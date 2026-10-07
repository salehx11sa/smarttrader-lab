#!/usr/bin/env node
/* SmartTrader Runner 7.2.19-dev (نسخة تطوير منفصلة — ليست المنشورة). 7.2.19-dev: قرار صالح 7 أكتوبر 2026 («الطريق الأوسط»):
   • استراتيجية I1-index-hold: شراء صندوق مؤشر واسع (VOO افتراضيًا؛ SPY/IVV/VTI فقط) والاحتفاظ به. شراء فقط نحو مبلغ مستهدف، بالنقد المسوّى المثبت،
     بأسهم كاملة. لا بيع آلي أبدًا، ولا وقف خسارة لمركز المؤشر (قرار صالح: احتفاظ طويل). المؤشر قد يهبط 30–50% والأداة لن تبيع.
     الحالة في السجل decision-benchmark: مسموحة فقط في تجربة ورقية (executionTrialOnly) — وضع الاستراتيجية/المال الحقيقي مرفوض (LIVE_CAPS=null).
   • أمر جديد overnight: من 16:15 نيويورك بعد الإغلاق حتى 09:15 من صباح يوم التداول التالي، أمر سوق عند الافتتاح (time_in_force=opg)،
     معرّفه ix1-<يوم التداول المستهدف>-r<سنتات> — أمر واحد على الأكثر لكل يوم تداول (مهما تكرر التشغيل). خارج النافذة: لا شراء، مطابقة فقط.
   • دفتر المؤشر (ix1-) منفصل عن دفتر ds1-: لا حماية بوقف، ولا يدخل خروج S1/M1، ولا يُعد «نشاطًا أجنبيًا». كل أقفال الدخول القائمة تنطبق
     (HALT، ENTRIES_ENABLED، حادثة الحفظ، الاستمرارية، الأعلام، قفل البوابة، النقد المسوّى).
   7.2.17-dev: لا تغيير في منطق المنفّذ؛ الإصلاح DEV-SAVE-05 في state_guard.cjs 7.2.17-dev: لا تغيير في منطق المنفّذ؛ الإصلاح DEV-SAVE-05 في state_guard.cjs
   (سجل مستقل لكل عملية استعادة: restore-manifest-<run>-<attempt>-by-<guardRun>-<guardAttempt>.json). 7.2.16-dev: لا تغيير في منطق المنفّذ؛ الإصلاح DEV-SAVE-04 في state_guard.cjs
   (استعادة أدلة الحوادث من artifact) — المنفّذ يجد الأدلة المستعادة بفحصه الحالي (scanSaveIncidents) ويمنع الدخول حتى clear-flags.
   ملاحظات المراجعة المستقلة لـ7.2.14-dev (7.2.15-dev):
   • DEV-SAVE-03: الحفظ الكامل = سجل التشغيل (runs.json) + التقرير نفسه + إيصال الحفظ (state/last-report.json)، والثلاثة متسقة.
     (أ) أي فشل في كتابة التقرير (أو الإيصال) بعد نجاح runs.json ⇒ حادثة حفظ بالآلية نفسها (state/evidence + reports + علم) + نسخة التقرير في
         state/evidence/report-unwritten-<id>.json إن أمكن + خطأ صريح (سطر الأوامر يخرج برمز 3).
     (ب) عند بدء كل تشغيل تداول: آخر سجل في runs.json يجب أن يجد تقريره ببصمته نفسها، والتقرير يحمل رقم التشغيل والمحاولة ووقت البدء نفسها.
         أي نقص أو اختلاف ⇒ حادثة حفظ دائمة (pair-<التقرير>) + لا دخول؛ الحماية والخروج والمطابقة مستمرة. لا تُثار مرة أخرى بعد حسمها بـclear-flags.
     (ج) verifySave(): تستعملها خطوة الحفظ في الـworkflow لكتابة المرساة (pairVerified + incomplete) — المصدر الوحيد لقاعدة الاكتمال.
   • قفل الدخول من بوابة الجدولة: TRIGGER_ENTRY_LOCK (أي قيمة غير فارغة غير off) أو TRIGGER_SOURCE=manual-recovery ⇒ صفر شراء في كل أمر وفي أي وقت؛
     الحماية والخروج ومتابعة الأوامر والمطابقة مستمرة. القيمتان تُسجلان في runEnv. بلا المتغيرين لا يتغير شيء.
SmartTrader Runner 7.2.14-dev — ملاحظات المراجعة المستقلة لـ7.2.13-dev:
   • DEV-SAVE-02: حادثة الحفظ (فشل runs.json، أو runs.json وflags.json معًا) تُكتب في ثلاثة مواضع مستقلة:
     state/evidence/save-incident-<id>.json + reports/save-incident-<id>.json + التقرير نفسه (saveStatus.incidentId).
     كل تشغيل تداول يفحص هذه المواضع (scanSaveIncidents): حادثة غير محسومة ⇒ لا دخول جديد + إعادة رفع علم run-record-failed؛
     الحماية والخروج والمطابقة مستمرة. clear-flags يكتب سجل حسم save-incident-<id>.resolved.json (من/متى/ملاحظة) فلا تُثار الحادثة مجددًا.
   • DEV-CASH-02: النقد المسوّى يُثبت ولا يُفترض: account.cash − حصيلة البيوع غير المسوّاة (T+1، من نشاطات FILL وسجل تسوية محلي)،
     مع مقارنة non_marginable_buying_power إن وُجد. تعذر الإثبات ⇒ لا دخول (الحماية مستمرة). الحجز يُخصم مرة واحدة في caps.checkEntry.
   • هامش 2% للتعبئة تقدير لحجز التكلفة فقط — ليس ضمانًا لسعر التعبئة ولا سقفًا للخسارة.
SmartTrader Runner 7.2.13-dev — ملاحظات المراجعة المستقلة لـ7.2.12-dev:
   • DEV-SAVE-01: فشل كتابة runs.json في saveReport لم يعد يُبتلع: التقرير يُكتب بحالة «أدلة غير مكتملة» + دليل في state/evidence/
     + علم run-record-failed (يمنع الدخول الجديد فقط؛ الحماية والخروج والمطابقة مستمرة) + خطأ صريح (سطر الأوامر يخرج برمز 3).
   • ربط وحدة السقوف (caps.cjs) بكل مسار دخول (S1 استراتيجية، تجربة التنفيذ، M1): checkEntry قبل كل أمر شراء، وpostFillCheck بعد التعبئة وفي كل تشغيل تداول.
     التجاوز ⇒ علم cap-breach-after-fill (يمنع الدخول فقط، لا بيع قسري). LIVE_CAPS=null ⇒ وضع «استراتيجية» لا يدخل أبدًا.
   • أمر شراء معلق بسعر مرجعي غير معروف ⇒ لا دخول جديد (كان يُقدَّر بـeq×maxPosPct).
   • سقوف التجربة بفحص نوع صارم (رقم محدود موجب، وmaxPositions عدد صحيح) بدل !(+cfg[k]<=v).
   • مخاطرة الصفقة: الكمية × (السعر المرجعي − الوقف) ≤ riskPct% × حقوق المخاطر تُفرض في بوابة الدخول لكل المسارات (وكانت في plan() لـS1 فقط).
SmartTrader Runner 7.2.12-dev — S10 إثبات مصدر التشغيل:
   • runs.json: كل سجل تشغيل يحمل هويته ومصدره: githubRunId وgithubRunAttempt وgithubEvent (GITHUB_EVENT_NAME) وgithubSchedule (GH_EVENT_SCHEDULE)
     وstartedAt (وقت بدء العملية) وcmd، واسم ملف التقرير الذي كتبه هذا التشغيل وبصمته sha256 (ربط السجل بتقريره).
   • runEnv.startedAt في التقرير = startedAt في السجل نفسه. لا تغيير في الإرسال أو الحجم أو الوقف أو النقد أو المخاطر أو HALT أو الأعلام.
SmartTrader Runner 7.2.11 — منفّذ الاستراتيجية اليومية بلا متصفح ولا جهاز مستيقظ.
   7.2.11 (O01): دليل flags.json التالف يُحفظ في state/evidence/flags-<وقت>.corrupt (لا .json في جذر state)، فلا يمنع الاستئناف بعد إصلاح الحالة وclear-flags.
SmartTrader Runner 7.2.10:
   7.2.10 (5/10/2026) — إكمال Q13 بعد المراجعة المستقلة لـ7.2.9:
     • continuity.json يجب أن يطابق التشغيل والمحاولة (GITHUB_RUN_ATTEMPT)، لا التشغيل وحده.
     • flags.json تالف أو ببنية خاطئة لا يُقرأ «بلا أعلام»: يُنسخ جانبًا ويُرفع علم state-corrupt (لا دخول حتى clear-flags).
     • سطر الأوامر يكتب state/last-run.json (التشغيل والمحاولة) عند البدء، فيُثبت state_guard هوية الـartifact.
SmartTrader Runner 7.2.9:
   7.2.9 (5/10/2026) — ملاحظات المراجعة المستقلة لـ7.2.8:
     Q10 تعذر تقييم حد الخسارة (سعر أو مرجع ناقص) يمنع الدخول الجديد؛ الحماية والخروج مستمران.
     Q11 مرجع اليوم/الأسبوع = آخر قياس محفوظ قبل بداية الفترة (لا أول قراءة فيها)؛ لا تُصفّر خسارة سابقة لأول تشغيل.
         ضياع المرجع مع وجود نشاط ⇒ علم risk-reference-missing (لا دخول حتى clear-flags).
     Q12 تعريف واحد لحقوق المخاطر: المخصص + المحقق + الرسوم الموقّعة (net_amount كما يرسلها الوسيط: سالب = خصم) + غير المحقق.
         يستعمله التخطيط (capacity) والمخاطر والتقارير.
     Q13 في GitHub Actions: لا دخول إلا إذا أثبت state_guard.cjs استمرارية الحالة لهذا التشغيل (state/continuity.json).
     Q14 runEnv.githubSchedule = حدث cron الذي أنشأ التشغيل (github.event.schedule) لقياس التأخر من موعده الفعلي.
   7.2.5 (4/10/2026) — ملاحظات مراجعة 7.2.4:
     Q05 أسباب التوقف (مطابقة الكمية والنقد، تأخر الجلسات، أيام بلا حراسة، الأعلام) تُفحص قبل أي شراء في التشغيل نفسه؛ تعذر التحقق = لا دخول.
     Q06 مهلة واحدة تغطي الطلب وقراءة الجسم كاملة؛ داخل session لا تتجاوز 09:50:30.
   7.2.4 (4/10/2026) — ملاحظات المراجعة المستقلة لـ7.2.3:
     Q01 أمر البيع المعلق ليس حماية: ثلاث حالات (protected / exit-pending / unprotected)؛ pending_cancel ليس خروجًا؛ الحراسة تتابع الخروج بعد الافتتاح حتى 09:35 ثم إلغاء مؤكد ووقف للباقي؛ لا بيع مكرر.
     Q02 مهلة الجلسة تُفحص في كل دورة حتى عند فشل القراءة، ولكل طلب مهلة؛ sessionStop بالسبب وغير المحسوم وعلم توقف.
     S10 أعلام توقف دائمة (state/flags.json): زمن حماية > 120 ث، تأخر الجلسة مرتين في 5 جلسات، يوم بأوامر بلا حراسة، فرق مطابقة؛ أي علم ⇒ لا دخول حتى clear-flags.
     S10 مطابقة يومية مستقلة (reports/recon-YYYY-MM-DD.json): كمية الدفتر/الوسيط + النقد بخط أساس + الرسوم والنشاطات.
     Q03 تعديلات التقسيم المعتمدة يدويًا (state/adjustments.json) في الدفتر. BSY: ATR والترتيب بدقة كاملة (التقريب غيّر الكمية سهمًا).
   7.2.3 (4/10/2026) — عيوب اكتشفتها إعادة التشغيل التاريخي (S09) + سد فجوة الحماية (S10):
     (أ) مركز يُرسل خروجه (بيع سوق بكامل الكمية) لا يُعد «حماية غير مؤكدة» تمنع الدخول، ولا يحرر السعة.
     (ب) ترقيم الأوامر: after حصري ⇒ أمر بنفس لحظة حد الصفحة كان يسقط فيصبح المركز «أجنبيًا» بلا وقف ولا خروج. الإصلاح: تداخل وإزالة تكرار، وخطأ صريح عند دفتر ناقص.
     (ج) إزالة تكرار التعبئات بالمعرّف (احتياط).
     (د) لا دخول في سهم وقفه المحسوب ≤ 0 (3×ATR ≥ السعر) — كان يرسل وقفًا سالبًا. فرق معلن عن قاعدة البحث (42 من 42151 صفقة بحثية).
     (هـ) أمر session: أوامر الافتتاح ثم حراسة كل 20 ثانية حتى 09:50 — يحمي التعبئة الجزئية/الكاملة خلال دورة (اختبارات S01–S07).
   7.2.2 (4/10/2026): حسم الشراء الجزئي وحمايته في أول تشغيل بعد الافتتاح (أُزيل شرط 09:45).
   7.2.1 (3/10/2026): إصلاح W01–W05 من المراجعة المستقلة الثالثة:
     W01 السعة تشمل أوامر الشراء المعلقة، ولا تتحرر ببيع أُرسل فقط؛ النقد يُحجز للشراء المعلق.
     W02 الحماية «مؤكدة» فقط لوقف بيع واحد نشط (new/accepted) GTC بالكمية المتبقية الصحيحة؛ held/pending_* غير محسومة؛ نقص الحماية يمنع الدخول.
     W03 الإلغاء يُحسم بمعناه: filled ⇒ استيراد وإعادة حساب، replaced ⇒ تتبع البديل؛ لا وقف جديد قبل إعادة المطابقة، ولا وقف لكمية انتهت.
     W04 أمر scan: قراءة الحساب والبيانات وحساب الإشارات بإعداد فحص معلن — قراءة فقط مفروضة في طبقة الطلبات حتى لو TRADING_ENABLED=true.
     W05 اختلاف كمية الوسيط عن دفتر المنفّذ يوقف أي أمر على الرمز ويمنع الدخول حتى المطابقة.
   الأوامر: scan | status | premarket | session | postopen | overnight (7.2.19-dev، I1 فقط) | clear-flags
   الأمان: paper-api فقط • حساب PA فقط • TRADING_ENABLED=true وحده يسمح بالإرسال • لا يلمس ما لا يملكه (ds1-) • المفاتيح لا تُسجل. */
'use strict';
const fs=(()=>{try{return require('fs');}catch(e){return null;}})(),path=(()=>{try{return require('path');}catch(e){return null;}})();
const DS=(typeof DailyStrat!=='undefined')?DailyStrat:require('./daily_strat.js');
const M1=(typeof M1Strat!=='undefined')?M1Strat:(()=>{try{return require('./m1_strat.js');}catch(e){return null;}})();
/* 7.2.13-dev: وحدة السقوف (نسخة مطابقة حرفيًا لـ12_caps/caps.cjs). غيابها ⇒ لا دخول جديد (فشل مغلق)؛ الخروج والحماية لا تتأثر. */
const CAPS=(typeof SmartCaps!=='undefined')?SmartCaps:(()=>{try{return require('./caps.cjs');}catch(e){return null;}})();
const PAPER='https://paper-api.alpaca.markets',DATA='https://data.alpaca.markets';
const VERSION='7.2.19-dev';
const CID='ds1-';
/* مقترح S12/S10 — ثلاثة أقفال تُفرض في الكود لا في الوثائق:
   (1) المسار المعتمد: لا إرسال حقيقي (غير GET مع TRADING_ENABLED=true) إلا إذا كان RUNNER_PATH في البيئة = cfg.approvedPath (الافتراضي github-actions).
   (2) قفل الحساب: أي نشاط اليوم بمعرّف لا يبدأ بـds1- (أمر أُرسل اليوم أو تعبئة اليوم أو شراء أجنبي مفتوح) ⇒ لا دخول جديد؛ الخروج والحماية مستمران.
   (3) سجل الاستراتيجيات: غير المسجل = مرفوض. المرفوض لا يدخل أبدًا إلا تجربة قياس تنفيذ معلنة:
       cfg.executionTrialOnly===true + trialAllowed + حساب ورقي PA + سقوف التجربة. التقرير يوسمها «ليست استراتيجية». */
const STRATEGY_REGISTRY=Object.freeze({
 'S1-x10-h10':Object.freeze({status:'rejected',trialAllowed:true,why:'البحث: PF 1.193 < 1.20 ودلالة يومية t=1.52 — مسموح فقط لقياس التنفيذ (S10)'}),
 'M1':Object.freeze({status:'rejected',trialAllowed:false,why:'S11: M1 مرفوضة بإعادة التشغيل'}),
 /* 7.2.19-dev: مرجع قرار (decision-benchmark) لا استراتيجية مقبولة: قرار صالح بشراء المؤشر والاحتفاظ به. لم يثبته بحث كإشارة تداول،
    ولا يحتاج ذلك؛ لكنه لم يُجرَّب بعد في التنفيذ. لذلك: تجربة ورقية فقط (trialAllowed + executionTrialOnly)، وstatus ليست accepted
    فلا يصل أبدًا إلى وضع الاستراتيجية. ولو صار accepted يومًا، فسقوف المال الحقيقي LIVE_CAPS=null ترفض كل دخول. */
 'I1-index-hold':Object.freeze({status:'decision-benchmark',trialAllowed:true,kind:'index-hold',why:'قرار صالح (7 أكتوبر 2026): صندوق مؤشر واسع يُشترى ويُحتفظ به — مرجع قرار، مسموح فقط في التجربة الورقية (executionTrialOnly)؛ المال الحقيقي مقفل (LIVE_CAPS=null)'})
});
const TRIAL_CAPS=Object.freeze({allocation:20000,maxPositions:4,riskPct:1,maxPosPct:15});
/* 7.2.13-dev: هامش انزلاق التعبئة لتجربة التنفيذ (مقترح ينتظر موافقة صالح): كل تكلفة دخول تُحسب بالسعر المرجعي × 1.02
   7.2.14-dev (توضيح): هذا الهامش **تقدير لحجز التكلفة فقط** (النقد وسقف المركز والمحفظة). ليس ضمانًا لسعر تعبئة أمر السوق،
   وليس سقفًا للخسارة. حد مخاطرة الصفقة يُحسب عند السعر المرجعي والوقف المخطط: capsGate (riskMax) وplan() لـS1.
   تعبئة أعلى من الهامش يكشفها فحص ما بعد التعبئة (capsPostFill) فيمنع الدخول التالي — بلا بيع قسري. */
const TRIAL_FILL_BUFFER_PCT=2;
/* ---------- 7.2.19-dev: I1-index-hold ----------
   القائمة المسموحة للصندوق: VOO (افتراضي) وSPY وIVV وVTI فقط. أي قيمة أخرى ⇒ لا دخول (فشل مغلق).
   السقف: TRIAL_CAPS.allocation (20,000$ في التجربة الورقية). المبلغ المستهدف = allocation + monthlyContribution × الأشهر منذ trialStart، ولا يتجاوز السقف.
   المقياس «بالتكلفة»: ما دُفع فعلًا (الكمية × متوسط التعبئة) + أوامر معلقة. هبوط السعر لا يفتح شراءً إضافيًا فوق المبلغ المستهدف.
   هامش فجوة الافتتاح لحجز التكلفة 3% (أمر الافتتاح يُسعَّر في الصباح لا عند الإرسال) — تقدير لحجز النقد فقط، ليس ضمانًا للسعر. */
const IX_CID='ix1-';
const INDEX_ALLOWLIST=Object.freeze(['VOO','SPY','IVV','VTI']);
const I1_DEFAULT_SYMBOL='VOO';
const I1_FILL_BUFFER_PCT=3;
const I1_POLICY='احتفاظ طويل بلا بيع آلي وبلا وقف خسارة (قرار صالح). المؤشر قد يهبط 30–50% ولن تبيع الأداة. الخروج قرار يدوي من صالح فقط.';
/* نافذة overnight بتوقيت نيويورك: من 16:15 في آخر يوم تداول حتى 09:15 من يوم التداول المستهدف (التالي في تقويم الوسيط).
   حد Alpaca الموثق لقبول أوامر OPG قرابة 09:28 ET — **يحتاج تحققًا من وثائق Alpaca ومن الحساب الورقي**؛ 09:15 حد متحفظ قبله. */
const OVERNIGHT=Object.freeze({startHm:16*60+15,cutoffHm:9*60+15,alpacaOpgCutoffHm:9*60+28,alpacaCutoffVerified:false});
function i1Settings(cfg){cfg=cfg||{};const why=[];const sym=cfg.indexSymbol===undefined?I1_DEFAULT_SYMBOL:cfg.indexSymbol;
 if(typeof sym!=='string'||!INDEX_ALLOWLIST.includes(sym))why.push('indexSymbol='+JSON.stringify(sym===undefined?null:sym)+' ليس من القائمة المسموحة ('+INDEX_ALLOWLIST.join('/')+')');
 if(!trialCapOk('allocation',cfg.allocation))why.push('allocation='+JSON.stringify(cfg.allocation===undefined?null:cfg.allocation)+' ليس رقمًا موجبًا ≤ '+TRIAL_CAPS.allocation);
 const mc=(cfg.monthlyContribution===undefined||cfg.monthlyContribution===null)?0:cfg.monthlyContribution;
 if(typeof mc!=='number'||!Number.isFinite(mc)||mc<0||mc>TRIAL_CAPS.allocation)why.push('monthlyContribution='+JSON.stringify(mc)+' ليس رقمًا بين 0 و'+TRIAL_CAPS.allocation);
 return{ok:!why.length,why,symbol:sym,allocation:cfg.allocation,monthlyContribution:(typeof mc==='number'&&Number.isFinite(mc)&&mc>=0)?mc:0,cap:TRIAL_CAPS.allocation};}
/* المبلغ المستهدف ليوم التداول المستهدف (بالتكلفة) */
function i1Target(I,trialStart,targetDate){const a=String(trialStart||'').slice(0,7),b=String(targetDate||'').slice(0,7);let months=0;
 if(/^\d{4}-\d{2}$/.test(a)&&/^\d{4}-\d{2}$/.test(b))months=Math.max(0,(+b.slice(0,4)-+a.slice(0,4))*12+(+b.slice(5,7)-+a.slice(5,7)));
 return{months,target:+Math.min(I.cap,(+I.allocation||0)+(I.monthlyContribution||0)*months).toFixed(2)};}
/* هل الآن داخل نافذة overnight؟ دالة نقية: الوقت + تواريخ تقويم الوسيط + next_open من ساعة الوسيط. الهدف = يوم next_open. */
function overnightWindow(nowMs,calDates,nextOpenIso){const n=nyParts(nowMs);const hh=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
 const R={nyNow:n.date+' '+hh(n.hm),target:null,prev:null,start:null,cutoff:null,inWindow:false,late:false,why:null,cutoffNote:'09:15 حد متحفظ؛ حد Alpaca لأوامر OPG قرابة 09:28 ET — يحتاج تحققًا'};
 const t=nextOpenIso&&Number.isFinite(Date.parse(nextOpenIso))?nyParts(Date.parse(nextOpenIso)).date:null;
 if(!t){R.why='موعد الافتتاح التالي (next_open) غير معروف';return R;}
 const ds=[...new Set((calDates||[]).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(String(d))))].sort();
 if(!ds.includes(t)){R.why='يوم الافتتاح التالي '+t+' غير موجود في تقويم الوسيط';return R;}
 const prev=ds.filter(d=>d<t).pop();if(!prev){R.why='لا يوم تداول قبل '+t+' في التقويم';return R;}
 R.target=t;R.prev=prev;R.start=prev+' 16:15';R.cutoff=t+' 09:15';
 if(n.date<prev||(n.date===prev&&n.hm<OVERNIGHT.startHm)){R.why='قبل بداية النافذة ('+R.start+' نيويورك)';return R;}
 if(n.date>t||(n.date===t&&n.hm>OVERNIGHT.cutoffHm)){R.late=true;R.why='بعد حد النافذة ('+R.cutoff+' نيويورك) — فات وقت أمر الافتتاح';return R;}
 R.inWindow=true;return R;}
/* 7.2.13-dev: فحص صارم لقيمة إعداد مقابل سقف التجربة: رقم فعلي (typeof number) محدود موجب ≤ الحد، وmaxPositions عدد صحيح.
   يرفض null و'' وfalse و[] و'10' والسالب والصفر (التعبير القديم !(+v<=cap) كان يقبلها). يستعمله المنفّذ وpreflight.cjs. */
