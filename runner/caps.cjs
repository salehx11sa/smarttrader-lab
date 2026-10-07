'use strict';
/* SmartTrader S12-T08 — وحدة السقوف (مستقلة، دوال نقية، بلا شبكة ولا ملفات ولا أسرار ولا وسيط).
   - 7.2.13-dev: مربوطة بالمنفّذ التطويري (نسخة مطابقة حرفيًا في مجلد المنفّذ)؛ ليست في النسخة المنشورة.
   - 7.2.14-dev: proveSettledCash — إثبات النقد المسوّى من سجل تسوية (DEV-CASH-02).
   - القيم الحقيقية قرار صالح: LIVE_CAPS كلها null ⇒ كل دخول جديد مرفوض.
   - السقوف تقيّد الدخول فقط. الخروج والحماية لا تُمنع أبدًا (checkExit يعيد allowed:true دائمًا).
   - أي قيمة مفقودة أو غير صالحة ⇒ رفض الدخول (فشل مغلق). */

const CAP_KEYS = Object.freeze(['allocation', 'maxPositions', 'maxPosPct', 'riskPct', 'fillBufferPct']);
/* مفاتيح الإعداد التي تُقارن بالسقف (fillBufferPct سقف فقط وليس إعدادًا للاستراتيجية) */
const CFG_KEYS = Object.freeze(['allocation', 'maxPositions', 'maxPosPct', 'riskPct']);
const BREACH_FLAG = 'cap-breach-after-fill';
const EPS = 1e-9;

/* القيم الحقيقية: غير محددة — قرار صالح. الدخول مغلق ما دامت null. */
const LIVE_CAPS = Object.freeze({ allocation: null, maxPositions: null, maxPosPct: null, riskPct: null, fillBufferPct: null });

/* رقم حقيقي (typeof number) محدود وموجب. يرفض: null و'' والمنطقية والنصوص مثل '10' وNaN وInfinity والسالب والصفر. */
function isPosFinite(v) { return typeof v === 'number' && Number.isFinite(v) && v > 0; }
function isPosInt(v) { return isPosFinite(v) && Number.isInteger(v); }
function isNonNegFinite(v) { return typeof v === 'number' && Number.isFinite(v) && v >= 0; }
function isPlainObject(o) { return o !== null && typeof o === 'object' && !Array.isArray(o); }
function show(v) { if (typeof v === 'string') return JSON.stringify(v); if (typeof v === 'number') return String(v); if (v === undefined) return 'undefined'; try { return JSON.stringify(v); } catch (e) { return String(v); } }

/* قاعدة كل مفتاح: نوع + حدود منطقية */
function checkKey(k, v, who) {
  if (k === 'maxPositions') return isPosInt(v) ? null : who + '.maxPositions=' + show(v) + ' ليس عددًا صحيحًا موجبًا';
  if (!isPosFinite(v)) return who + '.' + k + '=' + show(v) + ' ليس رقمًا محدودًا موجبًا';
  if ((k === 'maxPosPct' || k === 'riskPct') && v > 100) return who + '.' + k + '=' + v + ' > 100%';
  if (k === 'fillBufferPct' && v >= 100) return who + '.fillBufferPct=' + v + ' ≥ 100%';
  return null;
}

/* التحقق من صلاحية السقف ذاته */
function validateCaps(caps) {
  const errors = [];
  if (!isPlainObject(caps)) return { ok: false, errors: ['السقوف غير موجودة أو ليست كائنًا'] };
  for (const k of CAP_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(caps, k)) { errors.push('caps.' + k + ' مفقود'); continue; }
    const e = checkKey(k, caps[k], 'caps'); if (e) errors.push(e);
  }
  return { ok: errors.length === 0, errors };
}

