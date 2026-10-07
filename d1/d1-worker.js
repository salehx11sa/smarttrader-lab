/* D1 — المضارب اليومي (اختراق نطاق الافتتاح) — Cloudflare Worker. البروتوكول: PROTOCOL-D1.md
   الأمان: paper-api فقط • حساب PA فقط • حساب مستقل (يرفض العمل إذا رأى أمرًا لا يبدأ بـd1- أو مركزًا خارج قائمته)
   • TRADING_ENABLED=true وحده يرسل أوامر (وإلا تشغيل جاف) • المفاتيح لا تُطبع ولا تُرجع. */
const VERSION = 'd1-0.4';
const PAPER = 'https://paper-api.alpaca.markets';
const DATA = 'https://data.alpaca.markets';

const RULES = Object.freeze({
  player: 'D1', prefix: 'd1-',
  universe: Object.freeze(['SPY', 'QQQ', 'IWM', 'AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'TSLA', 'AMD']),
  budget: 13000, startEquity: 100000, maxPosPct: 25, riskPct: 0.5,
  orMinutes: 15, minOrBars: 10, entryUntilMin: 120, maxAttempts: 2, entryLimitBufPct: 0.2, entryTtlMin: 3, signalMaxAgeMin: 3,
  cancelBeforeCloseMin: 12, flattenBeforeCloseMin: 10,
  killPct: 15, start: '2026-10-08', end: '2027-01-07', feed: 'iex',
  judge: Object.freeze({ minTrades: 50, costPerSidePct: 0.02, minProfitFactor: 1.3, maxDdPctOfBudget: 10, strongT: 1.65 })
});
const TERMINAL = new Set(['filled', 'canceled', 'expired', 'rejected', 'replaced']);
const MAX_CALLS = 40;

/* ---------- الوقت (نيويورك) ---------- */
const NYF = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
function nyParts(ms) {
  const p = {}; for (const x of NYF.formatToParts(new Date(ms))) p[x.type] = x.value;
  const date = p.year + '-' + p.month + '-' + p.day; const hh = +p.hour % 24, mm = +p.minute, ss = +p.second;
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, hh, mm, ss);
  return { date, hh, mm, ss, offsetMs: asUtc - Math.floor(ms / 1000) * 1000 };
}
function nyLocalToUtc(date, hhmm, offsetMs) { const [y, m, d] = date.split('-').map(Number); const [h, mi] = String(hhmm).split(':').map(Number); return Date.UTC(y, m - 1, d, h, mi) - offsetMs; }
const isoS = ms => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const ymd = d => d.replace(/-/g, '');
const r2 = x => Math.round(x * 100) / 100;
const flag = v => String(v || '').trim().toLowerCase() === 'true';

/* ---------- الوسيط ---------- */
function makeApi(env, fetchFn) {
  const H = { 'APCA-API-KEY-ID': env.APCA_API_KEY_ID, 'APCA-API-SECRET-KEY': env.APCA_API_SECRET_KEY, 'content-type': 'application/json' };
  let calls = 0;
  async function req(base, method, path, body) {
    if (base !== PAPER && base !== DATA) throw new Error('عنوان غير مسموح');
    if (++calls > MAX_CALLS) throw new Error('تجاوز حد الطلبات في التشغيل الواحد');
    const r = await fetchFn(base + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
    const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { j = null; }
    if (!r.ok) { const e = new Error(method + ' ' + path.split('?')[0] + ' → ' + r.status + ' ' + String((j && j.message) || t || '').slice(0, 160)); e.status = r.status; throw e; }
    return j;
  }
  return { get: p => req(PAPER, 'GET', p), post: (p, b) => req(PAPER, 'POST', p, b), del: p => req(PAPER, 'DELETE', p), data: p => req(DATA, 'GET', p), calls: () => calls };
}
async function getBars(api, syms, startMs, endMs) {
  const out = {}; let token = null, pages = 0;
  do {
    const q = '/v2/stocks/bars?symbols=' + syms.join(',') + '&timeframe=1Min&start=' + isoS(startMs) + '&end=' + isoS(endMs) + '&feed=' + RULES.feed + '&adjustment=raw&limit=10000' + (token ? '&page_token=' + encodeURIComponent(token) : '');
    const j = await api.data(q) || {};
    for (const [s, a] of Object.entries(j.bars || {})) (out[s] = out[s] || []).push(...a.map(b => ({ t: Date.parse(b.t), o: +b.o, h: +b.h, l: +b.l, c: +b.c })));
    token = j.next_page_token || null;
  } while (token && ++pages < 3);
  for (const s of Object.keys(out)) out[s].sort((a, b) => a.t - b.t);
  return out;
}

/* ---------- التشغيل كل دقيقة ---------- */
async function tick(env, nowMs, fetchFn) {
  const R = RULES; const out = { version: VERSION, at: isoS(nowMs), mode: flag(env.TRADING_ENABLED) ? 'trading' : 'dry-run', phase: null, actions: [], blocked: [], warnings: [], errors: [] };
  if (!env.APCA_API_KEY_ID || !env.APCA_API_SECRET_KEY) { out.phase = 'no-keys'; out.errors.push('المفاتيح غير موجودة في إعدادات Cloudflare'); return out; }
  const TRADING = flag(env.TRADING_ENABLED), HALT = flag(env.HALT), FLAT = flag(env.FLATTEN_NOW);
  const api = makeApi(env, fetchFn);
  try {
    const clock = await api.get('/v2/clock');
    if (!clock || !clock.is_open) { out.phase = 'closed'; return out; }
    const acc = await api.get('/v2/account');
    if (!String(acc.account_number || '').startsWith('PA')) { out.phase = 'refused'; out.errors.push('الحساب ليس ورقيًا (PA) — رفض'); return out; }
    const n = nyParts(nowMs); const D = ymd(n.date);
    const cal = (await api.get('/v2/calendar?start=' + n.date + '&end=' + n.date)) || [];
    const day = cal.find(c => c.date === n.date); if (!day) { out.phase = 'closed'; out.warnings.push('لا يوم تداول في التقويم رغم أن الساعة تقول مفتوح'); return out; }
    const openMs = nyLocalToUtc(n.date, day.open, n.offsetMs); const closeMs = Date.parse(clock.next_close) || nyLocalToUtc(n.date, day.close, n.offsetMs);
    const m = (nowMs - openMs) / 60000, toClose = (closeMs - nowMs) / 60000; out.minutesSinceOpen = Math.floor(m); out.minutesToClose = Math.floor(toClose);

    const orders = (await api.get('/v2/orders?status=all&after=' + isoS(nowMs - 5 * 864e5) + '&limit=500&direction=desc&nested=false')) || [];
    const openAll = (await api.get('/v2/orders?status=open&limit=500&nested=false')) || [];
    const first = (await api.get('/v2/orders?status=all&after=2015-01-01T00:00:00Z&direction=asc&limit=1&nested=false')) || [];
    const positions = (await api.get('/v2/positions')) || [];
    /* حزام الاستقلال: أي أمر ليس لـD1 (حديث أو قائم بأي عمر)، أو مركز لا تفسره تعبئات D1 ⇒ لا شيء أبدًا */
    const isD1 = o => String(o.client_order_id || '').startsWith(R.prefix);
    const foreignOrders = [...first, ...orders, ...openAll].filter(o => !isD1(o));
    const fullFrom = ymd(nyParts(nowMs - 4 * 864e5).date);
    const net = {}; for (const o of orders) { if (!isD1(o)) continue; const dd = String(o.client_order_id).slice(R.prefix.length, R.prefix.length + 8); if (dd < fullFrom) continue; const f = +o.filled_qty || 0; net[o.symbol] = (net[o.symbol] || 0) + (o.side === 'buy' ? f : -f); }
    const unexplained = positions.filter(p => !R.universe.includes(p.symbol) || Math.abs((+p.qty) - (net[p.symbol] || 0)) > 1e-9);
    if (foreignOrders.length || unexplained.length) { out.phase = 'refused'; out.errors.push('الحساب ليس مستقلًا لـD1 (' + [...new Set([...foreignOrders, ...unexplained].map(x => x.symbol))].slice(0, 8).join('، ') + ') — لا يرسل ولا يلغي شيئًا. ضع مفاتيح الحساب الورقي الثاني'); return out; }

    const todays = orders.filter(o => String(o.client_order_id).startsWith(R.prefix + D + '-'));
    const openD1 = openAll.filter(o => isD1(o) && !TERMINAL.has(o.status));
    const oldOpen = openD1.filter(o => !String(o.client_order_id).startsWith(R.prefix + D + '-'));
    const pos = {}; for (const p of positions) pos[p.symbol] = { qty: +p.qty, avail: p.qty_available != null ? +p.qty_available : +p.qty, px: +p.current_price || 0 };
    const shorts = Object.entries(pos).filter(([, p]) => p.qty < 0).map(([s]) => s);
    const symOrders = (s, f) => todays.filter(o => o.symbol === s && (!f || f(o)));
    const rem = o => (+o.qty) - (+o.filled_qty || 0);
    const seq = (s, tag) => symOrders(s, o => String(o.client_order_id).startsWith(R.prefix + D + '-' + s + '-' + tag)).length + 1;

    const act = async (kind, sym, fn, info) => {
      const rec = Object.assign({ kind, sym }, info || {});
      if (!TRADING) { rec.dry = true; out.actions.push(rec); return null; }
      try { const r = await fn(); rec.ok = true; if (r && r.id) rec.id = r.id; out.actions.push(rec); return r || true; }
      catch (e) { rec.ok = false; rec.error = e.message; rec.status = e.status; rec.ambiguous = !(e.status >= 400 && e.status < 500); if (e.status === 422 && /client_order_id/i.test(e.message)) rec.exists = true; else out.errors.push(kind + ' ' + sym + ': ' + e.message); out.actions.push(rec); return null; }
    };
    const cancelled = new Set();
    const cancel = (o, why) => { if (cancelled.has(o.id) || o.status === 'pending_cancel') return null; cancelled.add(o.id); return act('cancel', o.symbol, () => api.del('/v2/orders/' + o.id), { cid: o.client_order_id, why }); };
    const submit = (body, why) => act(body.side === 'buy' ? 'buy' : (body.type === 'stop' ? 'stop' : 'sell'), body.symbol, () => api.post('/v2/orders', body), { cid: body.client_order_id, qty: +body.qty, type: body.type, limit: body.limit_price ? +body.limit_price : undefined, stop: body.stop_price ? +body.stop_price : undefined, why });
    const sellMkt = (s, q, why) => submit({ symbol: s, qty: String(q), side: 'sell', type: 'market', time_in_force: 'day', client_order_id: R.prefix + D + '-' + s + '-X' + seq(s, 'X') }, why);

    /* حقوق D1 والقتل وأقفال الدخول */
    const lastEq = +acc.last_equity, eqNow = +acc.equity;
    const d1Prev = R.budget + (lastEq - R.startEquity), d1Now = R.budget + (eqNow - R.startEquity);
    out.d1Equity = r2(d1Now); out.d1EquityPrevClose = r2(d1Prev);
    const killFloor = R.budget * (1 - R.killPct / 100);
    let killed = d1Prev <= killFloor;
    const why = [];
    if (!TRADING) why.push('تشغيل جاف (TRADING_ENABLED ليس true)');
    if (HALT) why.push('HALT مفعّل'); if (FLAT) why.push('FLATTEN_NOW مفعّل');
    /* D1-KILL-01: القتل دائم — يُشتق من تاريخ حقوق الحساب اليومي كاملًا منذ البداية (أي إغلاق ≤ 85% يقفل بقية التجربة). تعذر الإثبات ⇒ لا دخول */
    const wantEntries = m >= R.orMinutes && m < R.entryUntilMin && toClose > R.cancelBeforeCloseMin && !FLAT;
    if (wantEntries && !killed) { try { const hist = await killHistory(api, nowMs); out.killHistory = { days: hist.days, minD1: hist.minD1 == null ? null : r2(hist.minD1), at: hist.minAt };
        if (hist.minD1 != null && hist.minD1 <= killFloor) killed = true; }
      catch (e) { why.push('تعذر إثبات سجل مفتاح القتل: ' + e.message); } }
    out.killed = killed;
    if (killed) why.push('مفتاح القتل (دائم): حقوق D1 نزلت عند إغلاق يوم ما إلى ≤ 85% من الميزانية');
    if (lastEq > R.startEquity + R.budget * 0.5 || lastEq < R.startEquity - R.budget) why.push('رصيد الحساب عند إغلاق أمس (' + lastEq + ') لا يطابق بداية 100,000');
    if (n.date < R.start) why.push('قبل بداية D1 ' + R.start); if (n.date > R.end) why.push('بعد نهاية D1 ' + R.end);
    if (acc.status !== 'ACTIVE' || acc.trading_blocked || acc.account_blocked) why.push('الحساب غير نشط');
    if (shorts.length) why.push('مراكز بيع على المكشوف غير متوقعة: ' + shorts.join('، '));
    if (oldOpen.length) why.push('أوامر D1 قائمة من أيام سابقة');

    const closing = toClose <= R.cancelBeforeCloseMin || FLAT;
    const flattening = toClose <= R.flattenBeforeCloseMin || FLAT;
    out.phase = flattening ? 'flatten' : closing ? 'pre-close' : m < R.orMinutes ? 'opening-range' : m < R.entryUntilMin ? 'entry-window' : 'manage';

    /* نطاق الافتتاح (فشل البيانات لا يوقف الحماية ولا الخروج) */
    const orEnd = openMs + R.orMinutes * 60000; const OR = {};
    const needOR = !closing && m >= R.orMinutes && (Object.values(pos).some(p => p.qty > 0) || m < R.entryUntilMin);
    if (needOR) { try { const b = await getBars(api, R.universe, openMs, orEnd - 1000);
      for (const s of R.universe) { const a = (b[s] || []).filter(x => x.t >= openMs && x.t < orEnd); if (a.length >= R.minOrBars) OR[s] = { hi: Math.max(...a.map(x => x.h)), lo: Math.min(...a.map(x => x.l)), bars: a.length }; } }
      catch (e) { out.warnings.push('تعذر جلب نطاق الافتتاح هذه الدقيقة: ' + e.message); } }
    out.openingRange = OR;

    /* 1) قبل الإغلاق: إلغاء كل أوامر D1 القائمة (عدا أوامر الخروج بالسوق) */
    if (closing) { for (const o of openD1.filter(o => !(o.side === 'sell' && o.type === 'market'))) await cancel(o, 'قبل الإغلاق'); }
    /* 2) انتهاء نافذة الدخول أو الإيقاف أو الصلاحية: إلغاء أوامر الشراء القائمة */
    else for (const o of openD1.filter(o => o.side === 'buy')) {
      const age = (nowMs - Date.parse(o.submitted_at || o.created_at)) / 60000;
      if (m >= R.entryUntilMin || HALT || killed) await cancel(o, 'انتهت نافذة الدخول أو إيقاف');
      else if (age >= R.entryTtlMin) await cancel(o, 'انتهت صلاحية أمر الدخول (3 دقائق)');
    }
    if (oldOpen.length) for (const o of oldOpen) await cancel(o, 'أمر من يوم سابق');

    /* 3) المراكز: وقف أو خروج. قاعدة Alpaca: لا بيع (وقف أو سوق) مع شراء قائم للرمز نفسه ⇒ يُلغى باقي الشراء أولًا */
    for (const [s, p] of Object.entries(pos)) {
      if (!(p.qty > 0)) continue;
      const openBuys = openD1.filter(o => o.symbol === s && o.side === 'buy');
      if (openBuys.length) { for (const o of openBuys) if ((+o.filled_qty || 0) > 0) await cancel(o, 'تعبئة جزئية: إلغاء الباقي ثم الوقف'); out.warnings.push(s + ': شراء قائم، الوقف في الدقيقة التالية'); continue; }
      const openSells = openD1.filter(o => o.symbol === s && o.side === 'sell');
      const entered = symOrders(s, o => o.side === 'buy' && (+o.filled_qty || 0) > 0).length > 0;
      if (flattening || !entered) {
        if (!entered && !flattening) out.warnings.push(s + ': مركز D1 من يوم سابق (متبقٍ) ⇒ خروج فوري');
        if (openSells.some(o => o.type === 'market')) continue;
        const stops = openSells.filter(o => o.type !== 'market');
        if (stops.length) { if (!closing) for (const o of stops) await cancel(o, 'خروج'); continue; }
        if (p.avail + 1e-9 < p.qty) { out.warnings.push(s + ': الكمية محجوزة، ينتظر الإلغاء'); continue; }
        await sellMkt(s, p.qty, flattening ? 'خروج قبل الإغلاق' : 'خروج مركز متبقٍ');
        continue;
      }
      if (closing) continue;
      const ent = symOrders(s, o => o.side === 'buy' && (+o.filled_qty || 0) > 0)[0]; const mL = /-L(\d+)$/.exec(String(ent.client_order_id));
      const want = mL ? (+mL[1]) / 100 : (OR[s] ? r2(OR[s].lo - 0.01) : null);
      if (!(want > 0)) { out.warnings.push(s + ': سعر الوقف غير معروف هذه الدقيقة'); continue; }
      const stops = openSells.filter(o => o.type === 'stop' || o.type === 'stop_limit');
      if (stops.length === 1 && Math.abs(rem(stops[0]) - p.qty) < 1e-9 && Math.abs(+stops[0].stop_price - want) < 0.005) continue;
      if (stops.length) { for (const o of stops) await cancel(o, 'وقف بكمية أو سعر غير مطابق'); continue; }
      if (openSells.length) continue;
      if (p.px > 0 && p.px <= want) { await sellMkt(s, p.qty, 'السعر تحت الوقف قبل وضعه'); continue; }
      const r = await submit({ symbol: s, qty: String(p.qty), side: 'sell', type: 'stop', stop_price: want.toFixed(2), time_in_force: 'day', client_order_id: R.prefix + D + '-' + s + '-S' + seq(s, 'S') }, 'وقف عند أدنى النطاق');
      const la = out.actions[out.actions.length - 1];
      if (!r && TRADING && la && la.ok === false && !la.exists && /stop/i.test(la.error || '')) await sellMkt(s, p.qty, 'رُفض الوقف (السعر تحته) ⇒ خروج');
    }

    /* 4) الدخول */
    const inWindow = m >= R.orMinutes && m < R.entryUntilMin && !closing;
    if (inWindow) {
      if (why.length) out.blocked = why.slice();
      let recent = null; try { recent = await getBars(api, R.universe, Math.floor(nowMs / 60000) * 60000 - 6 * 60000, nowMs); } catch (e) { out.warnings.push('تعذر جلب الشموع الحديثة: لا دخول هذه الدقيقة'); }
      if (recent) {
      let committed = 0; for (const [s, p] of Object.entries(pos)) if (p.qty > 0) committed += p.qty * p.px;
      for (const o of openD1) if (o.side === 'buy') committed += rem(o) * (+o.limit_price || 0);
      let avail = Math.min(d1Now - committed, +acc.cash || 0);
      out.signals = [];
      /* D1-ACK-01: رقم دخول يومي عام n في المعرّف (بلا رمز) ⇒ تشغيلان متزامنان يتصادمان على المعرّف نفسه؛ الحجز قبل الإرسال؛ النتيجة الغامضة توقف بقية الدخول */
      let nextN = todays.filter(x => x.side === 'buy').length + 1; let stopEntries = false;
      for (const s of R.universe) {
        if (stopEntries) break;
        const o = OR[s]; if (!o) { out.signals.push({ s, why: 'نطاق الافتتاح ناقص' }); continue; }
        const buys = symOrders(s, x => x.side === 'buy');
        if (buys.some(x => (+x.filled_qty || 0) > 0)) continue;
        if (buys.some(x => !TERMINAL.has(x.status))) continue;
        if (buys.length >= R.maxAttempts) continue;
        if ((pos[s] && pos[s].qty !== 0) || openD1.some(x => x.symbol === s && x.side === 'sell')) continue;
        const done = (recent[s] || []).filter(b => b.t >= orEnd && b.t + 60000 <= nowMs && b.t >= nowMs - (R.signalMaxAgeMin + 1) * 60000);
        const last = done[done.length - 1]; if (!last || !(last.c > o.hi)) continue;
        const limit = r2(last.c * (1 + R.entryLimitBufPct / 100)), stop = r2(o.lo - 0.01);
        if (!(stop > 0) || !(limit > stop)) continue;
        const qRisk = Math.floor((d1Now * R.riskPct / 100) / (limit - stop)), qCap = Math.floor((d1Now * R.maxPosPct / 100) / limit), qCash = Math.floor(avail / limit);
        const qty = Math.min(qRisk, qCap, qCash);
        const sig = { s, close: last.c, orHigh: o.hi, orLow: o.lo, limit, stop, qty, qRisk, qCap, qCash };
        out.signals.push(sig);
        if (qty < 1) { sig.why = 'الحجم أقل من سهم (المخاطرة أو النقد)'; continue; }
        if (why.length) { sig.why = 'محجوب: ' + why[0]; continue; }
        const cid = R.prefix + D + '-N' + nextN + '-E-L' + Math.round(stop * 100);
        avail -= qty * limit; /* حجز قبل الإرسال */
        const r = await submit({ symbol: s, qty: String(qty), side: 'buy', type: 'limit', limit_price: limit.toFixed(2), time_in_force: 'day', client_order_id: cid }, 'اختراق أعلى نطاق الافتتاح');
        const la = out.actions[out.actions.length - 1];
        if (r) { nextN++; continue; }
        if (la && la.exists) { out.warnings.push('معرّف الدخول ' + cid + ' مستعمل (تشغيل متزامن؟) ⇒ لا دخول آخر هذه الدقيقة'); stopEntries = true; continue; }
        if (la && la.ambiguous) { let found = null;
          try { found = await api.get('/v2/orders:by_client_order_id?client_order_id=' + encodeURIComponent(cid)); } catch (e) { if (e.status !== 404) found = undefined; }
          if (found && found.id) { la.resolved = 'accepted-by-lookup'; nextN++; continue; }
          if (found === undefined) { la.resolved = 'unknown'; out.warnings.push('نتيجة إرسال غامضة لـ' + cid + ' ⇒ الحجز باقٍ ولا دخول آخر حتى تُحسم'); stopEntries = true; continue; }
          la.resolved = 'not-found'; }
        avail += qty * limit; /* رفض صريح أو غير موجود ⇒ فك الحجز */
      }
      }
    }
  } catch (e) { out.errors.push(e.message); }
  out.calls = api.calls();
  return out;
}

async function killHistory(api, nowMs) {
  const j = await api.get('/v2/account/portfolio/history?period=1A&timeframe=1D');
  if (!j || !Array.isArray(j.timestamp) || !Array.isArray(j.equity)) throw new Error('تاريخ الحقوق غير مقروء');
  const today = nyParts(nowMs).date; let minD1 = null, minAt = null, days = 0, peak = null, dd = 0;
  for (let i = 0; i < j.timestamp.length; i++) { const d = nyParts(j.timestamp[i] * 1000).date; const e = j.equity[i];
    if (d < RULES.start || d >= today || e == null || !(+e > 0)) continue; days++;
    const d1 = RULES.budget + (+e - RULES.startEquity); if (minD1 == null || d1 < minD1) { minD1 = d1; minAt = d; }
    peak = peak == null ? d1 : Math.max(peak, d1); dd = Math.max(dd, peak - d1); }
  return { minD1, minAt, days, equityDrawdown: dd };
}

/* ---------- صفحة الحالة (قراءة فقط) ---------- */
async function rulesHash() { const b = new TextEncoder().encode(JSON.stringify(RULES)); const h = await crypto.subtle.digest('SHA-256', b); return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, '0')).join(''); }