function trialCapOk(k,v){const cap=TRIAL_CAPS[k];return typeof cap==='number'&&typeof v==='number'&&Number.isFinite(v)&&v>0&&v<=cap&&(k!=='maxPositions'||Number.isInteger(v));}
const strictNum=v=>typeof v==='number'?v:(typeof v==='string'&&/^\s*-?\d+(\.\d+)?\s*$/.test(v)?Number(v):NaN);
/* السعر المرجعي لأمر شراء المنفّذ من معرّفه (…-r<سنتات>)؛ غيابه ⇒ null (غير معروف) */
function refOfOrder(o){const m=/-r(\d+)$/.exec((o&&(o.client_order_id||o._parentCid))||'');return m?(+m[1])/100:null;}
/* ---------- 7.2.14-dev (DEV-SAVE-02): حوادث الحفظ غير المحسومة ----------
   حادثة = تشغيل لم يُكتب سجله (runs.json) وربما علمه (flags.json). تُعرف من أي موضع من ثلاثة (يكفي واحد):
     (1) state/evidence/save-incident-<id>.json (أو دليل 7.2.13 القديم run-record-failed-<id>.json)
     (2) reports/save-incident-<id>.json
     (3) تقرير تشغيل حديث (آخر 30 يومًا) فيه saveStatus.status='incomplete-evidence'
   الحسم = سجل save-incident-<id>.resolved.json (في state/evidence أو reports) يكتبه clear-flags، أو علم runrec-<id> مرفوع يدويًا في flags.json.
   ملف حادثة تالف يبقى حادثة مفتوحة (فشل مغلق)؛ سجل حسم تالف لا يحسم شيئًا. لا شبكة ولا كتابة هنا. */
function scanSaveIncidents(stateDir,reportsDir,o){o=o||{};const R={open:[],resolved:[],errors:[],scanned:{evidence:0,reports:0}};
 if(!fs||!path||!stateDir)return R;const nowMs=o.now||Date.now();const found=new Map(),resolved=new Map();
 const add=(id,where,v)=>{const e=found.get(id)||{id,at:null,cmd:null,runId:null,runAttempt:null,reportFile:null,failed:null,where:[]};
  if(v&&typeof v==='object'){e.at=e.at||v.at||null;e.cmd=e.cmd||v.cmd||null;e.runId=e.runId||v.runId||null;e.runAttempt=e.runAttempt||v.runAttempt||null;e.reportFile=e.reportFile||v.reportFile||null;e.failed=e.failed||v.failed||null;}
  e.where.push(where);found.set(id,e);};
 const scanDir=(d,label,isReports)=>{let names;try{names=fs.readdirSync(d);}catch(e){if(e.code!=='ENOENT')R.errors.push(label+': '+e.message);return;}
  for(const n of names){let m;
   if((m=/^save-incident-(.+)\.resolved\.json$/.exec(n))){let v=null;try{v=JSON.parse(fs.readFileSync(path.join(d,n),'utf8'));}catch(e){v=null;}
    if(v&&v.incidentId===m[1]&&v.resolvedAt)resolved.set(m[1],Object.assign({file:label+'/'+n},v));else R.errors.push(label+'/'+n+': سجل حسم تالف — لا يُعتد به');continue;}
   if((m=/^save-incident-(.+)\.json$/.exec(n))||(!isReports&&(m=/^run-record-failed-(.+)\.json$/.exec(n)))){let v=null;try{v=JSON.parse(fs.readFileSync(path.join(d,n),'utf8'));}catch(e){v=null;}
    add(m[1],label+'/'+n+(v?'':' (تالف)'),v);if(label==='state/evidence')R.scanned.evidence++;continue;}
   if(isReports&&/-(premarket|postopen|session|overnight)\.json$/.test(n)){const dm=/^(\d{4}-\d{2}-\d{2})T/.exec(n);if(!dm||Date.parse(dm[1]+'T00:00:00Z')<nowMs-30*864e5)continue;
    let t;try{t=fs.readFileSync(path.join(d,n),'utf8');}catch(e){R.errors.push('reports/'+n+': '+e.message);continue;}R.scanned.reports++;
    if(t.indexOf('incomplete-evidence')<0)continue;let v=null;try{v=JSON.parse(t);}catch(e){v=null;}
    const ss=v&&v.saveStatus;if(v&&!(ss&&ss.status==='incomplete-evidence'))continue;
    const id=(ss&&ss.incidentId)||(/^(.+)-(premarket|postopen|session|overnight)\.json$/.exec(n)||[])[1];add(id,'reports/'+n,{at:v&&v.at,cmd:(/-(premarket|postopen|session|overnight)\.json$/.exec(n)||[])[1],reportFile:n});}}};
 scanDir(path.join(stateDir,'evidence'),'state/evidence',false);if(reportsDir)scanDir(reportsDir,'reports',true);
 for(const fid of (o.clearedFlagIds||[])){const m=/^runrec-(.+)$/.exec(String(fid));if(m&&!resolved.has(m[1]))resolved.set(m[1],{incidentId:m[1],via:'flags.json cleared '+fid});}
 for(const [id,e] of found){if(resolved.has(id))R.resolved.push(Object.assign({},e,{resolution:resolved.get(id)}));else R.open.push(e);}
 R.open.sort((a,b)=>a.id<b.id?-1:1);return R;}
/* ---------- 7.2.15-dev (DEV-SAVE-03): اتساق زوج «سجل التشغيل ↔ تقريره» وإيصال الحفظ ----------
   lastRunPair: آخر سجل في runs.json ⇒ ملف تقريره موجود، وبصمته sha256 = reportSha256 في السجل، والتقرير يحمل githubRunId وgithubRunAttempt وstartedAt نفسها.
     status: none (لا سجلات) • legacy (سجل قديم بلا ربط بتقرير — قبل 7.2.12 أو recordRun مباشر) • ok • mismatch (+ problems، + incidentId ثابت للحادثة).
   pairCovered: هل هذا الخلل مغطى بحادثة حفظ مفتوحة (open-incident) أو محسومة (resolved) — بالمعرّف أو باسم التقرير.
   verifySave: حكم خطوة الحفظ في الـworkflow (المرساة). pairVerified=true فقط إذا أثبت: إيصال هذا التشغيل والمحاولة، والتقرير موجود ببصمته ويحمل رقم التشغيل،
     وسجل runs.json الأخير لهذا التشغيل يطابق الإيصال (لأوامر التسجيل)، وآخر زوج سليم أو حادثته محسومة. لا شبكة ولا كتابة هنا. */
const sha256Hex=b=>{try{return require('crypto').createHash('sha256').update(b).digest('hex');}catch(e){return null;}};
const idNorm=x=>(x==null||x==='')?'local':String(x);const attNorm=x=>String((+x>0)?+x:1);
function lastRunPair(stateDir,reportsDir){const P={status:'none',record:null,problems:[],incidentId:null};
 if(!fs||!path||!stateDir)return P;let txt;
 try{txt=fs.readFileSync(path.join(stateDir,'runs.json'),'utf8');}catch(e){if(e.code==='ENOENT')return P;P.status='mismatch';P.incidentId='pair-runs-unreadable';P.problems.push('تعذرت قراءة state/runs.json: '+e.message);return P;}
 let runs=null;try{runs=JSON.parse(txt);}catch(e){runs=null;}
 if(!Array.isArray(runs)){P.status='mismatch';P.incidentId='pair-runs-'+String(sha256Hex(txt)||'x').slice(0,12);P.problems.push('state/runs.json تالف أو ببنية خاطئة');return P;}
 if(!runs.length)return P;const last=runs[runs.length-1];
 if(!last||typeof last!=='object'){P.status='mismatch';P.incidentId='pair-runs-'+String(sha256Hex(txt)||'x').slice(0,12);P.problems.push('آخر سجل في runs.json ليس كائنًا');return P;}
 P.record={cmd:last.cmd||null,startedAt:last.startedAt||last.start||null,githubRunId:last.githubRunId||null,githubRunAttempt:last.githubRunAttempt||null,reportFile:last.reportFile==null?null:String(last.reportFile),reportSha256:last.reportSha256||null};
 if(last.reportFile==null){P.status='legacy';return P;}
 const name=String(last.reportFile);P.incidentId='pair-'+name.replace(/\.json$/,'').replace(/[^A-Za-z0-9._-]/g,'_');
 if(name!==path.basename(name)||name.startsWith('.')||!reportsDir)P.problems.push('اسم التقرير في السجل غير صالح: '+name);
 else{let buf=null;try{buf=fs.readFileSync(path.join(reportsDir,name));}catch(e){P.problems.push(e.code==='ENOENT'?'ملف التقرير '+name+' غير موجود':'تعذرت قراءة التقرير '+name+': '+e.message);}
  if(buf){const h=sha256Hex(buf);if(!last.reportSha256||h!==String(last.reportSha256))P.problems.push('بصمة التقرير '+name+' لا تطابق بصمته في سجل التشغيل');
   let rep=null;try{rep=JSON.parse(buf.toString('utf8'));}catch(e){rep=null;}const E=rep&&rep.runEnv;
   if(!E)P.problems.push('التقرير '+name+' غير مقروء أو بلا runEnv');
   else{if(idNorm(E.githubRunId)!==idNorm(last.githubRunId)||attNorm(E.githubRunAttempt)!==attNorm(last.githubRunAttempt))P.problems.push('التقرير '+name+' لتشغيل آخر ('+idNorm(E.githubRunId)+'/'+attNorm(E.githubRunAttempt)+') غير المسجل ('+idNorm(last.githubRunId)+'/'+attNorm(last.githubRunAttempt)+')');
    if(last.startedAt&&E.startedAt!==last.startedAt)P.problems.push('وقت البدء في التقرير '+name+' لا يطابق السجل');}}}
 P.status=P.problems.length?'mismatch':'ok';return P;}
function pairCovered(P,SI){if(!P||P.status!=='mismatch'||!SI)return null;const rf=P.record&&P.record.reportFile;
 const hit=arr=>(arr||[]).find(e=>e.id===P.incidentId||(rf&&e.reportFile===rf));const r=hit(SI.resolved);if(r)return{status:'resolved',id:r.id};const o=hit(SI.open);if(o)return{status:'open-incident',id:o.id};return null;}
function verifySave(stateDir,reportsDir,o){o=o||{};const V={anchorSchema:2,pairVerified:false,incomplete:true,openSaveIncidents:0,runnerExit:null,receipt:null,lastPair:null,problems:[]};
 try{const SI=scanSaveIncidents(stateDir,reportsDir,{now:o.now||Date.now()});V.openSaveIncidents=SI.open.length+(SI.errors.length?1:0);
  let rc=null;try{rc=JSON.parse(fs.readFileSync(path.join(stateDir,'last-report.json'),'utf8'));}catch(e){V.problems.push('لا إيصال حفظ مقروء (state/last-report.json)');}
  if(rc){V.receipt={runId:rc.runId||null,runAttempt:rc.runAttempt||null,cmd:rc.cmd||null,reportFile:rc.reportFile||null,recorded:rc.recorded===true,exitCode:rc.exitCode==null?null:rc.exitCode};V.runnerExit=V.receipt.exitCode;
   if(idNorm(rc.runId)!==idNorm(o.runId)||attNorm(rc.runAttempt)!==attNorm(o.runAttempt))V.problems.push('إيصال الحفظ لتشغيل آخر ('+idNorm(rc.runId)+'/'+attNorm(rc.runAttempt)+') — هذا التشغيل لم يكتب تقريره');
   else{if(o.cmd&&rc.cmd&&String(rc.cmd)!==String(o.cmd))V.problems.push('أمر الإيصال ('+rc.cmd+') غير الأمر المختار ('+o.cmd+')');
    const name=String(rc.reportFile||'');let buf=null;
    if(!name||name!==path.basename(name))V.problems.push('اسم التقرير في الإيصال غير صالح');
    else{try{buf=fs.readFileSync(path.join(reportsDir,name));}catch(e){V.problems.push('تقرير هذا التشغيل '+name+' غير موجود');}}
    if(buf){if(sha256Hex(buf)!==rc.reportSha256)V.problems.push('بصمة تقرير هذا التشغيل لا تطابق الإيصال');
     let rep=null;try{rep=JSON.parse(buf.toString('utf8'));}catch(e){}if(!rep||!rep.runEnv||idNorm(rep.runEnv.githubRunId)!==idNorm(o.runId))V.problems.push('تقرير هذا التشغيل لا يحمل رقم التشغيل '+idNorm(o.runId));}
    if(rc.recorded===true){let runs=null;try{runs=JSON.parse(fs.readFileSync(path.join(stateDir,'runs.json'),'utf8'));}catch(e){}const last=Array.isArray(runs)&&runs.length?runs[runs.length-1]:null;
     if(!last||idNorm(last.githubRunId)!==idNorm(o.runId)||attNorm(last.githubRunAttempt)!==attNorm(o.runAttempt)||last.reportFile!==rc.reportFile||last.reportSha256!==rc.reportSha256)V.problems.push('آخر سجل في runs.json ليس سجل هذا التشغيل أو لا يطابق تقريره');}}}
  const P=lastRunPair(stateDir,reportsDir);const C=pairCovered(P,SI);V.lastPair={status:C?C.status:P.status,incidentId:C?C.id:P.incidentId,problems:P.problems};
  if(P.status==='mismatch'&&!(C&&C.status==='resolved'))V.problems.push('آخر سجل تشغيل وتقريره غير متسقين: '+P.problems.join('، '));
  V.pairVerified=!V.problems.length;
  const out=String(o.runOutcome||'');
  /* نتيجة خطوة Run: success، أو failure مع إيصال يثبت أن المنفّذ أكمل أمره وحفظه وخرج برمز 1 (أخطاء في التقرير) أو 2 (أمر رُفض، مثل premarket بعد 09:25).
     رمز 3 (حادثة حفظ) أو بلا إيصال أو cancelled/skipped ⇒ غير مكتمل. */
  const outcomeOk=out==='success'||(out==='failure'&&V.pairVerified&&(V.runnerExit===1||V.runnerExit===2));
  if(!outcomeOk)V.problems.push('نتيجة خطوة Run «'+(out||'غير معروفة')+'»'+(V.runnerExit!=null?' ورمز خروج المنفّذ '+V.runnerExit:'')+' لا تثبت اكتمال التشغيل');
  V.incomplete=!(V.openSaveIncidents===0&&V.pairVerified&&outcomeOk);}
 catch(e){V.pairVerified=false;V.incomplete=true;V.problems.push('تعذر التحقق: '+e.message);}
 return V;}
function strategyStatus(id){if(!id)return{id:null,status:'none',trialAllowed:false,why:'لا استراتيجية في الإعداد (strategy=null)'};
 const r=STRATEGY_REGISTRY[id];return Object.assign({id},r||{status:'rejected',trialAllowed:false,why:'غير مسجلة في سجل الاستراتيجيات — مرفوضة افتراضيًا'});}
const TERMINAL=new Set(['canceled','expired','rejected','filled','replaced']);
const ACTIVE_STOP=new Set(['new','accepted']);
/* 7.2.4 (Q01): أمر بيع «حي» فقط يُعد خروجًا جاريًا؛ pending_cancel/pending_replace/held وغيرها ليست خروجًا ولا حماية */
const EXIT_LIVE=new Set(['new','accepted','pending_new','accepted_for_bidding','partially_filled']);
function nyParts(ms){const f=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
 const o={};f.formatToParts(new Date(ms)).forEach(p=>o[p.type]=p.value);return{date:`${o.year}-${o.month}-${o.day}`,hm:(+o.hour%24)*60+(+o.minute)};}