/* الإعداد يجب أن يكون صالحًا بنفس الصرامة ولا يتجاوز السقف. السقف غير الصالح ⇒ رفض. */
function validateConfigAgainstCaps(cfg, caps) {
  const vc = validateCaps(caps);
  const errors = vc.ok ? [] : vc.errors.slice();
  if (!isPlainObject(cfg)) { errors.push('الإعداد غير موجود أو ليس كائنًا'); return { ok: false, errors }; }
  for (const k of CFG_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(cfg, k)) { errors.push('cfg.' + k + ' مفقود'); continue; }
    const e = checkKey(k, cfg[k], 'cfg'); if (e) { errors.push(e); continue; }
    if (vc.ok && cfg[k] > caps[k] + EPS) errors.push('cfg.' + k + '=' + cfg[k] + ' > السقف ' + caps[k]);
  }
  return { ok: errors.length === 0, errors };
}

/* حدود فعلية (بالدولار) بعد التحقق */
function limits(cfg, caps) {
  const allocation = cfg.allocation;
  return {
    allocation,
    perPositionValue: allocation * cfg.maxPosPct / 100,
    maxPositions: cfg.maxPositions,
    bufferMult: 1 + caps.fillBufferPct / 100
  };
}

/* تحقق من مدخلات الحالة: مراكز وأوامر معلقة ونقد — بيانات ناقصة ⇒ رفض (فشل مغلق) */
function readState({ positions, pendingOrders, cash }, bufferMult, errs) {
  const pos = []; const pend = [];
  if (!Array.isArray(positions)) errs.push('positions ليست قائمة');
  else positions.forEach((p, i) => {
    if (!isPlainObject(p) || typeof p.symbol !== 'string' || !p.symbol) { errs.push('مركز #' + i + ': رمز غير صالح'); return; }
    if (!isNonNegFinite(p.qty)) { errs.push('مركز ' + p.symbol + ': كمية غير صالحة ' + show(p.qty)); return; }
    if (!isNonNegFinite(p.marketValue)) { errs.push('مركز ' + p.symbol + ': قيمة سوقية غير صالحة ' + show(p.marketValue)); return; }
    if (p.qty > 0) pos.push({ symbol: p.symbol, value: p.marketValue });
  });
  if (!Array.isArray(pendingOrders)) errs.push('pendingOrders ليست قائمة');
  else pendingOrders.forEach((o, i) => {
    if (!isPlainObject(o) || typeof o.symbol !== 'string' || !o.symbol) { errs.push('أمر معلق #' + i + ': رمز غير صالح'); return; }
    if (!isNonNegFinite(o.qty)) { errs.push('أمر معلق ' + o.symbol + ': كمية متبقية غير صالحة ' + show(o.qty)); return; }
    if (!isPosFinite(o.limitOrRefPrice)) { errs.push('أمر معلق ' + o.symbol + ': سعر مرجعي مفقود ' + show(o.limitOrRefPrice) + ' — لا يمكن حجز قيمته'); return; }
    if (o.qty > 0) pend.push({ symbol: o.symbol, value: o.qty * o.limitOrRefPrice * bufferMult });
  });
  if (!isNonNegFinite(cash)) errs.push('النقد المسوّى غير صالح ' + show(cash));
  return { pos, pend };
}

/* فحص دخول جديد — يُطبق على كل الاستراتيجيات (بما فيها M1) وكل المراكز والأوامر المعلقة.
   يعيد maxQty: أكبر كمية صحيحة مسموحة؛ الاستراتيجية تقصّ كميتها إليها (أو تُمنع إن كانت 0). */