/* D1-PNL-01: مطابقة التعبئات عبر الأيام لكل رمز (من صفر إلى صفر). الصفقة التي بات مركزها تبقى في الربح والهبوط وتُعلَّم overnight، ولا تُعد ضمن صفقات اليوم الواحد */
function tradesFromFills(fills, nowMs) {
  const c = RULES.judge.costPerSidePct / 100; const bySym = new Map(); const trades = [];
  const fs = fills.slice().sort((a, b) => (a.transaction_time < b.transaction_time ? -1 : a.transaction_time > b.transaction_time ? 1 : 0));
  for (const f of fs) { const q = +f.qty, px = +f.price; let x = bySym.get(f.symbol);
    if (!x) { x = { sym: f.symbol, pos: 0, bq: 0, bn: 0, sq: 0, sn: 0, entryAt: null, exitAt: null }; bySym.set(f.symbol, x); }
    if (x.pos === 0 && x.bq === 0 && x.sq === 0) x.entryAt = f.transaction_time;
    if (f.side === 'buy') { x.pos += q; x.bq += q; x.bn += q * px; } else { x.pos -= q; x.sq += q; x.sn += q * px; x.exitAt = f.transaction_time; }
    if (Math.abs(x.pos) < 1e-9 && x.bq > 0) { const gross = x.sn - x.bn, cost = c * (x.bn + x.sn); const ed = nyParts(Date.parse(x.entryAt)).date, xd = nyParts(Date.parse(x.exitAt)).date;
      trades.push({ date: xd, entryDate: ed, sym: x.sym, qty: x.bq, entry: r2(x.bn / x.bq), exit: r2(x.sn / x.sq), gross: r2(gross), net: r2(gross - cost), pct: +((gross - cost) / x.bn * 100).toFixed(3), overnight: ed !== xd, exitAt: x.exitAt });
      bySym.set(f.symbol, null); } }
  const today = nowMs ? nyParts(nowMs).date : null; const open = [];
  for (const x of bySym.values()) if (x && (x.bq > 0 || x.sq > 0)) open.push({ sym: x.sym, since: nyParts(Date.parse(x.entryAt)).date, qty: x.pos, bought: x.bq, sold: x.sq, stale: today ? nyParts(Date.parse(x.entryAt)).date < today : false, short: x.pos < -1e-9 });
  return { trades, open };
}
function judge(trades, ctx) {
  const J = RULES.judge; ctx = ctx || {};
  const all = trades, intraday = trades.filter(t => !t.overnight); const n = intraday.length; const nets = all.map(t => t.net);
  const gw = nets.filter(v => v > 0).reduce((a, v) => a + v, 0), gl = -nets.filter(v => v < 0).reduce((a, v) => a + v, 0); const total = nets.reduce((a, v) => a + v, 0);
  let eq = 0, peak = 0, dd = 0; for (const v of nets) { eq += v; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq); }
  const ddAll = Math.max(dd, +ctx.equityDrawdown || 0);
  const mean = all.length ? total / all.length : 0; const sd = all.length > 1 ? Math.sqrt(nets.reduce((a, v) => a + (v - mean) ** 2, 0) / (all.length - 1)) : 0; const t = sd > 0 ? mean / (sd / Math.sqrt(all.length)) : null;
  const pf = gl > 0 ? gw / gl : (gw > 0 ? Infinity : null);
  const c = { trades50: n >= J.minTrades, netPositive: total > 0, profitFactor: pf != null && pf >= J.minProfitFactor, drawdown: ddAll <= RULES.budget * J.maxDdPctOfBudget / 100 };
  const incomplete = []; if (ctx.truncated) incomplete.push('سجل التعبئات مقطوع'); if ((ctx.open || []).some(o => o.stale || o.short)) incomplete.push('مركز مفتوح من يوم سابق أو بيع على المكشوف'); if (ctx.historyError) incomplete.push('تاريخ الحقوق غير مقروء: ' + ctx.historyError);
  const verdict = incomplete.length ? 'لا حكم: الدفتر غير مكتمل (' + incomplete.join('، ') + ')' : n < J.minTrades ? 'لم يكتمل (' + n + ' من ' + J.minTrades + ' صفقة يومية)' : (Object.values(c).every(Boolean) ? (t != null && t >= J.strongT ? 'ناجح: واعد بقوة' : 'ناجح: واعد، يحتاج صفقات أكثر') : 'راسب');
  return { trades: n, overnightTrades: all.length - n, overnightNet: r2(all.filter(x => x.overnight).reduce((a, x) => a + x.net, 0)), wins: nets.filter(v => v > 0).length, losses: nets.filter(v => v < 0).length, netTotal: r2(total), avgNet: r2(mean), profitFactor: pf == null ? null : (pf === Infinity ? 'inf' : +pf.toFixed(2)), maxDrawdown: r2(ddAll), realizedDrawdown: r2(dd), equityDrawdown: r2(+ctx.equityDrawdown || 0), tStat: t == null ? null : +t.toFixed(2), criteria: c, incomplete, verdict };
}
async function status(env, nowMs, fetchFn) {
  const api = makeApi(env, fetchFn); const o = { version: VERSION, at: isoS(nowMs), rulesHash: await rulesHash(), rules: RULES, mode: flag(env.TRADING_ENABLED) ? 'trading' : 'dry-run', halt: flag(env.HALT), flattenNow: flag(env.FLATTEN_NOW) };
  if (!env.APCA_API_KEY_ID || !env.APCA_API_SECRET_KEY) { o.error = 'المفاتيح غير موجودة'; return o; }
  try {
    const acc = await api.get('/v2/account'); const paper = String(acc.account_number || '').startsWith('PA');
    o.account = { paper, masked: acc.account_number ? '****' + String(acc.account_number).slice(-4) : null, status: acc.status, equity: +acc.equity, lastEquity: +acc.last_equity, cash: +acc.cash };
    if (!paper) { o.error = 'الحساب ليس ورقيًا'; return o; }
    o.d1Equity = r2(RULES.budget + (+acc.equity - RULES.startEquity));
    let hist = null, historyError = null; try { hist = await killHistory(api, nowMs); } catch (e) { historyError = e.message; }
    o.killed = RULES.budget + (+acc.last_equity - RULES.startEquity) <= RULES.budget * (1 - RULES.killPct / 100) || !!(hist && hist.minD1 != null && hist.minD1 <= RULES.budget * (1 - RULES.killPct / 100));
    const fills = []; let token = null, pages = 0;
    do { const j = await api.get('/v2/account/activities/FILL?after=' + RULES.start + 'T00:00:00Z&direction=asc&page_size=100' + (token ? '&page_token=' + encodeURIComponent(token) : '')) || [];
      fills.push(...j); token = j.length === 100 ? j[j.length - 1].id : null; } while (token && ++pages < 25);
    const T = tradesFromFills(fills, nowMs); o.judge = judge(T.trades, { open: T.open, truncated: !!token, equityDrawdown: hist ? hist.equityDrawdown : 0, historyError }); o.openPositions = T.open; o.recentTrades = T.trades.slice(-40).reverse();
    const n = nyParts(nowMs); const todays = ((await api.get('/v2/orders?status=all&after=' + isoS(nowMs - 864e5) + '&limit=200&direction=desc')) || []).filter(x => String(x.client_order_id || '').startsWith(RULES.prefix + ymd(n.date) + '-'));
    o.todayOrders = todays.map(x => ({ cid: x.client_order_id, sym: x.symbol, side: x.side, type: x.type, qty: +x.qty, filled: +x.filled_qty || 0, avg: x.filled_avg_price ? +x.filled_avg_price : null, status: x.status }));
    o.foreignOrders = ((await api.get('/v2/orders?status=all&limit=50&direction=desc')) || []).filter(x => !String(x.client_order_id || '').startsWith(RULES.prefix)).length;
  } catch (e) { o.error = e.message; }
  return o;
}