function mkRunner(env,io){
 env=env||(typeof process!=='undefined'?process.env:{});io=io||{};
 const fetchFn=io.fetch||globalThis.fetch;const now=io.now||(()=>Date.now());
 const cfg=Object.assign({universe:'U-LIQ',strategy:null,scanStrategy:'S1-x10-h10',allocation:20000,maxPositions:4,riskPct:1,maxPosPct:15,trialStart:'2026-10-05T00:00:00Z',universeFile:'universe.json',approvedPath:'github-actions'},io.config||{});
 /* 7.2.13-dev: خطافات اختبار فقط (io.testRegistry وio.testCaps) — تُقبل فقط مع وسيط محقون من الكود (io.fetch)؛ سطر الأوامر لا يحقنهما أبدًا */
 const TESTING=!!io.fetch;
 const stStatus=id=>(TESTING&&io.testRegistry&&id&&io.testRegistry[id])?Object.assign({id},io.testRegistry[id]):strategyStatus(id);
 /* 7.2.19-dev: هل الإعداد I1-index-hold؟ (من السجل، لا من الاسم) */
 const IS_I1=stStatus(cfg.strategy).kind==='index-hold';const I1SET=IS_I1?i1Settings(cfg):null;
 const TRADING=String(env.TRADING_ENABLED||'').toLowerCase()==='true';
 const ENTRIES=String(env.ENTRIES_ENABLED||'true').toLowerCase()!=='false';
 /* 7.2.8 (S10/S12): HALT=true = إيقاف كل قرار تداول جديد مع إبقاء إدارة المخاطر:
    يوقف: أي دخول جديد، وأي خروج استراتيجي (أوامر البيع قبل الافتتاح).
    يستمر: حسم أوامر الشراء المعلقة (إلغاء الباقي)، وحماية مراكز المنفّذ (ds1-) بوقف GTC وتحويل الوقف اليومي، ومتابعة خروج أُرسل قبل HALT،
    والمطابقة اليومية، والأعلام، والتقارير. لا يمس المراكز الأجنبية (القديمة) أو وقفاتها أبدًا — كما في كل الأوضاع. */
 const HALT=String(env.HALT||'').toLowerCase()==='true';
 /* 7.2.15-dev: قفل الدخول من بوابة الجدولة (عقد مع 17_scheduler). TRIGGER_ENTRY_LOCK غير فارغ وغير off ⇒ قفل بقيمته؛
    TRIGGER_SOURCE=manual-recovery ⇒ قفل حتى لو غاب TRIGGER_ENTRY_LOCK (دفاع في العمق). القفل يمنع أي شراء جديد في كل أمر وأي وقت،
    ولا يمس الحماية والخروج ومتابعة الأوامر المرسلة والمطابقة. بلا المتغيرين: لا تغيير. */
 const TRIG_SOURCE=env.TRIGGER_SOURCE==null?'':String(env.TRIGGER_SOURCE);const TRIG_LOCK_RAW=env.TRIGGER_ENTRY_LOCK==null?'':String(env.TRIGGER_ENTRY_LOCK);
 const ENTRY_LOCK=(TRIG_LOCK_RAW!==''&&TRIG_LOCK_RAW.trim().toLowerCase()!=='off')?TRIG_LOCK_RAW:(TRIG_SOURCE.trim()==='manual-recovery'?'manual-recovery':null);
 const ENTRY_LOCK_WHY=ENTRY_LOCK?'قفل دخول من بوابة الجدولة: '+ENTRY_LOCK:null;
 const KEY=env.APCA_API_KEY_ID||'',SEC=env.APCA_API_SECRET_KEY||'';
 let READONLY=false;
 const RUN_PATH=String(env.RUNNER_PATH||'').trim();
 const PATH_OK=!!cfg.approvedPath&&RUN_PATH===cfg.approvedPath;
 /* إعادة تشغيل تاريخية: مزوّد شموع ووسيط محاكى محقونان من الكود معًا (سطر الأوامر لا يحقنهما أبدًا) */
 const REPLAY=!!(io.barsProvider&&io.fetch);const RESEARCH_REPLAY=REPLAY&&cfg.executionTrialOnly!==true; /* إعادة بحث (لا بروفة تجربة): أزمنة الحماية محاكاة فلا أعلام زمن */
 const journal=[];const methods=new Set();
 const report={version:VERSION,strategyVersion:DS.VERSION,config:cfg.strategy,universe:cfg.universe,trading:TRADING,entries:ENTRIES,at:new Date(now()).toISOString(),steps:[],warnings:[],errors:[],orders:[],wouldSend:[],
  halt:HALT,approvedPath:{approved:cfg.approvedPath||null,thisRun:RUN_PATH||null,ok:PATH_OK},strategyRegistry:stStatus(cfg.strategy),
  runEnv:{path:RUN_PATH||null,githubRunId:env.GITHUB_RUN_ID||null,githubRunAttempt:env.GITHUB_RUN_ATTEMPT||null,githubWorkflow:env.GITHUB_WORKFLOW||null,githubEvent:env.GITHUB_EVENT_NAME||null,githubRepository:env.GITHUB_REPOSITORY||null,githubRunNumber:env.GITHUB_RUN_NUMBER||null,githubSchedule:env.GH_EVENT_SCHEDULE||null,triggerSource:TRIG_SOURCE||null,triggerEntryLock:TRIG_LOCK_RAW||null,entryLock:ENTRY_LOCK}};
 const log=(k,x)=>{const e=Object.assign({ts:new Date(now()).toISOString(),k},x||{});journal.push(e);if(io.verbose!==false)console.log(k,JSON.stringify(x||{}));};
 const sleep=io.sleep||(ms=>new Promise(r=>setTimeout(r,ms)));
 /* 7.2.4: حالة دائمة بين التشغيلات (أعلام التوقف، سجل التشغيلات، خط الأساس النقدي، تعديلات التقسيم).
    المكان: io.stateDir، أو state/ بجانب المنفّذ عند التشغيل من سطر الأوامر. بلا نظام ملفات (المتصفح) أو بلا dir ⇒ ذاكرة فقط.
    في GitHub يُحفظ المجلد بالـcommit مع التقارير (الخطوة Save report). */
 const STATE_DIR=io.stateDir||(io.dir&&path?path.join(io.dir,'state'):null);const MEM={};
 function readState(name,def){if(STATE_DIR&&fs){try{return JSON.parse(fs.readFileSync(path.join(STATE_DIR,name),'utf8'));}catch(e){return def;}}return name in MEM?JSON.parse(MEM[name]):def;}
 function writeState(name,v,force){if(READONLY&&!force)return;if(STATE_DIR&&fs){fs.mkdirSync(STATE_DIR,{recursive:true});fs.writeFileSync(path.join(STATE_DIR,name),JSON.stringify(v,null,1));}else MEM[name]=JSON.stringify(v);}
 const CMD=io.cmd||null;const STARTED=now();report.runEnv.startedAt=new Date(STARTED).toISOString(); /* 7.2.12-dev: وقت بدء هذا التشغيل (يطابق startedAt في runs.json) */let HARD_DEADLINE=null; /* 7.2.5: نهاية نافذة الحراسة (يضبطها session) */
 async function req(method,url,body,{dataApi=false}={}){
  if(READONLY&&method!=='GET')throw new Error('وضع القراءة فقط: رُفض '+method+' '+url+' داخل المنفّذ قبل الإرسال');
  const full=(dataApi?DATA:PAPER)+url;
  /* 7.2.15-dev: قفل الدخول في طبقة الطلبات — لا أمر شراء (ولا «سيُرسل» في التشغيل الجاف) مهما كان المسار */
  if(ENTRY_LOCK&&method==='POST'&&/^\/v2\/orders\/?$/.test(url)&&body&&String(body.side).toLowerCase()==='buy')throw new Error(ENTRY_LOCK_WHY+' — رُفض أمر شراء '+(body.symbol||'')+' قبل الإرسال');
  /* 7.2.19-dev: حزام في طبقة الطلبات — I1 لا يبيع المؤشر أبدًا، وأمر ix1- لا يكون إلا شراء سوق عند الافتتاح (opg) */
  if(method==='POST'&&/^\/v2\/orders\/?$/.test(url)&&body){const cid=String(body.client_order_id||'');const side=String(body.side||'').toLowerCase();
   if(cid.startsWith(IX_CID)&&!(side==='buy'&&body.type==='market'&&body.time_in_force==='opg'&&!body.order_class&&!body.stop_loss))throw new Error('أمر ix1- بغير شكل I1 (شراء سوق opg بلا وقف) — رُفض قبل الإرسال');
   if(IS_I1&&side!=='buy'&&I1SET&&body.symbol===I1SET.symbol)throw new Error('I1: بيع المؤشر '+body.symbol+' ممنوع في الكود (احتفاظ طويل بقرار صالح) — رُفض قبل الإرسال');}
  if(method!=='GET'&&!TRADING){report.wouldSend.push({method,url,body});log('dry_run',{method,url,body});return{__dry:true,id:'dry-'+report.wouldSend.length,status:'dry'};}
  /* قفل (1): مسار غير معتمد لا يرسل أي أمر حقيقي — يُفحص في طبقة الطلبات فلا يتجاوزه أي أمر */
  if(method!=='GET'&&!PATH_OK&&!REPLAY)throw new Error('مسار غير معتمد: RUNNER_PATH='+(RUN_PATH||'(فارغ)')+' والمعتمد '+(cfg.approvedPath||'(غير محدد)')+' — رُفض '+method+' '+url+' قبل الإرسال');
  methods.add(method);
  /* 7.2.5 (Q06): مؤقت واحد يغطي الطلب وقراءة الجسم كاملة، ولا يُلغى قبل انتهاء القراءة. داخل الجلسة لا يتجاوز نهاية نافذة الحراسة. */
  let TMO=io.requestTimeoutMs||cfg.requestTimeoutMs||15000;if(HARD_DEADLINE)TMO=Math.max(500,Math.min(TMO,HARD_DEADLINE-now()));
  let tm=null;const ac=(typeof AbortController!=='undefined')?new AbortController():null;
  /* 7.2.6 (S07): Content-Type يُرسل فقط مع جسم. Alpaca لا يسمح به في CORS على /v2/clock و/v2/calendar وdata API، فكان المتصفح يرفض الطلب («Failed to fetch»). */
  const hdr={'APCA-API-KEY-ID':KEY,'APCA-API-SECRET-KEY':SEC};if(body)hdr['Content-Type']='application/json';
  const work=(async()=>{const resp=await fetchFn(full,{method,headers:hdr,body:body?JSON.stringify(body):undefined,signal:ac?ac.signal:undefined});
   const t=await resp.text();return{resp,t};})();work.catch(()=>{});
  let got;try{got=await Promise.race([work,new Promise((_,rej)=>{tm=setTimeout(()=>{try{ac&&ac.abort();}catch(e){}const e=new Error(method+' '+url+' → مهلة '+TMO+'ms (الطلب أو قراءة الجسم)');e.status=0;e.timeout=true;rej(e);},TMO);})]);}
  finally{clearTimeout(tm);}
  const r=got.resp,txt=got.t;let j=null;try{j=txt?JSON.parse(txt):null;}catch(e){j=null;}
  if(!r.ok){const e=new Error(method+' '+url+' → HTTP '+r.status+' '+(j&&j.message||txt||'').slice(0,160));e.status=r.status;throw e;}
  if(method!=='GET')report.orders.push({method,url,body,status:r.status,id:j&&j.id});
  return j;
 }
 const isStop=x=>x.side==='sell'&&(x.type==='stop'||x.type==='stop_limit');
 /* ---------- الحالة من الوسيط (مصدر الحقيقة) ---------- */
 async function loadState(){
  const acc=await req('GET','/v2/account');
  const clock=await req('GET','/v2/clock');
  const positions=await req('GET','/v2/positions');
  let orders=[],after=cfg.trialStart;
  /* 7.2.3 (S09): after حصري؛ أوامر بنفس submitted_at عند حد الصفحة كانت تسقط فيُعامل المركز كأجنبي (بلا وقف ولا خروج).
     الإصلاح: تداخل 1ms ثم إزالة التكرار بالمعرّف؛ صفحة بلا جديد أو استنفاد الصفحات ⇒ خطأ يوقف التشغيل (دفتر ناقص). */
  {const ids=new Set();let complete=false;
   for(let i=0;i<40;i++){const r=await req('GET','/v2/orders?status=all&nested=true&direction=asc&limit=500&after='+encodeURIComponent(after));if(!r||!r.length){complete=true;break;}
    let fresh=0;for(const o of r){if(!ids.has(o.id)){ids.add(o.id);orders.push(o);fresh++;}}
    if(r.length<500){complete=true;break;}
    if(!fresh)throw new Error('ترقيم الأوامر عالق (أكثر من 500 أمر بنفس اللحظة) — الدفتر غير مكتمل');
    after=new Date(Date.parse(r[r.length-1].submitted_at)-1).toISOString();}
   if(!complete)throw new Error('سجل الأوامر تجاوز حد الصفحات — الدفتر غير مكتمل');}
  const seen=new Set();orders=orders.filter(o=>seen.has(o.id)?false:(seen.add(o.id),true));
  const flat=[];orders.forEach(o=>{flat.push(o);(o.legs||[]).forEach(l=>{if(seen.has(l.id)&&flat.some(f=>f.id===l.id))return;l._parent=o.id;l._parentCid=o.client_order_id;flat.push(l);});});
  const byId={};flat.forEach(o=>byId[o.id]=o);
  const mineIds=new Set();const isMine=o=>String(o.client_order_id||'').startsWith(CID)||String(o._parentCid||'').startsWith(CID);
  flat.forEach(o=>{if(isMine(o))mineIds.add(o.id);});
  /* بدائل الاستبدال (replaced_by) تتبع أصلها */
  let grew=true;while(grew){grew=false;flat.forEach(o=>{if(mineIds.has(o.id)&&o.replaced_by&&!mineIds.has(o.replaced_by)&&byId[o.replaced_by]){mineIds.add(o.replaced_by);grew=true;}});}
  const mine=flat.filter(o=>mineIds.has(o.id));
  let acts=[],tok=null;for(let i=0;i<50;i++){const r=await req('GET','/v2/account/activities/FILL?direction=asc&page_size=100&after='+encodeURIComponent(cfg.trialStart)+(tok?'&page_token='+encodeURIComponent(tok):''));if(!r||!r.length){tok='__done';break;}acts.push(...r);if(r.length<100){tok='__done';break;}tok=r[r.length-1].id;}
  if(tok!=='__done')throw new Error('سجل التعبئات تجاوز حد الصفحات — الدفتر غير مكتمل');
  /* 7.2.4 (S10-مطابقة): كل النشاطات غير التعبئة (رسوم، توزيعات، تحويلات، أحداث شركات) للمطابقة النقدية؛ الرسوم منها */
  let fees=0,otherActs=[],otherOk=true;
  try{let t2=null;for(let i=0;i<50;i++){const r=await req('GET','/v2/account/activities?direction=asc&page_size=100&after='+encodeURIComponent(cfg.trialStart)+(t2?'&page_token='+encodeURIComponent(t2):''));
    if(!r||!r.length)break;otherActs.push(...r.filter(a=>a.activity_type!=='FILL'));if(r.length<100)break;t2=r[r.length-1].id;if(i===49)otherOk=false;}
   {const sn=new Set();otherActs=otherActs.filter(a=>sn.has(a.id)?false:(sn.add(a.id),true));}
   otherActs.forEach(a=>{if(a.activity_type==='FEE'||a.activity_type==='CFEE')fees+=+a.net_amount||0;});}
  catch(e){otherOk=false;report.warnings.push('تعذر جلب النشاطات غير التعبئة (رسوم/توزيعات): '+e.message);}
  {const seenA=new Set();acts=acts.filter(a=>seenA.has(a.id)?false:(seenA.add(a.id),true));} /* 7.2.3: إزالة تكرار النشاطات عند تداخل الصفحات */
  const myFills=acts.filter(a=>mineIds.has(a.order_id));
  const owned={};const book={};
  /* 7.2.4 (Q03): تعديلات التقسيم المعتمدة يدويًا (state/adjustments.json) تُطبق على الدفتر في تاريخها: الكمية × النسبة، والتكلفة كما هي.
     لا كشف آلي للتقسيم: اختلاف كمية الوسيط يوقف الرمز (W05) حتى يسجل صالح التعديل بعد التحقق منه. */
  const adj=readState('adjustments.json',[]).filter(a=>a&&a.symbol&&a.effective&&(+a.ratio>0||a.type==='delist')).sort((a,b)=>a.effective<b.effective?-1:1);
  const ev=myFills.map(f=>({k:'f',t:f.transaction_time,f})).concat(adj.map(a=>({k:'a',t:a.effective+'T00:00:00-04:00',a})));
  ev.sort((x,y)=>Date.parse(x.t)-Date.parse(y.t)||(x.k==='a'?-1:1));
  for(const e of ev){
   if(e.k==='a'){const b=book[e.a.symbol];if(!(b&&b.qty>1e-9))continue;
    /* 7.2.5: شطب معتمد يدويًا {type:'delist', proceedsPerShare} ⇒ إغلاق الدفتر بالعائد المسجل (المحقق = العائد − التكلفة) */
    if(e.a.type==='delist'){b.realized+=b.qty*(+e.a.proceedsPerShare||0)-b.cost;b.qty=0;b.cost=0;b.delisted=e.a.effective;continue;}
    b.qty=+(b.qty*(+e.a.ratio)).toFixed(6);b.splitAdj=(b.splitAdj||[]).concat(e.a.effective+'×'+e.a.ratio);continue;}
   const f=e.f;const q=+f.qty,px=+f.price;const b=book[f.symbol]=book[f.symbol]||{qty:0,cost:0,realized:0,lastBuyOrder:null,lastBuyTs:null};
   if(f.side==='buy'){b.cost+=q*px;b.qty+=q;b.lastBuyOrder=f.order_id;b.lastBuyTs=f.transaction_time;}
   else{const avg=b.qty?b.cost/b.qty:0;b.realized+=(px-avg)*q;b.cost-=avg*q;b.qty-=q;}}
  Object.entries(book).forEach(([s,b])=>{if(b.qty>1e-9)owned[s]={qty:+b.qty.toFixed(6),avg:b.cost/b.qty,lastBuyOrder:b.lastBuyOrder,lastBuyTs:b.lastBuyTs};});
  const realized=Object.values(book).reduce((a,b)=>a+b.realized,0);
  const openMine=mine.filter(o=>!TERMINAL.has(o.status));
  const brokerPos={};(positions||[]).forEach(p=>brokerPos[p.symbol]=+p.qty);
  const mySyms=new Set([...Object.keys(owned),...mine.map(o=>o.symbol)]);
  /* W05: اختلاف الكمية لأي رمز يملكه المنفّذ أو تداوله */
  const mismatch={};for(const s of mySyms){const a=owned[s]?owned[s].qty:0,b=brokerPos[s]||0;if(Math.abs(a-b)>1e-6&&(a>0||mine.some(o=>o.symbol===s&&(+o.filled_qty>0))))mismatch[s]={runner:a,broker:b};}
  /* 7.2.19-dev: دفتر المؤشر I1 (أوامر ix1-): منفصل عن ds1-؛ لا حماية بوقف ولا خروج، ولا يُعد نشاطًا أجنبيًا. فرق الكمية مع الوسيط ⇒ لا شراء للمؤشر. */
  const ixOrders=flat.filter(o=>!mineIds.has(o.id)&&String(o.client_order_id||'').startsWith(IX_CID));const ixIds=new Set(ixOrders.map(o=>o.id));
  const ixFills=acts.filter(a=>ixIds.has(a.order_id));const ixBook={};
  for(const f of ixFills.slice().sort((a,b)=>Date.parse(a.transaction_time)-Date.parse(b.transaction_time))){const b=ixBook[f.symbol]=ixBook[f.symbol]||{qty:0,cost:0};const q=+f.qty,px=+f.price;
   if(f.side==='buy'){b.qty+=q;b.cost+=q*px;}else{const avg=b.qty?b.cost/b.qty:0;b.cost-=avg*q;b.qty-=q;}}
  const ixOwned={};Object.entries(ixBook).forEach(([s,b])=>{if(b.qty>1e-9)ixOwned[s]={qty:+b.qty.toFixed(6),avg:b.cost/b.qty,cost:+b.cost.toFixed(4)};});
  const ixPending=ixOrders.filter(o=>!TERMINAL.has(o.status));
  const ixMismatch={};for(const s of new Set([...Object.keys(ixOwned),...ixOrders.filter(o=>(+o.filled_qty||0)>0).map(o=>o.symbol),...(IS_I1&&I1SET&&typeof I1SET.symbol==='string'?[I1SET.symbol]:[])])){const a=(ixOwned[s]?ixOwned[s].qty:0)+(owned[s]?owned[s].qty:0),b=brokerPos[s]||0;if(Math.abs(a-b)>1e-6)ixMismatch[s]={runner:a,broker:b};}
  const foreign=new Set(Object.keys(brokerPos).filter(s=>!owned[s]&&!ixOwned[s]));
  const pendingBuys=openMine.filter(o=>o.side==='buy'&&!o._parent);
  /* 7.2.3 (S09): خروج معلق = أمر بيع سوق غير نهائي بكامل الكمية المملوكة؛ الحماية أُلغيت عمدًا قبله */
  const exiting={};openMine.filter(o=>o.side==='sell'&&o.type==='market'&&!o._parent&&EXIT_LIVE.has(o.status)).forEach(o=>{exiting[o.symbol]=(exiting[o.symbol]||0)+((+o.qty)-(+o.filled_qty||0));});
  const openSells=openMine.filter(o=>o.side==='sell'&&!isStop(o)&&!o._parent);
  /* قفل (2): نشاط أجنبي على الحساب اليوم (منصة المتصفح أو يدوي أو منفّذ آخر) */
  const today=nyParts(now()).date;const dOf=x=>x?nyParts(Date.parse(x)).date:null;
  const fx=o=>({id:o.id,cid:o.client_order_id||null,symbol:o.symbol,side:o.side,type:o.type,status:o.status});
  const foreignActivity={
   ordersToday:flat.filter(o=>!mineIds.has(o.id)&&!ixIds.has(o.id)&&dOf(o.submitted_at||o.created_at)===today).map(fx),
   openBuys:flat.filter(o=>!mineIds.has(o.id)&&!ixIds.has(o.id)&&o.side==='buy'&&!TERMINAL.has(o.status)).map(fx),
   fillsToday:acts.filter(a=>!mineIds.has(a.order_id)&&!ixIds.has(a.order_id)&&dOf(a.transaction_time)===today).map(a=>({id:a.id,order_id:a.order_id,symbol:a.symbol,side:a.side,qty:+a.qty}))};
  foreignActivity.any=!!(foreignActivity.ordersToday.length||foreignActivity.openBuys.length||foreignActivity.fillsToday.length);
  const S0={acc,clock,positions,brokerPos,orders:flat,byId,mine,openMine,owned,realized,fees,foreign,mismatch,pendingBuys,exiting,openSells,myFills,acts,otherActs,otherOk,foreignActivity,ixOrders,ixFills,ixOwned,ixPending,ixMismatch};
  try{observeProtection(S0);}catch(e){}
  return S0;
 }
 /* W02: الحماية المؤكدة */
 function protectionOf(S,sym,want){
  const o=S.owned[sym];const stops=S.openMine.filter(x=>x.symbol===sym&&isStop(x));
  const active=stops.filter(x=>ACTIVE_STOP.has(x.status));
  const rem=x=>(+x.qty)-(+x.filled_qty||0);
  const p={sym,qty:o.qty,brokerQty:S.brokerPos[sym]||0,stops:stops.map(x=>({id:x.id,status:x.status,qty:+x.qty,filled:+x.filled_qty||0,stop:+x.stop_price,tif:x.time_in_force||null})),confirmed:false,why:[]};
  if(S.mismatch[sym])p.why.push('كمية الوسيط '+p.brokerQty+' ≠ دفتر المنفّذ '+o.qty);
  if(stops.length!==1)p.why.push(stops.length?'أكثر من أمر وقف ('+stops.length+')':'لا أمر وقف');
  if(stops.length===1){const x=stops[0];
   if(!ACTIVE_STOP.has(x.status))p.why.push('حالة الوقف '+x.status+' غير محسومة/غير نشطة');
   if(x.time_in_force!=='gtc')p.why.push('صلاحية الوقف '+(x.time_in_force||'?')+' وليست GTC');
   if(Math.abs(rem(x)-o.qty)>1e-6)p.why.push('كمية الوقف المتبقية '+rem(x)+' ≠ '+o.qty);
   if(!(+x.stop_price>0))p.why.push('سعر وقف غير صالح');
   if(want&&Math.abs(+x.stop_price-want)/want>0.005)p.why.push('سعر الوقف '+x.stop_price+' ≠ المطلوب '+want);}
  p.confirmed=!p.why.length&&active.length===1;return p;
 }
 async function getBars(syms,start){
  /* حقن مزوّد شموع (لإعادة التشغيل التاريخي/الاختبار فقط): نفس الشكل {t,o,h,l,c,v} — لا يغير أي منطق قرار */
  if(io.barsProvider){const r=await io.barsProvider(syms,start,now());report.feedUsed=report.feedUsed||'provider';return r;}
  /* الخطة المجانية تمنع آخر 15 دقيقة من SIP: النهاية = الآن − 16 د، ومع الرفض (403/422) نعود إلى IEX ويُسجَّل ذلك */
  const end=new Date(now()-16*60000).toISOString();
  const out={};for(let i=0;i<syms.length;i+=100){const chunk=syms.slice(i,i+100);let tok=null,g=0;
   for(;;){const feed=report.feedUsed||cfg.feed||'sip';const u='/v2/stocks/bars?symbols='+encodeURIComponent(chunk.join(','))+'&timeframe=1Day&start='+start+'&end='+encodeURIComponent(end)+'&limit=10000&adjustment=split&feed='+feed+(tok?'&page_token='+encodeURIComponent(tok):'');
    let j;try{j=await req('GET',u,null,{dataApi:true});}catch(e){if((e.status===403||e.status===422)&&feed==='sip'&&!report.feedUsed){report.feedUsed='iex';report.warnings.push('رفض SIP ('+e.status+') — استُخدم IEX للشموع');tok=null;continue;}throw e;}
    report.feedUsed=report.feedUsed||feed;
    Object.entries(j.bars||{}).forEach(([t,a])=>{(out[t]=out[t]||[]).push(...(a||[]));});tok=j.next_page_token||null;if(!tok||++g>=60)break;}}
  const res={};for(const [t,a] of Object.entries(out)){res[t]=a.map(b=>({t:nyParts(Date.parse(b.t)).date,o:+b.o,h:+b.h,l:+b.l,c:+b.c,v:+b.v})).filter(b=>b.o>0&&b.c>0).sort((x,y)=>x.t<y.t?-1:1);}
  return res;
 }
 function universe(){if(Array.isArray(cfg.universeList))return cfg.universeList;
  const f=path.isAbsolute(cfg.universeFile)?cfg.universeFile:path.join(io.dir||__dirname,cfg.universeFile);return JSON.parse(fs.readFileSync(f,'utf8')).symbols;}
 /* W03: إلغاء يُحسم بمعناه، مع تتبع البديل */
 async function cancelChain(id){const r=await cancelChain0(id);r.ms=Date.now()-r._t0;delete r._t0;(report.cancels=report.cancels||[]).push({id,status:r.status,resolved:r.resolved,ms:r.ms});return r;} /* 7.2.5: زمن الإلغاء الحقيقي (E4) */
 async function cancelChain0(id){const _t0=Date.now();const R=await (async()=>{
  let cur=id;
  for(let hop=0;hop<4;hop++){
   try{await req('DELETE','/v2/orders/'+cur);}catch(e){if(e.status!==404&&e.status!==422)log('cancel_send_failed',{id:cur,err:e.message});}
   if(!TRADING)return{resolved:false,dry:true,status:'dry'};
   let st=null;
   for(let k=0;k<5;k++){try{st=await req('GET','/v2/orders/'+cur);}catch(e){if(e.status===404)return{resolved:false,status:'not_found',id:cur};}
    if(st&&TERMINAL.has(st.status))break;await sleep(1000);}
   if(!st||!TERMINAL.has(st.status))return{resolved:false,status:st?st.status:'unknown',id:cur,filled:st?+st.filled_qty||0:0};
   if(st.status==='replaced'&&st.replaced_by){log('cancel_follow_replacement',{from:cur,to:st.replaced_by});cur=st.replaced_by;continue;}
   return{resolved:true,status:st.status,id:cur,filled:+st.filled_qty||0};
  }
  return{resolved:false,status:'replace_chain_too_long',id:cur};
 })();R._t0=_t0;return R;}
 /* قفل (3) + (2): سياسة الدخول — تُستدعى قبل أي شراء. لا تمس الخروج ولا الحماية. */
 function entryPolicy(S){const st=stStatus(cfg.strategy);const why=[];let mode=null;
  /* 7.2.7: إعادة تشغيل تاريخية (مزوّد شموع ووسيط محاكى محقونان من الكود، لا من الإعداد أو البيئة) ليست تداولًا — تُسمح لإعادة البحث والتطابق */
  if(RESEARCH_REPLAY&&!ENTRY_LOCK&&/^PASIM\d+$/.test(String(S.acc.account_number||''))){mode='research-replay';const r={ok:true,mode,strategy:st,why:[],label:'إعادة تشغيل تاريخية — ليست تداولًا'};report.entryPolicy=r;return r;}
  if(st.status==='accepted')mode='strategy';
  else if(cfg.executionTrialOnly===true&&st.trialAllowed){mode='execution-trial';
   if(!String(S.acc.account_number||'').startsWith('PA'))why.push('تجربة التنفيذ على حساب غير ورقي');
   /* 7.2.19-dev: I1 له سقف المبلغ فقط (مركز واحد بكامل المبلغ)؛ القائمة المسموحة والمساهمة الشهرية تُفحص بصرامة */
   if(st.kind==='index-hold'){const I=i1Settings(cfg);for(const w of I.why)why.push('I1: '+w);}
   else for(const [k,v] of Object.entries(TRIAL_CAPS))if(!trialCapOk(k,cfg[k]))why.push('سقف التجربة: '+k+'='+JSON.stringify(cfg[k]===undefined?null:cfg[k])+' ليس رقمًا موجبًا ≤ '+v+(k==='maxPositions'?' (عدد صحيح)':''));}
  else why.push('الاستراتيجية '+(st.id||'null')+' حالتها «'+st.status+'» — '+st.why+(st.trialAllowed&&cfg.executionTrialOnly!==true?' (للتجربة: executionTrialOnly=true)':''));
  if(HALT)why.push('HALT مفعّل — لا دخول جديد');
  if(ENTRY_LOCK)why.unshift(ENTRY_LOCK_WHY);
  /* 7.2.8: حدود الخسارة شرط للدخول في أي وضع تداول (تجربة أو استراتيجية): غيابها = لا دخول */
  if((mode==='execution-trial'||mode==='strategy')&&!(cfg.lossLimits&&+cfg.lossLimits.dailyPct>0&&+cfg.lossLimits.weeklyPct>0))why.push('حدود الخسارة غير مضبوطة (lossLimits.dailyPct وweeklyPct) — لا دخول');
  if(S.foreignActivity&&S.foreignActivity.any)why.push('قفل الحساب: نشاط اليوم بمعرّف غير ds1- ('+[...new Set([...S.foreignActivity.ordersToday,...S.foreignActivity.openBuys,...S.foreignActivity.fillsToday].map(x=>x.symbol+(x.cid?'/'+x.cid:'')))].slice(0,8).join('، ')+') — مسار آخر يتداول على الحساب');
  const r={ok:!why.length,mode,strategy:st,why,label:mode==='execution-trial'?(st.kind==='index-hold'?'تجربة ورقية لشراء المؤشر (I1) — مرجع قرار، ليست استراتيجية مقبولة':'تجربة تنفيذ — ليست استراتيجية مقبولة'):null};
  report.entryPolicy=r;if(S.foreignActivity)report.foreignActivity=S.foreignActivity;return r;}
 function stopFor(entry,atrSig){return +(entry-3*atrSig).toFixed(entry-3*atrSig<1?4:2);}
 function lastCompleted(cal,n){const ds=cal.map(c=>c.date);const done=ds.filter(d=>d<n.date||(d===n.date&&n.hm>=16*60+15));return done.pop();}
 async function sessionInfo(){const n=nyParts(now());const cal=await req('GET','/v2/calendar?start='+new Date(now()-12*864e5).toISOString().slice(0,10)+'&end='+n.date);saveCalendar(cal);return{n,cal,prev:cal.map(c=>c.date).filter(d=>d<n.date).pop(),last:lastCompleted(cal,n)};}
 function gate(S){const why=[];
  for(const sym of Object.keys(S.mismatch))why.push(sym+': '+JSON.stringify(S.mismatch[sym]));
  for(const sym of Object.keys(S.owned)){if(!S.clock.is_open&&isExiting(S,sym))continue; /* سياسة معلنة: خروج حي قبل الافتتاح لا يمنع الدخول، لكنه ليس حماية */
   const p=protectionOf(S,sym);if(!p.confirmed)why.push(sym+': حماية غير مؤكدة — '+p.why.join('، '));}
  return why;}
 /* 7.2.3/7.2.4: «خروج جارٍ» = أمر بيع سوق حي (EXIT_LIVE) بكامل الكمية ولا وقف قائم. حالة مستقلة عن «محمي»: لا تُحسب حماية أبدًا (Q01). */
 function isExiting(S,sym){const o=S.owned[sym];return !!(o&&(S.exiting[sym]||0)>=o.qty-1e-9&&!S.openMine.some(x=>x.symbol===sym&&isStop(x))&&!S.mismatch[sym]);}
 /* 7.2.9 (Q12): تعريف واحد لحقوق المخاطر في التخطيط والمخاطر والتقارير.
    الرسوم S.fees = مجموع net_amount لنشاطات FEE/CFEE كما يرسلها الوسيط (رسوم = سالب، استرداد = موجب) فتُجمع بإشارتها ولا تُطرح.
    riskBase = المخصص + المحقق + الرسوم.  riskEquity = riskBase + غير المحقق بسعر الوسيط current_price لكل مركز مملوك.
    سعر ناقص لأي مركز مملوك ⇒ ok=false (لا رقم تقريبي). */
 function riskBase(S){return +cfg.allocation+S.realized+S.fees;}
 function riskEquity(S){const px={};(S.positions||[]).forEach(p=>px[p.symbol]=+p.current_price);let un=0;const missing=[];
  for(const [sym,o] of Object.entries(S.owned)){const c=px[sym];if(!(c>0)){missing.push(sym);continue;}un+=(c-o.avg)*o.qty;}
  for(const [sym,o] of Object.entries(S.ixOwned||{})){const c=px[sym];if(!(c>0)){missing.push(sym);continue;}un+=(c-o.avg)*o.qty;} /* 7.2.19-dev: مركز المؤشر داخل حقوق المخاطر (للقياس فقط — لا بيع) */
  const base=riskBase(S);return{ok:!missing.length,missing,base:+base.toFixed(2),unrealized:+un.toFixed(2),equity:missing.length?null:+(base+un).toFixed(2)};}
 /* W01: السعة والنقد المحجوز */
 function capacity(S){
  const ownedSyms=Object.keys(S.owned).filter(s=>S.owned[s].qty>0);
  const pend=S.pendingBuys.filter(o=>!S.owned[o.symbol]);
  const pendSyms=new Set(pend.map(o=>o.symbol));
  const used=ownedSyms.length+pendSyms.size;
  const eq=riskBase(S); /* 7.2.9 (Q12): التعريف الموحد */
  const ownedVal=ownedSyms.reduce((a,s)=>a+S.owned[s].qty*S.owned[s].avg,0);
  /* 7.2.13-dev: أمر معلق بلا سعر مرجعي لا يُقدَّر (كان eq×maxPosPct) — يُسجل في unknownPending فيمنع الدخول الجديد */
  let pendVal=0;const unknownPending=[];for(const o of S.pendingBuys){const ref=refOfOrder(o);const rem=(+o.qty)-(+o.filled_qty||0);
   if(ref)pendVal+=rem*ref;else unknownPending.push({id:o.id,symbol:o.symbol,cid:o.client_order_id||null,remaining:rem});}
  return{used,slots:Math.max(0,cfg.maxPositions-used),eq,ownedVal,pendVal,cashAvail:Math.max(0,eq-ownedVal-pendVal),pendingSymbols:[...pendSyms],unknownPending};
 }
 /* ---------- 7.2.13-dev: محوّل السقوف (حالة الوسيط ← مدخلات caps.cjs) ----------
    • المراكز: مراكز المنفّذ فقط (دفتر ds1-)؛ القيمة السوقية = الكمية × current_price من الوسيط، والتكلفة = الكمية × متوسط التعبئة الفعلي.
      المراكز الأجنبية القديمة (AMD/CAT/MSFT/NVDA…) خارج المخصص ولا تُحسب ولا تُمس.
    • الأوامر المعلقة: أوامر شراء المنفّذ غير النهائية؛ الباقي = qty − filled_qty بالسعر المرجعي من المعرّف (غير معروف ⇒ null ⇒ رفض).
    • 7.2.14-dev (DEV-CASH-02): النقد المسوّى **يُثبت** في settlementProof (لا يُفترض من account.cash):
      account.cash − حصيلة البيوع غير المسوّاة (T+1) من نشاطات FILL وسجل تسوية محلي (state/settlement-ledger.json)،
      ومقارنة non_marginable_buying_power إن أبلغ عنه الوسيط. لا يُستبدل الحقل آليًا بـnon_marginable_buying_power، والحجز يُخصم مرة واحدة (checkEntry).
      تعذر الإثبات ⇒ cash=NaN في بوابة الدخول ⇒ لا دخول. فحص ما بعد التعبئة يستعمل المثبت، وإلا account.cash موسومًا «غير مثبت» (للكشف فقط؛ الدخول ممنوع أصلًا). */
 function capsCfg(){return{allocation:cfg.allocation,maxPositions:cfg.maxPositions,maxPosPct:cfg.maxPosPct,riskPct:cfg.riskPct};}
 function capsModeFromConfig(){const st=stStatus(cfg.strategy);if(st.status==='accepted')return'strategy';if(cfg.executionTrialOnly===true&&st.trialAllowed)return'execution-trial';return null;}
 function capsForMode(mode){if(mode==='execution-trial')return Object.assign({},TRIAL_CAPS,{fillBufferPct:TRIAL_FILL_BUFFER_PCT});
  if(mode==='strategy')return(TESTING&&io.testCaps)?io.testCaps:(CAPS?CAPS.LIVE_CAPS:null);return null;}
 function capsState(S,forPostFill){const px={};(S.positions||[]).forEach(p=>px[p.symbol]=strictNum(p.current_price));
  return{positions:Object.entries(S.owned).map(([sym,o])=>({symbol:sym,qty:o.qty,marketValue:o.qty*(sym in px?px[sym]:NaN),costBasis:+(o.qty*o.avg).toFixed(6)})),
   pendingOrders:S.pendingBuys.map(o=>({symbol:o.symbol,qty:Math.max(0,(+o.qty)-(+o.filled_qty||0)),limitOrRefPrice:refOfOrder(o)})),
   ...cashOf(S,forPostFill)};}
 function cashOf(S,forPostFill){const P=S._settle;if(P&&P.proven)return{cash:P.settledCash,cashField:'settled-cash (account.cash − unsettled sales, ledger)'};
  if(forPostFill)return{cash:strictNum(S.acc&&S.acc.cash),cashField:'account.cash (التسوية غير مثبتة — للكشف بعد التعبئة فقط)'};
  return{cash:NaN,cashField:'settled-cash: غير مثبت'};}
 /* 7.2.14-dev (DEV-CASH-02): محوّل إثبات النقد المسوّى. GET فقط: /v2/account/activities/FILL (آخر 14 يومًا) و/v2/calendar.
    سجل التسوية المحلي = البيوع غير المسوّاة المعروفة (اتحاد السابق غير المستحق + الحالي)؛ بيع سابق اختفى من النشاطات ⇒ غير متسق ⇒ منع.
    مسارات النشاط والتقويم كما في وثائق Alpaca العامة — لم تُختبر على الوسيط الحقيقي في هذه النسخة (لا شبكة). */
 const SETTLE_LOOKBACK_DAYS=14;
 async function settlementProof(S){if(S._settle)return S._settle;
  const n=nyParts(now());const fromMs=now()-SETTLE_LOOKBACK_DAYS*864e5;const fromIso=new Date(fromMs).toISOString();const fromDate=nyParts(fromMs).date;
  let fills=null,fillsError=null,cal=null,calendarError=null;
  try{const a=[];let tok=null,done=false;
   for(let i=0;i<50;i++){const r=await req('GET','/v2/account/activities/FILL?direction=asc&page_size=100&after='+encodeURIComponent(fromIso)+(tok?'&page_token='+encodeURIComponent(tok):''));
    if(!Array.isArray(r))throw new Error('رد نشاطات غير متوقع');if(!r.length){done=true;break;}a.push(...r);if(r.length<100){done=true;break;}tok=r[r.length-1].id;}
   if(!done)throw new Error('نشاطات التعبئة تجاوزت حد الصفحات');
   fills=a.map(f=>{const t=f&&Date.parse(f.transaction_time);return{id:f&&f.id!=null?String(f.id):'',side:f&&f.side,qty:f&&f.qty,price:f&&f.price,symbol:f&&f.symbol||null,order_id:f&&f.order_id||null,tradeDate:Number.isFinite(t)?nyParts(t).date:null};});}
  catch(e){fillsError=e.message;}
  try{const c=await req('GET','/v2/calendar?start='+fromDate+'&end='+n.date);if(!Array.isArray(c))throw new Error('رد تقويم غير متوقع');cal=c.map(x=>x&&x.date);}catch(e){calendarError=e.message;}
  /* حجز الأوامر المعلقة بالسعر المرجعي (بلا هامش) — للمقارنة مع non_marginable_buying_power فقط (أشد تحفظًا)؛ لا يُخصم هنا */
  let reserve=0,resOk=true;for(const o of S.pendingBuys.concat(S.ixPending||[])){const ref=refOfOrder(o);const rem=Math.max(0,(+o.qty)-(+o.filled_qty||0));if(!ref){resOk=false;continue;}reserve+=rem*ref;}
  const prior=readState('settlement-ledger.json',null);
  const P=CAPS&&CAPS.proveSettledCash?CAPS.proveSettledCash({cash:S.acc&&S.acc.cash,nonMarginableBuyingPower:S.acc?S.acc.non_marginable_buying_power:undefined,fills,fillsError,calendar:cal,calendarError,today:n.date,coverageFrom:fromDate,pendingReserve:resOk?+reserve.toFixed(6):null,priorLedger:prior})
   :{proven:false,settledCash:null,reasons:['caps.cjs (proveSettledCash) غير موجود']};
  P.at=new Date(now()).toISOString();P.sources={account:'/v2/account (cash, non_marginable_buying_power)',activities:'/v2/account/activities/FILL',calendar:'/v2/calendar'};
  if(!fillsError&&!calendarError&&P.ledger&&TRADING&&!READONLY&&!RESEARCH_REPLAY){
   const keep=(prior&&Array.isArray(prior.unsettled)?prior.unsettled:[]).filter(x=>x&&typeof x.id==='string'&&!(typeof x.settleDate==='string'&&x.settleDate<n.date));
   const m=new Map();for(const x of keep.concat(P.ledger.unsettled))m.set(x.id,x);
   try{writeState('settlement-ledger.json',{v:1,at:P.at,today:n.date,rule:'T+1 يوم عمل؛ غير مسوّى حتى نهاية يوم التسوية',unsettled:[...m.values()]});}catch(e){report.warnings.push('تعذر حفظ سجل التسوية: '+e.message);}}
  S._settle=P;report.settlement=P;return P;}
 /* بوابة الدخول: كل خطة شراء (S1 استراتيجية/تجربة، M1) تمر هنا قبل الإرسال. تعيد الخطة بعد القص؛ 0 ⇒ لا أمر.
    (1) caps.checkEntry: سقف الرمز وسقف المحفظة وعدد المراكز والنقد المسوّى والهامش والعلم — مع أوامر هذا التشغيل كأوامر معلقة.
    (2) مخاطرة الصفقة: الكمية × (السعر المرجعي − الوقف) ≤ riskPct% × حقوق المخاطر (riskBase). */
 function capsGate(S,P,mode,stratId){const G={mode,cashField:'settled-cash',caps:null,checks:[]};report.capsEntry=G;
  if(mode==='research-replay'){G.skipped='إعادة تشغيل تاريخية (حساب محاكى) — ليست تداولًا، لا سقوف';return P;}
  if(!CAPS){G.blocked='وحدة السقوف caps.cjs غير موجودة — لا دخول';report.errors.push(G.blocked);return[];}
  /* 7.2.14-dev (DEV-CASH-02): لا دخول بلا نقد مسوّى مثبت */
  if(!(S._settle&&S._settle.proven)){G.blocked='النقد المسوّى غير مثبت — لا دخول (الحماية والخروج مستمران): '+((S._settle&&S._settle.reasons)||['لم يُحسب']).join('، ');G.settlement=S._settle||null;report.errors.push(G.blocked);return[];}
  const caps=capsForMode(mode);G.caps=caps;const st=capsState(S);G.cash=st.cash;G.cashField=st.cashField;G.accountCash=strictNum(S.acc&&S.acc.cash);G.unsettledProceeds=S._settle.unsettledProceeds;const flags=activeFlags().map(f=>f.kind);
  const eq=riskBase(S);const placed=[];const out=[];
  for(const p of P){const c=CAPS.checkEntry({caps,cfg:capsCfg(),strategyId:stratId,order:{symbol:p.sym,side:'buy',qty:p.qty,refPrice:p.refClose},
    positions:st.positions,pendingOrders:st.pendingOrders.concat(placed),cash:st.cash,activeFlags:flags});
   const dist=p.refClose-p.provisionalStop;const rp=cfg.riskPct;
   const riskMax=(dist>0&&eq>0&&typeof rp==='number'&&Number.isFinite(rp)&&rp>0)?Math.floor((eq*rp/100)/dist+1e-9):0;
   const q=Math.max(0,Math.min(p.qty,c.maxQty>=1?c.maxQty:0,riskMax));
   G.checks.push({sym:p.sym,plannedQty:p.qty,refPrice:p.refClose,stop:p.provisionalStop,capsMaxQty:c.maxQty,riskMaxQty:riskMax,finalQty:q,riskAtStop:+(q*dist).toFixed(2),riskLimit:+(eq*(+rp||0)/100).toFixed(2),reasons:c.reasons});
   if(q<1){report.warnings.push(p.sym+': لا دخول — السقوف/المخاطرة ('+(c.reasons.join('، ')||('حد المخاطرة '+riskMax))+')');continue;}
   if(q<p.qty)report.warnings.push(p.sym+': قُصّت الكمية '+p.qty+' → '+q+' بالسقوف/المخاطرة');
   out.push(Object.assign({},p,{qty:q,plannedQty:p.qty}));placed.push({symbol:p.sym,qty:q,limitOrRefPrice:p.refClose});}
  return out;}
 /* فحص ما بعد التعبئة: كل تشغيل تداول (في تقييم الأعلام) وبداية postopen قبل أي إلغاء. التجاوز ⇒ علم cap-breach-after-fill (يمنع الدخول فقط) — لا بيع قسري. */
 function sigOf(t){let h=5381;for(let i=0;i<t.length;i++)h=((h*33)^t.charCodeAt(i))>>>0;return h.toString(36);}
 function capsPostFill(S,stage){if(!TRADING||READONLY||RESEARCH_REPLAY)return null;
  if(!Object.keys(S.owned).length&&!S.pendingBuys.length)return null;
  const mode=capsModeFromConfig();const L=report.capsPostFill=report.capsPostFill||[];const today=nyParts(now()).date;
  if(!mode){L.push({stage,skipped:'لا وضع تداول في الإعداد — لا سقوف تنطبق (الدخول مغلق أصلًا)'});return null;}
  if(!CAPS){L.push({stage,mode,breach:true,evaluated:false,details:['caps.cjs غير موجود']});raise('cap-breach-after-fill','capbreach-nomodule-'+today,{stage,note:'caps.cjs غير موجود — تعذر التقييم'});return null;}
  const st=capsState(S,true);const byOrder={};
  for(const f of S.myFills){if(f.side!=='buy'||nyParts(Date.parse(f.transaction_time)).date!==today)continue;const x=byOrder[f.order_id]=byOrder[f.order_id]||{symbol:f.symbol,qty:0,cost:0,refPrice:refOfOrder(S.byId[f.order_id])};x.qty+=+f.qty;x.cost+=(+f.qty)*(+f.price);}
  const fills=Object.values(byOrder).map(x=>({symbol:x.symbol,qty:x.qty,avgFillPrice:x.cost/x.qty,refPrice:x.refPrice}));
  const r=CAPS.postFillCheck({caps:capsForMode(mode),cfg:capsCfg(),fills,positions:st.positions.map(p=>({symbol:p.symbol,qty:p.qty,costBasis:p.costBasis})),pendingOrders:st.pendingOrders,cash:st.cash});
  const rec=Object.assign({stage,mode,at:new Date(now()).toISOString(),cashField:st.cashField},r);L.push(rec);
  if(r.breach){const key=r.details.filter(d=>!/انزلاق التعبئة/.test(d)).join('|');raise(CAPS.BREACH_FLAG,'capbreach-'+sigOf(key),{stage,mode,details:r.details,exposureBySymbol:r.exposureBySymbol||null,pendingReserve:r.pendingReserve==null?null:r.pendingReserve,cash:r.cash==null?null:r.cash,evaluated:r.evaluated,forceSell:false,note:'يمنع الدخول الجديد فقط — لا بيع قسري؛ الحماية والخروج والمطابقة مستمرة. يرفعه صالح بـclear-flags'});}
  return rec;}
 async function scanSignals(S,strat,lastDay,excl){
  const start=new Date(now()-430*864e5).toISOString().slice(0,10);
  const uni=universe().filter(s=>!excl.has(s));
  const bars=await getBars(uni,start);
  const cands=[];let stale=0,checked=0,eligible=0;
  for(const sym of uni){let b=bars[sym];if(!b)continue;b=b.filter(x=>x.t<=lastDay);if(b.length<DS.UNIVERSES[cfg.universe].minBars)continue;checked++;
   if(b[b.length-1].t!==lastDay){stale++;continue;}
   const I=DS.ind(b);const i=b.length-1;if(!DS.eligible(cfg.universe,b,I,i))continue;eligible++;
   const s=DS.signal(strat,b,I,i);if(s)cands.push({sym,rank:s.rank,close:b[i].c,atr:I.atr14[i]});} /* 7.2.4 (BSY): ATR بدقته الكاملة للحجم والوقف — التقريب كان يغيّر الكمية سهمًا */
  cands.sort((a,b)=>b.rank-a.rank);
  return{cands,stats:{universe:uni.length,withBars:checked,staleLastBar:stale,eligible,signals:cands.length,lastCompletedSession:lastDay},ok:!(checked<(cfg.minUniverse==null?50:cfg.minUniverse)||stale/Math.max(1,checked)>0.2)};
 }
 function plan(S,cands,cap){const out=[];let cash=cap.cashAvail;
  for(const c of cands){if(out.length>=cap.slots)break;const stopDist=3*c.atr/c.close;const val=Math.min(cap.eq*cfg.riskPct/100/stopDist,cap.eq*cfg.maxPosPct/100,cash);
   const ps=stopFor(c.close,c.atr);
   /* 7.2.3 (S09): 3×ATR ≥ السعر ⇒ وقف الكارثة ≤ 0 لا يمكن وضعه لدى الوسيط ⇒ لا دخول (فرق معلن عن قاعدة البحث؛ أثره مقاس في إعادة التشغيل) */
   if(!(ps>0)){(report.skippedUnprotectable=report.skippedUnprotectable||[]).push(c.sym);continue;}
   const qty=Math.floor(val/c.close);if(qty<1)continue;out.push({sym:c.sym,qty,refClose:c.close,provisionalStop:ps,rank:c.rank});cash-=qty*c.close;}
  return out;}
 /* ---------- W04: فحص للقراءة فقط ---------- */
 async function scan(){
  READONLY=true;const strat=DS.CONFIGS.find(c=>c.id===((IS_I1?null:cfg.strategy)||cfg.scanStrategy));
  report.mode='scan (قراءة فقط — لا أوامر مهما كانت الإعدادات)';report.scanStrategy=strat?strat.id:null;
  report.scanNote=cfg.strategy?'استراتيجية الإعداد':'إعداد فحص معلن للقراءة فقط — غير مقبولة كاستراتيجية (البحث: لا استراتيجية مقبولة)';
  const S=await loadState();const si=await sessionInfo();report.calendarDates=(si.cal||[]).map(c=>c.date);
  report.account={status:S.acc.status,paper:String(S.acc.account_number||'').startsWith('PA'),account_number_masked:S.acc.account_number?'****'+String(S.acc.account_number).slice(-4):null,cash:S.acc.cash,equity:S.acc.equity};
  report.positionsAtBroker=(S.positions||[]).map(p=>({symbol:p.symbol,qty:+p.qty}));
  if(!strat){report.errors.push('لا إعداد فحص صالح');return finish(S);}
  try{entryPolicy(S);}catch(e){} /* للعرض فقط: هل كان الدخول مسموحًا لو كان تشغيل تداول */
  const cap=capacity(S);report.capacity=cap;
  const excl=new Set([...Object.keys(S.owned),...S.foreign,...cap.pendingSymbols,...Object.keys(S.ixOwned||{})]);
  const r=await scanSignals(S,strat,si.last,excl);report.scan=r.stats;report.dataOk=r.ok;
  report.topSignals=r.cands.slice(0,15);report.wouldPlan=gate(S).length?[]:plan(S,r.cands,cap);
  report.gate=gate(S);
  return finish(S);
 }
 /* ---------- قبل الافتتاح ---------- */
 async function premarket(){
  if(cfg.strategy==='M1')return premarketM1();
  if(IS_I1)throw new Error('I1-index-hold يعمل بأمر overnight فقط (أمر الافتتاح opg بعد الإغلاق) — premarket لا يرسل شيئًا لـI1');
  const strat=DS.CONFIGS.find(c=>c.id===cfg.strategy);
  if(!strat)throw new Error('لا استراتيجية مقبولة في الإعداد (strategy=null) — لا أوامر. للفحص دون أوامر استخدم: scan');
  if(strat.fam==='S0')throw new Error('S0 يحتاج إدارة داخل اليوم (هدف/إغلاق) — غير مدعوم في المنفذ');
  let S=await loadState();
  if(!String(S.acc.account_number||'').startsWith('PA'))throw new Error('الحساب ليس ورقيًا (PA) — رفض');
  if(S.acc.status!=='ACTIVE'||S.acc.trading_blocked)throw new Error('الحساب غير نشط');
  const n=nyParts(now());
  if(S.clock.is_open)throw new Error('السوق مفتوح — premarket يعمل قبل الافتتاح فقط');
  const nextOpen=nyParts(Date.parse(S.clock.next_open));
  if(nextOpen.date!==n.date){log('no_session_today',{today:n.date,nextOpen:nextOpen.date});report.steps.push('لا جلسة اليوم');return finish(S);}
  if(HALT){report.steps.push('HALT: لا خروج استراتيجي ولا دخول — الحماية والمطابقة مستمرتان');return finish(S);}
  if(n.hm>9*60+25)throw new Error('بعد 09:25 ET — فات وقت إرسال أوامر الافتتاح بأمان');
  const si=await sessionInfo();const prev=si.prev;
  const todayCids=new Set(S.mine.filter(o=>nyParts(Date.parse(o.submitted_at||o.created_at||0)).date===n.date).map(o=>(o.client_order_id||'').replace(/-r\d+$/,'')));
  const start=new Date(now()-430*864e5).toISOString().slice(0,10);
  /* الخروج */
  let exitsPosted=0;const ownedSyms=Object.keys(S.owned);
  const obars=ownedSyms.length?await getBars(ownedSyms,start):{};
  for(const sym of ownedSyms){const b=(obars[sym]||[]).filter(x=>x.t<=prev);const o=S.owned[sym];
   if(S.mismatch[sym]){report.errors.push(sym+': كمية الوسيط ≠ دفتر المنفّذ — لا أي أمر على الرمز حتى المطابقة');continue;}
   if(!b.length||b[b.length-1].t!==prev){report.warnings.push(sym+': شموع غير مكتملة حتى '+prev+' — لا قرار خروج');continue;}
   const I=DS.ind(b);const entryDay=nyParts(Date.parse(o.lastBuyTs)).date;
   const ei=b.findIndex(x=>x.t===entryDay);if(ei<1){report.warnings.push(sym+': يوم الدخول غير موجود في الشموع');continue;}
   const pos={entry:o.avg,stop:stopFor(o.avg,I.atr14[ei-1]),target:null,maxDays:strat.H||2,entryIdx:ei,peak:o.avg};
   let dec=null;for(let k=ei;k<b.length;k++){const r=DS.manage(strat,pos,b,I,k);if(r){dec=r;break;}}
   if(!dec)continue;
   const cid=CID+'S-'+sym+'-'+n.date.replace(/-/g,'');
   if(todayCids.has(cid)){log('exit_already_sent',{sym});continue;}
   if(S.openSells.some(x=>x.symbol===sym)){report.warnings.push(sym+': أمر بيع قائم ('+S.openSells.filter(x=>x.symbol===sym).map(x=>x.status).join('/')+') — لا بيع ثانٍ حتى يُحسم');continue;}
   if(S.pendingBuys.some(x=>x.symbol===sym)){report.errors.push(sym+': أمر شراء معلق على الرمز — لا بيع قبل حسمه');continue;}
   if(dec.exit&&!dec.exitNextOpen)report.warnings.push(sym+': الإدارة تشير إلى خروج داخل يوم سابق ('+dec.exit+') والمركز ما زال مملوكًا — بيع عند الافتتاح وتحقيق في الوقف');
   const stops=S.openMine.filter(x=>x.symbol===sym&&isStop(x));
   if(!TRADING){for(const st of stops)await req('DELETE','/v2/orders/'+st.id);await req('POST','/v2/orders',{symbol:sym,qty:String(o.qty),side:'sell',type:'market',time_in_force:'day',client_order_id:cid});continue;}
   let ok=true;for(const st of stops){const c=await cancelChain(st.id);if(!c.resolved){ok=false;report.errors.push(sym+': إلغاء الوقف لم يُحسم ('+c.status+') — لا بيع منعًا للبيع المزدوج');}}
   if(!ok)continue;
   S=await loadState();
   const left=S.openMine.filter(x=>x.symbol===sym&&isStop(x));
   if(left.length){report.errors.push(sym+': بقي أمر وقف غير منتهٍ بعد الإلغاء — لا بيع');continue;}
   if(S.mismatch[sym]){report.errors.push(sym+': بعد الإلغاء صارت كمية الوسيط ≠ الدفتر — لا بيع');continue;}
   const q=S.owned[sym]?S.owned[sym].qty:0;if(!(q>0)){log('exit_skip_closed_by_stop',{sym});continue;}
   await req('POST','/v2/orders',{symbol:sym,qty:String(q),side:'sell',type:'market',time_in_force:'day',client_order_id:cid});
   log('exit_submitted',{sym,qty:q,why:dec.exitNextOpen||dec.exit});exitsPosted++;
  }
  if(exitsPosted&&TRADING)S=await loadState(); /* 7.2.3: الحالة بعد إرسال الخروج (الخروج المعلق لا يمنع الدخول) */
  /* الدخول */
  if(!ENTRIES){report.steps.push('الدخول الجديد موقوف (ENTRIES_ENABLED=false)');return finish(S);}
  if(ENTRY_LOCK){entryPolicy(S);report.entryLock={locked:true,why:ENTRY_LOCK_WHY,triggerSource:TRIG_SOURCE||null,triggerEntryLock:TRIG_LOCK_RAW||null};report.steps.push(ENTRY_LOCK_WHY+' — صفر دخول جديد؛ الخروج والحماية والمطابقة مستمرة');return finish(S);}
  {const ep=entryPolicy(S);if(!ep.ok){report.errors.push('الدخول مرفوض بالسياسة (الخروج والحماية مستمران): '+ep.why.join(' • '));return finish(S);}}
  /* 7.2.5 (Q05): كل أسباب التوقف تُفحص قبل أي أمر شراء في التشغيل نفسه: المطابقة (كمية ونقد)، وتأخر الجلسات، وأيام بلا حراسة، والأعلام القائمة.
     تعذر تحقق مطلوب (لا خط أساس مع وجود تعبئات، نشاطات ناقصة، تقويم غير متاح) ⇒ لا دخول — لا يُعد «سليمًا» تلقائيًا. الخروج أُرسل قبل هذا، والحماية في postopen لا تتأثر. */
  if(TRADING){const why=[];let R=null;try{R=reconcile(S);report.recon=R;}catch(e){why.push('تعذرت المطابقة: '+e.message);}
   if(R&&!R.qtyOk)why.push('فرق كمية بين الدفتر والوسيط');
   if(R&&R.cashOk===false)why.push('فرق نقد '+R.cash.diff+'$');
   if(R&&R.cashOk===null)why.push('المطابقة النقدية غير متحققة ('+(R.cash.note||'')+')');
   let st={calendarOk:true};try{st=await evaluateFlags(S);}catch(e){st={calendarOk:false};report.warnings.push('تقييم الأعلام: '+e.message);}
   if(!st.calendarOk)why.push('تعذر التحقق من سجل الجلسات (التقويم)');
   why.push(...riskPreconditions());
   if((report.entryPolicy&&report.entryPolicy.mode)!=='research-replay'){let P=null;try{P=await settlementProof(S);}catch(e){P={proven:false,reasons:[e.message]};}if(!P.proven)why.push('النقد المسوّى غير مثبت ('+P.reasons.join('، ')+')');} /* 7.2.14-dev (DEV-CASH-02) */
   const F=activeFlags();if(F.length)why.push('أعلام توقف نشطة: '+F.map(f=>f.kind+' '+f.id).join('، '));
   report.preEntryChecks={ok:!why.length,why};
   if(why.length){report.errors.push('الدخول موقوف قبل أي شراء (الخروج والحماية مستمران): '+why.join(' • ')+(F.length?' — يرفعه صالح بـclear-flags بعد المراجعة':''));return finish(S);}}
  const g=gate(S);if(g.length){report.errors.push('الدخول ممنوع حتى الحسم: '+g.join(' • '));return finish(S);}
  const cap=capacity(S);report.capacity=cap;
  if(cap.unknownPending.length){report.errors.push('أمر شراء معلق بسعر مرجعي غير معروف ('+cap.unknownPending.map(x=>x.symbol+'/'+(x.cid||x.id)).join('، ')+') — لا دخول جديد؛ الحماية والخروج والمطابقة مستمرة');return finish(S);}
  if(cap.slots<=0){report.steps.push('السعة ممتلئة ('+cap.used+'/'+cfg.maxPositions+' بين مراكز وأوامر شراء معلقة)');return finish(S);}
  const excl=new Set([...Object.keys(S.owned),...S.foreign,...cap.pendingSymbols,...Object.keys(S.mismatch),...S.openMine.map(o=>o.symbol),...Object.keys(S.ixOwned||{})]);
  const r=await scanSignals(S,strat,prev,excl);report.scan=r.stats;
  if(!r.ok){report.errors.push('بيانات غير مكتملة ('+r.stats.staleLastBar+'/'+r.stats.withBars+' بلا شمعة '+prev+') — لا دخول');return finish(S);}
  if((report.entryPolicy&&report.entryPolicy.mode)!=='research-replay')await settlementProof(S); /* 7.2.14-dev: إثبات النقد المسوّى قبل البوابة (مخزّن على S) */
  const P=capsGate(S,plan(S,r.cands,cap),report.entryPolicy&&report.entryPolicy.mode,strat.id);let placed=0;
  for(const p of P){const base=CID+'B-'+p.sym+'-'+n.date.replace(/-/g,'');if(todayCids.has(base))continue;
   await req('POST','/v2/orders',{symbol:p.sym,qty:String(p.qty),side:'buy',type:'market',time_in_force:'day',order_class:'oto',stop_loss:{stop_price:String(p.provisionalStop)},client_order_id:base+'-r'+Math.round(p.refClose*100)});
   log('entry_submitted',p);placed++;}
  report.entriesPlaced=placed;report.steps.push('إشارات '+r.cands.length+' • أوامر دخول '+placed+' • سعة متاحة قبلها '+cap.slots);
  return finish(S);
 }

 /* ---------- 7.2.5 (S11): M1 — زخم شهري. T = أول يوم تداول في الشهر (بيع)، T+1 = ثانيه (شراء)، M = آخر يوم تداول قبل T (قرار الترتيب).
    البيع: مملوك اشتُري قبل T، له شمعة يوم M، وغير مؤهل أو ترتيبه > 8 ⇒ بيع سوق بالافتتاح؛ يُعاد في الأيام التالية من الشهر إن بقي مملوكًا.
    الشراء: يوم T+1 فقط، بالترتيب عند M، مع تخطي ما فقد شرطًا عند إغلاق T؛ 24% من eq لكل مركز حتى 4؛ وقف = −3×ATR؛ لا دخول بلا حماية.
    لا دخول داخل الشهر بعد وقف. نفس فحوص ما قبل الشراء (Q05) ونفس الحماية بعد الافتتاح. */
 async function scanM1(dayList,excl){
  const start=new Date(now()-430*864e5).toISOString().slice(0,10);const uni=universe().filter(s=>!excl.has(s));const bars=await getBars(uni,start);
  const out={};for(const d of dayList)out[d]={};let withBars=0,stale=0;
  for(const sym of uni){const b=bars[sym];if(!b)continue;withBars++;
   for(const d of dayList){const w=b.filter(x=>x.t<=d);if(!w.length||w[w.length-1].t!==d)continue;out[d][sym]=M1.evaluate(w);}}
  return{byDay:out,stats:{universe:uni.length,withBars}};}
 async function premarketM1(){
  if(!M1)throw new Error('m1_strat.js غير موجود');
  let S=await loadState();
  if(!String(S.acc.account_number||'').startsWith('PA'))throw new Error('الحساب ليس ورقيًا (PA) — رفض');
  if(S.acc.status!=='ACTIVE'||S.acc.trading_blocked)throw new Error('الحساب غير نشط');
  const n=nyParts(now());if(S.clock.is_open)throw new Error('السوق مفتوح — premarket يعمل قبل الافتتاح فقط');
  const nextOpen=nyParts(Date.parse(S.clock.next_open));
  if(nextOpen.date!==n.date){report.steps.push('لا جلسة اليوم');return finish(S);}
  if(HALT){report.steps.push('HALT: لا خروج استراتيجي ولا دخول — الحماية والمطابقة مستمرتان');return finish(S);}
  if(n.hm>9*60+25)throw new Error('بعد 09:25 ET — فات وقت إرسال أوامر الافتتاح بأمان');
  const ym=n.date.slice(0,7);const prevMonth=new Date(Date.parse(ym+'-01T12:00:00Z')-20*864e5).toISOString().slice(0,7)+'-01';
  const cal=((await req('GET','/v2/calendar?start='+prevMonth+'&end='+n.date))||[]).map(c=>c.date).filter(d=>d<=n.date);
  const inMonth=cal.filter(d=>d.slice(0,7)===ym);const T=inMonth[0],T1=inMonth[1];const M=cal.filter(d=>d<T).pop();
  report.m1={today:n.date,M,T,T1,role:n.date===T?'بيع':n.date===T1?'شراء':'داخل الشهر'};
  if(!T||!M){report.errors.push('M1: تعذر تحديد أيام التوازن من التقويم');return finish(S);}
  const todayCids=new Set(S.mine.filter(o=>nyParts(Date.parse(o.submitted_at||o.created_at||0)).date===n.date).map(o=>(o.client_order_id||'').replace(/-r\d+$/,'')));
  const prev=cal.filter(d=>d<n.date).pop();
  /* البيع */
  const ownedSyms=Object.keys(S.owned);
  const old=ownedSyms.filter(sym=>nyParts(Date.parse(S.owned[sym].lastBuyTs)).date<T);
  if(old.length&&n.date>=T){
   /* قرار الإبقاء يُحسب مرة على بيانات M ويُحفظ؛ في أيام الشهر التالية يُعاد البيع لما بقي مملوكًا من قرارات «بيع» فقط */
   let D=readState('m1-decisions.json',null);
   if(!D||D.M!==M){const R=await scanM1([M],new Set());const ev=R.byDay[M];
    const ranked=M1.rank(Object.entries(ev).filter(([,e])=>e.eligible).map(([sym,e])=>Object.assign({sym},e)));const rk={};ranked.forEach(x=>rk[x.sym]=x.rank);
    D={M,at:n.date,rankedAtM:ranked.length,decisions:{}};
    for(const sym of old){if(!ev[sym]){D.decisions[sym]={keep:true,noBarAtM:true};continue;}D.decisions[sym]={eligible:ev[sym].eligible,why:ev[sym].why||null,rank:rk[sym]||null,keep:ev[sym].eligible&&rk[sym]<=M1.P.keepRank};}
    writeState('m1-decisions.json',D);}
   report.m1.rankedAtM=D.rankedAtM;report.m1.decisions=D.decisions;
   for(const sym of old){
    if(S.mismatch[sym]){report.errors.push(sym+': كمية الوسيط ≠ الدفتر — لا أمر');continue;}
    const d=D.decisions[sym];if(!d){report.warnings.push(sym+': لا قرار مسجل لهذا المركز عند M');continue;}
    if(d.noBarAtM){report.warnings.push(sym+': لا شمعة يوم M — لا قرار ترتيب (قاعدة التوقف/الشطب)');continue;}
    if(d.keep)continue;
    const cid=CID+'S-'+sym+'-'+n.date.replace(/-/g,'');if(todayCids.has(cid))continue;
    if(S.openSells.some(x=>x.symbol===sym)){report.warnings.push(sym+': أمر بيع قائم — لا بيع ثانٍ');continue;}
    if(S.pendingBuys.some(x=>x.symbol===sym)){report.errors.push(sym+': شراء معلق — لا بيع');continue;}
    const stops=S.openMine.filter(x=>x.symbol===sym&&isStop(x));
    if(!TRADING){for(const st of stops)await req('DELETE','/v2/orders/'+st.id);await req('POST','/v2/orders',{symbol:sym,qty:String(S.owned[sym].qty),side:'sell',type:'market',time_in_force:'day',client_order_id:cid});continue;}
    let ok=true;for(const st of stops){const c=await cancelChain(st.id);if(!c.resolved){ok=false;report.errors.push(sym+': إلغاء الوقف لم يُحسم — لا بيع');}}
    if(!ok)continue;S=await loadState();
    if(S.openMine.some(x=>x.symbol===sym&&isStop(x))||S.mismatch[sym])continue;
    const q=S.owned[sym]?S.owned[sym].qty:0;if(!(q>0))continue;
    await req('POST','/v2/orders',{symbol:sym,qty:String(q),side:'sell',type:'market',time_in_force:'day',client_order_id:cid});log('m1_exit',{sym,qty:q,rank:(D.decisions[sym]||{}).rank||null});}
   if(TRADING)S=await loadState();}
  /* الشراء: يوم T+1 فقط */
  if(n.date!==T1){report.steps.push('M1: لا شراء اليوم ('+report.m1.role+')');return finish(S);}
  if(!ENTRIES){report.steps.push('الدخول الجديد موقوف (ENTRIES_ENABLED=false)');return finish(S);}
  if(ENTRY_LOCK){entryPolicy(S);report.entryLock={locked:true,why:ENTRY_LOCK_WHY,triggerSource:TRIG_SOURCE||null,triggerEntryLock:TRIG_LOCK_RAW||null};report.steps.push(ENTRY_LOCK_WHY+' — صفر دخول جديد؛ الخروج والحماية والمطابقة مستمرة');return finish(S);}
  {const ep=entryPolicy(S);if(!ep.ok){report.errors.push('الدخول مرفوض بالسياسة (الخروج والحماية مستمران): '+ep.why.join(' • '));return finish(S);}}
  if(TRADING){const why=[];let R=null;try{R=reconcile(S);report.recon=R;}catch(e){why.push('تعذرت المطابقة: '+e.message);}
   if(R&&!R.qtyOk)why.push('فرق كمية');if(R&&R.cashOk===false)why.push('فرق نقد '+R.cash.diff+'$');if(R&&R.cashOk===null)why.push('المطابقة النقدية غير متحققة');
   let st={calendarOk:true};try{st=await evaluateFlags(S);}catch(e){st={calendarOk:false};}if(!st.calendarOk)why.push('تعذر التحقق من سجل الجلسات');
   why.push(...riskPreconditions());
   if((report.entryPolicy&&report.entryPolicy.mode)!=='research-replay'){let P=null;try{P=await settlementProof(S);}catch(e){P={proven:false,reasons:[e.message]};}if(!P.proven)why.push('النقد المسوّى غير مثبت ('+P.reasons.join('، ')+')');} /* 7.2.14-dev (DEV-CASH-02) */
   const F=activeFlags();if(F.length)why.push('أعلام توقف نشطة: '+F.map(f=>f.kind).join('، '));report.preEntryChecks={ok:!why.length,why};
   if(why.length){report.errors.push('الدخول موقوف قبل أي شراء: '+why.join(' • '));return finish(S);}}
  const g=gate(S);if(g.length){report.errors.push('الدخول ممنوع حتى الحسم: '+g.join(' • '));return finish(S);}
  const cap=capacity(S);report.capacity=cap;
  if(cap.unknownPending.length){report.errors.push('أمر شراء معلق بسعر مرجعي غير معروف ('+cap.unknownPending.map(x=>x.symbol+'/'+(x.cid||x.id)).join('، ')+') — لا دخول جديد؛ الحماية والخروج والمطابقة مستمرة');return finish(S);}
  if(cap.slots<=0){report.steps.push('M1: السعة ممتلئة');return finish(S);}
  const excl=new Set([...Object.keys(S.owned),...S.foreign,...cap.pendingSymbols,...Object.keys(S.mismatch),...S.openMine.map(o=>o.symbol),...Object.keys(S.ixOwned||{})]);
  const R=await scanM1([M,T],excl);report.scan=R.stats;
  const ranked=M1.rank(Object.entries(R.byDay[M]).filter(([,e])=>e.eligible).map(([sym,e])=>Object.assign({sym},e)));
  let cash=cap.cashAvail;const plan=[];const skipped=[];
  for(const c of ranked){if(plan.length>=cap.slots)break;const atT=R.byDay[T][c.sym];
   if(!atT||!atT.eligible){skipped.push({sym:c.sym,rank:c.rank,why:atT?atT.why:'لا شمعة يوم T'});continue;}
   const ps=M1.stopFor(atT.close,atT.atr);if(!(ps>0)){skipped.push({sym:c.sym,rank:c.rank,why:'وقف ≤ 0'});continue;}
   const qty=Math.floor(Math.min(cap.eq*M1.P.posPct/100,cash)/atT.close);if(qty<1){skipped.push({sym:c.sym,rank:c.rank,why:'نقد غير كافٍ'});continue;}
   plan.push({sym:c.sym,rank:c.rank,score:c.score,qty,refClose:atT.close,provisionalStop:ps});cash-=qty*atT.close;}
  report.m1.plan=plan;report.m1.skipped=skipped.slice(0,20);let placed=0;
  if((report.entryPolicy&&report.entryPolicy.mode)!=='research-replay')await settlementProof(S); /* 7.2.14-dev */
  const planC=capsGate(S,plan,report.entryPolicy&&report.entryPolicy.mode,'M1');report.m1.planAfterCaps=planC;
  for(const p of planC){const base=CID+'B-'+p.sym+'-'+n.date.replace(/-/g,'');if(todayCids.has(base))continue;
   await req('POST','/v2/orders',{symbol:p.sym,qty:String(p.qty),side:'buy',type:'market',time_in_force:'day',order_class:'oto',stop_loss:{stop_price:String(p.provisionalStop)},client_order_id:base+'-r'+Math.round(p.refClose*100)});
   log('m1_entry',p);placed++;}
  report.entriesPlaced=placed;report.steps.push('M1: مرتبون عند M '+ranked.length+' • أوامر شراء '+placed+' • سعة '+cap.slots);
  return finish(S);
 }
 /* ---------- بعد الافتتاح: حسم الشراء المعلق ثم حماية مؤكدة GTC لكل مركز ---------- */
 async function postopen(){
  let S=await loadState();
  if(!String(S.acc.account_number||'').startsWith('PA'))throw new Error('الحساب ليس ورقيًا (PA) — رفض');
  const n=nyParts(now());const start=new Date(now()-430*864e5).toISOString().slice(0,10);
  /* 7.2.13-dev: فحص ما بعد التعبئة على الحالة كما هي قبل أي إلغاء (تعبئة جزئية + الباقي المعلق). لا يغيّر شيئًا في الحماية التالية. */
  if(TRADING&&!READONLY&&!RESEARCH_REPLAY&&(Object.keys(S.owned).length||S.pendingBuys.length)){try{await settlementProof(S);}catch(e){report.warnings.push('إثبات التسوية: '+e.message);}}
  try{capsPostFill(S,'postopen-start');}catch(e){report.warnings.push('فحص السقوف بعد التعبئة: '+e.message);}
  /* 7.2.2: حسم الشراء المعلق في أول تشغيل بعد الافتتاح (كان مشروطًا بـ09:45):
     جزئي ⇒ إلغاء الباقي فورًا ثم حماية الكمية المنفذة في نفس التشغيل • غير معبأ بعد 09:35 ⇒ إلغاء (أمر سوق لم يُنفذ = حالة غير طبيعية) */
  if(S.clock.is_open){let any=false;
   for(const o of S.pendingBuys){const part=(+o.filled_qty||0)>0;
    if(!part&&n.hm<9*60+35){report.warnings.push(o.symbol+': أمر الشراء لم يُعبأ بعد (قبل 09:35) — يُترك');continue;}
    any=true;const c=await cancelChain(o.id);log('entry_rest_cancel',{sym:o.symbol,order_id:o.id,partial:part,res:c});
    if(!c.resolved&&!c.dry)report.errors.push(o.symbol+': تعذر حسم باقي أمر الشراء ('+c.status+') — الحماية غير مؤكدة؛ يُعاد في التشغيل التالي والدخول ممنوع');}
   if(any&&TRADING)S=await loadState();}
  const syms=Object.keys(S.owned);const bars=syms.length?await getBars(syms,start):{};
  for(const sym of syms){
   if(S.mismatch[sym]){report.errors.push(sym+': كمية الوسيط ≠ دفتر المنفّذ — لا تعديل للحماية حتى المطابقة');continue;}
   if(S.pendingBuys.some(x=>x.symbol===sym)){report.warnings.push(sym+': أمر شراء ما زال معلقًا — الحماية تُحسم بعد حسمه');continue;}
   /* 7.2.4 (Q01): متابعة الخروج بعد الافتتاح. بيع سوق حي قبل 09:35 ⇒ يُنتظر (ليس حماية).
      غير حي (pending_cancel/مرفوض…) أو ما زال قائمًا من 09:35 ⇒ إلغاء مؤكد، ثم إعادة المطابقة، ثم وقف GTC للكمية الباقية.
      لا بيع مكرر (الخروج يُعاد في premarket التالي) ولا وقف قبل حسم البيع (منعًا للتداخل). */
   {const sells=S.openSells.filter(x=>x.symbol===sym);
    if(sells.length&&S.clock.is_open){
     const waiting=sells.every(x=>EXIT_LIVE.has(x.status))&&n.hm<9*60+35;
     if(waiting){report.warnings.push(sym+': خروج جارٍ ('+sells.map(x=>x.status).join('/')+') — يُتابع حتى 09:35');continue;}
     if(!TRADING){for(const x of sells)await req('DELETE','/v2/orders/'+x.id);continue;}
     let ok=true;for(const x of sells){const c=await cancelChain(x.id);log('exit_unresolved_cancel',{sym,id:x.id,res:c});if(!c.resolved){ok=false;report.errors.push(sym+': أمر البيع '+x.id+' لم يُحسم ('+c.status+') — لا وقف حتى يُحسم منعًا للتداخل');}}
     if(!ok)continue;
     S=await loadState();if(!S.owned[sym]){report.steps.push(sym+': نُفذ البيع أثناء الإلغاء — المركز مغلق');continue;}
     {const m=sym+': الخروج لم يكتمل حتى 09:35 ('+sells.map(x=>x.status).join('/')+') — أُلغي الباقي ويوضع وقف GTC للكمية '+S.owned[sym].qty+'؛ يُعاد الخروج في premarket التالي';(report.exitIssues=report.exitIssues||[]).push(m);report.errors.push(m);}}
    else if(sells.length){report.warnings.push(sym+': أمر بيع قائم والسوق مغلق — يُتابع بعد الافتتاح');continue;}}
   const o=S.owned[sym];const b=bars[sym]||[];const entryDay=nyParts(Date.parse(o.lastBuyTs)).date;
   const ei=b.findIndex(x=>x.t===entryDay);const sigIdx=ei>0?ei-1:(b.length&&b[b.length-1].t<entryDay?b.length-1:-1);
   if(sigIdx<0){report.errors.push(sym+': لا شموع ليوم الإشارة — لا يُحسب الوقف');continue;}
   const I=DS.ind(b);const want=stopFor(o.avg,I.atr14[sigIdx]);
   if(ei>=0&&entryDay===n.date){report.slippage=report.slippage||[];report.slippage.push({sym,fillAvg:+o.avg.toFixed(4),officialOpen:b[ei].o,slipPct:+((o.avg/b[ei].o-1)*100).toFixed(3)});}
   const p=protectionOf(S,sym,want);if(p.confirmed)continue;
   const stops=S.openMine.filter(x=>x.symbol===sym&&isStop(x));
   /* مسار 1: وقف واحد نشط ⇒ استبدال (سعر/صلاحية GTC/كمية) ثم تأكيد */
   if(stops.length===1&&ACTIVE_STOP.has(stops[0].status)){
    try{const r=await req('PATCH','/v2/orders/'+stops[0].id,{qty:String(o.qty),stop_price:String(want),time_in_force:'gtc',client_order_id:CID+'R-'+sym+'-'+Date.now().toString(36)});
     log('stop_replace_sent',{sym,to:want,newId:r&&r.id});
     if(!TRADING)continue;
     S=await loadState();if(protectionOf(S,sym,want).confirmed){log('stop_replaced_confirmed',{sym});continue;}}
    catch(e){log('stop_replace_failed',{sym,err:e.message});}
   }
   if(!TRADING){for(const st of stops)await req('DELETE','/v2/orders/'+st.id);await req('POST','/v2/orders',{symbol:sym,qty:String(o.qty),side:'sell',type:'stop',stop_price:String(want),time_in_force:'gtc',client_order_id:CID+'P-'+sym});continue;}
   /* مسار 2: إلغاء مؤكد لكل أوامر الوقف (بما فيها held) ثم إعادة المطابقة ثم وقف واحد بالكمية الفعلية */
   S=await loadState();let ok=true;
   for(const st of S.openMine.filter(x=>x.symbol===sym&&isStop(x))){const c=await cancelChain(st.id);if(!c.resolved){ok=false;report.errors.push(sym+': إلغاء الوقف '+st.id+' لم يُحسم ('+c.status+') — لا وقف جديد منعًا للتداخل');}}
   if(!ok)continue;
   S=await loadState();
   if(S.mismatch[sym]){report.errors.push(sym+': بعد الإلغاء كمية الوسيط ≠ الدفتر — لا وقف جديد حتى المطابقة');continue;}
   const q=S.owned[sym]?S.owned[sym].qty:0;
   if(!(q>0)){log('position_closed_during_cancel',{sym});report.steps.push(sym+': نُفذ الوقف أثناء الإلغاء — المركز مغلق، لا وقف جديد');continue;}
   if(S.openMine.some(x=>x.symbol===sym&&isStop(x))){report.errors.push(sym+': ما زال أمر وقف قائمًا — لا وقف جديد');continue;}
   const nw=await req('POST','/v2/orders',{symbol:sym,qty:String(q),side:'sell',type:'stop',stop_price:String(want),time_in_force:'gtc',client_order_id:CID+'P-'+sym+'-'+Date.now().toString(36)});
   log('stop_posted',{sym,qty:q,stop:want,id:nw&&nw.id});
   S=await loadState();if(!protectionOf(S,sym,want).confirmed)report.errors.push(sym+': الوقف الجديد لم يتأكد نشطًا بعد');
  }
  return finish(S);
 }
 /* ---------- 7.2.19-dev: overnight — I1-index-hold: أمر شراء واحد للمؤشر عند افتتاح يوم التداول التالي ----------
    النافذة: 16:15 نيويورك (آخر يوم تداول) حتى 09:15 (يوم التداول المستهدف = next_open من ساعة الوسيط، والتقويم من الوسيط).
    خارج النافذة أو السوق مفتوح ⇒ لا شراء: postopen إن كان السوق مفتوحًا (حماية ds1 إن وُجدت)، وإلا مطابقة وأعلام فقط.
    تكرار التشغيل لليوم نفسه ⇒ «verified» (الأمر موجود لدى الوسيط) بلا أمر ثانٍ. معرّف الأمر: ix1-<YYYYMMDD المستهدف>-r<سنتات السعر المرجعي>.
    قبل الإرسال: نية مكتوبة في state/ix-intents.json بالمعرّف نفسه؛ إعادة المحاولة بعد خطأ غامض تعيد المعرّف نفسه (الوسيط يرفض المكرر).
    أقفال الدخول كلها قبل أي أمر: HALT، ENTRIES_ENABLED، قفل البوابة، سياسة الدخول (تجربة ورقية فقط)، المطابقة، الأعلام، الاستمرارية،
    حوادث الحفظ، النقد المسوّى المثبت، فرق كمية المؤشر، أمر مؤشر معلق، مراكز ds1 (I1 يحتاج حسابًا بلا مراكز ds1)، السقوف (caps.checkEntry). */
 async function overnight(){
  report.mode=undefined;
  if(!IS_I1)throw new Error('overnight لاستراتيجية I1-index-hold فقط (الإعداد: '+(cfg.strategy||'null')+') — لا أوامر');
  let S=await loadState();
  if(!String(S.acc.account_number||'').startsWith('PA'))throw new Error('الحساب ليس ورقيًا (PA) — رفض');
  if(S.acc.status!=='ACTIVE'||S.acc.trading_blocked)throw new Error('الحساب غير نشط');
  const I=I1SET;const ix=report.ix={strategy:cfg.strategy,symbol:I.symbol,policy:I1_POLICY,targetDate:null,window:null,status:null,why:[],order:null,existing:[]};
  const block=(st,w)=>{ix.status=st;ix.why.push(w);report.steps.push('overnight: لا شراء — '+w);return finish(S);};
  if(S.clock.is_open){ix.window={inWindow:false,why:'السوق مفتوح'};ix.status='outside-window';report.steps.push('overnight: السوق مفتوح — لا شراء؛ حماية ومطابقة فقط (postopen)');return postopen();}
  const n=nyParts(now());let cal=null;
  try{cal=await req('GET','/v2/calendar?start='+new Date(now()-12*864e5).toISOString().slice(0,10)+'&end='+new Date(now()+12*864e5).toISOString().slice(0,10));saveCalendar(cal);}catch(e){return block('blocked','تعذر جلب تقويم الوسيط: '+e.message);}
  const W=overnightWindow(now(),(cal||[]).map(c=>c&&c.date),S.clock.next_open);ix.window=W;ix.targetDate=W.target;
  if(!W.inWindow){ix.status=W.late?'late':'outside-window';ix.why.push(W.why);report.steps.push('overnight: خارج النافذة ('+W.why+') — لا شراء؛ مطابقة فقط');return finish(S);}
  /* منع التكرار: أي أمر ix1- لليوم المستهدف لدى الوسيط ⇒ تحقق فقط */
  const ymd=W.target.replace(/-/g,'');const pre=IX_CID+ymd;const mineDay=S.ixOrders.filter(o=>{const c=String(o.client_order_id||'');return c===pre||c.startsWith(pre+'-');});
  ix.existing=mineDay.map(o=>({id:o.id,cid:o.client_order_id,qty:+o.qty,status:o.status,tif:o.time_in_force||null}));
  if(mineDay.length===1){ix.status='verified';report.steps.push('overnight: أمر اليوم '+W.target+' موجود لدى الوسيط ('+mineDay[0].client_order_id+'، '+mineDay[0].status+') — لا أمر ثانٍ');return finish(S);}
  if(mineDay.length>1){ix.status='duplicate-detected';report.errors.push('I1: أكثر من أمر ix1- ليوم '+W.target+' ('+mineDay.length+') — يحتاج مراجعة صالح');return finish(S);}
  if(HALT)return block('blocked','HALT مفعّل');
  if(!ENTRIES)return block('blocked','الدخول الجديد موقوف (ENTRIES_ENABLED=false)');
  if(ENTRY_LOCK){entryPolicy(S);report.entryLock={locked:true,why:ENTRY_LOCK_WHY,triggerSource:TRIG_SOURCE||null,triggerEntryLock:TRIG_LOCK_RAW||null};return block('blocked',ENTRY_LOCK_WHY);}
  {const ep=entryPolicy(S);if(!ep.ok){report.errors.push('الدخول مرفوض بالسياسة: '+ep.why.join(' • '));return block('blocked','سياسة الدخول: '+ep.why.join(' • '));}}
  if(!I.ok)return block('blocked','إعداد I1 غير صالح: '+I.why.join('، '));
  if(TRADING){const why=[];let R=null;try{R=reconcile(S);report.recon=R;}catch(e){why.push('تعذرت المطابقة: '+e.message);}
   if(R&&!R.qtyOk)why.push('فرق كمية بين الدفتر والوسيط');if(R&&R.cashOk===false)why.push('فرق نقد '+R.cash.diff+'$');if(R&&R.cashOk===null)why.push('المطابقة النقدية غير متحققة ('+(R.cash.note||'')+')');
   let st={calendarOk:true};try{st=await evaluateFlags(S);}catch(e){st={calendarOk:false};report.warnings.push('تقييم الأعلام: '+e.message);}
   if(!st.calendarOk)why.push('تعذر التحقق من سجل الجلسات (التقويم)');
   why.push(...riskPreconditions());
   let P=null;try{P=await settlementProof(S);}catch(e){P={proven:false,reasons:[e.message]};}if(!P.proven)why.push('النقد المسوّى غير مثبت ('+P.reasons.join('، ')+')');
   const F=activeFlags();if(F.length)why.push('أعلام توقف نشطة: '+F.map(f=>f.kind+' '+f.id).join('، '));
   report.preEntryChecks={ok:!why.length,why};
   if(why.length){report.errors.push('الدخول موقوف قبل أي شراء: '+why.join(' • '));return block('blocked',why.join(' • '));}}
  {const g=gate(S);if(g.length)return block('blocked','حماية ds1 غير مؤكدة: '+g.join(' • '));}
  if(Object.keys(S.owned).length||S.pendingBuys.length)return block('blocked','مراكز أو أوامر ds1 قائمة — تجربة I1 تحتاج حسابًا بلا مراكز ds1');
  if(Object.keys(S.ixMismatch).length)return block('blocked','كمية المؤشر لدى الوسيط ≠ دفتر ix1-: '+JSON.stringify(S.ixMismatch));
  if(S.ixPending.length)return block('blocked','أمر مؤشر معلق ('+S.ixPending.map(o=>o.client_order_id+'/'+o.status).join('، ')+')');
  /* السعر المرجعي: إغلاق آخر يوم تداول (W.prev) */
  let ref=null;{let b=null;try{b=(await getBars([I.symbol],new Date(now()-40*864e5).toISOString().slice(0,10)))[I.symbol]||[];}catch(e){return block('blocked','تعذر جلب شموع '+I.symbol+': '+e.message);}
   const last=b.filter(x=>x.t<=W.prev).pop();if(!last||last.t!==W.prev||!(last.c>0))return block('blocked','لا شمعة '+I.symbol+' ليوم '+W.prev+' — لا سعر مرجعي');ref=+last.c;}
  const T=i1Target(I,cfg.trialStart,W.target);const held=Object.values(S.ixOwned).reduce((a,o)=>a+o.cost,0);const need=+(T.target-held).toFixed(2);
  const unit=ref*(1+I1_FILL_BUFFER_PCT/100);const want=Math.max(0,Math.floor((need+1e-9)/unit));
  ix.sizing={ref,targetAmount:T.target,monthsSinceStart:T.months,heldCost:+held.toFixed(2),need,unitWithGapBuffer:+unit.toFixed(4),wantQty:want,gapBufferPct:I1_FILL_BUFFER_PCT,measure:'بالتكلفة المدفوعة لا بالقيمة السوقية'};
  if(want<1){ix.status='target-reached';report.steps.push('overnight: المبلغ المستهدف '+T.target+'$ مكتمل (المدفوع '+held.toFixed(2)+'$) — لا أمر');return finish(S);}
  /* السقوف: تجربة ورقية ⇒ سقف I1 (المبلغ كاملًا لمركز واحد). وضع الاستراتيجية ⇒ LIVE_CAPS (null ⇒ رفض). غير ذلك ⇒ رفض */
  const mode=report.entryPolicy&&report.entryPolicy.mode;const caps=mode==='execution-trial'?{allocation:I.cap,maxPositions:1,maxPosPct:100,riskPct:100,fillBufferPct:I1_FILL_BUFFER_PCT}:capsForMode(mode==='strategy'?'strategy':null);
  const G=report.capsEntry={mode,book:'ix1',caps,cashField:'settled-cash',checks:[]};
  if(!CAPS)return block('blocked','وحدة السقوف caps.cjs غير موجودة');
  if(TRADING&&!(S._settle&&S._settle.proven))return block('blocked','النقد المسوّى غير مثبت');
  const px={};(S.positions||[]).forEach(p=>px[p.symbol]=strictNum(p.current_price));
  const positions=Object.entries(S.ixOwned).map(([sym,o])=>({symbol:sym,qty:o.qty,marketValue:Math.max(o.cost,o.qty*(sym in px?px[sym]:NaN))}));
  const cash=TRADING?S._settle.settledCash:strictNum(S.acc&&S.acc.cash);
  const c=CAPS.checkEntry({caps,cfg:{allocation:T.target,maxPositions:1,maxPosPct:100,riskPct:100},strategyId:cfg.strategy,order:{symbol:I.symbol,side:'buy',qty:want,refPrice:ref},positions,pendingOrders:[],cash,activeFlags:activeFlags().map(f=>f.kind)});
  let qty=Math.max(0,Math.min(want,c.maxQty>=1?c.maxQty:0));G.checks.push({sym:I.symbol,plannedQty:want,refPrice:ref,capsMaxQty:c.maxQty,finalQty:qty,reasons:c.reasons,cash});
  if(qty<1)return block('blocked','السقوف/النقد: '+(c.reasons.join('، ')||'الكمية 0'));
  /* نية مكتوبة قبل الإرسال؛ نية سابقة لليوم نفسه لم تصل للوسيط ⇒ المعرّف نفسه */
  const intents=readState('ix-intents.json',{});const prior=intents&&intents[W.target];let cid=pre+'-r'+Math.round(ref*100);
  if(prior&&typeof prior.cid==='string'&&prior.cid.startsWith(pre+'-')){cid=prior.cid;if(+prior.qty>=1)qty=Math.min(qty,+prior.qty);ix.reusedIntent=prior;}
  if(TRADING){try{const nx=Object.assign({},intents);nx[W.target]={cid,qty,ref,at:new Date(now()).toISOString(),runId:env.GITHUB_RUN_ID||null,runAttempt:env.GITHUB_RUN_ATTEMPT||null};
    const keep=Object.keys(nx).sort().slice(-40);const o2={};keep.forEach(k=>o2[k]=nx[k]);writeState('ix-intents.json',o2);}catch(e){return block('blocked','تعذر حفظ نية الأمر قبل الإرسال: '+e.message);}}
  const body={symbol:I.symbol,qty:String(qty),side:'buy',type:'market',time_in_force:'opg',client_order_id:cid};
  try{const r=await req('POST','/v2/orders',body);ix.order={cid,qty,ref,tif:'opg',id:r&&r.id||null,dry:!!(r&&r.__dry)};ix.status=r&&r.__dry?'dry-run':'submitted';if(!(r&&r.__dry))report.ixOrdersPlaced=1;log('ix_entry_submitted',ix.order);}
  catch(e){if(e.status===422&&/unique/i.test(e.message)){ix.status='verified';ix.why.push('الوسيط رفض معرّفًا مكررًا ('+cid+') — الأمر موجود سابقًا');}
   else{ix.status='submit-failed';report.errors.push('I1: تعذر إرسال أمر المؤشر: '+e.message);}}
  report.steps.push('overnight: '+ix.status+' — '+I.symbol+' × '+qty+' (opg) ليوم '+W.target);
  return finish(S);
 }
 async function status(){READONLY=true;const S=await loadState();return finish(S);}
 /* ---------- 7.2.7 (S10/Q09): زمن الحماية — المرصود منفصل عن المستنتج ----------
    كل قراءة ناجحة للحالة (loadState) تُسجّل رصدًا لكل مركز: مغطى (أمر وقف نشط new/accepted بكمية = المملوك، أي صلاحية) أم لا، ومحمي (مؤكد GTC) أم لا.
    الأرصاد تُحفظ في state/protection-obs.json عبر التشغيلات، فتُجمع تغيرات الحماية خلال الجلسة.
    المرصود: حدّان زمنيان من أرصادنا الفعلية: الحد الأدنى = آخر رصد «غير مغطى» بعد أول تعبئة، والحد الأعلى = أول رصد «مغطى».
    وقت الوسيط: updated_at لأمر الوقف (حقل من الوسيط؛ قد يكون آخر تحديث لا لحظة التفعيل) — يُعرض منفصلًا ويُفحص اتساقه مع الحدين.
    المستنتج (الطريقة القديمة: آخر تعبئة الدخول لرجل OTO، أو submitted_at للوقف): يُعرض للعلم فقط ولا يُستخدم دليلًا ولا في الأعلام. */
 const OBS=[];let obsSaved=0;
 function coverOf(S,sym){const o=S.owned[sym];if(!o)return null;const rem=x=>(+x.qty)-(+x.filled_qty||0);
  return S.openMine.find(x=>x.symbol===sym&&isStop(x)&&ACTIVE_STOP.has(x.status)&&Math.abs(rem(x)-o.qty)<1e-6)||null;}
 function observeProtection(S){if(report.mode&&/^scan/.test(report.mode))return; /* الفحص للقراءة لا يرصد؛ status والتداول يرصدان */const t=new Date(now()).toISOString();const d=nyParts(now()).date;
  for(const sym of Object.keys(S.owned)){const c=coverOf(S,sym);const p=protectionOf(S,sym);
   OBS.push({t,date:d,sym,qty:S.owned[sym].qty,covered:!!c,protected:!!p.confirmed,exiting:isExiting(S,sym),coverId:c?c.id:null,coverTif:c?(c.time_in_force||null):null,coverUpdatedAt:c?(c.updated_at||null):null,
    stops:S.openMine.filter(x=>x.symbol===sym&&isStop(x)).map(x=>({id:x.id,status:x.status,tif:x.time_in_force||null}))});}}
 function allObs(){const P=readState('protection-obs.json',[]);return P.concat(OBS.slice(obsSaved));}
 function saveObs(){if(!TRADING||obsSaved>=OBS.length)return;const P=readState('protection-obs.json',[]);P.push(...OBS.slice(obsSaved));obsSaved=OBS.length;writeState('protection-obs.json',P.slice(-20000),true);} /* أرصاد قراءة فقط تُحفظ حتى في status (لا تمس الوسيط) */
 function saveCalendar(cal){try{if(!READONLY&&Array.isArray(cal)&&cal.length){const C=readState('calendar.json',{dates:[]});const set=new Set(C.dates);cal.forEach(c=>c&&c.date&&set.add(c.date));writeState('calendar.json',{dates:[...set].sort(),updatedAt:new Date(now()).toISOString(),source:'GET /v2/calendar'});}}catch(e){}return cal;}
 function latencyOf(S,sym){const n=nyParts(now());
  const buys=S.myFills.filter(f=>f.symbol===sym&&f.side==='buy'&&nyParts(Date.parse(f.transaction_time)).date===n.date);
  if(!buys.length)return null;const first=Math.min(...buys.map(f=>Date.parse(f.transaction_time)));const o=S.owned[sym];if(!o)return null;
  const sec=ms=>+((ms-first)/1000).toFixed(1);
  const obs=allObs().filter(x=>x.sym===sym&&x.date===n.date&&Date.parse(x.t)>=first).sort((a,b)=>Date.parse(a.t)-Date.parse(b.t));
  const fp=obs.find(x=>x.covered);const before=fp?obs.filter(x=>Date.parse(x.t)<Date.parse(fp.t)):obs;const lu=before.filter(x=>!x.covered).pop();
  const transitions=[];obs.forEach(x=>{const k=(x.covered?'covered':'uncovered')+'/'+(x.protected?'protected':'-')+'/'+(x.coverId||'');if(!transitions.length||transitions[transitions.length-1].k!==k)transitions.push({k,t:x.t,covered:x.covered,protected:x.protected,coverId:x.coverId,coverTif:x.coverTif});});
  const lapses=fp?obs.filter(x=>Date.parse(x.t)>Date.parse(fp.t)&&!x.covered&&!x.exiting).map(x=>x.t):[];
  const observed={polls:obs.length,firstCoveredAt:fp?fp.t:null,lastUncoveredAt:lu?lu.t:null,lowerBoundSec:lu?sec(Date.parse(lu.t)):0,upperBoundSec:fp?sec(Date.parse(fp.t)):null,lapsesAfterCover:lapses,
   status:fp?'observed-bounds':(obs.length?'uncovered-at-all-observations':'not-observed')};
  const cover=coverOf(S,sym);let broker=null,inferred=null,origin=null;
  if(cover){let org=cover;for(let k=0;k<10;k++){const prev=S.orders.find(x=>x.replaced_by===org.id);if(!prev)break;org=prev;}origin=org._parent?'oto-leg':'runner-stop';
   let st;if(org._parent){const pf=S.acts.filter(f=>f.order_id===org._parent).map(f=>Date.parse(f.transaction_time));st=pf.length?Math.max(...pf):Date.parse(org.submitted_at);}else st=Date.parse(org.submitted_at||org.created_at||0);
   st=Math.max(st,first);inferred={start:new Date(st).toISOString(),sec:sec(st),basis:org._parent?'آخر تعبئة لأمر الدخول (رجل OTO)':'submitted_at لأمر الوقف',note:'مستنتج — للعلم فقط، لا يُستخدم دليلًا'};
   if(cover.updated_at){const u=Date.parse(cover.updated_at);broker={stopId:cover.id,updatedAt:cover.updated_at,sec:sec(u),consistentWithObserved:(observed.upperBoundSec==null||sec(u)<=observed.upperBoundSec+1)&&sec(u)>=observed.lowerBoundSec-1,
    note:'updated_at من الوسيط لأمر الوقف الحالي — قد يعكس آخر تحديث لا لحظة التفعيل'};}}
  return{sym,firstFill:new Date(first).toISOString(),fillIds:buys.map(f=>f.id),entryOrderIds:[...new Set(buys.map(f=>f.order_id))],origin,covered:!!cover,coverTif:cover?(cover.time_in_force||null):null,
   observed,broker,inferred,transitions:transitions.map(({k,...x})=>x),sec:observed.upperBoundSec};}
 /* ---------- 7.2.4 (S10): المطابقة اليومية المستقلة (كمية + نقد + رسوم) ----------
    النقد المتوقع = خط الأساس (نقد الحساب عند أول تشغيل تداول قبل أي تعبئة للمنفّذ) + تدفقات تعبئات المنفّذ + تدفقات التعبئات الأجنبية + صافي النشاطات الأخرى. */
 function reconcile(S){const n=nyParts(now());
  const flow=fs_=>fs_.reduce((a,f)=>a+(f.side==='sell'?1:-1)*(+f.qty)*(+f.price),0);
  const mineSet=new Set(S.myFills.map(f=>f.id));const ixFillSet=new Set((S.ixFills||[]).map(f=>f.id));const foreignFills=S.acts.filter(f=>!mineSet.has(f.id)&&!ixFillSet.has(f.id));
  const hasIx=!!((S.ixFills||[]).length||(S.ixOrders||[]).length);
  let base=readState('baseline.json',null);
  if(!base&&TRADING&&!S.myFills.length&&!S.mine.length&&!hasIx){base={cash:+S.acc.cash,at:new Date(now()).toISOString(),trialStart:cfg.trialStart,note:'نقد الحساب قبل أي أمر للمنفّذ'};writeState('baseline.json',base);}
  const qty=[...new Set([...Object.keys(S.owned),...Object.keys(S.mismatch)])].map(sym=>({sym,ledger:S.owned[sym]?S.owned[sym].qty:0,broker:S.brokerPos[sym]||0,diff:+((S.brokerPos[sym]||0)-(S.owned[sym]?S.owned[sym].qty:0)).toFixed(6)}));
  /* 7.2.19-dev: كمية دفتر المؤشر (ix1-) مقابل الوسيط — صف لكل رمز مؤشر */
  for(const sym of new Set([...Object.keys(S.ixOwned||{}),...Object.keys(S.ixMismatch||{})])){if(qty.some(x=>x.sym===sym))continue;const led=(S.ixOwned[sym]?S.ixOwned[sym].qty:0);qty.push({sym,book:'ix1',ledger:led,broker:S.brokerPos[sym]||0,diff:+((S.brokerPos[sym]||0)-led).toFixed(6)});}
  /* 7.2.7 (S10، عيب من التدقيق): خط الأساس = نقد الحساب لحظة التقاطه، فما قبله داخل فيه. تُحسب بعده فقط التعبئات الأجنبية والنشاطات الأخرى.
     نشاط بتاريخ يوم فقط في يوم الالتقاط نفسه غامض (قبله أم بعده؟) ⇒ لا يُحسب، ويُسجَّل، وإن بقي فرق تصبح المطابقة «غير متحققة» لا «مطابقة». */
  const bAt=base?Date.parse(base.at):null;const bDay=base?nyParts(bAt).date:null;const tsOf=x=>x.transaction_time?Date.parse(x.transaction_time):null;
  const ambiguous=[];const afterBase=x=>{if(bAt==null)return true;const t=tsOf(x);if(t!=null)return t>bAt;const d=String(x.date||'').slice(0,10);if(!d)return true;if(d>bDay)return true;if(d===bDay){ambiguous.push({id:x.id,type:x.activity_type,date:d,net:+x.net_amount||0});}return false;};
  const foreignAfter=foreignFills.filter(afterBase);const otherAfter=S.otherActs.filter(afterBase);
  const other=otherAfter.reduce((a,x)=>a+(+x.net_amount||0),0);const ixFlow=hasIx?+flow(S.ixFills||[]).toFixed(2):0;
  const r={date:n.date,at:new Date(now()).toISOString(),qty,qtyOk:qty.every(x=>Math.abs(x.diff)<1e-6),
   cash:{baseline:base?base.cash:null,baselineAt:base?base.at:null,myFillsFlow:+flow(S.myFills).toFixed(2),foreignFillsFlow:+flow(foreignAfter).toFixed(2),foreignFillsBeforeBaseline:foreignFills.length-foreignAfter.length,ambiguousSameDay:ambiguous,otherActivities:+other.toFixed(2),fees:+S.fees.toFixed(2),broker:+S.acc.cash,activitiesComplete:S.otherOk}};
  if(hasIx)r.cash.ixFillsFlow=ixFlow; /* 7.2.19-dev: تعبئات المؤشر (ix1-) — بعد خط الأساس دائمًا (لا يُلتقط خط أساس بعد أي نشاط ix1-) */
  if(base&&S.otherOk){r.cash.expected=+(base.cash+r.cash.myFillsFlow+ixFlow+r.cash.foreignFillsFlow+r.cash.otherActivities).toFixed(2);r.cash.diff=+(r.cash.broker-r.cash.expected).toFixed(2);r.cashOk=Math.abs(r.cash.diff)<=1;if(!r.cashOk&&ambiguous.length){r.cashOk=null;r.cash.note='فرق مع نشاط غامض في يوم الالتقاط — المطابقة غير متحققة';}}
  else{r.cashOk=null;r.cash.note=base?'نشاطات غير مكتملة — المطابقة النقدية غير متوفرة':'لا خط أساس (تعبئات للمنفّذ قبل التقاطه) — المطابقة النقدية غير متوفرة';}
  if(fs&&STATE_DIR&&!READONLY){try{const d=path.join(STATE_DIR,'..','reports');fs.mkdirSync(d,{recursive:true});fs.writeFileSync(path.join(d,'recon-'+n.date+'.json'),JSON.stringify(r,null,1));}catch(e){}}
  return r;}
 /* ---------- 7.2.4 (S10): أعلام التوقف الدائمة ----------
    أي علم نشط ⇒ لا دخول جديد (الخروج والحماية مستمران). يبقى محفوظًا في state/flags.json بين التشغيلات.
    يرفعه صالح فقط بأمر يدوي: clear-flags (GitHub: Run workflow بالأمر clear-flags) بعد مراجعة السبب. */
 /* 7.2.10: قراءة صارمة لأعلام التوقف — ملف تالف لا يعني «لا أعلام» */
 function readFlags(){if(STATE_DIR&&fs){const f=path.join(STATE_DIR,'flags.json');if(fs.existsSync(f)){let v=null;try{v=JSON.parse(fs.readFileSync(f,'utf8'));}catch(e){v=null;}
   const okShape=v&&Array.isArray(v.active)&&Array.isArray(v.cleared)&&v.active.concat(v.cleared).every(x=>x&&typeof x.id==='string');if(okShape)return v;
   const at=new Date(now()).toISOString();const ts=at.replace(/[:.]/g,'-');const F={active:[{id:'flags-corrupt-'+ts,kind:'state-corrupt',at,detail:{note:'state/flags.json تالف أو ببنية خاطئة — نُسخ إلى state/evidence/flags-'+ts+'.corrupt. راجع الأعلام فيه ثم clear-flags'}}],cleared:[]};
   if(!READONLY){try{const ed=path.join(STATE_DIR,'evidence');fs.mkdirSync(ed,{recursive:true});fs.copyFileSync(f,path.join(ed,'flags-'+ts+'.corrupt'));}catch(e){}writeState('flags.json',F,true);}return F;}}
  return readState('flags.json',{active:[],cleared:[]});}
 function raise(kind,id,detail){const F=readFlags();
  if(F.active.some(f=>f.id===id)||F.cleared.some(f=>f.id===id))return;F.active.push({id,kind,at:new Date(now()).toISOString(),detail});writeState('flags.json',F);log('flag_raised',{id,kind,detail});}
 /* 7.2.9: شروط ما قبل الدخول الخاصة بالمخاطر واستمرارية الحالة (Q10/Q11/Q13). إعادة البحث التاريخية مستثناة (لا أموال). */
 function riskPreconditions(){const why=[];const mode=report.entryPolicy&&report.entryPolicy.mode;if(mode==='research-replay')return why;
  const LL=cfg.lossLimits;if(LL&&(+LL.dailyPct>0||+LL.weeklyPct>0)){const L=report.lossLimit;
   if(!(L&&L.evaluated===true))why.push('حد الخسارة غير مقيّم'+(L&&L.missing?' (لا سعر لـ '+L.missing.join('، ')+')':'')+' — لا دخول حتى يُقاس');}
  if(String(env.GITHUB_ACTIONS||'').toLowerCase()==='true'){const C=readState('continuity.json',null);
   if(!C||String(C.runId)!==String(env.GITHUB_RUN_ID||'')||(+C.runAttempt||1)!==(+env.GITHUB_RUN_ATTEMPT||1))why.push('استمرارية الحالة غير مثبتة لهذا التشغيل وهذه المحاولة (state_guard لم يعمل أو لم يكتب نتيجة) — لا دخول');
   else if(C.ok!==true)why.push('استمرارية الحالة: '+(C.reason||'غير مثبتة')+' — لا دخول');
   report.continuity=C;}
  /* 7.2.15-dev (DEV-SAVE-03): آخر سجل تشغيل يجب أن يجد تقريره المطابق — وإلا حادثة دائمة ولا دخول */
  {let P=null;try{P=pairCheck(true);}catch(e){why.push('تعذر التحقق من اتساق سجل التشغيل الأخير وتقريره: '+e.message);}
   if(P&&(P.status==='mismatch'||P.status==='open-incident'))why.push('تقرير التشغيل السابق '+((P.record&&P.record.reportFile)||'')+' مفقود أو لا يطابق سجله في runs.json ('+P.problems.join('، ')+') — حادثة حفظ '+(P.coveredBy||P.incidentId)+'؛ لا دخول حتى يراجعها صالح ويشغّل clear-flags');}
  /* 7.2.14-dev (DEV-SAVE-02): حادثة حفظ غير محسومة في أي موضع ⇒ لا دخول (ولو ضاع العلم وكانت المرساة سليمة) */
  {const SI=saveIncidents();if(SI){if(SI.open.length)why.push('حادثة حفظ غير محسومة ('+SI.open.map(x=>x.id).join('، ')+'): حفظ تشغيل سابق غير مكتمل (سجل التشغيل أو التقرير أو الإيصال أو العلم) — لا دخول حتى يراجعها صالح ويرفعها بـclear-flags');
   if(SI.errors.length)why.push('تعذر التحقق من حوادث الحفظ: '+SI.errors.join('، '));}}
  return why;}
 function saveIncidents(){if(!STATE_DIR||!fs||!path)return null;let cleared=[];try{cleared=readFlags().cleared.map(f=>f.id);}catch(e){}
  const SI=scanSaveIncidents(STATE_DIR,path.join(STATE_DIR,'..','reports'),{now:now(),clearedFlagIds:cleared});report.saveIncidents={open:SI.open,resolvedCount:SI.resolved.length,errors:SI.errors,scanned:SI.scanned};return SI;}
 /* 7.2.15-dev (DEV-SAVE-03): فحص زوج السجل/التقرير الأخير. خلل غير مغطى بحادثة ⇒ تُكتب حادثة دائمة (pair-<التقرير>) في state/evidence وreports + علم
    (عند create وفي تشغيل كتابة). مغطى بحادثة محسومة ⇒ resolved (لا إعادة إثارة). لا يحذف شيئًا ولا يعدّل runs.json أو التقارير. */
 function pairCheck(create){if(!STATE_DIR||!fs||!path)return null;const rd=path.join(STATE_DIR,'..','reports');const P=lastRunPair(STATE_DIR,rd);
  if(P.status==='mismatch'){let cleared=[];try{cleared=readFlags().cleared.map(f=>f.id);}catch(e){}
   const C=pairCovered(P,scanSaveIncidents(STATE_DIR,rd,{now:now(),clearedFlagIds:cleared}));
   if(C){P.status=C.status;P.coveredBy=C.id;}
   else if(create&&!READONLY&&!RESEARCH_REPLAY){const at=new Date(now()).toISOString();
    const w=writeSaveIncident({id:P.incidentId,at,cmd:P.record&&P.record.cmd,failed:['report-pair'],error:P.problems.join('، '),reportFile:P.record&&P.record.reportFile,outDir:rd,
     extra:{detectedBy:'runner start-up pair check',record:P.record,problems:P.problems,detectedRunId:env.GITHUB_RUN_ID||null,detectedRunAttempt:env.GITHUB_RUN_ATTEMPT||null}});
    try{raise('run-record-failed','runrec-'+P.incidentId,{incidentId:P.incidentId,failed:['report-pair'],problems:P.problems,reportFile:P.record&&P.record.reportFile,note:'تقرير التشغيل السابق مفقود أو لا يطابق سجله — لا دخول جديد حتى clear-flags؛ الحماية والخروج والمطابقة مستمرة'});}catch(e){w.markerErrors.push('flags.json: '+e.message);}
    P.status='open-incident';P.coveredBy=P.incidentId;P.created=true;P.markers=w.markers;P.markerErrors=w.markerErrors;}}
  report.runPair=P;return P;}
 /* حادثة حفظ في موضعين مستقلين (state/evidence وreports) — كل موضع يُجرب وحده (يكفي أحدهما؛ العلم وruns.json موضعان آخران) */
 function writeSaveIncident(o){const incident=Object.assign({kind:'save-incident',incidentId:o.id,at:o.at,cmd:o.cmd||null,runId:env.GITHUB_RUN_ID||null,runAttempt:env.GITHUB_RUN_ATTEMPT||null,failed:o.failed,
   error:o.error||null,flagError:o.flagError||null,reportFile:o.reportFile||null,evidenceFile:o.evidenceFile||null,resolved:false,
   note:'حادثة حفظ غير محسومة: لا دخول جديد حتى يراجعها صالح ويشغّل clear-flags (يكتب save-incident-'+o.id+'.resolved.json). الحماية والخروج والمطابقة مستمرة.'},o.extra||{});
  const markers=[],markerErrors=[];
  for(const [dir,label] of [[path.join(STATE_DIR,'evidence'),'state/evidence'],[o.outDir,'reports']]){try{fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'save-incident-'+o.id+'.json'),JSON.stringify(incident,null,1));markers.push(label+'/save-incident-'+o.id+'.json');}catch(e){markerErrors.push(label+': '+e.message);}}
  return{markers,markerErrors};}
 function activeFlags(){return readFlags().active;}
 function ixPostFill(S){const syms=Object.keys(S.ixOwned||{});if(!syms.length&&!(S.ixPending||[]).length)return null;
  const cost=syms.reduce((a,s)=>a+S.ixOwned[s].cost,0);let pend=0,unknown=0;for(const o of S.ixPending||[]){const ref=refOfOrder(o);const rem=Math.max(0,(+o.qty)-(+o.filled_qty||0));if(ref)pend+=rem*ref;else unknown++;}
  const lim=+(TRIAL_CAPS.allocation*(1+I1_FILL_BUFFER_PCT/100)).toFixed(2);const r={at:new Date(now()).toISOString(),symbols:syms,cost:+cost.toFixed(2),pendingReserve:+pend.toFixed(2),unknownPending:unknown,limit:lim,breach:cost+pend>lim+1e-6||unknown>0};
  report.ixPostFill=r;if(r.breach)raise(CAPS?CAPS.BREACH_FLAG:'cap-breach-after-fill','capbreach-ix-'+sigOf(syms.join(',')+'|'+Math.round(cost+pend)),{book:'ix1',cost:r.cost,pendingReserve:r.pendingReserve,unknownPending:unknown,limit:lim,forceSell:false,note:'مبلغ المؤشر تجاوز السقف — يمنع الشراء فقط، لا بيع. يرفعه صالح بـclear-flags'});
  return r;}
 async function evaluateFlags(S){const st={calendarOk:true};if(!TRADING||READONLY)return st;const n=nyParts(now());
  /* 1) زمن الحماية > 120 ث */
  if(!RESEARCH_REPLAY)for(const L of (report.protectionLatency||[])){const O=L.observed||{};const age=(now()-Date.parse(L.firstFill))/1000;
   if(O.lowerBoundSec>120||(O.upperBoundSec!=null&&O.upperBoundSec>120)||(O.upperBoundSec==null&&age>120))raise('protection-latency','lat-'+L.sym+'-'+n.date,L);}
  /* 2) تأخر بدء الجلسة: يوم تداول (من التقويم) لم يبدأ فيه session/premarket حتى 09:25 — مرتين خلال آخر 5 جلسات */
  const runs=readState('runs.json',[]);let cal=[];
  if(runs.length){try{cal=(saveCalendar((await req('GET','/v2/calendar?start='+runs[0].date+'&end='+n.date))||[])).map(c=>c.date).filter(d=>d>=runs[0].date&&d<=n.date);}catch(e){st.calendarOk=false;report.warnings.push('تعذر جلب التقويم لعدّ التأخر: '+e.message);}}
  if(cal.length&&runs.length){const firstRun=runs[0].date;const days=cal.filter(d=>d>=firstRun&&(d<n.date||(d===n.date&&n.hm>=9*60+30))).slice(-5);
   const late=days.filter(d=>!runs.some(r=>(r.date===d&&(r.cmd==='session'||r.cmd==='premarket')&&r.startHm<=9*60+25)||(r.cmd==='overnight'&&r.ixTarget===d&&r.ixInWindow===true))); /* 7.2.19-dev: تشغيل overnight داخل نافذة اليوم يكفي */
   report.lateSessionDays=late;if(late.length>=2)raise('session-late','late-'+late.join(','),{days:late,window:days});
   /* 3) يوم فيه أوامر دخول بلا تشغيل حراسة بعد الافتتاح */
   for(const d of days.filter(d=>d<n.date)){const placed=runs.some(r=>r.date===d&&(r.entriesPlaced||0)>0);
    const guarded=runs.some(r=>r.date===d&&((r.cmd==='session'&&(r.guards||0)>0)||(r.cmd==='postopen'&&r.startHm>=9*60+30)));
    if(placed&&!guarded)raise('no-postopen-guard','noguard-'+d,{day:d});}}
  /* 5) حد الخسارة اليومي والأسبوعي لأموال المنفّذ (7.2.7، وأُعيد تعريفه في 7.2.9 — Q10/Q11/Q12).
     الحقوق = riskEquity (تعريف واحد). المرجع اليومي = آخر قياس محفوظ بتاريخ قبل اليوم (نيويورك)؛ الأسبوعي = آخر قياس قبل اثنين الأسبوع.
     لا قياس سابق ⇒ القياس الأول للتجربة (genesis) المأخوذ قبل أي نشاط (= المخصص). كل خسارة بعد آخر قياس تدخل الفترة التالية ولا تضيع.
     النسبة = (الحقوق ÷ المرجع − 1) × 100؛ الحد 3% يعني هبوط الحقوق 3% عن المرجع.
     تعذر التقييم (سعر ناقص) ⇒ evaluated=false فيمنع الدخول في فحص ما قبل الدخول. ضياع سجل القياسات مع وجود نشاط ⇒ علم risk-reference-missing. */
  {const LL=cfg.lossLimits;if(LL&&(+LL.dailyPct>0||+LL.weeklyPct>0)){const q=riskEquity(S);
   if(!q.ok){report.warnings.push('حد الخسارة غير محسوب: لا سعر لـ '+q.missing.join('، ')+' — لا دخول جديد');report.lossLimit={evaluated:false,reason:'price-missing',missing:q.missing};}
   else{const eq=q.equity;const d=n.date;const dt=new Date(d+'T12:00:00Z');const mon=new Date(dt-((dt.getUTCDay()+6)%7)*864e5).toISOString().slice(0,10);const at=new Date(now()).toISOString();
    let M=readState('equity-marks.json',null);if(!(M&&M.v===2&&M.genesis))M=null;
    const activity=Object.keys(S.owned).length>0||(S.myFills||[]).length>0||Object.keys(S.ixOwned||{}).length>0||(S.ixFills||[]).length>0||Math.abs(S.fees)>1e-9||Math.abs(S.realized)>1e-9||(S.pendingBuys||[]).length>0;
    if(!M){M={v:2,definition:'equity=allocation+realized+fees(signed)+unrealized@current_price; dayRef=last mark before today; weekRef=last mark before week start',genesis:{date:d,at,equity:eq,clean:!activity},marks:[]};
     if(activity)raise('risk-reference-missing','riskref-'+d,{note:'سجل قياسات الحقوق مفقود مع وجود نشاط للمنفّذ — لا يمكن إثبات مرجع اليوم/الأسبوع؛ بدأ سجل جديد من الآن',equity:eq});}
    const before=x=>M.marks.filter(m=>m.date<x).sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:(a.at<b.at?-1:1)).pop()||null;
    const ref=(x)=>{const m=before(x);return m?{equity:m.equity,date:m.date,at:m.at,source:'آخر قياس قبل الفترة'}:{equity:M.genesis.equity,date:M.genesis.date,at:M.genesis.at,source:M.genesis.clean?'القياس الأول (قبل أي نشاط)':'القياس الأول بعد فقد السجل (علم مرفوع)'};};
    const dayRef=ref(d),weekRef=ref(mon);
    M.marks=M.marks.filter(m=>m.date!==d).concat([{date:d,at,equity:eq}]).sort((a,b)=>a.date<b.date?-1:1).slice(-60);writeState('equity-marks.json',M);
    const dd=+((eq/dayRef.equity-1)*100).toFixed(3),wd=+((eq/weekRef.equity-1)*100).toFixed(3);
    report.lossLimit={evaluated:true,equity:eq,base:q.base,unrealized:q.unrealized,fees:+S.fees.toFixed(2),dayStart:dayRef.equity,weekStart:weekRef.equity,dayRef,weekRef,dayPct:dd,weekPct:wd,limits:LL};
    if(+LL.dailyPct>0&&dd<=-LL.dailyPct)raise('loss-limit','loss-day-'+d,report.lossLimit);if(+LL.weeklyPct>0&&wd<=-LL.weeklyPct)raise('loss-limit','loss-week-'+mon,report.lossLimit);}}}
  /* 7أ) 7.2.15-dev (DEV-SAVE-03): فحص زوج السجل/التقرير الأخير في كل تشغيل تداول (postopen أيضًا) — خلل ⇒ حادثة دائمة */
  if(!RESEARCH_REPLAY){try{pairCheck(true);}catch(e){report.warnings.push('فحص اتساق سجل التشغيل وتقريره: '+e.message);}}
  /* 7) 7.2.14-dev (DEV-SAVE-02): كل حادثة حفظ غير محسومة تُعيد رفع علم run-record-failed (يُحفظ إن أمكن؛ الفحص نفسه يمنع الدخول حتى لو فشل الحفظ) */
  if(!RESEARCH_REPLAY){try{const SI=saveIncidents();if(SI)for(const x of SI.open){try{raise('run-record-failed','runrec-'+x.id,{incidentId:x.id,reraised:true,where:x.where,cmd:x.cmd,reportFile:x.reportFile,note:'حادثة حفظ غير محسومة اكتُشفت عند بدء التشغيل — لا دخول جديد حتى clear-flags؛ الحماية والخروج والمطابقة مستمرة'});}catch(e){report.warnings.push('تعذر حفظ علم حادثة الحفظ '+x.id+': '+e.message);}}}catch(e){report.warnings.push('فحص حوادث الحفظ: '+e.message);}}
  /* 6) 7.2.13-dev: فحص السقوف بعد التعبئة (علم cap-breach-after-fill يمنع الدخول فقط). 7.2.14-dev: بالنقد المسوّى المثبت إن أمكن */
  if(TRADING&&!READONLY&&!RESEARCH_REPLAY&&(Object.keys(S.owned).length||S.pendingBuys.length)){try{await settlementProof(S);}catch(e){report.warnings.push('إثبات التسوية: '+e.message);}}
  capsPostFill(S,'run');
  /* 6ب) 7.2.19-dev: سقف مبلغ المؤشر بعد التعبئة — التكلفة الفعلية + المعلق ≤ السقف × (1 + هامش الفجوة). التجاوز ⇒ علم يمنع الشراء فقط، لا بيع */
  if(TRADING&&!READONLY&&!RESEARCH_REPLAY)ixPostFill(S);
  /* 4) المطابقة اليومية */
  const R=report.recon;if(R&&(!R.qtyOk||R.cashOk===false))raise('recon-mismatch','recon-'+n.date+'-'+(R.qtyOk?'cash':'qty'),{qty:R.qty.filter(x=>Math.abs(x.diff)>=1e-6),cash:R.cash});
  report.flags=activeFlags();return st;}
 async function finish(S){
  report.ordersSinceTrialStart={all:S.orders.length,mine:S.mine.length,trialStart:cfg.trialStart}; /* 7.2.5: لتقييم S07 (خطر ترقيم الأوامر) */
  report.owned=S.owned;report.realized=+S.realized.toFixed(2);report.feesSinceTrialStart=+S.fees.toFixed(2);report.foreign=[...S.foreign];report.mismatch=S.mismatch;
  report.pendingBuys=S.pendingBuys.map(o=>({symbol:o.symbol,qty:+o.qty,filled:+o.filled_qty||0,status:o.status}));
  /* 7.2.4 (Q01): ثلاث حالات منفصلة لكل مركز: protected (وقف مؤكد) • exit-pending (بيع سوق حي، ليس حماية) • unprotected */
  report.protection=Object.keys(S.owned).map(sym=>{const p=protectionOf(S,sym);p.state=p.confirmed?'protected':(isExiting(S,sym)?'exit-pending':'unprotected');
   if(p.state==='exit-pending')p.why.push('خروج جارٍ بأمر سوق — ليس حماية');
   const sells=S.openSells.filter(o=>o.symbol===sym);if(sells.length)p.sells=sells.map(o=>({id:o.id,status:o.status,qty:+o.qty,filled:+o.filled_qty||0}));return p;});
  report.exitPending=report.protection.filter(p=>p.state==='exit-pending').map(p=>p.sym);
  /* 7.2.19-dev: مركز المؤشر — بلا وقف عمدًا (قرار صالح)؛ لا يدخل protectionOk ولا E2 */
  if(IS_I1||Object.keys(S.ixOwned||{}).length||(S.ixOrders||[]).length)report.indexHold={symbol:I1SET?I1SET.symbol:null,owned:S.ixOwned||{},mismatch:S.ixMismatch||{},noStop:true,policy:I1_POLICY,
   orders:(S.ixOrders||[]).slice(-60).map(o=>({id:o.id,cid:o.client_order_id||null,symbol:o.symbol,side:o.side,type:o.type,tif:o.time_in_force||null,qty:+o.qty,filled:+o.filled_qty||0,avgFill:o.filled_avg_price!=null?+o.filled_avg_price:null,status:o.status,submittedAt:o.submitted_at||null,orderClass:o.order_class||null}))};
  report.protectionOk=report.protection.every(p=>p.state==='protected')&&!Object.keys(S.mismatch).length;
  const bad=report.protection.filter(p=>p.state==='unprotected'||(p.state==='exit-pending'&&S.clock.is_open));
  if(bad.length&&report.mode===undefined)report.errors.push('الحماية غير مؤكدة: '+bad.map(p=>p.sym+' ['+p.state+'] ('+p.why.join('، ')+')').join(' • '));
  if(!S.clock.is_open&&report.exitPending.length)report.warnings.push('خروج جارٍ قبل الافتتاح بلا وقف (سياسة معلنة): '+report.exitPending.join('، ')+' — يُتابع بعد الافتتاح');
  report.protectionLatency=Object.keys(S.owned).map(sym=>latencyOf(S,sym)).filter(Boolean);
  report.protectionObservations=OBS.slice();try{saveObs();}catch(e){report.warnings.push('تعذر حفظ أرصاد الحماية: '+e.message);}
  try{report.recon=reconcile(S);}catch(e){report.warnings.push('تعذرت المطابقة اليومية: '+e.message);}
  try{await evaluateFlags(S);}catch(e){report.warnings.push('تعذر تقييم الأعلام: '+e.message);}
  if(!READONLY)report.flags=activeFlags();
  report.httpMethodsSent=[...methods];report.brokerMutations=report.orders.length;
  report.journal=journal;return report;
 }
 /* سجل التشغيلات (لعدّ التأخر وأيام بلا حراسة) — يُستدعى مرة بعد كل أمر من سطر الأوامر */
 function runRecordOf(cmd,rep,link){const n=nyParts(STARTED);link=link||{};
  /* 7.2.12-dev (S10): مصدر التشغيل وهويته وربطه بتقريره — المدقق لا يحسب جدولة إلا لتشغيل مجدول مثبت بهذه الحقول */
  return{date:n.date,startHm:n.hm,start:new Date(STARTED).toISOString(),cmd,entriesPlaced:rep.entriesPlaced||0,guards:rep.guards||0,errors:(rep.errors||[]).length,
   startedAt:new Date(STARTED).toISOString(),githubRunId:env.GITHUB_RUN_ID||null,githubRunAttempt:env.GITHUB_RUN_ATTEMPT||null,githubEvent:env.GITHUB_EVENT_NAME||null,githubSchedule:env.GH_EVENT_SCHEDULE||null,
   reportFile:link.reportFile||null,reportSha256:link.reportSha256||null,
   ...(cmd==='overnight'?{ixTarget:rep.ix&&rep.ix.targetDate||null,ixInWindow:!!(rep.ix&&rep.ix.window&&rep.ix.window.inWindow),ixStatus:rep.ix&&rep.ix.status||null,ixOrdersPlaced:rep.ixOrdersPlaced||0}:{})};} /* 7.2.19-dev: حقول overnight فقط */
 function recordRun(cmd,rep,link){if(READONLY||!TRADING)return;const runs=readState('runs.json',[]);
  runs.push(runRecordOf(cmd,rep,link));
  writeState('runs.json',runs.slice(-400));return true;}
 /* 7.2.12-dev (S10): كتابة التقرير وسجل التشغيل معًا. النص يُحسب أولًا، ثم بصمته، ثم يُسجل التشغيل باسم الملف وبصمته، ثم يُكتب الملف بالنص نفسه.
    أوامر التسجيل كما كانت (premarket/postopen/session فقط). يعيد مسار التقرير. */
 let EXIT_HINT=null;function setExitCode(c){EXIT_HINT=c==null?null:+c;}
 function saveReport(cmd,rep,outDir,exitCode){if(exitCode===undefined)exitCode=EXIT_HINT;const f=path.join(outDir,new Date(now()).toISOString().replace(/[:.]/g,'-')+'-'+cmd+'.json');const body=JSON.stringify(rep,null,1);
  let sha=null;try{sha=require('crypto').createHash('sha256').update(body,'utf8').digest('hex');}catch(e){}
  /* 7.2.13-dev (DEV-SAVE-01): فشل كتابة سجل التشغيل لا يُبتلع. التقرير وحده ليس حفظًا مكتملًا:
     (1) دليل في state/evidence/run-record-failed-<وقت>.json (الخطأ + السجل المقصود + اسم التقرير)
     (2) علم run-record-failed: لا دخول جديد حتى clear-flags؛ الحماية والخروج والمطابقة مستمرة
     (3) التقرير يُكتب بـsaveStatus.status='incomplete-evidence' وخطأ صريح، ثم يُرمى خطأ RUN_RECORD_FAILED (سطر الأوامر يخرج برمز 3).
     7.2.15-dev (DEV-SAVE-03): بعد نجاح runs.json، فشل كتابة التقرير نفسه (أو إيصال الحفظ) حادثة حفظ أيضًا — REPORT_WRITE_FAILED / SAVE_RECEIPT_FAILED (رمز 3).
     الحفظ الكامل = سجل + تقرير + إيصال state/last-report.json (يكتب آخرًا، ويقرؤه verifySave في خطوة الحفظ). */
  let fail=null,recorded=false;
  if(['premarket','postopen','session','overnight'].includes(cmd)){try{recorded=recordRun(cmd,rep,{reportFile:path.basename(f),reportSha256:sha})===true;}catch(e){fail=e;}}
  if(!fail){let werr=null;try{fs.mkdirSync(outDir,{recursive:true});fs.writeFileSync(f,body);}catch(e){werr=e;}
   if(!werr){let rerr=null;
    if(STATE_DIR){try{fs.mkdirSync(STATE_DIR,{recursive:true});fs.writeFileSync(path.join(STATE_DIR,'last-report.json'),JSON.stringify({kind:'save-receipt',version:VERSION,runId:env.GITHUB_RUN_ID||null,runAttempt:env.GITHUB_RUN_ATTEMPT||null,cmd,
      reportFile:path.basename(f),reportSha256:sha,recorded,exitCode:exitCode==null?null:+exitCode,startedAt:new Date(STARTED).toISOString(),at:new Date(now()).toISOString()},null,1));}catch(e){rerr=e;}}
    if(!rerr)return f;
    return saveFailure(cmd,rep,f,sha,{what:'receipt',error:rerr,recorded,body});}
   return saveFailure(cmd,rep,f,sha,{what:'report',error:werr,recorded,body});}
  const at=new Date(now()).toISOString(),ts=at.replace(/[:.]/g,'-');const msg=String(fail&&fail.message||fail);
  const intendedRecord=runRecordOf(cmd,rep,{reportFile:path.basename(f),reportSha256:sha});
  const ev={kind:'run-record-failed',at,cmd,error:msg,code:fail&&fail.code||null,intendedRecord,reportFile:path.basename(f),reportSha256Intended:sha,
   note:'runs.json لم يُكتب لهذا التشغيل. التقرير المكتوب يختلف عن البصمة المقصودة لأنه يحمل حالة الحفظ غير المكتمل.'};
  let evidenceFile=null,evidenceError=null;
  try{const ed=path.join(STATE_DIR,'evidence');fs.mkdirSync(ed,{recursive:true});const ef=path.join(ed,'run-record-failed-'+ts+'.json');fs.writeFileSync(ef,JSON.stringify(ev,null,1));evidenceFile='state/evidence/'+path.basename(ef);}catch(e){evidenceError=e.message;}
  let flagError=null;
  try{raise('run-record-failed','runrec-'+ts,{incidentId:ts,cmd,error:msg,reportFile:path.basename(f),evidenceFile,note:'سجل التشغيل لم يُكتب — لا دخول جديد حتى clear-flags؛ الحماية والخروج والمطابقة مستمرة'});}catch(e){flagError=e.message;}
  /* 7.2.14-dev (DEV-SAVE-02): علامة الحادثة في موضعين مستقلين إضافيين (state/evidence وreports) — كل تشغيل تالٍ يفحصها ويمنع الدخول حتى الحسم،
     حتى لو لم يُحفظ العلم (flags.json) وكتبت خطوة الحفظ مرساة last-saved.json */
  const failed=['runs.json'].concat(flagError?['flags.json']:[]);
  let W=writeSaveIncident({id:ts,at,cmd,failed,error:msg,flagError,reportFile:path.basename(f),evidenceFile,outDir});
  rep.saveStatus={complete:false,status:'incomplete-evidence',incidentId:ts,runRecord:'failed',error:msg,intendedRecord,evidenceFile,evidenceError,flag:flagError?null:'run-record-failed',flagError,incidentMarkers:W.markers,incidentMarkerErrors:W.markerErrors};
  rep.errors.push('سجل التشغيل runs.json لم يُكتب ('+msg+') — الأدلة غير مكتملة'+(flagError?'؛ وتعذر رفع العلم ('+flagError+')':'؛ رُفع علم run-record-failed: لا دخول جديد حتى clear-flags، والحماية والخروج والمطابقة مستمرة'));
  /* 7.2.15-dev: فشل كتابة التقرير هنا أيضًا لا يُبتلع — تُحدَّث علامتا الحادثة (report ضمن الفاشل) ويبقى الخطأ RUN_RECORD_FAILED (رمز 3) */
  let reportError=null;try{fs.mkdirSync(outDir,{recursive:true});fs.writeFileSync(f,JSON.stringify(rep,null,1));}catch(e){reportError=e.message;
   W=writeSaveIncident({id:ts,at,cmd,failed:failed.concat(['report']),error:msg+' • التقرير: '+reportError,flagError,reportFile:path.basename(f),evidenceFile,outDir});}
  const err=new Error('RUN_RECORD_FAILED: سجل التشغيل لم يُكتب ('+msg+') — '+(reportError?'وتعذرت كتابة التقرير أيضًا ('+reportError+')':'التقرير كُتب بحالة أدلة غير مكتملة'));err.code='RUN_RECORD_FAILED';err.reportFile=f;err.evidenceFile=evidenceFile;err.incidentId=ts;err.reportError=reportError;throw err;}
 /* 7.2.15-dev (DEV-SAVE-03): runs.json كُتب (أو لا يلزم) لكن التقرير أو إيصال الحفظ لم يُكتب ⇒ حادثة حفظ:
    (1) نسخة التقرير في state/evidence/report-unwritten-<id>.json (إن أمكن) (2) علم run-record-failed (3) علامتا الحادثة في state/evidence وreports
    (4) سجل runs.json نفسه يشير إلى تقرير غير موجود فيكشفه فحص الزوج في التشغيل التالي حتى لو فشل كل ما سبق. ثم خطأ صريح (رمز 3). */
 function saveFailure(cmd,rep,f,sha,o){const at=new Date(now()).toISOString(),ts=at.replace(/[:.]/g,'-');const msg=String(o.error&&o.error.message||o.error);
  const label=o.what==='report'?'التقرير':'إيصال الحفظ state/last-report.json';let evidenceFile=null,evidenceError=null;
  if(STATE_DIR){try{const ed=path.join(STATE_DIR,'evidence');fs.mkdirSync(ed,{recursive:true});const ef=path.join(ed,'report-unwritten-'+ts+'.json');
    fs.writeFileSync(ef,JSON.stringify({kind:o.what==='report'?'report-write-failed':'save-receipt-failed',at,cmd,error:msg,code:o.error&&o.error.code||null,reportFile:path.basename(f),reportSha256:sha,runRecorded:o.recorded,
     note:'نص التقرير المقصود محفوظ هنا كما هو (reportBody) — بصمته reportSha256. لا دخول جديد حتى يراجع صالح الحادثة ويشغّل clear-flags.',reportBody:o.what==='report'?o.body:null},null,1));evidenceFile='state/evidence/'+path.basename(ef);}catch(e){evidenceError=e.message;}}
  let flagError=null;try{raise('run-record-failed','runrec-'+ts,{incidentId:ts,cmd,failed:[o.what==='report'?'report':'last-report.json'],error:msg,reportFile:path.basename(f),evidenceFile,note:label+' لم يُكتب — لا دخول جديد حتى clear-flags؛ الحماية والخروج والمطابقة مستمرة'});}catch(e){flagError=e.message;}
  const failed=[o.what==='report'?'report':'last-report.json'].concat(flagError?['flags.json']:[]);
  const W=STATE_DIR?writeSaveIncident({id:ts,at,cmd,failed,error:msg,flagError,reportFile:path.basename(f),evidenceFile,outDir:path.dirname(f),extra:{runRecorded:o.recorded,reportSha256:sha,evidenceError}}):{markers:[],markerErrors:['لا مجلد حالة']};
  rep.saveStatus={complete:false,status:'incomplete-evidence',incidentId:ts,report:o.what==='report'?'failed':'written',receipt:o.what==='report'?'not-written':'failed',runRecord:o.recorded?'written':'not-required',error:msg,evidenceFile,evidenceError,flag:flagError?null:'run-record-failed',flagError,incidentMarkers:W.markers,incidentMarkerErrors:W.markerErrors};
  rep.errors.push(label+' لم يُكتب ('+msg+') — الأدلة غير مكتملة؛ حادثة حفظ '+ts+': لا دخول جديد حتى clear-flags، والحماية والخروج والمطابقة مستمرة');
  const code=o.what==='report'?'REPORT_WRITE_FAILED':'SAVE_RECEIPT_FAILED';
  const err=new Error(code+': '+label+' لم يُكتب ('+msg+') — حادثة حفظ '+ts+' مسجلة في '+(W.markers.concat(flagError?[]:['state/flags.json']).join('، ')||'لا موضع! (سجل runs.json يكشفها في التشغيل التالي)'));
  err.code=code;err.reportFile=f;err.evidenceFile=evidenceFile;err.incidentId=ts;err.incidentMarkers=W.markers;throw err;}
 function clearFlags(note){
  /* 7.2.15-dev (DEV-SAVE-03): قبل الحسم — خلل زوج السجل/التقرير الأخير يُسجل حادثة (إن لم يكن مسجلًا) فيُحسم بأثر مكتوب، لا يُتجاوز بصمت */
  try{pairCheck(true);}catch(e){report.warnings.push('فحص اتساق سجل التشغيل وتقريره: '+e.message);}
  const F=readFlags();const at=new Date(now()).toISOString();
  F.cleared.push(...F.active.map(f=>Object.assign({},f,{clearedAt:at,clearedBy:'أمر يدوي clear-flags',note:note||null})));const n=F.active.length;F.active=[];writeState('flags.json',F);
  report.steps.push('رُفعت '+n+' أعلام توقف');report.flags=[];
  /* 7.2.14-dev (DEV-SAVE-02): أثر المعالجة اليدوية — سجل حسم لكل حادثة حفظ مفتوحة في موضعين (state/evidence وreports)، فلا تُثار مرة أخرى */
  if(STATE_DIR&&fs&&path){const SI=scanSaveIncidents(STATE_DIR,path.join(STATE_DIR,'..','reports'),{now:now()});const done=[];
   for(const x of SI.open){const rec={kind:'save-incident-resolution',incidentId:x.id,resolvedAt:at,resolvedBy:'أمر يدوي clear-flags',actor:note||null,runId:env.GITHUB_RUN_ID||null,runAttempt:env.GITHUB_RUN_ATTEMPT||null,incident:x,
     note:'راجع صالح الحادثة ورفعها يدويًا. سجل التشغيل أو التقرير المفقود يبقى مفقودًا، ولا يُحذف أي دليل (state/evidence وreports وruns.json كما هي) — هذا السجل يمنع إعادة إثارتها فقط.'};
    let ok=0;for(const dir of [path.join(STATE_DIR,'evidence'),path.join(STATE_DIR,'..','reports')]){try{fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'save-incident-'+x.id+'.resolved.json'),JSON.stringify(rec,null,1));ok++;}catch(e){report.errors.push('تعذر كتابة سجل حسم الحادثة '+x.id+': '+e.message);}}
    if(ok)done.push(x.id);}
   report.saveIncidentsResolved=done;if(done.length)report.steps.push('حُسمت '+done.length+' حوادث حفظ: '+done.join('، '));}
  return report;}
 /* ---------- 7.2.3 (S10): جلسة كاملة = قبل الافتتاح + حراسة الافتتاح ----------
    سبب الفجوة: رجل OTO لا تنشط إلا بعد اكتمال التعبئة، فالتعبئة الجزئية تبقى بلا وقف حتى يتدخل المنفّذ.
    الحل في الكود: نفس التشغيل الذي أرسل الدخول يبقى حيًا بعد الافتتاح ويستدعي postopen كل 20 ث حتى 09:50
    (أو حتى لا يبقى شراء معلق وتتأكد الحماية) ⇒ الجزئي يُلغى باقيه ويُحمى خلال دورة واحدة.
    لا يُغلق الفجوة نهائيًا: إن لم يعمل التشغيل أصلًا فلا أوامر دخول (لا خطر)؛ إن انقطع بعد الإرسال فالحماية تعود لأول تشغيل لاحق. */
 async function session(){
  report.mode=undefined;report.session=[];
  let S=null;const n0=nyParts(now());
  try{S=await loadState();}catch(e){report.session.push({t:new Date(now()).toISOString(),err:'تعذر القراءة الأولى: '+e.message});}
  if(S&&!S.clock.is_open&&n0.hm<=9*60+25){try{await premarket();}catch(e){report.errors.push('premarket: '+e.message);}}
  else if(!S&&n0.hm<=9*60+25)report.errors.push('session: تعذرت القراءة الأولى — لا أوامر افتتاح هذا التشغيل');
  if(!TRADING){report.steps.push('session: تشغيل جاف — لا حراسة');return finish(await loadState());}
  /* 7.2.4 (Q02): المهلة تُفحص في بداية كل دورة قبل أي قراءة، وبعد كل فشل. فشل القراءة لا يتجاوز 09:50.
     الطلبات لها مهلة (requestTimeoutMs). عند بلوغ المهلة: خطأ صريح + sessionStop بالسبب والرموز غير المحسومة، وعلم توقف إن بقي مركز بلا حماية. */
  const deadline=9*60+50;let guards=0,fails=0,lastOk=null,lastT=null,stop=null;
  {const d0=nyParts(now()).date;for(const off of [4,5]){const ms=Date.parse(d0+'T09:50:00-0'+off+':00');if(nyParts(ms).date===d0&&nyParts(ms).hm===deadline){HARD_DEADLINE=ms+30000;break;}}} /* Q06: لا طلب يتجاوز 09:50:30 */
  for(let k=0;k<1000;k++){
   const n=nyParts(now());
   if(n.hm>=deadline){stop={reason:fails&&!lastOk?'outage':'deadline',at:new Date(now()).toISOString()};break;}
   let T;try{T=await loadState();lastOk=new Date(now()).toISOString();lastT=T;}
   catch(e){fails++;report.session.push({t:new Date(now()).toISOString(),err:'تعذر قراءة الحالة: '+e.message});
    if(nyParts(now()).hm>=deadline){stop={reason:'outage',at:new Date(now()).toISOString()};break;}await sleep(20000);continue;}
   const needs=T.pendingBuys.length>0||Object.keys(T.owned).some(sym=>!protectionOf(T,sym).confirmed);
   if(!needs){report.session.push({t:new Date(now()).toISOString(),done:true});break;}
   if(T.clock.is_open){guards++;const b0=report.errors.length;try{await postopen();}catch(e){report.errors.push('postopen: '+e.message);}
    const transient=report.errors.splice(b0);report.session.push({t:new Date(now()).toISOString(),guard:guards,transient});} /* أخطاء الدورات المؤقتة لا تُحسب؛ الحكم للحالة النهائية */
   /* 7.2.7 (Q09): أول دقيقتين بعد الافتتاح رصد كل 5 ث (لا 20) ليكون حدّا زمن الحماية المرصودان ضيقين؛ ~100 طلب/دقيقة كحد أعلى (حد Alpaca 200) */
   {const h=nyParts(now()).hm;await sleep(T.clock.is_open?(h>=9*60+30&&h<9*60+32?5000:20000):30000);}
  }
  if(report.exitIssues&&report.exitIssues.length)report.errors.push('session: خروج لم يكتمل وحُمي بوقف: '+[...new Set(report.exitIssues)].join(' • '));
  HARD_DEADLINE=null;report.guards=guards;report.steps.push('session: دورات حراسة بعد الافتتاح '+guards+' • قراءات فاشلة '+fails);
  let F;try{F=await loadState();}catch(e){F=null;}
  if(stop){const src=F||lastT;const unresolved=src?Object.keys(src.owned).filter(sym=>!protectionOf(src,sym).confirmed).concat(src.pendingBuys.map(o=>o.symbol+'(شراء معلق)')):['غير معروف — لا قراءة ناجحة'];
   stop.lastSuccessfulRead=lastOk;stop.failedReads=fails;stop.unresolved=unresolved;stop.stateSource=F?'قراءة نهائية':(lastT?'آخر قراءة ناجحة':'لا يوجد');report.sessionStop=stop;
   if(unresolved.length){report.errors.push('session: توقفت الحراسة عند 09:50 ('+(stop.reason==='outage'?'انقطاع الاتصال':'انتهاء النافذة')+') وما زال غير محسوم: '+unresolved.join('، ')+' — التشغيل التالي (postopen) يستأنف من حالة الوسيط');
    raise('protection-unresolved','unres-'+nyParts(now()).date,stop);}}
  if(!F){report.errors.push('session: تعذرت القراءة النهائية — الحالة غير مؤكدة');report.flags=activeFlags();report.httpMethodsSent=[...methods];report.brokerMutations=report.orders.length;report.journal=journal;return report;}
  return finish(F);
 }
 return{scan,premarket,postopen,session,overnight,status,report,loadState,_req:req,cfg,recordRun,saveReport,clearFlags:async()=>clearFlags(io.flagNote),readState,entryLock:ENTRY_LOCK,setExitCode};
}
if(typeof module!=='undefined')module.exports={mkRunner,nyParts,VERSION,STRATEGY_REGISTRY,TRIAL_CAPS,TRIAL_FILL_BUFFER_PCT,trialCapOk,strategyStatus,CAPS_LOADED:!!CAPS,scanSaveIncidents,lastRunPair,pairCovered,verifySave,
 IX_CID,INDEX_ALLOWLIST,I1_FILL_BUFFER_PCT,I1_POLICY,OVERNIGHT,i1Settings,i1Target,overnightWindow};