function checkEntry(input) {
  const reasons = [];
  const out = (extra) => Object.assign({ allowed: false, maxQty: 0, reasons }, extra || {});
  if (!isPlainObject(input)) { reasons.push('مدخلات الفحص مفقودة'); return out(); }
  const { caps, cfg, strategyId, order, cash, buyingPower, activeFlags } = input;

  if (isPlainObject(order) && order.side === 'sell') return checkExit(order); /* الخروج ليس دخولًا */

  const v = validateConfigAgainstCaps(cfg, caps);
  if (!v.ok) { reasons.push(...v.errors.map(e => 'سقوف/إعداد: ' + e)); }
  if (typeof strategyId !== 'string' || !strategyId) reasons.push('strategyId مفقود — السقف يُطبق على الجميع لكن يجب تسمية الطالب');
  if (!isPlainObject(order)) reasons.push('الأمر مفقود');
  else {
    if (order.side !== 'buy') reasons.push('side=' + show(order.side) + ' غير معروف');
    if (typeof order.symbol !== 'string' || !order.symbol) reasons.push('رمز الأمر غير صالح');
    if (!isPosInt(order.qty)) reasons.push('كمية الأمر ' + show(order.qty) + ' ليست عددًا صحيحًا موجبًا');
    if (!isPosFinite(order.refPrice)) reasons.push('السعر المرجعي ' + show(order.refPrice) + ' غير صالح');
  }
  const flags = Array.isArray(activeFlags) ? activeFlags : [];
  if (flags.includes(BREACH_FLAG)) reasons.push('علم ' + BREACH_FLAG + ' نشط — لا دخول حتى يرفعه صالح');
  if (reasons.length) return out();

  const L = limits(cfg, caps);
  const errs = [];
  const st = readState(input, L.bufferMult, errs);
  if (errs.length) { reasons.push(...errs); return out(); }

  const unitCost = order.refPrice * L.bufferMult; /* السعر المرجعي + هامش انزلاق التعبئة. 7.2.14-dev: الهامش تقدير لحجز التكلفة فقط — ليس ضمانًا لسعر التعبئة ولا سقفًا للخسارة؛ مخاطرة الصفقة تُحسب في المنفّذ عند السعر المرجعي والوقف المخطط */
  const sum = a => a.reduce((s, x) => s + x.value, 0);
  const posVal = sum(st.pos), pendVal = sum(st.pend);
  const symExisting = sum(st.pos.filter(p => p.symbol === order.symbol)) + sum(st.pend.filter(p => p.symbol === order.symbol));
  const symbols = new Set([...st.pos.map(p => p.symbol), ...st.pend.map(p => p.symbol)]);
  const newSymbol = !symbols.has(order.symbol);
  const countAfter = symbols.size + (newSymbol ? 1 : 0);

  const room = {
    position: L.perPositionValue - symExisting,          /* سقف المركز الواحد (مع الموجود والمعلق لنفس الرمز) */
    portfolio: L.allocation - posVal - pendVal,          /* سقف المحفظة الإجمالي */
    cash: cash - pendVal                                  /* نقد مسوّى فقط — لا هامش ولا buyingPower */
  };
  const qtyBy = {};
  for (const k of Object.keys(room)) qtyBy[k] = Math.max(0, Math.floor((room[k] + EPS) / unitCost));
  let maxQty = Math.min(qtyBy.position, qtyBy.portfolio, qtyBy.cash);
  if (countAfter > L.maxPositions) { maxQty = 0; reasons.push('عدد المراكز (مع الأوامر المعلقة) سيصبح ' + countAfter + ' > ' + L.maxPositions); }
  if (qtyBy.position < order.qty) reasons.push('سقف المركز: المسموح ' + qtyBy.position + ' سهم (حد ' + L.perPositionValue.toFixed(2) + '$)');
  if (qtyBy.portfolio < order.qty) reasons.push('سقف المحفظة: المسموح ' + qtyBy.portfolio + ' سهم (المتبقي ' + room.portfolio.toFixed(2) + '$)');
  if (qtyBy.cash < order.qty) reasons.push('النقد المسوّى: المسموح ' + qtyBy.cash + ' سهم (المتاح ' + room.cash.toFixed(2) + '$؛ القوة الشرائية لا تُستخدم)');

  const allowed = maxQty >= 1 && order.qty <= maxQty;
  return {
    allowed, maxQty, reasons,
    clippedQty: maxQty >= 1 ? Math.min(order.qty, maxQty) : 0,
    detail: {
      strategyId, unitCostWithBuffer: +unitCost.toFixed(6), limits: L, room, qtyBy, countAfter,
      buyingPowerIgnored: buyingPower === undefined ? null : buyingPower
    }
  };
}

/* الخروج والحماية: لا تمنعها السقوف أبدًا، حتى لو كانت السقوف مفقودة أو العلم نشطًا. */
function checkExit(_order) { return { allowed: true, maxQty: null, reasons: ['الخروج/الحماية لا تخضع للسقوف'] }; }

