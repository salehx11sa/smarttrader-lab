'use strict';
/* SmartTrader PAPER LAB 0.1 — قواعد اللاعبين (دوال نقية: بلا شبكة ولا ملفات ولا وسيط).
   هذا الملف «مجمّد» قبل بدء المختبر: بصمته في LAB/FREEZE.md وفي runner/lab-freeze.json، وlab_preflight يرفض التداول إن تغيّر.
   أي تغيير في قاعدة = نسخة لاعب جديدة تبدأ من الصفر (بادئة جديدة)، لا تعديل أثناء الاختبار.
   القواعد مكتوبة بالعربية في LAB/RULES-<player>.md. */
const DS = (typeof DailyStrat !== 'undefined') ? DailyStrat : require('./daily_strat.js');

const LAB_VERSION = 'lab-0.1';
const BUDGET = 13000;
const GAP_BUFFER_PCT = 3;           /* حجز النقد لأوامر المزاد (opg/cls): السعر المرجعي × 1.03 — تقدير لحجز النقد فقط، ليس ضمانًا للسعر */
const KILL_PCT = 15;                /* مفتاح القتل: إغلاق يومي ≤ 85% من البداية ⇒ لا دخول جديد لبقية المختبر (الحكَم مستثنى) */
const ETF_SYMBOLS = Object.freeze(['SPY', 'VOO']);

/* مواصفة RSI(2) المشتركة بين السريع والرخيص (والقرين في المتعلّم والظلال) */
const S1_SPEC = Object.freeze({ id: 'S1-x10-h10', universe: 'U-LIQ', useDsEligible: true, rsiMax: 10, sma200: true, condExitSma5: true, holdDays: 10, maxPositions: 4, riskPct: 1, maxPosPct: 25, atrMult: 3, barsDays: 430 });
const CHEAP_SPEC = Object.freeze({ id: 'CHEAP-rsi10-h5', universe: 'U-LOW', useDsEligible: false, minPx: 1, maxPx: 15, minAdv: 5e6, minBars: 21, rsiMax: 10, sma200: false, condExitSma5: false, holdDays: 5, maxPositions: 4, riskPct: 1, maxPosPct: 25, atrMult: 3, barsDays: 60 });

const PLAYERS = Object.freeze([
  Object.freeze({ id: 'REF', name: 'الحَكَم', prefix: 'ref1-', kind: 'ref', symbol: 'VOO', budget: BUDGET, killExempt: true }),
  Object.freeze({ id: 'S1', name: 'السريع', prefix: 's1-', kind: 'rsi2', spec: S1_SPEC, budget: BUDGET }),
  Object.freeze({ id: 'T1', name: 'الصبور', prefix: 't1-', kind: 't1', symbol: 'SPY', smaMonths: 10, budget: BUDGET }),
  Object.freeze({ id: 'TM1', name: 'الموسمي', prefix: 'tm1-', kind: 'tm1', symbol: 'SPY', sellTradingDay: 4, budget: BUDGET }),
  Object.freeze({ id: 'O1', name: 'الليلي', prefix: 'o1-', kind: 'o1', symbol: 'SPY', fraction: 0.5, minFillOfHalf: 0.5, budget: BUDGET }),
  Object.freeze({ id: 'CHEAP', name: 'الرخيص', prefix: 'ch1-', kind: 'rsi2', spec: CHEAP_SPEC, budget: BUDGET }),
  Object.freeze({ id: 'LEARN', name: 'المتعلّم', prefix: 'ln1-', kind: 'learn', subs: Object.freeze(['S1', 'T1', 'TM1', 'O1', 'CHEAP']), floor: 0.10, top: 2, blend: 0.5, budget: BUDGET })
]);
const PLAYER_BY_ID = Object.freeze(Object.fromEntries(PLAYERS.map(p => [p.id, p])));

