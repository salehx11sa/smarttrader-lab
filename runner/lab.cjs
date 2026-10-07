#!/usr/bin/env node
/* SmartTrader PAPER LAB 0.1 — محرّك المختبر الورقي (سبعة لاعبين في حساب Alpaca ورقي واحد، لكل لاعب دفتر مستقل).
   قرار صالح (7 أكتوبر 2026): مختبر ورقي أمامي 3 أشهر. المال الحقيقي مقفل: لا عنوان حي في هذا الملف، وLIVE_CAPS لا تُستعمل ولا تُمس.
   الأمان المحفوظ من المنفّذ المقبول (7.2.19-dev):
     • paper-api فقط + حساب PA فقط • TRADING_ENABLED=true وحده يسمح بالإرسال (وإلا تشغيل جاف) • RUNNER_PATH المعتمد • RUNNER_MODE=lab
     • HALT وENTRIES_ENABLED=false وقفل البوابة (TRIGGER_ENTRY_LOCK/manual-recovery) ⇒ صفر شراء (الخروج والحماية مستمران)
     • استمرارية الحالة (state_guard ⇒ continuity.json) • حوادث الحفظ وزوج السجل/التقرير (من runner.cjs كما هو) • الأعلام
     • النقد المسوّى مثبت على مستوى الحساب (caps.proveSettledCash) ولكل دفتر (نقده − بيوعه غير المسوّاة) • caps.checkEntry لكل دخول
     • المراكز القديمة (AMD/CAT/MSFT/NVDA) ووقفاتها لا تُمس أبدًا: حزام في طبقة الطلبات
   الأوامر: lab-overnight (16:15→09:15 نيويورك: أوامر الافتتاح opg لكل اللاعبين) • lab-postopen (أثناء الجلسة: حماية بوقف GTC، ومطابقة،
            وأوامر الإغلاق cls للّيلي) • lab-status (قراءة فقط) • lab-clear-flags */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ST = require('./lab_strats.cjs');
const DS = require('./daily_strat.js');
const CAPS = require('./caps.cjs');
const RL = require('./runner.cjs'); /* مكتبة فقط: scanSaveIncidents/lastRunPair/pairCovered/verifySave/nyParts — نسخة مطابقة حرفيًا لـ7.2.19-dev */
const PAPER = 'https://paper-api.alpaca.markets', DATA = 'https://data.alpaca.markets';
const VERSION = 'lab-0.1';
/* النوافذ بتوقيت نيويورك. حدود Alpaca الفعلية لأوامر opg (قرابة 09:28) وcls (قرابة 15:50) غير متحقق منها — حدودنا أبكر للاحتياط. */
const WIN = Object.freeze({ overnightStartHm: 16 * 60 + 15, overnightCutoffHm: 9 * 60 + 15, clsStartHm: 9 * 60 + 35, clsCutoffBeforeCloseMin: 15, opgCleanupHm: 9 * 60 + 35, alpacaCutoffsVerified: false });
const TERMINAL = new Set(['canceled', 'expired', 'rejected', 'filled', 'replaced', 'done_for_day']);
const ACTIVE_STOP = new Set(['new', 'accepted']);
/* نسخة سريعة من nyParts في المنفّذ (المنسّق مخزّن مؤقتًا؛ النتيجة نفسها) */
const NYF = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
const NYC = new Map();
function nyParts(ms) { const k = Math.floor(ms / 60000); let r = NYC.get(k); if (r) return r; const o = {}; NYF.formatToParts(new Date(ms)).forEach(p => o[p.type] = p.value);
  r = { date: o.year + '-' + o.month + '-' + o.day, hm: (+o.hour % 24) * 60 + (+o.minute) }; if (NYC.size > 200000) NYC.clear(); NYC.set(k, r); return r; }
const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
const ymd = d => String(d).replace(/-/g, '');
const r2 = x => +(+x).toFixed(2);
/* وقت نيويورك ⇒ UTC ms (يعالج التوقيت الصيفي والشتوي) */
function nyMs(date, hm) { const hh = String(Math.floor(hm / 60)).padStart(2, '0'), mm = String(hm % 60).padStart(2, '0');
  for (const off of ['-04:00', '-05:00']) { const t = Date.parse(date + 'T' + hh + ':' + mm + ':00' + off); const p = nyParts(t); if (p.date === date && p.hm === hm) return t; }
  return Date.parse(date + 'T' + hh + ':' + mm + ':00-05:00'); }
function isoWeek(d) { const t = new Date(d + 'T12:00:00Z'); const day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day + 3); const y = t.getUTCFullYear();
  const f = new Date(Date.UTC(y, 0, 4)); const w = 1 + Math.round(((t - f) / 864e5 - 3 + ((f.getUTCDay() + 6) % 7)) / 7); return y + '-W' + String(w).padStart(2, '0'); }
function refOfCid(cid) { const m = /-r(\d+)$/.exec(String(cid || '')); return m ? (+m[1]) / 100 : null; }
function targetOfCid(cid) { const b = ST.bookOfCid(cid); if (!b) return null; const m = /^(\d{8})-/.exec(String(cid).slice(b.prefix.length)); return m ? m[1].slice(0, 4) + '-' + m[1].slice(4, 6) + '-' + m[1].slice(6, 8) : null; }
function addMonths(date, n) { const [y, m, d] = date.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1 + n, d)); return t.toISOString().slice(0, 10); }
function labEndOf(cfg) { if (!cfg.labStart) return null; return cfg.labEnd || addMonths(cfg.labStart, cfg.labMonths || 3); }