/* فحص بعد التعبئة الفعلية: يقيس التعبئة الحقيقية ولا يفترضها.
   fills: [{symbol, qty, avgFillPrice, refPrice}] ، positions: [{symbol, qty, costBasis}] (بعد التعبئة) ،
   pendingOrders كما في checkEntry ، cash: النقد المسوّى بعد التعبئة.
   التجاوز ⇒ علم cap-breach-after-fill: يمنع الدخول الجديد فقط. لا بيع قسري أبدًا. */
function postFillCheck(input) {
  const details = []; const slippage = [];
  const res = (breach, evaluated) => ({ evaluated, breach, flag: breach ? BREACH_FLAG : null, blockNewEntries: breach, forceSell: false, details, slippage });
  if (!isPlainObject(input)) { details.push('مدخلات مفقودة — تعذر التقييم'); return res(true, false); }
  const { caps, cfg, fills, positions, pendingOrders, cash } = input;
  const v = validateConfigAgainstCaps(cfg, caps);
  if (!v.ok) { details.push(...v.errors.map(e => 'تعذر التقييم: ' + e)); return res(true, false); }
  const L = limits(cfg, caps);
  const errs = [];
  if (!Array.isArray(fills)) errs.push('fills ليست قائمة');
  else fills.forEach((f, i) => {
    if (!isPlainObject(f) || typeof f.symbol !== 'string' || !f.symbol || !isPosFinite(f.qty) || !isPosFinite(f.avgFillPrice)) { errs.push('تعبئة #' + i + ' غير صالحة'); return; }
    if (isPosFinite(f.refPrice)) {
      const pct = (f.avgFillPrice / f.refPrice - 1) * 100;
      const over = pct > caps.fillBufferPct + EPS;
      slippage.push({ symbol: f.symbol, slipPct: +pct.toFixed(4), bufferPct: caps.fillBufferPct, exceedsBuffer: over });
      if (over) details.push(f.symbol + ': انزلاق التعبئة ' + pct.toFixed(2) + '% > الهامش ' + caps.fillBufferPct + '% (للعلم؛ التجاوز يُحكم بالقيم أدناه)');
    } else slippage.push({ symbol: f.symbol, slipPct: null, note: 'لا سعر مرجعي' });
  });
  const pos = [];
  if (!Array.isArray(positions)) errs.push('positions ليست قائمة');
  else positions.forEach((p, i) => {
    if (!isPlainObject(p) || typeof p.symbol !== 'string' || !p.symbol || !isNonNegFinite(p.qty) || !isNonNegFinite(p.costBasis)) { errs.push('مركز #' + i + ' غير صالح'); return; }
    if (p.qty > 0) pos.push({ symbol: p.symbol, value: p.costBasis });
  });
  const pendErrs = []; const st = readState({ positions: [], pendingOrders, cash: 0 }, L.bufferMult, pendErrs);
  if (!(typeof cash === 'number' && Number.isFinite(cash))) errs.push('النقد المسوّى غير صالح ' + show(cash)); /* السالب مقبول هنا ليُكشف كتجاوز */
  errs.push(...pendErrs);
  if (errs.length) { details.push(...errs.map(e => 'تعذر التقييم: ' + e)); return res(true, false); }

  let breach = false;
  /* 7.2.13-dev (DEV-CAP-01): التجميع لكل رمز = تكلفة المركز الفعلية (أسعار التعبئة) + حجز الباقي المعلق لنفس الرمز (السعر المرجعي × (1+الهامش)).
     قبلها كان المركز يُقاس وحده فيفوت: تعبئة جزئية بسعر أعلى + باقي أمر معلق لنفس الرمز. */
  const bySym = {};
  const slot = sym => (bySym[sym] = bySym[sym] || { filled: 0, pendingReserve: 0 });
  for (const p of pos) slot(p.symbol).filled += p.value;
  for (const o of st.pend) slot(o.symbol).pendingReserve += o.value;
  const exposureBySymbol = {};
  for (const [sym, x] of Object.entries(bySym)) {
    const total = x.filled + x.pendingReserve;
    exposureBySymbol[sym] = { filled: +x.filled.toFixed(2), pendingReserve: +x.pendingReserve.toFixed(2), total: +total.toFixed(2), cap: +L.perPositionValue.toFixed(2) };
    if (total > L.perPositionValue + 0.005) { breach = true; details.push(sym + ': التعرض ' + total.toFixed(2) + '$ (منفذ ' + x.filled.toFixed(2) + '$ + حجز المعلق ' + x.pendingReserve.toFixed(2) + '$) > سقف المركز ' + L.perPositionValue.toFixed(2) + '$'); }
  }
  const pendingReserve = st.pend.reduce((s, p) => s + p.value, 0);
  const gross = pos.reduce((s, p) => s + p.value, 0) + pendingReserve;
  if (gross > L.allocation + 0.005) { breach = true; details.push('التعرض الإجمالي ' + gross.toFixed(2) + '$ > المخصص ' + L.allocation + '$'); }
  const count = new Set([...pos.map(p => p.symbol), ...st.pend.map(p => p.symbol)]).size;
  if (count > L.maxPositions) { breach = true; details.push('عدد المراكز ' + count + ' > ' + L.maxPositions); }
  if (cash < -0.005) { breach = true; details.push('النقد المسوّى سالب ' + cash.toFixed(2) + '$ — استُخدم هامش'); }
  /* 7.2.13-dev (DEV-CAP-01): حجز الأوامر المعلقة يجب أن يغطيه النقد الموجب المتاح بعد التعبئة؛ وإلا فتعبئة الباقي تستعمل هامشًا */
  const cashAvail = Math.max(0, cash);
  if (pendingReserve > cashAvail + 0.005) { breach = true; details.push('حجز الأوامر المعلقة ' + pendingReserve.toFixed(2) + '$ > النقد المتاح ' + cashAvail.toFixed(2) + '$'); }
  return Object.assign(res(breach, true), { exposureBySymbol, grossExposure: +gross.toFixed(2), pendingReserve: +pendingReserve.toFixed(2), cash: +cash.toFixed(2), positionsCount: count });
}