/* الدفاتر: كل لاعب دفتر، والمتعلّم خمسة دفاتر فرعية (ln1-s1- …) تتقاسم ميزانيته ونقده. */
function bookDefs() {
  const out = [];
  for (const p of PLAYERS) {
    if (p.kind !== 'learn') { out.push(Object.freeze({ id: p.id, player: p.id, prefix: p.prefix, strat: p.id, kind: p.kind })); continue; }
    for (const s of p.subs) { const sp = PLAYER_BY_ID[s]; out.push(Object.freeze({ id: 'LEARN.' + s, player: 'LEARN', prefix: 'ln1-' + sp.prefix, strat: s, kind: sp.kind, sub: true })); }
  }
  return out;
}
const BOOKS = Object.freeze(bookDefs());
const ALL_PREFIXES = Object.freeze(BOOKS.map(b => b.prefix));
/* الدفتر صاحب المعرّف: أطول بادئة مطابقة (ln1-s1- لا تبدأ بـs1-، وtm1- لا تبدأ بـt1-) */
function bookOfCid(cid) {
  cid = String(cid || ''); let best = null;
  for (const b of BOOKS) if (cid.startsWith(b.prefix) && (!best || b.prefix.length > best.prefix.length)) best = b;
  return best;
}

/* ---------- التقويم (من تقويم الوسيط: قائمة تواريخ YYYY-MM-DD) ---------- */
const ym = d => String(d).slice(0, 7);
function sortedDates(cal) { return [...new Set((cal || []).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(String(d))))].sort(); }
/* هل d آخر يوم تداول في شهره؟ يحتاج تقويمًا يمتد بعد نهاية الشهر؛ وإلا null (غير معروف ⇒ فشل مغلق) */
function isLastTradingDayOfMonth(cal, d) {
  const ds = sortedDates(cal); const i = ds.indexOf(d); if (i < 0) return null;
  if (i + 1 < ds.length) return ym(ds[i + 1]) !== ym(d);
  return null;
}
/* ترتيب d بين أيام تداول شهره (1 = أول يوم). يحتاج التقويم من بداية الشهر. */
function tradingDayOfMonth(cal, d) {
  const ds = sortedDates(cal); if (!ds.includes(d)) return null;
  const first = ds.find(x => ym(x) === ym(d)); if (!first) return null;
  /* التقويم يجب أن يغطي بداية الشهر: فيه تاريخ قبل الشهر، وإلا لا نعرف أن «أول يوم» فيه هو أول يوم تداول فعلًا */
  if (!(ds[0] < d.slice(0, 8) + '01')) return null;
  return ds.filter(x => ym(x) === ym(d) && x <= d).length;
}
/* أيام نهاية الشهر (آخر يوم تداول) في [from, to] */
function monthEndsBetween(cal, from, to) {
  const ds = sortedDates(cal); const out = [];
  for (let i = 0; i < ds.length - 1; i++) if (ym(ds[i + 1]) !== ym(ds[i]) && ds[i] >= from && ds[i] <= to) out.push(ds[i]);
  return out;
}
/* آخر نهاية شهر قبل d (أي آخر يوم تداول في الشهر السابق لشهر d) */
function prevMonthEnd(cal, d) { const ds = sortedDates(cal).filter(x => x < d.slice(0, 8) + '01'); return ds.length ? ds[ds.length - 1] : null; }
function prevTradingDay(cal, d) { const ds = sortedDates(cal).filter(x => x < d); return ds.length ? ds[ds.length - 1] : null; }
function tradingDaysBetween(cal, a, b) { /* عدد أيام التداول من a إلى b شاملًا الطرفين */ const ds = sortedDates(cal); const i = ds.indexOf(a), j = ds.indexOf(b); return (i < 0 || j < 0) ? null : j - i + 1; }
function nthTradingDayOfMonth(cal, monthYm, n) { const ds = sortedDates(cal).filter(x => ym(x) === monthYm); return ds.length >= n ? ds[n - 1] : null; }
function nextMonth(m) { let y = +m.slice(0, 4), mo = +m.slice(5, 7) + 1; if (mo > 12) { mo = 1; y++; } return y + '-' + String(mo).padStart(2, '0'); }

/* ---------- الصبور T1: SPY مقابل متوسط آخر N إغلاقات شهرية ----------
   الإغلاق الشهري = إغلاق آخر شمعة في الشهر. القرار عند نهاية الشهر m: إغلاق m > متوسط آخر N إغلاقات (يشمل m) ⇒ in، وإلا out.
   شموع ناقصة (أقل من N أشهر) أو شمعة m غير موجودة ⇒ null (لا دخول؛ ولا بيع بسبب نقص البيانات). */