export default {
  /* الجدولة في Cloudflare: "* 13-21 * * MON-FRI" (توقيت UTC؛ أيام الأسبوع بالأسماء لأن Cloudflare يعد 1 = الأحد) */
  async scheduled(event, env, ctx) {
    const run = (async () => { const now = Date.now(); const r = await tick(env, now, fetch); if (!env.D1_KV) return;
      const KV = env.D1_KV; const mm = new Date(now).getUTCMinutes();
      try {
        if (r.phase !== 'closed' && (mm % 5 === 0 || r.actions.length || r.errors.length)) await KV.put('last', JSON.stringify(r));
        if (r.actions.some(a => !a.dry)) await KV.put('last-action', JSON.stringify(r));
        if (r.errors.length) { const sig = JSON.stringify(r.errors); if ((await KV.get('last-error-sig')) !== sig) { await KV.put('last-error', JSON.stringify(r)); await KV.put('last-error-sig', sig); } }
        if (mm % 15 === 0 && (r.calls || 0) <= 20) await KV.put('status', JSON.stringify(await status(env, now, fetch)));
      } catch (e) {} })();
    ctx.waitUntil(run);
  },
  /* صفحة الحالة تقرأ لقطة محفوظة فقط (صفر طلبات للوسيط)، تُحدّث كل 15 دقيقة من الجدولة */
  async fetch(request, env) {
    const u = new URL(request.url);
    const h = { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'no-store' };
    if (u.pathname === '/status' || u.pathname === '/') {
      if (!env.D1_KV) return new Response(JSON.stringify({ version: VERSION, error: 'مخزن D1_KV غير مربوط — صفحة الحالة تحتاجه' }), { status: 503, headers: h });
      const g = async k => { try { return JSON.parse((await env.D1_KV.get(k)) || 'null'); } catch (e) { return null; } };
      const o = { version: VERSION, rulesHash: await rulesHash(), snapshot: await g('status'), lastTick: await g('last'), lastAction: await g('last-action'), lastError: await g('last-error') };
      if (!o.snapshot) o.note = 'لم تُكتب لقطة بعد: تُكتب عند الدقيقة 00 و15 و30 و45 من ساعات الجدولة';
      return new Response(JSON.stringify(o, null, 1), { headers: h });
    }
    return new Response('{"error":"not found"}', { status: 404, headers: h });
  },
  _t: { tick, status, tradesFromFills, judge, nyParts, nyLocalToUtc, RULES, VERSION, rulesHash }
};