/* ---------- 7.2.14-dev (DEV-CASH-02): إثبات النقد المسوّى القابل للصرف ----------
   السياسة المتفق عليها (لم تتغير): «النقد المسوّى فقط — بلا اقتراض، وبلا استعمال حصيلة بيع غير مسوّاة».
   account.cash رصيد نقدي وليس دليل تسوية. لذلك:
     النقد المسوّى = account.cash − حصيلة البيوع التي لم تُسوَّ بعد (من سجل تسوية مبني من نشاطات التعبئة FILL).
   • التسوية: T+1 يوم عمل (أسهم أمريكية). يوم التسوية = أول يوم تداول في التقويم بعد يوم الصفقة ليس عطلة بنوك (SETTLEMENT_BANK_HOLIDAYS).
     تحفّظ: البيع يبقى «غير مسوّى» حتى نهاية يوم التسوية نفسه (مسوّى فقط إذا كان يوم التسوية < اليوم).
   • الرسوم: رسوم البيع التنظيمية تُخصم من cash فورًا (نشاط FEE). نطرح الحصيلة الإجمالية (الكمية × السعر) ولا نطرح الرسوم مرة أخرى ⇒ لا ازدواج.
   • حجز الأوامر المعلقة لا يُخصم هنا: checkEntry يخصمه مرة واحدة (room.cash = cash − pendVal). pendingReserve يُمرَّر هنا للمقارنة فقط.
   • تعذر الإثبات ⇒ proven:false ⇒ لا دخول (الحماية والخروج والمطابقة لا تتأثر): نقد غير رقمي أو سالب، تعبئات غير مكتملة أو تالفة،
     تقويم ناقص، تغطية زمنية غير كافية، بيع سابق غير مسوّى اختفى من السجل، نقد مسوّى سالب، أو تناقض مع non_marginable_buying_power
     (إذا أُبلغ عنه وكان أقل من النقد المسوّى − الحجز ⇒ تناقض ⇒ منع؛ لا نستبدله آليًا بـcash ولا نخصم الحجز مرتين).
   افتراضات غير متحقق منها على الوسيط الحقيقي (لا شبكة): معنى cash وnon_marginable_buying_power في الحساب الورقي، وأن نشاط FILL يغطي كل البيوع. */