function t1Decision(bars, monthEndDate, months) {
  if (!Array.isArray(bars) || !monthEndDate) return null;
  const upto = bars.filter(b => b.t <= monthEndDate); if (!upto.length || upto[upto.length - 1].t !== monthEndDate) return null;
  const byMonth = new Map(); for (const b of upto) byMonth.set(ym(b.t), b.c);
  const keys = [...byMonth.keys()].sort(); if (keys.length < months) return null;
  const last = keys.slice(-months); const closes = last.map(k => byMonth.get(k));
  if (closes.some(c => !(c > 0))) return null;
  const sma = closes.reduce((a, c) => a + c, 0) / months; const close = closes[closes.length - 1];
  return { decision: close > sma ? 'in' : 'out', close: +close.toFixed(4), sma: +sma.toFixed(4), months, monthEnd: monthEndDate, monthsUsed: last };
}

/* ---------- الموسمي TM1 ---------- */
function tm1Plan(cal, target) {
  const last = isLastTradingDayOfMonth(cal, target);
  const td = tradingDayOfMonth(cal, target);
  return { buyDay: last === true, lastUnknown: last === null, tradingDayOfMonth: td };
}
/* يوم البيع المستحق لدفعة اشتُريت في يوم e: اليوم الرابع من الشهر التالي */
function tm1SellDue(cal, entryDate, sellTd) { return nthTradingDayOfMonth(cal, nextMonth(ym(entryDate)), sellTd || 4); }

/* ---------- RSI(2): الإشارات والخروج ---------- */
function stopFor(entry, atrSig, mult) { const v = entry - (mult || 3) * atrSig; return +(v.toFixed(v < 1 ? 4 : 2)); }
function rsiEligible(spec, b, I, i) {
  if (spec.useDsEligible) return DS.eligible(spec.universe, b, I, i);
  const c = b[i].c; return i + 1 >= spec.minBars && c >= spec.minPx && c <= spec.maxPx && I.adv20[i] > spec.minAdv && I.atr14[i] > 0;
}
function rsiSignalAt(spec, b, I, i) {
  if (spec.useDsEligible) { const s = DS.signal(DS.CONFIGS.find(c => c.id === 'S1-x10-h10'), b, I, i); if (!s) return null; if (!(I.rsi2[i] < spec.rsiMax)) return null; return s; }
  const r = I.rsi2[i]; if (!(r < spec.rsiMax)) return null; if (spec.sma200 && !(I.c[i] > I.sma200[i])) return null; return { rank: -r };
}
/* المرشحون على إغلاق lastDay. excl: رموز مستبعدة. تعيد {cands, stats, ok} — ok=false إذا البيانات قديمة/ناقصة (لا دخول). */
function rsiCandidates(spec, barsBySym, lastDay, excl, minUniverse) {
  const cands = []; let checked = 0, stale = 0, eligible = 0;
  for (const [sym, all] of Object.entries(barsBySym || {})) {
    if (excl && excl.has(sym)) continue;
    const b = (all || []).filter(x => x.t <= lastDay); if (b.length < (spec.useDsEligible ? 250 : spec.minBars)) continue; checked++;
    if (b[b.length - 1].t !== lastDay) { stale++; continue; }
    const I = DS.ind(b); const i = b.length - 1; if (!rsiEligible(spec, b, I, i)) continue; eligible++;
    const s = rsiSignalAt(spec, b, I, i); if (s) cands.push({ sym, rank: s.rank, close: b[i].c, atr: I.atr14[i], rsi2: +I.rsi2[i].toFixed(3) });
  }
  cands.sort((a, b) => b.rank - a.rank || (a.sym < b.sym ? -1 : 1));
  const min = minUniverse == null ? 50 : minUniverse;
  return { cands, stats: { withBars: checked, stale, eligible, signals: cands.length, lastDay }, ok: checked >= min && stale / Math.max(1, checked) <= 0.2 };
}
/* هل يخرج المركز عند افتتاح اليوم التالي؟ (قرار على إغلاق lastDay). الوقف يتولاه الوسيط (GTC). */
function rsiExit(spec, bars, cal, entryDate, lastDay) {
  const held = tradingDaysBetween(cal, entryDate, lastDay);
  if (held == null) return { exit: false, unknown: true, why: 'تاريخ الدخول أو آخر يوم غير موجود في التقويم' };
  if (spec.condExitSma5) {
    const b = (bars || []).filter(x => x.t <= lastDay);
    if (b.length && b[b.length - 1].t === lastDay && b.length >= 5) { const I = DS.ind(b); const k = b.length - 1; if (I.c[k] > I.sma5[k]) return { exit: true, reason: 'cond', held }; }
  }
  if (held >= spec.holdDays) return { exit: true, reason: 'time', held };
  return { exit: false, held };
}
/* حجم الدخول: مخاطرة riskPct% من حقوق الدفتر على مسافة الوقف، وسقف المركز maxPosPct%، والنقد المتاح بهامش 3% */
function rsiSize(spec, eq, ref, atr, spendable) {
  const stop = stopFor(ref, atr, spec.atrMult); const dist = ref - stop;
  if (!(stop > 0) || !(dist > 0) || !(ref > 0) || !(eq > 0)) return { qty: 0, stop, why: 'وقف غير صالح' };
  const val = Math.min(eq * spec.riskPct / 100 / (dist / ref), eq * spec.maxPosPct / 100, Math.max(0, spendable) / (1 + GAP_BUFFER_PCT / 100));
  const riskMax = Math.floor((eq * spec.riskPct / 100) / dist + 1e-9);
  return { qty: Math.max(0, Math.min(Math.floor(val / ref + 1e-9), riskMax)), stop, riskMax };
}
function wholeBudgetQty(spendable, ref) { if (!(ref > 0) || !(spendable > 0)) return 0; return Math.floor(spendable / (ref * (1 + GAP_BUFFER_PCT / 100)) + 1e-9); }