if(typeof require!=='undefined'&&typeof module!=='undefined'&&require.main===module){
 (async()=>{const cmd=process.argv[2]||'status';const dir=__dirname;
  if(!['scan','status','premarket','postopen','session','overnight','clear-flags'].includes(cmd)){console.error('الأوامر: scan | status | premarket | session | postopen | overnight | clear-flags');process.exit(2);}
  const cfg=JSON.parse(fs.readFileSync(path.join(dir,'config.json'),'utf8'));
  /* 7.2.10: هوية هذا التشغيل والمحاولة داخل state (تصل إلى artifact حتى لو فشل الحفظ) — بيانات وصفية بلا مفاتيح */
  try{const sd=path.join(dir,'state');fs.mkdirSync(sd,{recursive:true});fs.writeFileSync(path.join(sd,'last-run.json'),JSON.stringify({runId:process.env.GITHUB_RUN_ID||null,runNumber:+process.env.GITHUB_RUN_NUMBER||null,runAttempt:+process.env.GITHUB_RUN_ATTEMPT||1,cmd,at:new Date().toISOString()},null,1));}catch(e){}
  const R=mkRunner(process.env,{config:cfg,dir,cmd,flagNote:process.env.FLAG_CLEAR_NOTE||null});let rep,code=0;
  try{rep=await (cmd==='clear-flags'?R.clearFlags():R[cmd]());}catch(e){rep=R.report;rep.errors.push(e.message);code=2;}
  /* 7.2.12-dev: تسجيل التشغيل يتم داخل saveReport مع اسم التقرير وبصمته (بعد status.json)، بدل التسجيل هنا بلا ربط */
  if(rep.errors.length)code=code||1;
  const outDir=path.join(dir,'reports');fs.mkdirSync(outDir,{recursive:true});
  /* 7.2.7: حالة المسار المعتمد للواجهة (تقرؤها المنصة للعرض فقط) — لا مفاتيح ولا أرقام حساب */
  try{const st={tool:'SmartTrader-Runner-Status',version:rep.version,at:rep.at,cmd,approvedPath:rep.approvedPath,runEnv:rep.runEnv,trading:rep.trading,entries:rep.entries,
   strategy:rep.strategyRegistry,entryPolicy:rep.entryPolicy?{ok:rep.entryPolicy.ok,mode:rep.entryPolicy.mode,label:rep.entryPolicy.label,why:rep.entryPolicy.why}:null,
   flags:(rep.flags||[]).map(f=>({id:f.id,kind:f.kind,at:f.at})),protectionOk:rep.protectionOk==null?null:rep.protectionOk,errors:rep.errors.length,warnings:rep.warnings.length,brokerMutations:rep.brokerMutations,
   note:'المسار المعتمد الوحيد للتداول هو هذا المنفّذ. المنصة للعرض فقط.'};fs.writeFileSync(path.join(outDir,'status.json'),JSON.stringify(st,null,1));}catch(e){}
  /* 7.2.15-dev: رمز الخروج المقصود يُكتب في إيصال الحفظ (verifySave يقبل failure مع 1 أو 2 فقط إن ثبت الزوج). أي فشل حفظ ⇒ رمز 3 */
  let f;R.setExitCode(code);try{f=R.saveReport(cmd,rep,outDir);}catch(e){if(e&&['REPORT_WRITE_FAILED','SAVE_RECEIPT_FAILED'].includes(e.code)||e&&e.code==='RUN_RECORD_FAILED'){console.error(e.message);f=e.reportFile;code=3;}else{console.error('فشل حفظ غير متوقع: '+(e&&e.message));code=3;}}
  console.log('\n=== '+cmd+' • trading='+rep.trading+' • brokerMutations='+rep.brokerMutations+' • errors='+rep.errors.length+' • warnings='+rep.warnings.length+' → '+f);
  process.exitCode=code;})();
}