function mkLab(env, io) {
  env = env || process.env; io = io || {};
  const fetchFn = io.fetch || globalThis.fetch; const now = io.now || (() => Date.now());
  const cfg = Object.assign({ labStart: null, labMonths: 3, approvedPath: 'github-actions', foreignBaseline: { AMD: 1, CAT: 1, MSFT: 3, NVDA: 3 },
    universeFiles: { 'U-LIQ': 'universe-U-LIQ.json', 'U-LOW': 'universe-U-LOW.json' }, minUniverse: 50, requestTimeoutMs: 15000, freezeFile: 'lab-freeze.json' }, io.config || {});
  const DIR = io.dir || __dirname;
  const STATE_DIR = io.stateDir || path.join(DIR, 'state'); const REPORTS_DIR = io.reportsDir || path.join(DIR, 'reports'); const LABREP = io.labReportsDir || path.join(DIR, 'lab-reports'); /* تقارير المختبر المشتقة (تُعاد كتابتها) — خارج reports حتى لا تُعد «تعارضًا» عند استعادة الحارس */
  const TRADING = String(env.TRADING_ENABLED || '').toLowerCase() === 'true';
  const ENTRIES = String(env.ENTRIES_ENABLED || 'true').toLowerCase() !== 'false';
  const HALT = String(env.HALT || '').toLowerCase() === 'true';
  const MODE_OK = String(env.RUNNER_MODE || '') === 'lab';
  const TRIG_SOURCE = env.TRIGGER_SOURCE == null ? '' : String(env.TRIGGER_SOURCE); const TRIG_LOCK_RAW = env.TRIGGER_ENTRY_LOCK == null ? '' : String(env.TRIGGER_ENTRY_LOCK);
  const ENTRY_LOCK = (TRIG_LOCK_RAW !== '' && TRIG_LOCK_RAW.trim().toLowerCase() !== 'off') ? TRIG_LOCK_RAW : (TRIG_SOURCE.trim() === 'manual-recovery' ? 'manual-recovery' : null);
  const RUN_PATH = String(env.RUNNER_PATH || '').trim(); const PATH_OK = !!cfg.approvedPath && RUN_PATH === cfg.approvedPath;
  const KEY = env.APCA_API_KEY_ID || '', SEC = env.APCA_API_SECRET_KEY || '';
  const BASELINE = Object.freeze(Object.assign({}, cfg.foreignBaseline || {}));
  const LAB_END = labEndOf(cfg);
  let READONLY = false; let ENTRY_BLOCK = null; /* سبب منع الشراء في هذا التشغيل (حزام إضافي في طبقة الطلبات) */
  const LAB_ORDER_IDS = new Map(); /* id ⇒ أمر للمختبر (للإلغاء فقط) */
  const report = { tool: 'SmartTrader-PaperLab', version: VERSION, rulesVersion: ST.LAB_VERSION, at: new Date(now()).toISOString(), cmd: io.cmd || null, trading: TRADING, entries: ENTRIES, halt: HALT,
    runnerMode: env.RUNNER_MODE || null, labStart: cfg.labStart, labEnd: LAB_END, approvedPath: { approved: cfg.approvedPath, thisRun: RUN_PATH || null, ok: PATH_OK },
    steps: [], warnings: [], errors: [], orders: [], wouldSend: [], intents: [], crossesCreated: [], skipped: [],
    runEnv: { path: RUN_PATH || null, githubRunId: env.GITHUB_RUN_ID || null, githubRunAttempt: env.GITHUB_RUN_ATTEMPT || null, githubWorkflow: env.GITHUB_WORKFLOW || null, githubEvent: env.GITHUB_EVENT_NAME || null,
      githubRepository: env.GITHUB_REPOSITORY || null, githubRunNumber: env.GITHUB_RUN_NUMBER || null, githubSchedule: env.GH_EVENT_SCHEDULE || null, triggerSource: TRIG_SOURCE || null, triggerEntryLock: TRIG_LOCK_RAW || null, entryLock: ENTRY_LOCK } };
  const STARTED = now(); report.runEnv.startedAt = new Date(STARTED).toISOString();
  const sleep = io.sleep || (ms => new Promise(r => setTimeout(r, ms)));
  const log = (k, x) => { if (io.verbose) console.log(k, JSON.stringify(x || {})); };

  /* ---------- الحالة المحلية ---------- */
  function readState(name, def) { try { return JSON.parse(fs.readFileSync(path.join(STATE_DIR, name), 'utf8')); } catch (e) { return def; } }
  function writeState(name, v, force) { if (READONLY && !force) return; fs.mkdirSync(STATE_DIR, { recursive: true }); fs.writeFileSync(path.join(STATE_DIR, name), JSON.stringify(v, null, 1)); }
  function readFlags() { const f = path.join(STATE_DIR, 'flags.json'); if (!fs.existsSync(f)) return { active: [], cleared: [] };
    let v = null; try { v = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { v = null; }
    if (v && Array.isArray(v.active) && Array.isArray(v.cleared) && v.active.concat(v.cleared).every(x => x && typeof x.id === 'string')) return v;
    const at = new Date(now()).toISOString(); const ts = at.replace(/[:.]/g, '-');
    const F = { active: [{ id: 'flags-corrupt-' + ts, kind: 'state-corrupt', at, detail: { note: 'state/flags.json تالف — نُسخ إلى state/evidence' } }], cleared: [] };
    if (!READONLY) { try { fs.mkdirSync(path.join(STATE_DIR, 'evidence'), { recursive: true }); fs.copyFileSync(f, path.join(STATE_DIR, 'evidence', 'flags-' + ts + '.corrupt')); } catch (e) {} writeState('flags.json', F, true); }
    return F; }
  function raise(kind, id, detail) { if (READONLY || !TRADING) { report.warnings.push('علم (لم يُحفظ — تشغيل جاف/قراءة): ' + kind + ' ' + id); return; }
    const F = readFlags(); if (F.active.some(f => f.id === id) || F.cleared.some(f => f.id === id)) return; F.active.push({ id, kind, at: new Date(now()).toISOString(), detail }); writeState('flags.json', F); }
  function readCrosses() { const a = readState('lab-crosses.json', []); const m = new Map(); for (const x of Array.isArray(a) ? a : []) if (x && x.id && x.buyer && x.seller && x.qty > 0) m.set(x.id, x); return [...m.values()].sort((a, b) => a.id < b.id ? -1 : 1); }

  /* ---------- طبقة الطلبات + الأحزمة ---------- */
  async function req(method, url, body, opt) {
    opt = opt || {}; const dataApi = !!opt.dataApi;
    if (dataApi && method !== 'GET') throw new Error('data API: GET فقط');
    if (READONLY && method !== 'GET') throw new Error('وضع القراءة فقط: رُفض ' + method + ' ' + url);
    if (method !== 'GET') belt(method, url, body);
    if (method !== 'GET' && !TRADING) { report.wouldSend.push({ method, url, body }); return { __dry: true, id: 'dry-' + report.wouldSend.length, status: 'dry' }; }
    if (method !== 'GET' && !PATH_OK) throw new Error('مسار غير معتمد: RUNNER_PATH=' + (RUN_PATH || '(فارغ)') + ' — رُفض ' + method + ' قبل الإرسال');
    if (method !== 'GET' && !MODE_OK) throw new Error('RUNNER_MODE ليس lab — رُفض ' + method + ' قبل الإرسال');
    const full = (dataApi ? DATA : PAPER) + url;
    const TMO = io.requestTimeoutMs || cfg.requestTimeoutMs || 15000; let tm = null;
    const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const hdr = { 'APCA-API-KEY-ID': KEY, 'APCA-API-SECRET-KEY': SEC }; if (body) hdr['Content-Type'] = 'application/json';
    const work = (async () => { const r = await fetchFn(full, { method, headers: hdr, body: body ? JSON.stringify(body) : undefined, signal: ac ? ac.signal : undefined }); const t = await r.text(); return { r, t }; })(); work.catch(() => {});
    let got; try { got = await Promise.race([work, new Promise((_, rej) => { tm = setTimeout(() => { try { ac && ac.abort(); } catch (e) {} const e = new Error(method + ' ' + url + ' → مهلة ' + TMO + 'ms'); e.status = 0; rej(e); }, TMO); })]); } finally { clearTimeout(tm); }
    let j = null; try { j = got.t ? JSON.parse(got.t) : null; } catch (e) { j = null; }
    if (!got.r.ok) { const e = new Error(method + ' ' + url + ' → HTTP ' + got.r.status + ' ' + String((j && j.message) || got.t || '').slice(0, 160)); e.status = got.r.status; throw e; }
    if (method !== 'GET') report.orders.push({ method, url, body, status: got.r.status, id: j && j.id, orderStatus: j && j.status });
    return j;
  }
  /* الأحزمة: تُفحص قبل أي إرسال (وفي التشغيل الجاف أيضًا) */
  function belt(method, url, body) {
    if (method === 'POST' && /^\/v2\/orders\/?$/.test(url)) {
      const b = body || {}; const cid = String(b.client_order_id || ''); const book = ST.bookOfCid(cid); const side = String(b.side || '').toLowerCase(); const sym = String(b.symbol || '');
      if (!book) throw new Error('أمر بلا بادئة مختبر (' + (cid || 'بلا معرّف') + ') — رُفض قبل الإرسال');
      if (Object.prototype.hasOwnProperty.call(BASELINE, sym)) throw new Error('الرمز ' + sym + ' من المراكز القديمة — المختبر لا يلمسه أبدًا');
      if (b.order_class || b.stop_loss || b.take_profit || b.extended_hours) throw new Error('شكل أمر غير مسموح في المختبر (order_class/extended)');
      if (side === 'buy') {
        if (ENTRY_LOCK) throw new Error('قفل دخول من بوابة الجدولة: ' + ENTRY_LOCK + ' — رُفض شراء ' + sym);
        if (HALT) throw new Error('HALT مفعّل — رُفض شراء ' + sym);
        if (!ENTRIES) throw new Error('ENTRIES_ENABLED=false — رُفض شراء ' + sym);
        if (ENTRY_BLOCK) throw new Error('الدخول ممنوع في هذا التشغيل (' + ENTRY_BLOCK + ') — رُفض شراء ' + sym);
      }
      const kind = book.kind; const tif = b.time_in_force; const type = b.type;
      if (kind === 'ref') { if (side !== 'buy') throw new Error('الحَكَم لا يبيع أبدًا — رُفض قبل الإرسال'); if (sym !== 'VOO' || type !== 'market' || tif !== 'opg') throw new Error('الحَكَم: شراء VOO بأمر افتتاح فقط'); }
      else if (kind === 't1' || kind === 'tm1') { if (sym !== 'SPY' || type !== 'market' || tif !== 'opg') throw new Error(book.id + ': SPY بأمر افتتاح opg فقط'); }
      else if (kind === 'o1') { if (sym !== 'SPY' || type !== 'market' || !((side === 'buy' && tif === 'cls') || (side === 'sell' && tif === 'opg'))) throw new Error(book.id + ': شراء cls وبيع opg لـSPY فقط'); }
      else if (kind === 'rsi2') { if (ST.ETF_SYMBOLS.includes(sym)) throw new Error(book.id + ': لا صناديق في دفتر الأسهم');
        const okShape = (type === 'market' && tif === 'opg') || (side === 'sell' && type === 'stop' && tif === 'gtc' && +b.stop_price > 0); if (!okShape) throw new Error(book.id + ': شكل أمر غير مسموح ' + type + '/' + tif); }
      else throw new Error('نوع دفتر غير معروف');
      if (!(Number.isInteger(+b.qty) && +b.qty >= 1)) throw new Error('كمية غير صحيحة');
      return;
    }
    if (method === 'DELETE' && /^\/v2\/orders\/[^/]+$/.test(url)) { const id = url.split('/').pop(); const o = LAB_ORDER_IDS.get(id);
      if (!o) throw new Error('إلغاء أمر ليس للمختبر (' + id + ') — رُفض قبل الإرسال'); if (Object.prototype.hasOwnProperty.call(BASELINE, o.symbol)) throw new Error('أمر على مركز قديم — لا يُلغى'); return; }
    throw new Error('طلب تعديل غير مسموح في المختبر: ' + method + ' ' + url);
  }

  /* ---------- حالة الوسيط ---------- */
  function fromIso() { const a = now() - 25 * 864e5; const b = cfg.labStart ? Date.parse(cfg.labStart + 'T00:00:00Z') - 10 * 864e5 : a; return new Date(Math.min(a, b)).toISOString(); }
  async function loadBroker() {
    const acc = await req('GET', '/v2/account'); const clock = await req('GET', '/v2/clock'); const positions = await req('GET', '/v2/positions') || [];
    if (!String(acc && acc.account_number || '').startsWith('PA')) throw new Error('الحساب ليس ورقيًا (PA) — المختبر يرفض العمل');
    const after0 = fromIso(); const orders = []; { const ids = new Set(); let after = after0, complete = false;
      for (let i = 0; i < 40; i++) { const r = await req('GET', '/v2/orders?status=all&nested=true&direction=asc&limit=500&after=' + encodeURIComponent(after)); if (!r || !r.length) { complete = true; break; }
        let fresh = 0; for (const o of r) { if (!ids.has(o.id)) { ids.add(o.id); orders.push(o); fresh++; } (o.legs || []).forEach(l => { if (l && !ids.has(l.id)) { ids.add(l.id); orders.push(Object.assign({}, l, { _parentCid: o.client_order_id })); } }); }
        if (r.length < 500) { complete = true; break; } if (!fresh) throw new Error('ترقيم الأوامر عالق'); after = new Date(Date.parse(r[r.length - 1].submitted_at) - 1).toISOString(); }
      if (!complete) throw new Error('سجل الأوامر غير مكتمل'); }
    let fills = []; { let tok = null, done = false; for (let i = 0; i < 60; i++) { const r = await req('GET', '/v2/account/activities/FILL?direction=asc&page_size=100&after=' + encodeURIComponent(after0) + (tok ? '&page_token=' + encodeURIComponent(tok) : ''));
        if (!r || !r.length) { done = true; break; } fills.push(...r); if (r.length < 100) { done = true; break; } tok = r[r.length - 1].id; }
      if (!done) throw new Error('سجل التعبئات غير مكتمل'); const s = new Set(); fills = fills.filter(a => s.has(a.id) ? false : (s.add(a.id), true)); }
    const n = nyParts(now()); const calFrom = new Date(Math.min(now(), cfg.labStart ? Date.parse(cfg.labStart) : now()) - 430 * 864e5).toISOString().slice(0, 10); const calTo = new Date(now() + 45 * 864e5).toISOString().slice(0, 10);
    const calRaw = await req('GET', '/v2/calendar?start=' + calFrom + '&end=' + calTo); if (!Array.isArray(calRaw) || !calRaw.length) throw new Error('تقويم الوسيط فارغ');
    const calInfo = {}; for (const c of calRaw) if (c && c.date) calInfo[c.date] = { open: c.open || '09:30', close: c.close || '16:00' };
    const cal = ST.sortedDates(Object.keys(calInfo));
    const lab = [], foreign = []; for (const o of orders) { const b = ST.bookOfCid(o.client_order_id || o._parentCid); if (b) { lab.push(Object.assign(o, { _book: b.id })); LAB_ORDER_IDS.set(o.id, o); } else foreign.push(o); }
    const brokerPos = {}; for (const p of positions) brokerPos[p.symbol] = +p.qty; const px = {}; for (const p of positions) { const c = +p.current_price; if (c > 0) px[p.symbol] = c; }
    return { acc, clock, positions, brokerPos, px, orders, lab, foreign, fills, cal, calInfo, n };
  }

  /* ---------- الدفاتر (من تعبئات الوسيط + التقاطعات الداخلية المسجلة) ---------- */
  function events(B, crosses, crossPx) {
    const ev = []; const byId = new Map(B.orders.map(o => [o.id, o]));
    for (const f of B.fills) { const o = byId.get(f.order_id); const b = o && ST.bookOfCid(o.client_order_id || o._parentCid); if (!b) continue;
      ev.push({ t: Date.parse(f.transaction_time), id: 'f:' + f.id, book: b.id, sym: f.symbol, side: f.side, qty: +f.qty, px: +f.price, cid: o.client_order_id || o._parentCid, order: o, kind: 'fill' }); }
    for (const x of crosses) { const t = nyMs(x.date, 9 * 60 + 30); const p = crossPx(x); ev.push({ t, id: 'x:' + x.id + ':b', book: x.buyer, sym: x.symbol, side: 'buy', qty: +x.qty, px: p.px, provisional: p.provisional, cross: x.id, kind: 'cross', refPx: +x.refPx });
      ev.push({ t, id: 'x:' + x.id + ':s', book: x.seller, sym: x.symbol, side: 'sell', qty: +x.qty, px: p.px, provisional: p.provisional, cross: x.id, kind: 'cross', refPx: +x.refPx }); }
    ev.sort((a, b) => a.t - b.t || (a.side === 'buy' ? -1 : 1) || (a.id < b.id ? -1 : 1)); return ev;
  }
  function emptyBooks() { const o = {}; for (const b of ST.BOOKS) o[b.id] = { id: b.id, player: b.player, prefix: b.prefix, kind: b.kind, strat: b.strat, pos: {}, flow: 0, realized: 0, closed: [], sales: [], buys: 0, sells: 0, fills: [] }; return o; }
  function apply(books, e) { const k = books[e.book]; if (!k) return; const p = k.pos[e.sym] = k.pos[e.sym] || { qty: 0, cost: 0, entryDate: null, entryTs: null };
    const d = nyParts(e.t).date;
    if (e.side === 'buy') { if (p.qty <= 1e-9) { p.entryDate = d; p.entryTs = e.t; p.lotCost = 0; } p.qty += e.qty; p.cost += e.qty * e.px; k.flow -= e.qty * e.px; k.buys++; }
    else { const avg = p.qty > 1e-9 ? p.cost / p.qty : 0; const pnl = (e.px - avg) * e.qty; k.realized += pnl; p.cost -= avg * e.qty; p.qty -= e.qty; k.flow += e.qty * e.px; k.sells++;
      k.sales.push({ id: e.id, tradeDate: d, proceeds: e.qty * e.px, sym: e.sym }); p.lotPnl = (p.lotPnl || 0) + pnl;
      if (p.qty <= 1e-9) { k.closed.push({ sym: e.sym, entryDate: p.entryDate, exitDate: d, pnl: r2(p.lotPnl) }); p.qty = 0; p.cost = 0; p.lotPnl = 0; } }
    k.fills.push({ t: e.t, date: d, sym: e.sym, side: e.side, qty: e.qty, px: e.px, cid: e.cid || null, kind: e.kind, cross: e.cross || null, provisional: !!e.provisional, refPx: e.refPx || null }); }
  function ledgerAt(ev, cutoff) { const books = emptyBooks(); for (const e of ev) { if (cutoff != null && e.t > cutoff) break; apply(books, e); } return books; }
  function playerCash(books, pid) { const P = ST.PLAYER_BY_ID[pid]; return P.budget + Object.values(books).filter(k => k.player === pid).reduce((a, k) => a + k.flow, 0); }
  function holdings(books, pid) { const out = []; for (const k of Object.values(books)) if (k.player === pid) for (const [s, p] of Object.entries(k.pos)) if (p.qty > 1e-9) out.push({ book: k.id, sym: s, qty: p.qty, cost: p.cost, entryDate: p.entryDate }); return out; }

  /* ---------- الشموع ---------- */
  const BARS = {};
  async function getBars(syms, start) {
    syms = [...new Set(syms)].filter(s => s && !(s in BARS && BARS[s]._start <= start)); if (!syms.length) return;
    const end = new Date(now() - 16 * 60000).toISOString(); let feed = report.feedUsed || cfg.feed || 'sip';
    for (let i = 0; i < syms.length; i += 100) { const chunk = syms.slice(i, i + 100); let tok = null, g = 0; const out = {};
      for (;;) { const u = '/v2/stocks/bars?symbols=' + encodeURIComponent(chunk.join(',')) + '&timeframe=1Day&start=' + start + '&end=' + encodeURIComponent(end) + '&limit=10000&adjustment=split&feed=' + feed + (tok ? '&page_token=' + encodeURIComponent(tok) : '');
        let j; try { j = await req('GET', u, null, { dataApi: true }); } catch (e) { if ((e.status === 403 || e.status === 422) && feed === 'sip' && !report.feedUsed) { feed = 'iex'; report.feedUsed = 'iex'; report.warnings.push('رفض SIP — استُخدم IEX'); tok = null; continue; } throw e; }
        report.feedUsed = report.feedUsed || feed; Object.entries(j.bars || {}).forEach(([t, a]) => { (out[t] = out[t] || []).push(...(a || [])); }); tok = j.next_page_token || null; if (!tok || ++g >= 60) break; }
      for (const s of chunk) { const a = (out[s] || []).map(b => ({ t: nyParts(Date.parse(b.t)).date, o: +b.o, h: +b.h, l: +b.l, c: +b.c, v: +b.v })).filter(b => b.o > 0 && b.c > 0).sort((x, y) => x.t < y.t ? -1 : 1);
        const m = new Map(a.map(b => [b.t, b])); BARS[s] = [...m.values()]; BARS[s]._start = start; } }
  }
  const barOn = (s, d) => (BARS[s] || []).find(b => b.t === d) || null;
  const closeOnOrBefore = (s, d) => { const a = (BARS[s] || []).filter(b => b.t <= d); return a.length ? a[a.length - 1].c : null; };
  function universe(name) { if (cfg.universeLists && Array.isArray(cfg.universeLists[name])) return cfg.universeLists[name].slice();
    const f = cfg.universeFiles[name]; const p = path.isAbsolute(f) ? f : path.join(DIR, f); return JSON.parse(fs.readFileSync(p, 'utf8')).symbols; }
  function daysAgo(n) { return new Date(now() - n * 864e5).toISOString().slice(0, 10); }

  /* سعر التقاطع الداخلي: افتتاح يوم التنفيذ الرسمي من الشموع، وإلا السعر المرجعي المسجل (مؤقت) */
  function crossPx(x) { const b = barOn(x.symbol, x.date); if (b) return { px: b.o, provisional: false }; return { px: +x.refPx, provisional: true }; }

  /* ---------- المطابقة والنشاط الأجنبي ---------- */
  function reconcile(B, books) {
    const labQty = {}; for (const k of Object.values(books)) for (const [s, p] of Object.entries(k.pos)) labQty[s] = (labQty[s] || 0) + p.qty;
    const syms = new Set([...Object.keys(labQty), ...Object.keys(B.brokerPos)]); const rows = []; const labMismatch = {}; const unexplained = []; const baselineDrift = [];
    for (const s of [...syms].sort()) { const lab = +(labQty[s] || 0).toFixed(6), base = +(BASELINE[s] || 0), broker = +(B.brokerPos[s] || 0); const diff = +(broker - base - lab).toFixed(6);
      rows.push({ sym: s, lab, baseline: base, broker, diff });
      if (Math.abs(diff) > 1e-6) { if (lab > 1e-9 || B.lab.some(o => o.symbol === s)) labMismatch[s] = { lab, baseline: base, broker }; else if (base) baselineDrift.push(s); else unexplained.push(s); } }
    return { rows, ok: !Object.keys(labMismatch).length, labMismatch, unexplainedForeign: unexplained, baselineDrift };
  }
  function foreignActivity(B) { const today = B.n.date; const dOf = x => x ? nyParts(Date.parse(x)).date : null; const ids = new Set(B.foreign.map(o => o.id));
    const fx = o => ({ id: o.id, cid: o.client_order_id || null, symbol: o.symbol, side: o.side, status: o.status });
    const r = { ordersToday: B.foreign.filter(o => dOf(o.submitted_at || o.created_at) === today).map(fx), openBuys: B.foreign.filter(o => o.side === 'buy' && !TERMINAL.has(o.status)).map(fx),
      fillsToday: B.fills.filter(a => ids.has(a.order_id) && dOf(a.transaction_time) === today).map(a => ({ id: a.id, symbol: a.symbol, side: a.side, qty: +a.qty })) };
    const labIds = new Set(B.lab.map(o => o.id)); r.unknownFillsToday = B.fills.filter(a => !labIds.has(a.order_id) && !ids.has(a.order_id) && dOf(a.transaction_time) === today).map(a => ({ id: a.id, symbol: a.symbol }));
    r.any = !!(r.ordersToday.length || r.openBuys.length || r.fillsToday.length || r.unknownFillsToday.length); return r; }

  /* ---------- النقد المسوّى: الحساب كله (caps.proveSettledCash) ولكل لاعب ---------- */
  function accountSettlement(B) {
    const n = B.n; const from = nyParts(now() - 14 * 864e5).date; const fills = B.fills.filter(f => nyParts(Date.parse(f.transaction_time)).date >= from).map(f => ({ id: String(f.id), side: f.side, qty: f.qty, price: f.price, symbol: f.symbol, tradeDate: nyParts(Date.parse(f.transaction_time)).date }));
    let reserve = 0, ok = true; for (const o of B.orders) { if (o.side !== 'buy' || TERMINAL.has(o.status) || o._parentCid) continue; const ref = refOfCid(o.client_order_id) || (+o.limit_price > 0 ? +o.limit_price : null); if (!ref) { ok = false; continue; } reserve += Math.max(0, +o.qty - (+o.filled_qty || 0)) * ref * (1 + ST.GAP_BUFFER_PCT / 100); }
    const prior = readState('settlement-ledger.json', null);
    const P = CAPS.proveSettledCash({ cash: B.acc.cash, nonMarginableBuyingPower: B.acc.non_marginable_buying_power, fills, calendar: B.cal, today: n.date, coverageFrom: from, pendingReserve: ok ? +reserve.toFixed(6) : null, priorLedger: prior });
    P.pendingReserveAll = ok ? r2(reserve) : null;
    if (P.ledger && TRADING && !READONLY) { const keep = (prior && Array.isArray(prior.unsettled) ? prior.unsettled : []).filter(x => x && typeof x.id === 'string' && !(typeof x.settleDate === 'string' && x.settleDate < n.date));
      const m = new Map(); for (const x of keep.concat(P.ledger.unsettled)) m.set(x.id, x); try { writeState('settlement-ledger.json', { v: 1, at: new Date(now()).toISOString(), today: n.date, unsettled: [...m.values()] }); } catch (e) { report.warnings.push('سجل التسوية: ' + e.message); } }
    return P;
  }
  function playerSettlement(books, pid, cal, today, B) {
    const cash = playerCash(books, pid); let unsettled = 0; const list = [];
    for (const k of Object.values(books)) if (k.player === pid) for (const s of k.sales) { const sd = CAPS.settleDateOf(s.tradeDate, cal, CAPS.SETTLEMENT_BANK_HOLIDAYS); if (!(sd && sd < today)) { unsettled += s.proceeds; list.push({ sym: s.sym, tradeDate: s.tradeDate, settleDate: sd, proceeds: r2(s.proceeds) }); } }
    let reserve = 0; const unknown = []; for (const o of B.lab) { const b = ST.bookOfCid(o.client_order_id); if (!b || b.player !== pid || o.side !== 'buy' || TERMINAL.has(o.status)) continue; const ref = refOfCid(o.client_order_id); if (!ref) { unknown.push(o.client_order_id); continue; } reserve += Math.max(0, +o.qty - (+o.filled_qty || 0)) * ref * (1 + ST.GAP_BUFFER_PCT / 100); }
    const settled = cash - unsettled;
    /* الإثبات لكل دفتر بالدالة المقبولة نفسها (caps.proveSettledCash): نقد اللاعب وبيوعه (تعبئات وتقاطعات) منذ نشأة دفتره، والحساب اليدوي أعلاه للمقارنة */
    const fills = []; for (const k of Object.values(books)) if (k.player === pid) for (const s of k.sales) fills.push({ id: k.id + ':' + s.id, side: 'sell', qty: 1, price: s.proceeds, symbol: s.sym, tradeDate: s.tradeDate });
    const P = CAPS.proveSettledCash({ cash: +cash.toFixed(6), fills, calendar: cal, today, coverageFrom: nyParts(Date.parse(fromIso())).date, pendingReserve: unknown.length ? null : +reserve.toFixed(6), priorLedger: null });
    const agree = P.proven && Math.abs(P.settledCash - settled) <= 0.01;
    return { cash: r2(cash), unsettledProceeds: r2(unsettled), settledCash: r2(settled), pendingReserve: r2(reserve), spendable: r2(settled - reserve), unknownPending: unknown, unsettled: list,
      proof: { proven: P.proven, settledCash: P.settledCash, reasons: P.reasons, agreesWithBook: agree }, proven: settled >= -0.01 && !unknown.length && agree };
  }

  /* ---------- الحقوق اليومية (من الشموع: بلا حالة محفوظة) ---------- */
  function priceFor(sym, date, cost, qty) { const c = closeOnOrBefore(sym, date); return c > 0 ? c : (qty > 0 ? cost / qty : 0); }
  function equityOf(books, pid, priceFn) { let e = playerCash(books, pid); const miss = []; for (const h of holdings(books, pid)) { const p = priceFn(h.sym, h); if (!(p > 0)) miss.push(h.sym); else e += h.qty * p; } return { equity: miss.length ? null : r2(e), missing: miss }; }
  function history(ev, cal, upto) {
    const days = cal.filter(d => cfg.labStart && d >= cfg.labStart && d <= upto); const H = {}; for (const p of ST.PLAYERS) H[p.id] = [];
    const books = emptyBooks(); let i = 0;
    for (const d of days) { const cut = nyMs(d, 20 * 60); while (i < ev.length && ev[i].t <= cut) apply(books, ev[i++]);
      for (const p of ST.PLAYERS) { const q = equityOf(books, p.id, (s, h) => priceFor(s, d, h.cost, h.qty)); H[p.id].push({ date: d, equity: q.equity == null ? null : q.equity, cash: r2(playerCash(books, p.id)), closed: Object.values(books).filter(k => k.player === p.id).reduce((a, k) => a + k.closed.length, 0) }); } }
    return H;
  }
  function ddStats(series, start) { let peak = start, mdd = 0, cur = 0; for (const x of series) { if (x.equity == null) continue; peak = Math.max(peak, x.equity); cur = peak > 0 ? (peak - x.equity) / peak : 0; mdd = Math.max(mdd, cur); } return { maxDrawdownPct: r2(mdd * 100), drawdownPct: r2(cur * 100) }; }
  function killedOf(pid, series) { const P = ST.PLAYER_BY_ID[pid]; if (P.killExempt) return null; const lim = P.budget * (1 - ST.KILL_PCT / 100); const hit = series.find(x => x.equity != null && x.equity <= lim); return hit ? { date: hit.date, equity: hit.equity, limit: lim } : null; }

  /* ---------- البوابات ---------- */
  function freezeCheck() { const CODE = __dirname; const f = path.isAbsolute(cfg.freezeFile) ? cfg.freezeFile : path.join(CODE, cfg.freezeFile); let F = null; try { F = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return { ok: false, why: 'ملف التجميد غير مقروء (' + cfg.freezeFile + ')' }; }
    const bad = []; for (const [name, h] of Object.entries(F.files || {})) { let got = null; try { got = sha256(fs.readFileSync(path.join(CODE, name))); } catch (e) { got = null; } if (got !== h) bad.push(name); }
    return { ok: !bad.length && Object.keys(F.files || {}).length > 0, changed: bad, labVersion: F.labVersion || null, why: bad.length ? 'ملفات القواعد تغيّرت بعد التجميد: ' + bad.join('، ') : null }; }
  function globalEntryGates(B, ctx, target) {
    const why = [];
    if (!cfg.labStart) why.push('تاريخ بداية المختبر غير محدد (labStart=null)');
    else if (target < cfg.labStart) why.push('قبل بداية المختبر ' + cfg.labStart);
    if (LAB_END && target > LAB_END) why.push('بعد نهاية المختبر ' + LAB_END);
    if (HALT) why.push('HALT مفعّل'); if (!ENTRIES) why.push('ENTRIES_ENABLED=false'); if (ENTRY_LOCK) why.push('قفل دخول من بوابة الجدولة: ' + ENTRY_LOCK);
    if (B.acc.status !== 'ACTIVE' || B.acc.trading_blocked) why.push('الحساب غير نشط');
    const F = readFlags(); if (F.active.length) why.push('أعلام توقف نشطة: ' + F.active.map(f => f.kind + ' ' + f.id).join('، '));
    if (String(env.GITHUB_ACTIONS || '').toLowerCase() === 'true') { const C = readState('continuity.json', null);
      if (!C || String(C.runId) !== String(env.GITHUB_RUN_ID || '') || (+C.runAttempt || 1) !== (+env.GITHUB_RUN_ATTEMPT || 1)) why.push('استمرارية الحالة غير مثبتة لهذا التشغيل (state_guard)'); else if (C.ok !== true) why.push('استمرارية الحالة: ' + (C.reason || 'غير مثبتة')); report.continuity = C; }
    try { let cleared = []; try { cleared = readFlags().cleared.map(f => f.id); } catch (e) {} const SI = RL.scanSaveIncidents(STATE_DIR, REPORTS_DIR, { now: now(), clearedFlagIds: cleared }); report.saveIncidents = { open: SI.open.map(x => x.id), errors: SI.errors };
      if (SI.open.length) why.push('حادثة حفظ غير محسومة: ' + SI.open.map(x => x.id).join('، ')); if (SI.errors.length) why.push('تعذر فحص حوادث الحفظ');
      const P = RL.lastRunPair(STATE_DIR, REPORTS_DIR); const C = RL.pairCovered(P, SI); report.runPair = { status: C ? C.status : P.status, problems: P.problems };
      if (P.status === 'mismatch' && !(C && C.status === 'resolved')) { why.push('آخر سجل تشغيل وتقريره غير متسقين: ' + P.problems.join('، '));
        if (!C && TRADING && !READONLY) { writeIncident({ id: P.incidentId, failed: ['report-pair'], error: P.problems.join('، '), reportFile: P.record && P.record.reportFile }); raise('run-record-failed', 'runrec-' + P.incidentId, { problems: P.problems }); } } }
    catch (e) { why.push('تعذر التحقق من حوادث الحفظ: ' + e.message); }
    if (!ctx.recon.ok) why.push('فرق كمية بين الدفاتر والوسيط: ' + JSON.stringify(ctx.recon.labMismatch));
    if (ctx.foreign.any) why.push('نشاط أجنبي اليوم على الحساب (' + [...new Set([...ctx.foreign.ordersToday, ...ctx.foreign.openBuys, ...ctx.foreign.fillsToday].map(x => x.symbol))].slice(0, 8).join('، ') + ')');
    if (!ctx.settle.proven) why.push('النقد المسوّى للحساب غير مثبت: ' + (ctx.settle.reasons || []).join('، '));
    if (ctx.unprotected.length) why.push('مراكز أسهم بلا حماية مؤكدة: ' + ctx.unprotected.join('، '));
    const fz = freezeCheck(); report.freeze = fz; if (!fz.ok) why.push('التجميد: ' + (fz.why || 'غير متحقق'));
    return why;
  }
  function writeIncident(o) { const at = new Date(now()).toISOString(); const inc = { kind: 'save-incident', incidentId: o.id, at, cmd: io.cmd || null, runId: env.GITHUB_RUN_ID || null, runAttempt: env.GITHUB_RUN_ATTEMPT || null, failed: o.failed, error: o.error || null, reportFile: o.reportFile || null, resolved: false, note: 'حادثة حفظ: لا دخول حتى clear-flags' };
    const out = []; for (const d of [path.join(STATE_DIR, 'evidence'), REPORTS_DIR]) { try { fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'save-incident-' + o.id + '.json'), JSON.stringify(inc, null, 1)); out.push(d); } catch (e) {} } return out; }

  /* ---------- الحماية: وقف GTC لكل مركز أسهم (لكل دفتر وقفه) ---------- */
  function stopTargetOf(B, k, sym, p) { const sig = ST.prevTradingDay(B.cal, p.entryDate); const b = (BARS[sym] || []).filter(x => x.t <= sig); if (!sig || !b.length || b[b.length - 1].t !== sig || b.length < 15) return null;
    const I = DS.ind(b); const atr = I.atr14[b.length - 1]; if (!(atr > 0)) return null; const v = ST.stopFor(p.cost / p.qty, atr, 3); return v > 0 ? v : null; }
  function bookOpen(B, kid, sym) { return B.lab.filter(o => o._book === kid && o.symbol === sym && !TERMINAL.has(o.status)); }
  const isStop = o => o.side === 'sell' && (o.type === 'stop' || o.type === 'stop_limit');
  function protectionState(B, books) { const out = []; for (const k of Object.values(books)) { if (k.kind !== 'rsi2') continue;
      for (const [sym, p] of Object.entries(k.pos)) { if (!(p.qty > 1e-9)) continue; const open = bookOpen(B, k.id, sym); const exiting = open.some(o => o.side === 'sell' && o.type === 'market');
        const stops = open.filter(isStop); const want = stopTargetOf(B, k, sym, p); const rem = o => (+o.qty) - (+o.filled_qty || 0);
        const confirmed = stops.length === 1 && ACTIVE_STOP.has(stops[0].status) && stops[0].time_in_force === 'gtc' && Math.abs(rem(stops[0]) - p.qty) < 1e-6 && +stops[0].stop_price > 0 && (want == null || Math.abs(+stops[0].stop_price - want) / want <= 0.005);
        out.push({ book: k.id, sym, qty: p.qty, want, exiting, confirmed, stops: stops.map(o => ({ id: o.id, status: o.status, qty: +o.qty, stop: +o.stop_price, tif: o.time_in_force })), pendingBuy: open.some(o => o.side === 'buy') }); } }
    return out; }
  async function cancelConfirmed(id) { try { await req('DELETE', '/v2/orders/' + id); } catch (e) { if (e.status !== 404 && e.status !== 422) return { resolved: false, why: e.message }; }
    if (!TRADING) return { resolved: true, dry: true };
    for (let k = 0; k < 5; k++) { let st = null; try { st = await req('GET', '/v2/orders/' + id); } catch (e) { if (e.status === 404) return { resolved: true, status: 'not_found' }; }
      if (st && TERMINAL.has(st.status)) return { resolved: true, status: st.status, filled: +st.filled_qty || 0 }; await sleep(1000); }
    return { resolved: false, why: 'لم يُحسم الإلغاء' }; }
  async function protect(B, books) { const P = protectionState(B, books); report.protection = P; let changed = false;
    for (const x of P) { if (x.confirmed || x.exiting || x.pendingBuy) continue;
      if (x.want == null) { report.errors.push(x.book + ' ' + x.sym + ': لا يمكن حساب الوقف (شموع يوم الإشارة ناقصة) — الحماية غير مؤكدة'); continue; }
      let ok = true; for (const s of x.stops) { const c = await cancelConfirmed(s.id); if (!c.resolved) { ok = false; report.errors.push(x.book + ' ' + x.sym + ': إلغاء وقف قديم لم يُحسم — لا وقف جديد منعًا للتداخل'); } }
      if (!ok) continue; const k = books[x.book]; const base = k.prefix + ymd(B.n.date) + '-' + x.sym + '-P';
      const n = B.lab.filter(o => String(o.client_order_id || '').startsWith(base)).length + 1;
      try { const r = await req('POST', '/v2/orders', { symbol: x.sym, qty: String(Math.round(x.qty)), side: 'sell', type: 'stop', stop_price: String(x.want), time_in_force: 'gtc', client_order_id: base + n });
        report.steps.push('حماية: وقف GTC ' + x.book + ' ' + x.sym + ' × ' + x.qty + ' عند ' + x.want); changed = changed || !(r && r.__dry); }
      catch (e) { report.errors.push(x.book + ' ' + x.sym + ': تعذر وضع الوقف: ' + e.message); } }
    return changed; }

  /* ---------- السياق المشترك لكل تشغيل ---------- */
  async function context(B) {
    const crosses = readCrosses(); const heldSyms = new Set(); const ev0 = events(B, crosses, x => ({ px: +x.refPx, provisional: true }));
    for (const e of ev0) heldSyms.add(e.sym); for (const o of B.lab) heldSyms.add(o.symbol);
    try { await getBars([...heldSyms, 'SPY', 'VOO'], daysAgo(430)); } catch (e) { report.warnings.push('تعذر جلب شموع المراكز: ' + e.message); }
    const ev = events(B, crosses, crossPx); const books = ledgerAt(ev, null);
    const recon = reconcile(B, books); const foreign = foreignActivity(B); const settle = accountSettlement(B);
    report.recon = recon; report.foreignActivity = foreign; report.settlement = { proven: settle.proven, settledCash: settle.settledCash, cash: settle.cash, unsettledProceeds: settle.unsettledProceeds, reasons: settle.reasons, pendingReserveAll: settle.pendingReserveAll };
    if (recon.unexplainedForeign.length) report.warnings.push('مراكز أجنبية غير معروفة (لا تُمس): ' + recon.unexplainedForeign.join('، '));
    if (recon.baselineDrift.length) report.warnings.push('المراكز القديمة تغيّرت لدى الوسيط (لا تُمس): ' + recon.baselineDrift.join('، '));
    if (!recon.ok && TRADING) raise('lab-recon-mismatch', 'labrecon-' + B.n.date + '-' + Object.keys(recon.labMismatch).sort().join('_'), recon.labMismatch);
    const P = protectionState(B, books); const unprotected = P.filter(x => !x.confirmed && !x.exiting && !x.pendingBuy).map(x => x.book + ':' + x.sym);
    return { crosses, ev, books, recon, foreign, settle, unprotected };
  }
  function playersView(B, ctx, upto) {
    const H = history(ctx.ev, B.cal, upto); const out = {};
    for (const p of ST.PLAYERS) { const series = H[p.id]; const cur = equityOf(ctx.books, p.id, (s, h) => B.px[s] || priceFor(s, B.n.date, h.cost, h.qty)); const dd = ddStats(series, p.budget);
      out[p.id] = { id: p.id, name: p.name, series, equityNow: cur.equity, killed: killedOf(p.id, series), maxDrawdownPct: dd.maxDrawdownPct, drawdownPct: dd.drawdownPct,
        tradesClosed: Object.values(ctx.books).filter(k => k.player === p.id).reduce((a, k) => a + k.closed.length, 0) }; }
    return { H, view: out };
  }
  function learnState(B, H, target) { const eqAt = (pid, d) => { const x = (H[pid] || []).find(r => r.date === d); return x ? x.equity : null; };
    const W = ST.learnWeightsAt(B.cal, cfg.labStart || target, ST.prevTradingDay(B.cal, target) || target, eqAt);
    const lastMe = ST.monthEndsBetween(B.cal, cfg.labStart || target, ST.prevTradingDay(B.cal, target) || target).pop(); const eL = lastMe ? eqAt('LEARN', lastMe) : null;
    const base = (eL != null && eL > 0) ? eL : ST.BUDGET; const budgets = {}; for (const s of ST.PLAYER_BY_ID.LEARN.subs) budgets[s] = +Math.min(ST.BUDGET, Math.floor(W.weights[s] * base * 100) / 100).toFixed(2);
    return { weights: W.weights, history: W.history, equityBase: base, budgets }; }

  /* ---------- التخطيط: نيات كل دفتر ---------- */
  function capsFor(kind, alloc, spec) { if (kind === 'rsi2') return { allocation: alloc, maxPositions: spec.maxPositions, maxPosPct: spec.maxPosPct, riskPct: spec.riskPct, fillBufferPct: ST.GAP_BUFFER_PCT };
    return { allocation: alloc, maxPositions: 1, maxPosPct: 100, riskPct: 100, fillBufferPct: ST.GAP_BUFFER_PCT }; }
  function capsGate(B, books, k, sym, qty, ref, alloc, spec, cash, placedForBook) {
    const caps = capsFor(k.kind, +alloc.toFixed(2), spec); const positions = Object.entries(k.pos).filter(([, p]) => p.qty > 1e-9).map(([s, p]) => ({ symbol: s, qty: p.qty, marketValue: p.qty * (B.px[s] || closeOnOrBefore(s, B.n.date) || p.cost / p.qty) }));
    const pending = B.lab.filter(o => o._book === k.id && o.side === 'buy' && !TERMINAL.has(o.status)).map(o => ({ symbol: o.symbol, qty: Math.max(0, +o.qty - (+o.filled_qty || 0)), limitOrRefPrice: refOfCid(o.client_order_id) })).concat(placedForBook);
    const c = CAPS.checkEntry({ caps, cfg: { allocation: caps.allocation, maxPositions: caps.maxPositions, maxPosPct: caps.maxPosPct, riskPct: caps.riskPct }, strategyId: 'lab:' + k.id, order: { symbol: sym, side: 'buy', qty, refPrice: ref }, positions, pendingOrders: pending, cash, activeFlags: readFlags().active.map(f => f.kind) });
    return { qty: c.maxQty >= 1 ? Math.min(qty, c.maxQty) : 0, reasons: c.reasons, caps }; }

  async function planOvernight(B, ctx, W, gatesWhy) {
    const target = W.target, prev = W.prev; const T = ymd(target); const intents = []; const skip = (book, w) => report.skipped.push({ book, why: w });
    const { H, view } = playersView(B, ctx, prev); report.players = Object.fromEntries(Object.entries(view).map(([k, v]) => [k, { equityNow: v.equityNow, killed: v.killed, maxDrawdownPct: v.maxDrawdownPct, tradesClosed: v.tradesClosed }]));
    const L = learnState(B, H, target); report.learn = { weights: L.weights, budgets: L.budgets, equityBase: L.equityBase };
    const spy = BARS.SPY || [], voo = BARS.VOO || []; const refOf = (s) => { const b = barOn(s, prev); return b ? b.c : null; };
    const entriesOK = !gatesWhy.length; const settleBy = {}; for (const p of ST.PLAYERS) settleBy[p.id] = playerSettlement(ctx.books, p.id, B.cal, B.n.date, B);
    report.playerCash = settleBy; let acctRoom = (ctx.settle.proven ? ctx.settle.settledCash : 0) - (ctx.settle.pendingReserveAll || 0);
    const spent = {}; for (const p of ST.PLAYERS) spent[p.id] = 0; const placed = {}; for (const b of ST.BOOKS) placed[b.id] = [];
    const openSellSyms = new Set(B.orders.filter(o => o.side === 'sell' && !TERMINAL.has(o.status)).map(o => o.symbol));
    const exitSyms = new Set();
    /* إمكانية الدخول لكل دفتر */
    function canEnter(k) { const pid = k.player; if (!entriesOK) return 'بوابات الدخول: ' + gatesWhy.join(' • '); const v = view[pid];
      if (v.killed) return 'مفتاح القتل (−15%) منذ ' + v.killed.date; if (v.equityNow == null) return 'حقوق اللاعب غير محسوبة (سعر ناقص)';
      if (!ST.PLAYER_BY_ID[pid].killExempt && v.equityNow <= ST.PLAYER_BY_ID[pid].budget * (1 - ST.KILL_PCT / 100)) return 'الحقوق الآن تحت حد القتل (−15%)';
      const S = settleBy[pid]; if (!S.proven) return 'نقد اللاعب غير مثبت' + (S.unknownPending.length ? ' (أمر معلق بلا سعر مرجعي)' : ''); return null; }
    function budgetOf(k) { if (k.player !== 'LEARN') return { alloc: ST.PLAYER_BY_ID[k.player].budget, eq: view[k.player].equityNow };
      const b = L.budgets[k.strat]; return { alloc: b, eq: b }; }
    function spendable(k, alloc) { const S = settleBy[k.player]; let s = S.spendable - spent[k.player];
      if (k.player === 'LEARN') { const exp = Object.values(k.pos).reduce((a, p) => a + (p.qty > 1e-9 ? p.cost : 0), 0) + B.lab.filter(o => o._book === k.id && o.side === 'buy' && !TERMINAL.has(o.status)).reduce((a, o) => a + Math.max(0, +o.qty - (+o.filled_qty || 0)) * (refOfCid(o.client_order_id) || 0) * 1.03, 0);
        s = Math.min(s, alloc - exp); }
      return Math.max(0, s); }
    function addEntry(k, sym, qty, ref, reason, spec, extra) {
      if (qty < 1) return skip(k.id, sym + ': الكمية 0 (' + reason + ')');
      const alloc = budgetOf(k).alloc; const buf = 1 + ST.GAP_BUFFER_PCT / 100;
      /* checkEntry يخصم حجز أوامر هذا الدفتر المعلقة (السابقة ونيات هذا التشغيل) مرة واحدة — فيُعاد إليه النقد قبل حجزها حتى لا يُخصم مرتين */
      const ownRes = B.lab.filter(o => o._book === k.id && o.side === 'buy' && !TERMINAL.has(o.status)).reduce((a, o) => a + Math.max(0, +o.qty - (+o.filled_qty || 0)) * (refOfCid(o.client_order_id) || 0) * buf, 0) + placed[k.id].reduce((a, x) => a + x.qty * x.limitOrRefPrice * buf, 0);
      const cash = spendable(k, alloc) + ownRes; const g = capsGate(B, ctx.books, k, sym, qty, ref, alloc, spec, cash, placed[k.id]);
      let q = g.qty; const cost = q * ref * (1 + ST.GAP_BUFFER_PCT / 100);
      if (q >= 1 && cost > acctRoom + 1e-6) { q = Math.max(0, Math.floor(acctRoom / (ref * (1 + ST.GAP_BUFFER_PCT / 100)))); report.warnings.push(k.id + ' ' + sym + ': قُصّت الكمية بنقد الحساب المسوّى'); }
      if (q < 1) return skip(k.id, sym + ': السقوف/النقد: ' + (g.reasons.join('، ') || 'لا نقد مسوّى كافٍ'));
      const c2 = q * ref * (1 + ST.GAP_BUFFER_PCT / 100); acctRoom -= c2; spent[k.player] += c2; placed[k.id].push({ symbol: sym, qty: q, limitOrRefPrice: ref });
      intents.push(Object.assign({ book: k.id, sym, side: 'buy', qty: q, ref, reason, tif: 'opg' }, extra || {})); }
    for (const def of ST.BOOKS) { const k = ctx.books[def.id]; const P = ST.PLAYER_BY_ID[def.strat]; const held = s => (k.pos[s] && k.pos[s].qty > 1e-9) ? k.pos[s].qty : 0;
      const pendingBuy = s => B.lab.some(o => o._book === k.id && o.symbol === s && o.side === 'buy' && !TERMINAL.has(o.status));
      const pendingSell = s => B.lab.some(o => o._book === k.id && o.symbol === s && o.side === 'sell' && o.type === 'market' && !TERMINAL.has(o.status));
      const why = canEnter(k);
      if (def.kind === 'ref') { if (held('VOO') || pendingBuy('VOO') || k.buys > 0) continue; if (why) { skip(k.id, why); continue; } const ref = refOf('VOO'); if (!ref) { skip(k.id, 'لا شمعة VOO ليوم ' + prev); continue; }
        addEntry(k, 'VOO', ST.wholeBudgetQty(Math.min(spendable(k, ST.BUDGET), ST.BUDGET), ref), ref, 'الحكم: شراء مرة واحدة', null); continue; }
      if (def.kind === 't1') { const me = ST.prevMonthEnd(B.cal, target); const D = ST.t1Decision(spy, me, P.smaMonths); (report.t1 = report.t1 || {})[k.id] = D;
        if (!D) { skip(k.id, 'قرار T1 غير متاح (شموع شهرية ناقصة)'); continue; }
        if (D.decision === 'out' && held('SPY') && !pendingSell('SPY')) intents.push({ book: k.id, sym: 'SPY', side: 'sell', qty: held('SPY'), ref: refOf('SPY'), reason: 'T1: SPY تحت متوسط ' + P.smaMonths + ' أشهر (' + me + ')', tif: 'opg', exit: true });
        if (D.decision === 'in' && !held('SPY') && !pendingBuy('SPY')) { if (why) { skip(k.id, why); continue; } const ref = refOf('SPY'); const b = budgetOf(k);
          addEntry(k, 'SPY', ST.wholeBudgetQty(Math.min(spendable(k, b.alloc), b.alloc), ref), ref, 'T1: SPY فوق متوسط ' + P.smaMonths + ' أشهر (' + me + ')', null); }
        continue; }
      if (def.kind === 'tm1') { const plan = ST.tm1Plan(B.cal, target); (report.tm1 = report.tm1 || {})[k.id] = plan;
        if (held('SPY') && !pendingSell('SPY')) { const due = ST.tm1SellDue(B.cal, k.pos.SPY.entryDate, P.sellTradingDay); if (due && target >= due) intents.push({ book: k.id, sym: 'SPY', side: 'sell', qty: held('SPY'), ref: refOf('SPY'), reason: 'TM1: اليوم الرابع من الشهر (' + due + ')' + (target > due ? ' — متأخر' : ''), tif: 'opg', exit: true }); }
        if (plan.buyDay && !held('SPY') && !pendingBuy('SPY')) { if (why) { skip(k.id, why); continue; } const ref = refOf('SPY'); const b = budgetOf(k); addEntry(k, 'SPY', ST.wholeBudgetQty(Math.min(spendable(k, b.alloc), b.alloc), ref), ref, 'TM1: آخر يوم تداول في الشهر', null); }
        continue; }
      if (def.kind === 'o1') { if (held('SPY') && !pendingSell('SPY')) intents.push({ book: k.id, sym: 'SPY', side: 'sell', qty: held('SPY'), ref: refOf('SPY'), reason: 'O1: بيع عند الافتتاح', tif: 'opg', exit: true }); continue; }
      if (def.kind === 'rsi2') { const spec = P.spec;
        for (const [sym, p] of Object.entries(k.pos)) { if (!(p.qty > 1e-9) || pendingSell(sym)) continue; const x = ST.rsiExit(spec, BARS[sym], B.cal, p.entryDate, prev);
          if (x.unknown) { report.warnings.push(k.id + ' ' + sym + ': تعذر تقييم الخروج — ' + x.why); continue; }
          if (x.exit) { intents.push({ book: k.id, sym, side: 'sell', qty: p.qty, ref: closeOnOrBefore(sym, prev), reason: (x.reason === 'cond' ? 'خروج شرطي (الإغلاق فوق متوسط 5)' : 'خروج زمني بعد ' + x.held + ' أيام'), tif: 'opg', exit: true, needsStopCancel: true }); exitSyms.add(sym); } }
        if (why) { skip(k.id, why); continue; }
        const nHeld = Object.values(k.pos).filter(p => p.qty > 1e-9).length; const nPend = new Set(B.lab.filter(o => o._book === k.id && o.side === 'buy' && !TERMINAL.has(o.status)).map(o => o.symbol)).size;
        let slots = spec.maxPositions - nHeld - nPend; if (slots <= 0) continue;
        const U = ctx.universes && ctx.universes[spec.universe]; if (!U || !U.ok) { skip(k.id, 'بيانات الكون ' + spec.universe + ' غير صالحة/قديمة — لا دخول'); continue; }
        const excl = new Set([...Object.keys(BASELINE), ...ST.ETF_SYMBOLS, ...ctx.recon.unexplainedForeign, ...openSellSyms, ...exitSyms, ...Object.keys(k.pos).filter(s => k.pos[s].qty > 1e-9)]);
        const b = budgetOf(k); if (!(b.eq > 0)) continue;
        for (const c of U.cands) { if (slots <= 0) break; if (excl.has(c.sym) || pendingBuy(c.sym)) continue; const z = ST.rsiSize(spec, b.eq, c.close, c.atr, spendable(k, b.alloc)); if (z.qty < 1) continue;
          const before = intents.length; addEntry(k, c.sym, z.qty, c.close, 'RSI(2)=' + c.rsi2 + ' < ' + spec.rsiMax, spec, { stop: z.stop }); if (intents.length > before) slots--; }
        continue; } }
    return { intents, H, view, L };
  }
  /* التقاطع الداخلي لصناديق المؤشر: شراء وبيع للرمز نفسه في مزاد الافتتاح نفسه ⇒ يُطابقان داخليًا (Alpaca يرفض أوامر متعاكسة للرمز نفسه: «wash trade») */
  function crossIntents(intents, target, crossesExisting) { const created = []; const out = intents.slice();
    for (const sym of ST.ETF_SYMBOLS) { if (crossesExisting.some(x => x.date === target && x.symbol === sym)) continue;
      const buys = out.filter(i => i.sym === sym && i.side === 'buy' && i.qty > 0), sells = out.filter(i => i.sym === sym && i.side === 'sell' && i.qty > 0); if (!buys.length || !sells.length) continue;
      let k = 0; for (const b of buys) for (const s of sells) { if (b.qty <= 0 || s.qty <= 0) continue; const q = Math.min(b.qty, s.qty); b.qty -= q; s.qty -= q; k++;
        created.push({ id: 'x-' + ymd(target) + '-' + sym + '-' + k, date: target, symbol: sym, qty: q, buyer: b.book, seller: s.book, refPx: s.ref || b.ref, createdAt: new Date(now()).toISOString(), runId: env.GITHUB_RUN_ID || null, note: 'مطابقة داخلية بسعر افتتاح ' + target + ' الرسمي (مؤقتًا بالسعر المرجعي حتى تتوفر الشمعة)' }); } }
    return { intents: out.filter(i => i.qty > 0), created }; }
  async function sendIntents(B, ctx, intents, dateKey, tifDefault) {
    const res = []; const openOpp = (sym, side) => B.orders.some(o => o.symbol === sym && !TERMINAL.has(o.status) && o.side !== side);
    for (const it of intents.filter(i => i.side === 'sell').concat(intents.filter(i => i.side === 'buy'))) {
      const k = ctx.books[it.book]; const base = k.prefix + ymd(dateKey) + '-' + it.sym + '-' + (it.side === 'buy' ? 'B' : 'S');
      const ex = B.lab.filter(o => { const c = String(o.client_order_id || ''); return c === base || c.startsWith(base + '-'); });
      if (ex.length) { res.push({ book: it.book, sym: it.sym, side: it.side, status: 'verified', existing: ex.map(o => o.client_order_id + '/' + o.status) }); continue; }
      if (it.side === 'buy' && openOpp(it.sym, 'buy')) { res.push({ book: it.book, sym: it.sym, side: 'buy', status: 'wash-guard-skip' }); report.skipped.push({ book: it.book, why: it.sym + ': أمر بيع قائم للرمز نفسه — تجنب رفض «wash trade»' }); continue; }
      if (it.side === 'sell' && B.orders.some(o => o.symbol === it.sym && !TERMINAL.has(o.status) && o.side === 'buy')) { res.push({ book: it.book, sym: it.sym, side: 'sell', status: 'wash-guard-exit-wait' }); report.errors.push(it.book + ' ' + it.sym + ': خروج مؤجل — أمر شراء قائم للرمز نفسه (يُعاد في التشغيل التالي)'); continue; }
      if (it.needsStopCancel) { let ok = true; for (const s of bookOpen(B, it.book, it.sym).filter(isStop)) { const c = await cancelConfirmed(s.id); if (!c.resolved) ok = false; else s.status = c.status || 'canceled'; }
        if (!ok) { res.push({ book: it.book, sym: it.sym, side: 'sell', status: 'stop-cancel-unresolved' }); report.errors.push(it.book + ' ' + it.sym + ': إلغاء الوقف لم يُحسم — لا بيع (الوقف باقٍ)'); continue; } }
      const cid = it.side === 'buy' ? base + '-r' + Math.round(it.ref * 100) : base;
      const body = { symbol: it.sym, qty: String(it.qty), side: it.side, type: 'market', time_in_force: it.tif || tifDefault, client_order_id: cid };
      try { const r = await req('POST', '/v2/orders', body); res.push({ book: it.book, sym: it.sym, side: it.side, qty: it.qty, cid, status: r && r.__dry ? 'dry-run' : 'submitted', id: r && r.id }); if (!(r && r.__dry)) B.orders.push(Object.assign({}, r || {}, { symbol: it.sym, side: it.side, status: (r && r.status) || 'accepted' })); }
      catch (e) { if (e.status === 422 && /unique/i.test(e.message)) res.push({ book: it.book, sym: it.sym, side: it.side, cid, status: 'verified-duplicate' }); else { res.push({ book: it.book, sym: it.sym, side: it.side, cid, status: 'submit-failed', err: e.message }); report.errors.push(it.book + ' ' + it.sym + ': تعذر الإرسال: ' + e.message); } } }
    return res; }

  /* ---------- الأوامر ---------- */
  function overnightWindow(B) { const n = B.n; const hh = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
    const R = { nyNow: n.date + ' ' + hh(n.hm), target: null, prev: null, inWindow: false, late: false, why: null, note: 'حد 09:15 متحفظ؛ حد Alpaca لأوامر opg قرابة 09:28 — يحتاج تحققًا' };
    const t = B.clock && B.clock.next_open ? nyParts(Date.parse(B.clock.next_open)).date : null; if (!t) { R.why = 'next_open غير معروف'; return R; }
    if (!B.cal.includes(t)) { R.why = 'يوم الافتتاح التالي غير موجود في التقويم'; return R; } const prev = ST.prevTradingDay(B.cal, t); if (!prev) { R.why = 'لا يوم تداول سابق'; return R; }
    R.target = t; R.prev = prev; if (B.clock.is_open) { R.why = 'السوق مفتوح'; return R; }
    if (n.date < prev || (n.date === prev && n.hm < WIN.overnightStartHm)) { R.why = 'قبل 16:15 من ' + prev; return R; }
    if (n.date > t || (n.date === t && n.hm > WIN.overnightCutoffHm)) { R.late = true; R.why = 'بعد 09:15 من ' + t + ' — فات وقت أوامر الافتتاح'; return R; }
    R.inWindow = true; return R; }
  async function universesFor(prev) { const U = {}; for (const [name, spec] of [['U-LIQ', ST.S1_SPEC], ['U-LOW', ST.CHEAP_SPEC]]) {
      try { const syms = universe(name).filter(s => !(s in BASELINE) && !ST.ETF_SYMBOLS.includes(s)); const start = new Date(Math.min(now(), cfg.labStart ? Date.parse(cfg.labStart) : now()) - spec.barsDays * 864e5).toISOString().slice(0, 10);
        await getBars(syms, start); const bars = {}; for (const s of syms) if (BARS[s]) bars[s] = BARS[s]; const R = ST.rsiCandidates(spec, bars, prev, null, cfg.minUniverse); U[name] = Object.assign({ symbols: syms }, R); }
      catch (e) { U[name] = { ok: false, cands: [], error: e.message }; report.warnings.push('كون ' + name + ': ' + e.message); } }
    return U; }
  async function overnight() {
    const B = await loadBroker(); report.account = acctView(B);
    const W = overnightWindow(B); report.window = W; let ctx = await context(B);
    if (!W.inWindow) { report.steps.push('lab-overnight: لا أوامر افتتاح (' + W.why + ')؛ حماية ومطابقة فقط'); report.status = W.late ? 'late' : 'outside-window';
      await protect(B, ctx.books); await writeReports(B, ctx, null); return report; }
    ctx.universes = await universesFor(W.prev);
    report.universes = Object.fromEntries(Object.entries(ctx.universes).map(([k, v]) => [k, { ok: v.ok, stats: v.stats, top: (v.cands || []).slice(0, 8), error: v.error }]));
    const gatesWhy = globalEntryGates(B, ctx, W.target); report.entryGates = { ok: !gatesWhy.length, why: gatesWhy }; if (gatesWhy.length) ENTRY_BLOCK = gatesWhy[0];
    const plan = await planOvernight(B, ctx, W, gatesWhy);
    const X = crossIntents(plan.intents, W.target, ctx.crosses); report.intents = X.intents; report.crossesCreated = X.created;
    /* نية مكتوبة قبل الإرسال: التقاطعات تُحفظ أولًا (هي حالة داخلية لا يراها الوسيط) */
    if (TRADING && !READONLY) { try { if (X.created.length) writeState('lab-crosses.json', ctx.crosses.concat(X.created));
        const I = readState('lab-intents.json', {}); I[W.target] = (I[W.target] || []).concat([{ at: new Date(now()).toISOString(), runId: env.GITHUB_RUN_ID || null, intents: X.intents, crosses: X.created.map(x => x.id) }]);
        const keys = Object.keys(I).sort().slice(-60); const I2 = {}; keys.forEach(k => I2[k] = I[k]); writeState('lab-intents.json', I2); }
      catch (e) { report.errors.push('تعذر حفظ النيات/التقاطعات قبل الإرسال: ' + e.message + ' — لا أوامر'); report.status = 'blocked'; await writeReports(B, ctx, plan); return report; } }
    else if (X.created.length) report.warnings.push('تشغيل جاف: التقاطعات لم تُحفظ');
    report.sent = await sendIntents(B, ctx, X.intents, W.target, 'opg');
    report.status = 'planned'; report.steps.push('lab-overnight: ' + report.sent.length + ' أمر/تحقق، ' + X.created.length + ' تقاطع داخلي، ليوم ' + W.target);
    if (TRADING) { const U = ctx.universes; const B2 = await loadBroker(); ctx = await context(B2); ctx.universes = U; await protect(B2, ctx.books); await writeReports(B2, ctx, null); }
    else { await protect(B, ctx.books); await writeReports(B, ctx, plan); }
    return report;
  }
  function clsWindow(B) { const n = B.n; const ci = B.calInfo[n.date]; if (!ci || !B.clock.is_open) return { inWindow: false, why: !ci ? 'ليس يوم تداول' : 'السوق مغلق' };
    const [ch, cm] = String(ci.close || '16:00').split(':').map(Number); const cutoff = ch * 60 + cm - WIN.clsCutoffBeforeCloseMin;
    if (n.hm < WIN.clsStartHm) return { inWindow: false, why: 'قبل 09:35' }; if (n.hm > cutoff) return { inWindow: false, late: true, why: 'بعد حد أوامر الإغلاق (' + Math.floor(cutoff / 60) + ':' + String(cutoff % 60).padStart(2, '0') + ') — تُتخطى الليلة' };
    return { inWindow: true, cutoffHm: cutoff, close: ci.close }; }
  async function postopen() {
    let B = await loadBroker(); report.account = acctView(B); let ctx = await context(B);
    /* أوامر الافتتاح التي لم تُعبأ بعد 09:35 ⇒ إلغاء مؤكد (الجزئي يُحمى بعده) */
    if (B.clock.is_open && B.n.hm >= WIN.opgCleanupHm) { let any = false; for (const o of B.lab.filter(o => !TERMINAL.has(o.status) && o.time_in_force === 'opg')) { any = true; const c = await cancelConfirmed(o.id); report.steps.push('إلغاء أمر افتتاح لم يكتمل: ' + o.client_order_id + ' (' + (c.status || (c.resolved ? 'ok' : 'غير محسوم')) + ')'); if (!c.resolved) report.errors.push(o.client_order_id + ': إلغاء لم يُحسم'); }
      if (any && TRADING) { B = await loadBroker(); ctx = await context(B); } }
    if (await protect(B, ctx.books) && TRADING) { B = await loadBroker(); ctx = await context(B); report.protectionAfter = protectionState(B, ctx.books); }
    const CW = clsWindow(B); report.clsWindow = CW;
    if (CW.inWindow) { const gatesWhy = globalEntryGates(B, ctx, B.n.date); report.entryGates = { ok: !gatesWhy.length, why: gatesWhy }; if (gatesWhy.length) ENTRY_BLOCK = gatesWhy[0];
      const { H, view } = playersView(B, ctx, ST.prevTradingDay(B.cal, B.n.date)); const L = learnState(B, H, B.n.date); report.learn = { weights: L.weights, budgets: L.budgets };
      const ref = closeOnOrBefore('SPY', ST.prevTradingDay(B.cal, B.n.date)); const intents = []; let acctRoom = (ctx.settle.proven ? ctx.settle.settledCash : 0) - (ctx.settle.pendingReserveAll || 0);
      for (const def of ST.BOOKS.filter(b => b.kind === 'o1')) { const k = ctx.books[def.id]; const pid = def.player; const S = playerSettlement(ctx.books, pid, B.cal, B.n.date, B);
        const held = k.pos.SPY && k.pos.SPY.qty > 1e-9; const pend = B.lab.some(o => o._book === k.id && o.symbol === 'SPY' && !TERMINAL.has(o.status));
        if (held || pend) { report.skipped.push({ book: k.id, why: 'O1: ما زال يملك SPY أو أمرًا معلقًا — لا شراء الليلة' }); continue; }
        if (gatesWhy.length) { report.skipped.push({ book: k.id, why: 'بوابات الدخول: ' + gatesWhy.join(' • ') }); continue; }
        if (view[pid].killed || (view[pid].equityNow != null && view[pid].equityNow <= ST.BUDGET * (1 - ST.KILL_PCT / 100))) { report.skipped.push({ book: k.id, why: 'مفتاح القتل (−15%)' }); continue; } if (view[pid].equityNow == null || !S.proven || !(ref > 0)) { report.skipped.push({ book: k.id, why: 'حقوق/نقد/سعر غير متاح' }); continue; }
        const eq = pid === 'LEARN' ? L.budgets.O1 : view[pid].equityNow; let room = Math.min(S.spendable, ST.PLAYER_BY_ID.O1.fraction * eq);
        if (pid === 'LEARN') room = Math.min(room, L.budgets.O1 - holdings(ctx.books, 'LEARN').filter(h => h.book === k.id).reduce((a, h) => a + h.cost, 0));
        let q = ST.wholeBudgetQty(room, ref); const g = capsGate(B, ctx.books, k, 'SPY', Math.max(q, 1), ref, pid === 'LEARN' ? L.budgets.O1 : ST.BUDGET, null, Math.max(0, S.spendable), []); q = Math.min(q, g.qty);
        if (q * ref * 1.03 > acctRoom) q = Math.max(0, Math.floor(acctRoom / (ref * 1.03)));
        const O1P = ST.PLAYER_BY_ID.O1; const half = ST.wholeBudgetQty(O1P.fraction * eq, ref);
        if (q < 1 || q < Math.ceil(half * O1P.minFillOfHalf)) { report.skipped.push({ book: k.id, why: 'O1: النقد المسوّى لا يكفي نصف «النصف» (' + q + ' من ' + half + ' سهم) — تُتخطى الليلة (النصف الآخر لم يُسوَّ بعد)' }); continue; }
        acctRoom -= q * ref * 1.03; intents.push({ book: k.id, sym: 'SPY', side: 'buy', qty: q, ref, reason: 'O1: شراء عند الإغلاق بنصف الحقوق', tif: 'cls' }); }
      report.intents = intents; report.sent = await sendIntents(B, ctx, intents, B.n.date, 'cls'); }
    else report.steps.push('lab-postopen: لا أوامر إغلاق (' + CW.why + ')');
    if (TRADING && (report.sent || []).some(s => s.status === 'submitted')) { B = await loadBroker(); ctx = await context(B); }
    await writeReports(B, ctx, null); return report;
  }
  async function status() { READONLY = true; const B = await loadBroker(); report.account = acctView(B); const ctx = await context(B); report.protection = protectionState(B, ctx.books); await writeReports(B, ctx, null, true); return report; }
  function acctView(B) { return { paper: String(B.acc.account_number || '').startsWith('PA'), masked: '****' + String(B.acc.account_number || '').slice(-4), status: B.acc.status, cash: B.acc.cash, equity: B.acc.equity, clock: B.clock }; }
  function clearFlags(note) { const F = readFlags(); const at = new Date(now()).toISOString(); const by = note || env.FLAG_CLEAR_NOTE || 'manual';
    for (const f of F.active) F.cleared.push(Object.assign({}, f, { clearedAt: at, clearedBy: by })); const n = F.active.length; F.active = []; writeState('flags.json', F, true);
    const SI = RL.scanSaveIncidents(STATE_DIR, REPORTS_DIR, { now: now() }); for (const x of SI.open) { fs.mkdirSync(path.join(STATE_DIR, 'evidence'), { recursive: true }); fs.writeFileSync(path.join(STATE_DIR, 'evidence', 'save-incident-' + x.id + '.resolved.json'), JSON.stringify({ incidentId: x.id, resolvedAt: at, by, note: 'حسم يدوي عبر lab-clear-flags' }, null, 1)); }
    report.steps.push('رُفعت ' + n + ' أعلام، وحُسمت ' + SI.open.length + ' حوادث حفظ'); return report; }

  /* ---------- التقارير: يومي لكل لاعب + lab-status.json + ملاحظة أسبوعية + الظلال ---------- */
  function wj(f, v) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 1)); }
  function fillRows(k, d, B) { return k.fills.filter(f => f.date === d).map(f => { const exp = refOfCid(f.cid) || f.refPx || null; const tif = f.cid ? ((B.lab.find(o => o.client_order_id === f.cid) || {}).time_in_force || null) : 'cross';
      const bar = barOn(f.sym, d); const auction = tif === 'opg' || f.kind === 'cross' ? (bar ? bar.o : null) : tif === 'cls' ? (bar ? bar.c : null) : null;
      return { sym: f.sym, side: f.side, qty: f.qty, price: f.px, cid: f.cid, kind: f.kind, tif, expectedRef: exp, slipVsRefPct: exp ? +((f.px / exp - 1) * 100).toFixed(3) : null, auctionPrice: auction, slipVsAuctionPct: auction ? +((f.px / auction - 1) * 100).toFixed(3) : null, provisional: f.provisional || undefined }; }); }
  async function writeReports(B, ctx, plan, readOnly) {
    try {
      if (!cfg.labStart) { wj(path.join(LABREP, 'lab-status.json'), { tool: 'SmartTrader-PaperLab-Status', version: VERSION, at: new Date(now()).toISOString(), labStart: null, note: 'المختبر لم يبدأ بعد (labStart غير محدد) — لا تداول', trading: TRADING, halt: HALT }); return; }
      const lastDay = ST.sortedDates(B.cal).filter(d => d < B.n.date || (d === B.n.date && B.n.hm >= 16 * 60 + 15)).pop();
      if (!lastDay || lastDay < cfg.labStart) { wj(path.join(LABREP, 'lab-status.json'), { tool: 'SmartTrader-PaperLab-Status', version: VERSION, at: new Date(now()).toISOString(), labStart: cfg.labStart, labEnd: LAB_END, note: 'لم يكتمل أي يوم تداول في المختبر بعد', trading: TRADING }); return; }
      const syms = new Set(['SPY', 'VOO']); for (const e of ctx.ev) syms.add(e.sym); try { await getBars([...syms], daysAgo(430)); } catch (e) {}
      const ev = events(B, ctx.crosses, crossPx); const { H, view } = playersView(B, Object.assign({}, ctx, { ev }), lastDay);
      const days = H.REF.map(x => x.date); const refSeries = H.REF; const refDD = ddStats(refSeries, ST.BUDGET);
      const written = [];
      for (const d of days) { const dir = path.join(LABREP, 'daily', d); if (!readOnly && d !== lastDay && fs.existsSync(path.join(dir, 'REF.json'))) continue; if (readOnly && fs.existsSync(path.join(dir, 'REF.json'))) continue;
        const booksD = ledgerAt(ev, nyMs(d, 20 * 60));
        for (const p of ST.PLAYERS) { const s = H[p.id]; const i = s.findIndex(x => x.date === d); const e = s[i]; const prevE = i > 0 ? s[i - 1].equity : p.budget; const dd = ddStats(s.slice(0, i + 1), p.budget);
          const bks = Object.values(booksD).filter(k => k.player === p.id);
          const orders = B.lab.filter(o => { const b = ST.bookOfCid(o.client_order_id); return b && b.player === p.id && targetOfCid(o.client_order_id) === d; }).map(o => ({ cid: o.client_order_id, sym: o.symbol, side: o.side, type: o.type, tif: o.time_in_force, qty: +o.qty, filled: +o.filled_qty || 0, status: o.status, stop: o.stop_price ? +o.stop_price : undefined }));
          const R = { player: p.id, name: p.name, date: d, labVersion: VERSION, startEquity: p.budget, equity: e.equity, cash: e.cash, dayPnl: e.equity != null && prevE != null ? r2(e.equity - prevE) : null, totalPnl: e.equity != null ? r2(e.equity - p.budget) : null,
            totalReturnPct: e.equity != null ? +((e.equity / p.budget - 1) * 100).toFixed(3) : null, drawdownPct: dd.drawdownPct, maxDrawdownPct: dd.maxDrawdownPct,
            positions: holdings(booksD, p.id).map(h => { const c = priceFor(h.sym, d, h.cost, h.qty); return { book: h.book, sym: h.sym, qty: h.qty, avgCost: +(h.cost / h.qty).toFixed(4), close: c, value: r2(h.qty * c), entryDate: h.entryDate }; }),
            orders, fills: bks.flatMap(k => fillRows(k, d, B).map(r => Object.assign({ book: k.id }, r))), tradesClosedToday: bks.reduce((a, k) => a + k.closed.filter(c => c.exitDate === d).length, 0), tradesClosedTotal: e.closed,
            killed: (killedOf(p.id, s.slice(0, i + 1)) || null), vsRef: { refEquity: refSeries[i] ? refSeries[i].equity : null } };
          if (p.id === 'LEARN') { const Lw = learnState(B, H, ST.sortedDates(B.cal).find(x => x > d) || d); R.learnWeights = Lw.weights; R.learnBudgets = Lw.budgets; }
          wj(path.join(dir, p.id + '.json'), R); }
        written.push(d); }
      /* الظلال (افتراضية، بلا أوامر) */
      let shadows = null; if (ctx.universes) { const bars = {}; for (const [s, a] of Object.entries(BARS)) bars[s] = a; const uni = { 'U-LIQ': ctx.universes['U-LIQ'] && ctx.universes['U-LIQ'].symbols || [], 'U-LOW': ctx.universes['U-LOW'] && ctx.universes['U-LOW'].symbols || [] };
        shadows = ST.SHADOWS.map(sh => { try { const r = ST.simulateShadow(sh, { cal: B.cal, labStart: cfg.labStart, lastDay, bars, universes: uni, exclude: Object.keys(BASELINE) }); delete r.curve; return r; } catch (e) { return { id: sh.id, error: e.message }; } });
        wj(path.join(LABREP, 'shadows', lastDay + '.json'), { date: lastDay, note: 'لاعبو ظل افتراضيون: لا أوامر أبدًا. محاكاة من الشموع بلا تسوية ولا انزلاق ولا رسوم (متفائلة).', shadows }); }
      /* الحالة المجمعة للوحة */
      const refE = view.REF.series.length ? view.REF.series[view.REF.series.length - 1].equity : null; const refRet = refE != null ? refE / ST.BUDGET - 1 : null;
      const players = ST.PLAYERS.map(p => { const v = view[p.id]; const last = v.series.length ? v.series[v.series.length - 1] : null; const ret = last && last.equity != null ? last.equity / p.budget - 1 : null;
        const active = p.id !== 'REF'; const verdict = !active ? 'المرجع' : (ret == null || refRet == null) ? 'غير معروف' : (v.tradesClosed < 20 ? 'صفقات أقل من 20 — لا حكم بعد' : (ret > refRet && v.maxDrawdownPct <= refDD.maxDrawdownPct ? 'يتفوق على الحكَم حتى الآن' : 'لا يتفوق على الحكَم حتى الآن'));
        return { id: p.id, name: p.name, equityClose: last ? last.equity : null, equityNow: v.equityNow, totalReturnPct: ret == null ? null : +(ret * 100).toFixed(3), maxDrawdownPct: v.maxDrawdownPct, drawdownPct: v.drawdownPct, tradesClosed: v.tradesClosed, killed: v.killed, vsRefPct: ret != null && refRet != null ? +((ret - refRet) * 100).toFixed(3) : null, verdictSoFar: verdict }; });
      const Lw = learnState(B, H, ST.sortedDates(B.cal).find(x => x > lastDay) || lastDay);
      const status = { tool: 'SmartTrader-PaperLab-Status', version: VERSION, at: new Date(now()).toISOString(), cmd: io.cmd || null, labStart: cfg.labStart, labEnd: LAB_END, lastCompletedDay: lastDay, daysElapsed: days.length, trading: TRADING, halt: HALT,
        entryGates: report.entryGates || null, flags: readFlags().active.map(f => ({ id: f.id, kind: f.kind, at: f.at })), players, ref: { totalReturnPct: refRet == null ? null : +(refRet * 100).toFixed(3), maxDrawdownPct: refDD.maxDrawdownPct },
        learn: { weights: Lw.weights, budgets: Lw.budgets, history: Lw.history }, shadows: shadows ? shadows.map(s => ({ id: s.id, totalReturnPct: s.totalReturnPct, maxDrawdownPct: s.maxDrawdownPct, tradesClosed: s.tradesClosed, error: s.error })) : (readJson(path.join(LABREP, 'lab-status.json')) || {}).shadows || null,
        recon: { ok: ctx.recon.ok, labMismatch: ctx.recon.labMismatch }, settlement: { proven: ctx.settle.proven, settledCash: ctx.settle.settledCash }, crossesTotal: ctx.crosses.length,
        successRule: 'النجاح = عائد كلي أعلى من الحكَم + أقصى هبوط ليس أسوأ من الحكَم + 20 صفقة مغلقة على الأقل (للاعبين النشطين). الحكم النهائي عند ' + LAB_END + ' فقط.' };
      wj(path.join(LABREP, 'lab-status.json'), status); report.labStatus = { lastCompletedDay: lastDay, dailyWritten: written };
      /* الملاحظة الأسبوعية: عند آخر يوم تداول في الأسبوع */
      const nextTd = ST.sortedDates(B.cal).find(x => x > lastDay); if (nextTd && isoWeek(nextTd) !== isoWeek(lastDay)) { const wk = isoWeek(lastDay); const wkDays = days.filter(d => isoWeek(d) === wk);
        for (const p of ST.PLAYERS) { const f = path.join(LABREP, 'weekly', wk, p.id + '.md'); if (fs.existsSync(f) && readOnly) continue; fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, weeklyNote(p, wk, wkDays, view[p.id], refSeries, ev, B)); } report.weeklyWritten = wk; }
    } catch (e) { report.errors.push('تعذرت كتابة تقارير المختبر: ' + e.message); }
  }
  function readJson(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } }
  function weeklyNote(p, wk, wkDays, v, refSeries, ev, B) {
    const s = v.series; const first = s.find(x => x.date === wkDays[0]); const iFirst = s.indexOf(first); const startE = iFirst > 0 ? s[iFirst - 1].equity : p.budget; const last = s.find(x => x.date === wkDays[wkDays.length - 1]);
    const wkEv = ev.filter(e => ST.BOOKS.find(b => b.id === e.book && b.player === p.id) && wkDays.includes(nyParts(e.t).date));
    const buys = wkEv.filter(e => e.side === 'buy'), sells = wkEv.filter(e => e.side === 'sell'); const fmt = x => x == null ? '—' : Number(x).toLocaleString('en-US', { maximumFractionDigits: 2 });
    const refLast = refSeries.find(x => x.date === wkDays[wkDays.length - 1]); const ret = last && last.equity != null ? (last.equity / p.budget - 1) * 100 : null; const refRet = refLast && refLast.equity != null ? (refLast.equity / ST.BUDGET - 1) * 100 : null;
    const L = []; L.push('# ' + p.name + ' (' + p.id + ') — الأسبوع ' + wk); L.push(''); L.push('**الأيام:** ' + wkDays[0] + ' إلى ' + wkDays[wkDays.length - 1]); L.push('');
    L.push('## ماذا فعل'); if (!buys.length && !sells.length) L.push('- لم يشترِ ولم يبع هذا الأسبوع.');
    if (buys.length) L.push('- عمليات الشراء: ' + buys.length + ' (' + [...new Set(buys.map(e => e.sym))].join('، ') + ').'); if (sells.length) L.push('- عمليات البيع: ' + sells.length + ' (' + [...new Set(sells.map(e => e.sym))].join('، ') + ').');
    const cr = wkEv.filter(e => e.kind === 'cross'); if (cr.length) L.push('- عمليات تمت داخليًا مع لاعب آخر: ' + cr.length + ' (الرمز نفسه في الافتتاح نفسه، بسعر الافتتاح الرسمي).');
    L.push(''); L.push('## النتيجة'); L.push('- قيمة المحفظة: ' + fmt(startE) + ' ← ' + fmt(last && last.equity) + ' دولار.'); L.push('- منذ البداية: ' + (ret == null ? '—' : ret.toFixed(2) + '%') + '، والحكَم: ' + (refRet == null ? '—' : refRet.toFixed(2) + '%') + '.');
    L.push('- أكبر هبوط حتى الآن: ' + v.maxDrawdownPct + '%. الصفقات المغلقة: ' + v.tradesClosed + '.'); L.push('');
    L.push('## ما الذي تغيّر'); if (v.killed) L.push('- **توقف عن الشراء** منذ ' + v.killed.date + ' لأن خسارته بلغت 15%.'); else L.push('- لا تغيير في القواعد (القواعد مجمّدة).');
    L.push(''); L.push('_ملاحظة: هذا حساب ورقي. التعبئة الورقية متفائلة، والنتيجة لا تعني ربحًا حقيقيًا._'); return L.join('\n') + '\n'; }

  /* ---------- الحفظ: التقرير + runs.json + الإيصال (بالصيغة التي يتحقق منها verifySave) ---------- */
  let EXIT_HINT = null; function setExitCode(c) { EXIT_HINT = c == null ? null : +c; }
  function saveReport(cmd, rep, outDir, exitCode) { if (exitCode === undefined) exitCode = EXIT_HINT; outDir = outDir || REPORTS_DIR; fs.mkdirSync(outDir, { recursive: true });
    const name = new Date(now()).toISOString().replace(/[:.]/g, '-') + '-' + cmd + '.json'; const f = path.join(outDir, name); const recordable = TRADING && !READONLY && cmd !== 'lab-status' && cmd !== 'lab-clear-flags';
    let body = JSON.stringify(rep, null, 1); try { fs.writeFileSync(f, body); } catch (e) { const id = 'report-' + name.replace(/\.json$/, ''); writeIncident({ id, failed: ['report'], error: e.message, reportFile: name }); try { raise('run-record-failed', 'runrec-' + id, { reportFile: name }); } catch (x) {} const er = new Error('تعذرت كتابة التقرير: ' + e.message); er.code = 'REPORT_WRITE_FAILED'; er.reportFile = name; throw er; }
    let sha = sha256(Buffer.from(body)); let recorded = false;
    if (recordable) { try { const runs = readState('runs.json', []); runs.push({ cmd, start: report.runEnv.startedAt, startedAt: report.runEnv.startedAt, at: new Date(now()).toISOString(), githubRunId: env.GITHUB_RUN_ID || null, githubRunAttempt: env.GITHUB_RUN_ATTEMPT || null, githubEvent: env.GITHUB_EVENT_NAME || null, githubSchedule: env.GH_EVENT_SCHEDULE || null, reportFile: name, reportSha256: sha, lab: true, labStatus: rep.status || null, ordersSent: (rep.orders || []).length });
        writeState('runs.json', runs.slice(-3000)); recorded = true; }
      catch (e) { const id = 'runrec-' + name.replace(/\.json$/, ''); rep.saveStatus = { status: 'incomplete-evidence', incidentId: id, failed: ['runs.json'], error: e.message }; body = JSON.stringify(rep, null, 1); try { fs.writeFileSync(f, body); sha = sha256(Buffer.from(body)); } catch (x) {}
        writeIncident({ id, failed: ['runs.json'], error: e.message, reportFile: name }); try { raise('run-record-failed', 'runrec-' + id, { reportFile: name }); } catch (x) {}
        try { writeState('last-report.json', { runId: env.GITHUB_RUN_ID || 'local', runAttempt: env.GITHUB_RUN_ATTEMPT || '1', cmd, reportFile: name, reportSha256: sha, recorded: false, exitCode: 3 }, true); } catch (x) {}
        const er = new Error('تعذر تسجيل التشغيل في runs.json: ' + e.message); er.code = 'RUN_RECORD_FAILED'; er.reportFile = name; throw er; } }
    try { writeState('last-report.json', { runId: env.GITHUB_RUN_ID || 'local', runAttempt: env.GITHUB_RUN_ATTEMPT || '1', cmd, reportFile: name, reportSha256: sha, recorded, exitCode: exitCode == null ? (rep.errors.length ? 1 : 0) : exitCode, at: new Date(now()).toISOString() }, true); }
    catch (e) { const er = new Error('تعذر كتابة إيصال الحفظ: ' + e.message); er.code = 'SAVE_RECEIPT_FAILED'; er.reportFile = name; throw er; }
    return f; }

  return { overnight, postopen, status, clearFlags: async () => clearFlags(io.flagNote), report, saveReport, setExitCode, _req: req, cfg, readState };
}