/* ---------- المتعلّم LEARN: إعادة توزيع الأوزان (مسجلة مسبقًا) ----------
   البداية: أوزان متساوية 20%. عند كل نهاية شهر m: الأداء r_s = حقوق اللاعب s عند إغلاق m ÷ 13,000 − 1 (لاعبو 2–6، دفاترهم المستقلة).
   الهدف: أعلى اثنين 35% لكل منهما، والبقية 10% (أرضية 10%). الوزن الجديد = 0.5 × القديم + 0.5 × الهدف. التعادل يُحسم بترتيب اللاعبين الثابت.
   الأوزان تُقرب لأربع منازل ويُصحح آخر وزن ليكون المجموع 1. لا رافعة: مجموع الأوزان 1، والإنفاق من النقد المسوّى فقط. */
function learnTarget(perf, subs, floor, top) {
  const order = subs.map((s, i) => ({ s, i, r: perf[s] })).sort((a, b) => (b.r - a.r) || (a.i - b.i));
  const topSet = new Set(order.slice(0, top).map(x => x.s));
  const rest = 1 - floor * subs.length; const t = {};
  for (const s of subs) t[s] = floor + (topSet.has(s) ? rest / top : 0);
  return { target: t, top: [...topSet] };
}
function learnReweight(wOld, perf, cfg) {
  const subs = cfg.subs; const floor = cfg.floor, blend = cfg.blend;
  for (const s of subs) if (!(typeof perf[s] === 'number' && Number.isFinite(perf[s]))) return { ok: false, weights: Object.assign({}, wOld), why: 'أداء غير معروف لـ' + s };
  const T = learnTarget(perf, subs, floor, cfg.top); const w = {};
  for (const s of subs) w[s] = +((1 - blend) * wOld[s] + blend * T.target[s]).toFixed(4);
  const sum = subs.slice(0, -1).reduce((a, s) => a + w[s], 0); w[subs[subs.length - 1]] = +(1 - sum).toFixed(4);
  for (const s of subs) if (w[s] < floor - 1e-9) return { ok: false, weights: Object.assign({}, wOld), why: 'وزن تحت الأرضية' };
  return { ok: true, weights: w, top: T.top, target: T.target };
}
function learnInitial(subs) { const w = {}; subs.forEach((s, i) => { w[s] = i < subs.length - 1 ? +(1 / subs.length).toFixed(4) : 0; }); w[subs[subs.length - 1]] = +(1 - subs.slice(0, -1).reduce((a, s) => a + w[s], 0)).toFixed(4); return w; }
/* سلسلة الأوزان: من البداية حتى lastDay. equityAt(player, date) ⇒ حقوق اللاعب عند إغلاق ذلك اليوم أو null. */
function learnWeightsAt(cal, labStart, lastDay, equityAt) {
  const L = PLAYER_BY_ID.LEARN; let w = learnInitial(L.subs); const history = [{ from: labStart, weights: Object.assign({}, w), reason: 'البداية: أوزان متساوية' }];
  for (const m of monthEndsBetween(cal, labStart, lastDay)) {
    const perf = {}; for (const s of L.subs) { const e = equityAt(s, m); perf[s] = (typeof e === 'number' && Number.isFinite(e)) ? e / BUDGET - 1 : NaN; }
    const r = learnReweight(w, perf, L);
    if (r.ok) { w = r.weights; history.push({ monthEnd: m, perf: Object.fromEntries(Object.entries(perf).map(([k, v]) => [k, +v.toFixed(6)])), top: r.top, weights: Object.assign({}, w) }); }
    else history.push({ monthEnd: m, skipped: r.why, weights: Object.assign({}, w) });
  }
  return { weights: w, history };
}