const SETTLEMENT_BANK_HOLIDAYS = Object.freeze(['2026-10-12', '2026-11-11', '2027-10-11', '2027-11-11']); /* السوق مفتوح والبنوك مغلقة ⇒ لا تسوية */
const SETTLE_TOL = 0.01;
const isDate = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
function strictNumber(v) { if (typeof v === 'number') return v; if (typeof v === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(v)) return Number(v); return NaN; }
function settleDateOf(tradeDate, calendar, holidays) { for (const d of calendar) if (d > tradeDate && !holidays.includes(d)) return d; return null; }
function proveSettledCash(input) {
  const reasons = []; const unsettledSales = [];
  const out = extra => Object.assign({ proven: false, settledCash: null, cash: null, unsettledProceeds: null, unsettledSales, reasons, policy: 'settled-cash-only' }, extra || {});
  if (!isPlainObject(input)) { reasons.push('مدخلات إثبات التسوية مفقودة'); return out(); }
  const { cash, nonMarginableBuyingPower, fills, fillsError, calendar, calendarError, today, coverageFrom, pendingReserve, priorLedger } = input;
  const holidays = Array.isArray(input.bankHolidays) ? input.bankHolidays : SETTLEMENT_BANK_HOLIDAYS;
  const c = strictNumber(cash);
  if (!Number.isFinite(c)) reasons.push('account.cash غير رقمي ' + show(cash));
  else if (c < 0) reasons.push('account.cash سالب ' + c + ' — اقتراض/هامش');
  if (!isDate(today)) reasons.push('تاريخ اليوم غير صالح');
  if (fillsError) reasons.push('تعذر جلب نشاطات التعبئة FILL: ' + fillsError);
  else if (!Array.isArray(fills)) reasons.push('نشاطات التعبئة غير متاحة');
  if (calendarError) reasons.push('تعذر جلب التقويم: ' + calendarError);
  const cal = Array.isArray(calendar) ? [...new Set(calendar.filter(isDate))].sort() : null;
  if (!calendarError && (!cal || !cal.length)) reasons.push('التقويم فارغ — لا يمكن حساب أيام التسوية');
  if (reasons.length) return out({ cash: Number.isFinite(c) ? c : null });
  /* التغطية: آخر يوم d0 كل صفقاته مسوّاة يقينًا (يوم تسويته < اليوم). النشاطات يجب أن تبدأ قبله أو عنده. */
  let d0 = null; for (const d of cal) { if (d >= today) break; const s = settleDateOf(d, cal, holidays); if (s && s < today) d0 = d; }
  if (!d0) reasons.push('التقويم لا يغطي أيامًا كافية قبل اليوم لإثبات التسوية');
  else if (!isDate(coverageFrom) || coverageFrom > d0) reasons.push('نشاطات التعبئة تبدأ ' + show(coverageFrom) + ' بعد ' + d0 + ' — تغطية غير كافية');
  const seen = new Set(); let unsettled = 0;
  for (const [i, f] of fills.entries()) {
    if (!isPlainObject(f) || typeof f.id !== 'string' || !f.id) { reasons.push('تعبئة #' + i + ' بلا معرّف'); continue; }
    if (seen.has(f.id)) continue; seen.add(f.id);
    if (f.side !== 'buy' && f.side !== 'sell' && f.side !== 'sell_short') { reasons.push('تعبئة ' + f.id + ': جهة غير معروفة ' + show(f.side)); continue; }
    if (f.side === 'buy') continue; /* الشراء خُصم من cash عند التعبئة */
    const q = strictNumber(f.qty), px = strictNumber(f.price);
    if (!(q > 0) || !(px > 0) || !isDate(f.tradeDate)) { reasons.push('تعبئة بيع ' + f.id + ' ناقصة (كمية/سعر/تاريخ)'); continue; }
    const sd = settleDateOf(f.tradeDate, cal, holidays);
    if (sd && sd < today) continue; /* مسوّاة */
    const proceeds = q * px; unsettled += proceeds;
    unsettledSales.push({ id: f.id, symbol: f.symbol || null, qty: q, price: px, proceeds: +proceeds.toFixed(2), tradeDate: f.tradeDate, settleDate: sd, note: sd ? 'غير مسوّاة حتى نهاية ' + sd : 'يوم التسوية بعد آخر يوم في التقويم' });
  }
  /* اتساق السجل المحلي: بيع سجّله تشغيل سابق كغير مسوّى (ولم يحن موعده) يجب أن يظهر في النشاطات الحالية */
  if (priorLedger != null) {
    if (!isPlainObject(priorLedger) || !Array.isArray(priorLedger.unsettled)) reasons.push('سجل التسوية المحلي تالف');
    else for (const x of priorLedger.unsettled) {
      if (!isPlainObject(x) || typeof x.id !== 'string') { reasons.push('سجل التسوية المحلي: عنصر تالف'); continue; }
      const due = isDate(x.settleDate) ? x.settleDate < today : false;
      if (!due && !seen.has(x.id)) reasons.push('بيع غير مسوّى سابق ' + x.id + ' (' + (x.symbol || '?') + ') غائب عن نشاطات التعبئة — السجل غير متسق');
    }
  }
  const settled = c - unsettled;
  if (settled < -SETTLE_TOL) reasons.push('النقد المسوّى سالب ' + settled.toFixed(2) + '$ — حصيلة غير مسوّاة استُعملت');
  const res = isNonNegFinite(pendingReserve) ? pendingReserve : null;
  if (res === null) reasons.push('حجز الأوامر المعلقة غير محسوب');
  let nmbp = null; const nmbpRaw = nonMarginableBuyingPower;
  if (nmbpRaw !== undefined && nmbpRaw !== null && nmbpRaw !== '') {
    nmbp = strictNumber(nmbpRaw);
    if (!Number.isFinite(nmbp)) reasons.push('non_marginable_buying_power غير رقمي ' + show(nmbpRaw));
    else if (res !== null && nmbp < settled - res - SETTLE_TOL) reasons.push('تناقض: non_marginable_buying_power=' + nmbp + ' أقل من النقد المسوّى المحسوب ' + settled.toFixed(2) + '$ − الحجز ' + res.toFixed(2) + '$ — لا يمكن إثبات النقد');
  }
  const extra = { cash: c, unsettledProceeds: +unsettled.toFixed(2), settledCash: +settled.toFixed(2), pendingReserveCompared: res, nonMarginableBuyingPower: Number.isFinite(nmbp) ? nmbp : null, settlementRule: 'T+1 يوم عمل؛ غير مسوّى حتى نهاية يوم التسوية', coveredSince: coverageFrom, certainSettledThrough: d0, ledger: { unsettled: unsettledSales.map(x => ({ id: x.id, symbol: x.symbol, tradeDate: x.tradeDate, settleDate: x.settleDate, proceeds: x.proceeds })) } };
  if (reasons.length) return out(Object.assign(extra, { settledCash: null, computedSettledCash: +settled.toFixed(2) }));
  return Object.assign(out(extra), { proven: true });
}

/* للتوثيق فقط: التعبير الحالي في runner.cjs:245 — معيب (يقبل null و'' وfalse و[] والسالب والصفر والنص '10') */
function naiveTrialCheckPasses(v, cap) { return !!(+v <= cap); }

module.exports = { LIVE_CAPS, CAP_KEYS, CFG_KEYS, BREACH_FLAG, validateCaps, validateConfigAgainstCaps, checkEntry, checkExit, postFillCheck, naiveTrialCheckPasses, isPosFinite, isPosInt, proveSettledCash, settleDateOf, SETTLEMENT_BANK_HOLIDAYS };