const COMMANDS = { 'lab-overnight': 'overnight', 'lab-postopen': 'postopen', 'lab-status': 'status', 'lab-clear-flags': 'clearFlags' };
module.exports = { mkLab, VERSION, WIN, COMMANDS, nyMs, isoWeek, refOfCid, targetOfCid, labEndOf };
if (require.main === module) {
  (async () => { const cmd = process.argv[2] || 'lab-status'; const dir = __dirname;
    if (!COMMANDS[cmd]) { console.error('الأوامر: ' + Object.keys(COMMANDS).join(' | ')); process.exit(2); }
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'lab-config.json'), 'utf8'));
    try { const sd = path.join(dir, 'state'); fs.mkdirSync(sd, { recursive: true }); fs.writeFileSync(path.join(sd, 'last-run.json'), JSON.stringify({ runId: process.env.GITHUB_RUN_ID || null, runNumber: +process.env.GITHUB_RUN_NUMBER || null, runAttempt: +process.env.GITHUB_RUN_ATTEMPT || 1, cmd, at: new Date().toISOString() }, null, 1)); } catch (e) {}
    const R = mkLab(process.env, { config: cfg, dir, cmd, flagNote: process.env.FLAG_CLEAR_NOTE || null }); let rep, code = 0;
    try { rep = await R[COMMANDS[cmd]](); } catch (e) { rep = R.report; rep.errors.push(e.message); code = 2; }
    if (rep.errors.length) code = code || 1; let f; R.setExitCode(code);
    try { f = R.saveReport(cmd, rep, path.join(dir, 'reports')); } catch (e) { console.error(e.message); f = e.reportFile; code = 3; }
    console.log('=== ' + cmd + ' • trading=' + rep.trading + ' • orders=' + rep.orders.length + ' • errors=' + rep.errors.length + ' • warnings=' + rep.warnings.length + ' → ' + f);
    process.exitCode = code; })();
}