/* ---------- لاعبو الظل (افتراضيون: بلا أوامر أبدًا) ---------- */
const SHADOWS = Object.freeze([
  Object.freeze({ id: 'S1-h5', base: 'S1', spec: Object.freeze(Object.assign({}, S1_SPEC, { id: 'S1-x10-h5', holdDays: 5 })) }),
  Object.freeze({ id: 'S1-h15', base: 'S1', spec: Object.freeze(Object.assign({}, S1_SPEC, { id: 'S1-x10-h15', holdDays: 15 })) }),
  Object.freeze({ id: 'T1-sma8', base: 'T1', smaMonths: 8 }),
  Object.freeze({ id: 'T1-sma12', base: 'T1', smaMonths: 12 }),
  Object.freeze({ id: 'CHEAP-rsi5', base: 'CHEAP', spec: Object.freeze(Object.assign({}, CHEAP_SPEC, { id: 'CHEAP-rsi5-h5', rsiMax: 5 })) })
]);
/* محاكاة افتراضية من البداية حتى lastDay (بلا حالة محفوظة: تُعاد كل ليلة من الشموع). الدخول عند افتتاح اليوم التالي للإشارة،
   الوقف داخل اليوم (فجوة ⇒ الافتتاح)، الخروج الزمني/الشرطي عند الافتتاح. بلا تسوية ولا انزلاق ولا رسوم (متفائلة — للمقارنة فقط). */
function simulateShadow(sh, ctx) {
  const days = sortedDates(ctx.cal).filter(d => d >= ctx.labStart && d <= ctx.lastDay);
  let cash = BUDGET; const pos = {}; const trades = []; const curve = []; const pending = []; /* pending: دخول عند افتتاح اليوم التالي */
  const barOf = (sym, d) => { const a = ctx.bars[sym] || []; for (let i = a.length - 1; i >= 0; i--) if (a[i].t === d) return a[i]; return null; };
  const lastClose = (sym, d) => { const a = (ctx.bars[sym] || []).filter(x => x.t <= d); return a.length ? a[a.length - 1].c : null; };
  for (const d of days) {
    /* 1) الافتتاح: خروج مستحق ثم دخول معلق */
    for (const [sym, p] of Object.entries(pos)) if (p.exitAtOpen) { const b = barOf(sym, d); if (!b) continue; cash += p.qty * b.o; trades.push({ sym, entry: p.entryPx, exit: b.o, qty: p.qty, pnl: +((b.o - p.entryPx) * p.qty).toFixed(2), reason: p.exitAtOpen, exitDate: d }); delete pos[sym]; }
    for (const e of pending.splice(0)) { const b = barOf(e.sym, d); if (!b || pos[e.sym]) continue; const qty = e.kind === 'etf' ? Math.floor(cash / b.o) : Math.min(e.qty, Math.floor(cash / b.o)); if (qty < 1) continue; cash -= qty * b.o; pos[e.sym] = { qty, entryPx: b.o, entryDate: d, stop: e.atr ? stopFor(b.o, e.atr, 3) : null, kind: e.kind }; }
    /* 2) داخل اليوم: الوقف */
    for (const [sym, p] of Object.entries(pos)) { if (!(p.stop > 0)) continue; const b = barOf(sym, d); if (!b) continue; if (b.l <= p.stop) { const px = Math.min(b.o, p.stop); cash += p.qty * px; trades.push({ sym, entry: p.entryPx, exit: px, qty: p.qty, pnl: +((px - p.entryPx) * p.qty).toFixed(2), reason: 'stop', exitDate: d }); delete pos[sym]; } }
    /* 3) الإغلاق: قرارات الغد */
    const eq = cash + Object.entries(pos).reduce((a, [s, p]) => a + p.qty * (lastClose(s, d) || p.entryPx), 0);
    if (sh.base === 'T1') {
      const m = isLastTradingDayOfMonth(ctx.cal, d);
      if (m === true) { const D = t1Decision(ctx.bars.SPY, d, sh.smaMonths); if (D) { if (D.decision === 'out' && pos.SPY) pos.SPY.exitAtOpen = 'sma-out'; if (D.decision === 'in' && !pos.SPY) pending.push({ sym: 'SPY', kind: 'etf' }); } }
    } else {
      const spec = sh.spec;
      for (const [sym, p] of Object.entries(pos)) { if (p.exitAtOpen) continue; const x = rsiExit(spec, ctx.bars[sym], ctx.cal, p.entryDate, d); if (x.exit) p.exitAtOpen = x.reason; }
      const slots = spec.maxPositions - Object.keys(pos).length + Object.values(pos).filter(p => p.exitAtOpen).length;
      if (slots > 0) {
        const uni = {}; for (const s of ctx.universes[spec.universe] || []) if (ctx.bars[s]) uni[s] = ctx.bars[s];
        const R = rsiCandidates(spec, uni, d, new Set([...Object.keys(pos), ...(ctx.exclude || [])]), 0);
        let room = cash; for (const c of R.cands.slice(0, slots)) { const z = rsiSize(spec, eq, c.close, c.atr, room); if (z.qty < 1) continue; pending.push({ sym: c.sym, qty: z.qty, atr: c.atr, kind: 'stock' }); room -= z.qty * c.close * 1.03; }
      }
    }
    curve.push({ date: d, equity: +eq.toFixed(2) });
  }
  let peak = -Infinity, mdd = 0; for (const c of curve) { peak = Math.max(peak, c.equity); mdd = Math.max(mdd, peak > 0 ? (peak - c.equity) / peak : 0); }
  const last = curve.length ? curve[curve.length - 1].equity : BUDGET;
  return { id: sh.id, base: sh.base, virtual: true, noOrders: true, equity: last, totalReturnPct: +((last / BUDGET - 1) * 100).toFixed(3), maxDrawdownPct: +(mdd * 100).toFixed(3), tradesClosed: trades.length, openPositions: Object.keys(pos), trades: trades.slice(-50), curve };
}

module.exports = {
  LAB_VERSION, BUDGET, GAP_BUFFER_PCT, KILL_PCT, ETF_SYMBOLS, S1_SPEC, CHEAP_SPEC, PLAYERS, PLAYER_BY_ID, BOOKS, ALL_PREFIXES, bookOfCid, SHADOWS,
  sortedDates, isLastTradingDayOfMonth, tradingDayOfMonth, monthEndsBetween, prevMonthEnd, prevTradingDay, tradingDaysBetween, nthTradingDayOfMonth, nextMonth,
  t1Decision, tm1Plan, tm1SellDue, stopFor, rsiCandidates, rsiExit, rsiSize, wholeBudgetQty, learnTarget, learnReweight, learnInitial, learnWeightsAt, simulateShadow
};
