#!/usr/bin/env node
/* SmartTrader 7.2.19-dev — حارس استمرارية الحالة (Q13). يعمل في GitHub Actions قبل المنفّذ.
   7.2.19-dev: تقارير overnight (I1) تُفحص أيضًا بحثًا عن حادثة حفظ مستعادة (incomplete-evidence)، مثل premarket/postopen/session.
   7.2.17-dev (DEV-SAVE-05): سجل الاستعادة كان باسم الوحدة المستعادة فقط (restore-manifest-<run>-<attempt>.json) وفيه وقت الحارس وهويته،
     فعمليتا استعادة صحيحتان للوحدة نفسها (بعد فشل حفظ المستودع مرتين) تصنعان ملفين بالاسم نفسه ومحتوى مختلف ⇒ تعارض وهمي ⇒ state-stale.
     الآن كل عملية استعادة لها سجل مستقل الاسم: restore-manifest-<run>-<attempt>-by-<guardRun>-<guardAttempt>.json، يُكتب حصريًا (لا كتابة فوق
     سجل موجود أبدًا؛ إن وُجد الاسم بمحتوى آخر يُضاف لاحق -2، -3…). سجل بالاسم القديم (7.2.16) يختلف عن نسخة محلية بالاسم نفسه = عمليتا استعادة
     مختلفتان: تُحفظ نسخة الـartifact باسمها المستقل المشتق من هويتها (الوحدة + guardRun) ولا يُعد ذلك تعارضًا. أما سجل بالاسم المستقل نفسه
     بمحتوى مختلف، أو سجل لا تُقرأ هويته، فيبقى تعارضًا مانعًا. لا تغيير لبقية الأدلة: اختلاف تقرير أو حادثة أو إيصال ما زال تعارضًا يمنع الدخول.
   7.2.16-dev (DEV-SAVE-04): الاستعادة من artifact كانت تقرأ ملفات JSON في جذر state فقط، فتضيع أدلة حادثة الحفظ (state/evidence،
     وعلامات reports/save-incident-*، وسجلات الحسم، ونسخ التقارير غير المكتوبة، والتقارير التي لا يشير إليها إلا الحادثة) ⇒ يعود الشراء دون clear-flags.
     الآن لكل وحدة مستعادة:
       • اتحاد state/evidence كاملًا (مع المجلدات الفرعية) واتحاد reports: نسخ ما غاب محليًا فقط، ولا كتابة فوق ملف موجود أبدًا، ولا حذف.
         نسخة مطابقة = لا شيء. نسخة مختلفة لملف حساس (أدلة، علامات حادثة/حسم، تقارير تشغيل) ⇒ تُحفظ النسختان (نسخة artifact في
         state/evidence/restore-conflicts/<run>-<attempt>/…) والوحدة «غير مثبتة» ⇒ لا دخول. ملفات العرض المتغيرة (status.json وs08-validation.json وrecon-*) تبقى المحلية.
         كل ملف منسوخ يُتحقق منه ببصمته؛ أي فشل نسخ أو تحقق أو ملف غير عادي (رابط رمزي) ⇒ الوحدة غير مثبتة.
       • سجل استعادة state/evidence/restore-manifest-<run>-<attempt>.json (الوحدة، الـartifact، كل ملف وبصمته وحالته) — هوية التشغيل والمحاولة محفوظة.
         (7.2.17-dev: الاسم صار restore-manifest-<run>-<attempt>-by-<guardRun>-<guardAttempt>.json — انظر DEV-SAVE-05 أعلاه.)
       • حوادث الحفظ في الـartifact بلا سجل حسم (فيه أو محليًا أو علم runrec-<id> مرفوع) ⇒ الوحدة غير مثبتة (ok=false) — والمنفّذ يجدها أيضًا لأنها نُسخت.
         استعادة ملفات سليمة الشكل لا تعني أبدًا أن الحادثة حُسمت.
       • مرساة last-saved.json داخل الـartifact تخص المحاولة المستعادة وتقول incomplete أو pairVerified=false ⇒ الوحدة غير مثبتة.
   7.2.16-dev (PROPOSAL-SCHED-03): trigger-registry.json لم يعد يُستبدل بنسخة artifact: اتحاد قيود حسب runId/runAttempt يحفظ قيد التشغيل الحالي
     والقيود المستعادة. المفتاح نفسه بقرارين مختلفين ⇒ يُحفظ القيدان، ويُسجل التعارض صراحة في conflicts[] (البوابة تعطي protect لتلك الخانة)، والوحدة غير مثبتة.
   7.2.15-dev (DEV-SAVE-03): مرساة anchorSchema≥2 (تكتبها خطوة الحفظ من 7.2.15-dev) تُقبل فقط مع pairVerified=true (زوج سجل التشغيل والتقرير
     وإيصال الحفظ أُثبت لذلك التشغيل). pairVerified=false في أي مرساة ⇒ غير مثبتة. التوافق: مرساة قديمة بلا anchorSchema (7.2.11 المنشورة و≤7.2.14-dev)
     تُعامل كما كانت حتى لا يتوقف أول تشغيل بعد الترقية؛ ولا يفتح ذلك ثغرة لأن المنفّذ نفسه يفحص زوج آخر سجل وتقريره في كل تشغيل تداول
     (حادثة pair-… تمنع الدخول) مهما كان شكل المرساة.
     الاستعادة من artifact تستعيد أيضًا ملفات التقارير التي تشير إليها سجلات runs.json المستعادة (إن غابت محليًا) — وإلا لبدا الزوج ناقصًا بعد استعادة سليمة.
     last-report.json (إيصال الحفظ) لا يُدمج من artifact: هو خاص بالتشغيل الذي كتبه.
   7.2.14-dev (DEV-SAVE-02): مرساة last-saved.json فيها incomplete=true (أو openSaveIncidents>0) تعني أن الحفظ نجح لكن بقيت حادثة حفظ
     غير محسومة (سجل تشغيل أو علم لم يُكتب). الحارس لا يعدّها حالة سليمة: ok=false + علم state-stale ⇒ لا دخول حتى clear-flags.
     مرساة قديمة بلا الحقل تُعامل كما كانت (والمنفّذ نفسه يفحص الحوادث في state/evidence وreports في كل تشغيل).
   7.2.11 (O01/O02 من المراجعة المستقلة لـ7.2.10):
     O01 دليل الملف التالف يُحفظ في state/evidence/ باسم لا ينتهي بـ.json (flags-<وقت>.corrupt) — يُحفظ ويُرفع مع الحالة،
         ولا يُفحص كأنه حالة فعالة. الملف الفعال التالف ما زال يوقف الدخول.
     O02 مهلة لكل طلب تشمل قراءة جسم الرد (STATE_GUARD_REQUEST_MS، افتراضي 10000) وميزانية كلية للحارس (STATE_GUARD_BUDGET_MS، افتراضي 90000).
         تجاوزها ⇒ ok=false + علم state-stale + continuity.json، ثم ينتهي الحارس فتعمل خطوة Run (الحماية) — لا انتظار مفتوح.
         لا كتابة على الحالة بعد انتهاء الميزانية (عمل متأخر في الخلفية لا يغيّر شيئًا).
   المشكلة: الحالة (أعلام التوقف، سجل التشغيلات، مراجع الخسارة) تُحفظ بـgit commit/push. إن لم يُحفظ تشغيل سابق،
   يبدأ التشغيل التالي من نسخة قديمة لا تحوي أعلامه.
   الوحدة هنا «تشغيل + محاولة» (run_number + run_attempt): إعادة المحاولة (Re-run) لها نفس run_id وrun_number ومحاولة مختلفة.
   ما يفعله:
     1) المرساة runner/state/last-saved.json {runId, runNumber, runAttempt}: آخر وحدة حُفظت حالتها (تكتبها خطوة Save report في الـcommit نفسه).
     2) يسرد عبر GitHub API (قراءة فقط) كل وحدة بعد المرساة، عدا الوحدة الحالية، ويفحص خطواتها من /runs/{id}/attempts/{n}/jobs:
        - «لم يعمل المنفّذ»: لا job، أو خطوة Run متخطاة (skipped)، أو أُلغيت قبل أن تبدأ (cancelled بلا started_at).
        - غير ذلك (نجحت، فشلت، انتهت مهلتها، أو أُلغيت بعد أن بدأت) = عمل المنفّذ. إن لم تنجح Save report ⇒ «حالة لم تُحفظ».
        - job موجود بلا خطوة Run، أو تشغيل آخر غير مكتمل ⇒ غموض ⇒ لا دخول.
     3) الاستعادة لكل وحدة لم تُحفظ: artifact اسمه report-<run_id>-<attempt>. الاسم القديم report-<run_id> يُقبل فقط لتشغيل بمحاولة واحدة.
        قبل الدمج — كل شيء أو لا شيء للوحدة:
          • هوية: state/last-run.json في الـartifact (يكتبه المنفّذ عند بدء Run) يجب أن يطابق run_id والمحاولة. غيابه يُقبل فقط لتشغيل بمحاولة واحدة (الربط بمعرّف التشغيل من الـAPI).
          • سلامة: كل ملف JSON حرج في الـartifact يُقرأ ويُفحص بنيته؛ ملف تالف أو ببنية خاطئة ⇒ الوحدة غير مستعادة.
          • اكتمال: flags.json أو equity-marks.json موجود في الحالة الحالية وغائب عن الـartifact ⇒ ناقص ⇒ غير مستعادة. غياب ملف آخر يُسجل تحذيرًا.
          • الحالة الحالية نفسها: ملف حرج تالف فيها ⇒ غموض ⇒ لا دخول.
        الدمج: الأعلام اتحاد (المرفوع يدويًا يبقى مرفوعًا) • سجل التشغيلات وأرصاد الحماية اتحاد • قياسات الحقوق الأحدث لكل تاريخ.
     4) يكتب runner/state/continuity.json {runId, runAttempt, ok, ...}. المنفّذ في GitHub لا يدخل إلا مع ملف لهذا التشغيل وهذه المحاولة وok=true.
        أي وحدة غير مستعادة أو تعذر التحقق ⇒ ok=false + علم state-stale (لا دخول حتى clear-flags بعد مراجعة صالح). الحماية والمطابقة تستمران.
   لا يرسل أوامر ولا يطبع مفاتيح. يخرج برمز 0: الحكم يفرضه المنفّذ من continuity.json (غياب الملف = لا دخول). */
'use strict';const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process'),crypto=require('crypto');
const VERSION='7.2.19-dev';
const EVIDENCE_DIR='evidence'; /* داخل state: يُحفظ في git وartifact، ولا يدخل فحص الحالة (المجلد لا ينتهي بـ.json) */
function saveEvidence(stateDir,name,srcFile,at){const d=path.join(stateDir,EVIDENCE_DIR);fs.mkdirSync(d,{recursive:true});const f=path.join(d,name.replace(/\.json$/,'')+'-'+String(at).replace(/[:.]/g,'-')+'.corrupt');fs.copyFileSync(srcFile,f);return path.join(EVIDENCE_DIR,path.basename(f));}
const numEnv=(o,k,d)=>{const v=+((o&&o[k])||process.env[k]);return v>0?v:d;};
class TimeoutError extends Error{}
const writeJ=(f,v)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(v,null,1));};
/* قراءة صارمة: {exists, ok, value, error} — فشل JSON لا يتحول إلى «لا شيء» */
function readStrict(f){if(!fs.existsSync(f))return{exists:false,ok:true,value:undefined};try{return{exists:true,ok:true,value:JSON.parse(fs.readFileSync(f,'utf8'))};}catch(e){return{exists:true,ok:false,error:e.message};}}
const isArr=Array.isArray,isObj=x=>x&&typeof x==='object'&&!isArr(x);
/* فحص بنية الملفات الحرجة */
const SCHEMA={
 'flags.json':v=>isObj(v)&&isArr(v.active)&&isArr(v.cleared)&&v.active.concat(v.cleared).every(f=>isObj(f)&&typeof f.id==='string'&&f.id.length>0),
 'equity-marks.json':v=>isObj(v)&&v.v===2&&isObj(v.genesis)&&typeof v.genesis.equity==='number'&&isArr(v.marks)&&v.marks.every(m=>isObj(m)&&typeof m.date==='string'&&typeof m.equity==='number'),
 'runs.json':v=>isArr(v)&&v.every(isObj),
 'protection-obs.json':v=>isArr(v),
 'baseline.json':v=>isObj(v),
 'adjustments.json':v=>isArr(v),
 'calendar.json':v=>isObj(v)||isArr(v),
 'last-run.json':v=>isObj(v)&&v.runId!=null};
/* ملفات لا تُقبل الاستعادة بدونها إن كانت في الحالة الحالية: الأعلام ومراجع الخسارة. غياب غيرها يُسجَّل تحذيرًا (الدمج اتحاد فلا يُفقد شيء من الحالي). */
const REQUIRED=['flags.json','equity-marks.json'];const OPTIONAL=['runs.json','protection-obs.json','baseline.json','adjustments.json'];
/* يفحص مجلد حالة: يرجع {ok, files:{name:value}, problems:[]} */
function inspectState(dir){const out={ok:true,files:{},problems:[]};if(!dir||!fs.existsSync(dir))return out;
 for(const name of fs.readdirSync(dir)){if(!name.endsWith('.json'))continue;const r=readStrict(path.join(dir,name));
  if(!r.ok){out.ok=false;out.problems.push(name+': JSON غير صالح ('+r.error.slice(0,80)+')');continue;}
  if(SCHEMA[name]&&!SCHEMA[name](r.value)){out.ok=false;out.problems.push(name+': بنية غير متوقعة');continue;}
  out.files[name]=r.value;}
 return out;}
function uniqBy(arr,key){const m=new Map();for(const x of arr)m.set(key(x),x);return [...m.values()];}
/* دمج بلا قراءة ملفات (القيم مفحوصة مسبقًا). يرجع {name: value} لما تغيّر */
function mergeValues(cur,art){const out={};
 for(const [name,b] of Object.entries(art)){if(name==='continuity.json'||name==='last-saved.json'||name==='last-run.json'||name==='last-report.json')continue;const a=cur[name];let v;
  if(name==='flags.json'){const A=a||{active:[],cleared:[]};const cleared=uniqBy([...A.cleared,...b.cleared],f=>f.id+'|'+(f.clearedAt||''));
   const cid=new Set(cleared.map(f=>f.id));v={active:uniqBy([...A.active,...b.active],f=>f.id).filter(f=>!cid.has(f.id)),cleared};}
  else if(name==='equity-marks.json'){const marks=new Map();for(const m of [...(a?a.marks:[]),...b.marks]){const o=marks.get(m.date);if(!o||String(o.at)<String(m.at))marks.set(m.date,m);}
   v=Object.assign({},b,{genesis:(a&&a.genesis)||b.genesis,marks:[...marks.values()].sort((x,y)=>x.date<y.date?-1:1).slice(-60)});}
  else if(name==='trigger-registry.json')v=mergeRegistry(a,b);
  else if(isArr(b)&&(a===undefined||isArr(a))){v=uniqBy([...(a||[]),...b],x=>JSON.stringify(x));if(name==='runs.json')v.sort((x,y)=>String(x.start)<String(y.start)?-1:1);}
  else v=b;
  if(JSON.stringify(v)!==JSON.stringify(a))out[name]=v;}
 return out;}
/* 7.2.16-dev (PROPOSAL-SCHED-03): سجل البوابة اتحاد حسب runId/runAttempt — لا يُستبدل ولا يُفقد قيد. القيد المطابق حرفيًا لا يتكرر.
   المفتاح نفسه بقرار (action) مختلف ⇒ القيدان يبقيان + تعارض صريح في conflicts[] (يومه وخانته) ⇒ البوابة protect والحارس «غير مثبت». بنية خاطئة ⇒ خطأ (الوحدة غير مستعادة). */
const regOk=x=>isObj(x)&&isArr(x.entries);
const regKey=e=>(isObj(e)&&e.runId!=null&&String(e.runId)!=='')?String(e.runId)+'|'+String(+e.runAttempt||1):null;
function mergeRegistry(a,b){if(!regOk(b))throw new Error('trigger-registry.json في artifact ببنية خاطئة');if(a!==undefined&&!regOk(a))throw new Error('trigger-registry.json الحالي ببنية خاطئة');
 const A=a||{v:b.v||1,entries:[]};const entries=A.entries.slice();const seen=new Set(entries.map(e=>JSON.stringify(e)));
 const conflicts=uniqBy([].concat(isArr(A.conflicts)?A.conflicts:[],isArr(b.conflicts)?b.conflicts:[]),x=>JSON.stringify(x));
 for(const e of b.entries){const j=JSON.stringify(e);if(seen.has(j))continue;const k=regKey(e);
  if(k){const same=entries.filter(x=>regKey(x)===k);const acts=[...new Set(same.map(x=>x&&x.action).concat([e&&e.action]))];
   if(same.length&&acts.length>1&&!conflicts.some(c=>c&&c.key===k&&JSON.stringify(c.actions)===JSON.stringify(acts)))
    conflicts.push({key:k,runId:String(e.runId),runAttempt:+e.runAttempt||1,actions:acts,tradingDay:e.tradingDay||(same[0]&&same[0].tradingDay)||null,slot:e.slot||(same[0]&&same[0].slot)||null,detectedBy:'state_guard '+VERSION,
     note:'قيدان للتشغيل والمحاولة نفسهما بقرارين مختلفين — حُفظ الاثنان؛ لا دخول في هذه الخانة، والحالة غير مثبتة حتى يراجعها صالح'});}
  entries.push(e);seen.add(j);}
 const out=Object.assign({},A,{v:A.v||b.v||1,entries});if(conflicts.length)out.conflicts=conflicts;else delete out.conflicts;return out;}
/* توافق مع 7.2.9: دمج مجلد في مجلد (يفحص أولًا؛ يرمي خطأ عند أي مشكلة) */
function mergeState(dst,src){const C=inspectState(dst),A=inspectState(src);if(!C.ok||!A.ok)throw new Error('حالة غير سليمة: '+C.problems.concat(A.problems).join('، '));
 const ch=mergeValues(C.files,A.files);for(const [n,v] of Object.entries(ch))writeJ(path.join(dst,n),v);return Object.keys(ch);}
/* ---------- 7.2.16-dev (DEV-SAVE-04): اتحاد أدلة الحوادث والتقارير من artifact ---------- */
const sha256=b=>crypto.createHash('sha256').update(b).digest('hex');
/* ملفات عادية فقط (مع المجلدات الفرعية)؛ رابط رمزي أو ملف خاص ⇒ خطأ (لا استعادة جزئية صامتة) */
function listFiles(dir){const out=[];const walk=(d,rel)=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const r=rel?rel+'/'+e.name:e.name;const p=path.join(d,e.name);
  if(e.isSymbolicLink())throw new Error('رابط رمزي في artifact: '+r);if(e.isDirectory())walk(p,r);else if(e.isFile())out.push(r);else throw new Error('ملف غير عادي في artifact: '+r);}};
 walk(dir,'');return out.sort();}
/* في reports: ملفات العرض التي يعيد كل تشغيل كتابتها (لا تُعد تعارضًا؛ تبقى المحلية). غيرها حساس (علامات الحادثة والحسم وتقارير التشغيل) */
const VOLATILE_REPORT=n=>n==='status.json'||n==='s08-validation.json'||/^recon-\d{4}-\d{2}-\d{2}\.json$/.test(n);
/* 7.2.17-dev (DEV-SAVE-05): أسماء سجلات الاستعادة. الاسم المستقل يحمل هوية العملية (الوحدة + الحارس الذي استعادها). */
const manifestName=(uRun,uAtt,gRun,gAtt)=>'restore-manifest-'+uRun+'-'+uAtt+'-by-'+gRun+'-'+gAtt+'.json';
const LEGACY_MANIFEST=/^restore-manifest-([^/]+)-(\d+)\.json$/;
/* سجل استعادة بالاسم القديم (7.2.16) من الـartifact يختلف عن المحلي: إن كانت هويته مقروءة ومطابقة لاسمه ⇒ اسمه المستقل، وإلا null (يبقى تعارضًا) */
function distinctManifestName(rel,buf){if(rel.includes('/')||!LEGACY_MANIFEST.test(rel)||/-by-/.test(rel))return null;let v;try{v=JSON.parse(buf.toString('utf8'));}catch(e){return null;}
 if(!isObj(v)||v.kind!=='state-guard-restore'||!isObj(v.unit)||!isObj(v.guardRun))return null;const u=v.unit,g=v.guardRun;
 const uRun=String(u.runId==null?'':u.runId),uAtt=+u.runAttempt||0,gRun=String(g.runId==null?'':g.runId),gAtt=+g.runAttempt||0;
 if(!/^[A-Za-z0-9_]+$/.test(uRun)||!/^[A-Za-z0-9_]+$/.test(gRun)||!(uAtt>0)||!(gAtt>0))return null;
 if('restore-manifest-'+uRun+'-'+uAtt+'.json'!==rel)return null;return manifestName(uRun,uAtt,gRun,gAtt);}
function unionRestore(srcDir,dstDir,conflictDir,kind,ctl){const R={copied:[],same:[],conflicts:[],keptLocal:[],distinct:[],files:[]};
 if(!fs.existsSync(srcDir))return R;if(!fs.lstatSync(srcDir).isDirectory())throw new Error(kind+' في artifact ليس مجلدًا');
 for(const rel of listFiles(srcDir)){if(rel.split('/').some(x=>x===''||x==='.'||x==='..'))throw new Error('مسار غير صالح في artifact: '+rel);
  if(kind==='evidence'&&rel.split('/')[0]==='restore-conflicts'){R.files.push({path:rel,status:'skipped-conflict-copy'});continue;} /* نسخ تعارض سابقة تبقى في مكانها الأصلي محليًا إن وُجدت */
  const buf=fs.readFileSync(path.join(srcDir,rel));const h=sha256(buf);const dst=path.join(dstDir,rel);
  if(ctl&&ctl.expired)throw new TimeoutError('انتهت الميزانية أثناء استعادة الأدلة');
  if(!fs.existsSync(dst)){fs.mkdirSync(path.dirname(dst),{recursive:true});fs.writeFileSync(dst,buf,{flag:'wx'});
   if(sha256(fs.readFileSync(dst))!==h)throw new Error('تحقق النسخ فشل: '+kind+'/'+rel);R.copied.push(rel);R.files.push({path:rel,sha256:h,status:'copied'});continue;}
  const st=fs.lstatSync(dst);const local=st.isFile()?fs.readFileSync(dst):null;
  if(local&&sha256(local)===h){R.same.push(rel);R.files.push({path:rel,sha256:h,status:'same'});continue;}
  if(kind==='reports'&&!rel.includes('/')&&VOLATILE_REPORT(rel)){R.keptLocal.push(rel);R.files.push({path:rel,sha256:h,status:'kept-local'});continue;}
  /* 7.2.17-dev (DEV-SAVE-05): سجل استعادة قديم الاسم مختلف = عملية استعادة أخرى ⇒ يُحفظ باسمه المستقل (لا تعارض)، إلا إن كان الاسم المستقل موجودًا بمحتوى آخر */
  const alt=kind==='evidence'?distinctManifestName(rel,buf):null;
  if(alt){const adst=path.join(dstDir,alt);
   if(!fs.existsSync(adst)){fs.writeFileSync(adst,buf,{flag:'wx'});if(sha256(fs.readFileSync(adst))!==h)throw new Error('تحقق النسخ فشل: '+kind+'/'+alt);
    R.distinct.push(alt);R.files.push({path:rel,sha256:h,status:'distinct-record',savedAs:alt,localSha256:local?sha256(local):null});continue;}
   const al=fs.lstatSync(adst).isFile()?fs.readFileSync(adst):null;
   if(al&&sha256(al)===h){R.same.push(rel);R.files.push({path:rel,sha256:h,status:'same-as-distinct-record',savedAs:alt});continue;}}
  const cdst=path.join(conflictDir,kind,rel);fs.mkdirSync(path.dirname(cdst),{recursive:true});fs.writeFileSync(cdst,buf);
  if(sha256(fs.readFileSync(cdst))!==h)throw new Error('تحقق نسخة التعارض فشل: '+kind+'/'+rel);
  R.conflicts.push(rel);R.files.push({path:rel,sha256:h,status:'conflict',localSha256:local?sha256(local):null});}
 return R;}
/* حوادث الحفظ التي يحملها الـartifact (نفس تعريف المنفّذ scanSaveIncidents): علامات save-incident-<id>.json في evidence وreports،
   ودليل run-record-failed-<id>.json في evidence، وتقرير تشغيل مُستعاد saveStatus.status=incomplete-evidence. الحسم: سجل .resolved.json صالح
   (في الـartifact أو محليًا) أو علم runrec-<id> مرفوع. ملف حادثة تالف = حادثة مفتوحة. */
function restoredIncidents(aEv,aRep,cEv,cRep,copiedReports,cleared){const found=new Map(),resolved=new Set();
 const add=(id,where)=>{if(!id)return;(found.get(id)||found.set(id,[]).get(id)).push(where);};
 const names=d=>{try{return fs.readdirSync(d);}catch(e){return[];}};
 for(const [d,label,isRep] of [[aEv,'artifact:state/evidence',false],[aRep,'artifact:reports',true]])for(const n of names(d)){let m;
  if((m=/^save-incident-(.+)\.resolved\.json$/.exec(n)))continue;
  if((m=/^save-incident-(.+)\.json$/.exec(n))||(!isRep&&(m=/^run-record-failed-(.+)\.json$/.exec(n))))add(m[1],label+'/'+n);}
 for(const n of copiedReports||[]){if(!/-(premarket|postopen|session|overnight)\.json$/.test(n))continue;let t='';try{t=fs.readFileSync(path.join(aRep,n),'utf8');}catch(e){continue;}
  if(t.indexOf('incomplete-evidence')<0)continue;let v=null;try{v=JSON.parse(t);}catch(e){v=null;}const ss=v&&v.saveStatus;if(v&&!(ss&&ss.status==='incomplete-evidence'))continue;
  add((ss&&ss.incidentId)||n.replace(/-(premarket|postopen|session|overnight)\.json$/,''),'artifact:reports/'+n);}
 for(const d of [aEv,aRep,cEv,cRep])for(const n of names(d)){const m=/^save-incident-(.+)\.resolved\.json$/.exec(n);if(!m)continue;
  let v=null;try{v=JSON.parse(fs.readFileSync(path.join(d,n),'utf8'));}catch(e){v=null;}if(v&&v.incidentId===m[1]&&v.resolvedAt)resolved.add(m[1]);}
 for(const f of cleared||[]){const m=/^runrec-(.+)$/.exec(String(f&&f.id||''));if(m)resolved.add(m[1]);}
 const open=[];for(const [id,where] of found)if(!resolved.has(id))open.push({id,where});return{open,resolved:[...found.keys()].filter(id=>resolved.has(id))};}
const anchorIncomplete=a=>!!a&&(a.incomplete===true||a.incomplete==='true'||(+a.openSaveIncidents||0)>0||a.pairVerified===false||((+a.anchorSchema||0)>=2&&a.pairVerified!==true));
function findStateDir(root){const c=[path.join(root,'state'),path.join(root,'runner','state')];for(const d of c)if(fs.existsSync(d))return d;
 for(const e of fs.readdirSync(root,{withFileTypes:true}))if(e.isDirectory()){const r=findStateDir(path.join(root,e.name));if(r)return r;}return null;}
const keyCmp=(a,b)=>a[0]-b[0]||a[1]-b[1];
async function guardCore(o,ctl){const env=o.env||process.env;const fetchFn=o.fetch||globalThis.fetch;const stateDir=o.stateDir;const now=o.now||(()=>Date.now());
 const api=(env.GITHUB_API_URL||'https://api.github.com').replace(/\/$/,'');const repo=env.GITHUB_REPOSITORY;
 const runId=String(env.GITHUB_RUN_ID||'');const runNumber=+env.GITHUB_RUN_NUMBER||0;const runAttempt=+env.GITHUB_RUN_ATTEMPT||1;
 const wf=env.STATE_GUARD_WORKFLOW||'smarttrader-runner.yml';const H={Authorization:'Bearer '+(env.GITHUB_TOKEN||''),Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
 const res={tool:'state_guard '+VERSION,runId,runNumber,runAttempt,at:new Date(now()).toISOString(),anchor:null,checked:[],lost:[],recovered:[],unresolved:[],ok:false,reason:null};
 /* O02: مهلة واحدة تغطي الطلب وقراءة الجسم؛ AbortSignal للطلب الحقيقي، وسباق مع مؤقت حتى لو تجاهل الطرف الآخر الإلغاء */
 const REQ_MS=numEnv(env,'STATE_GUARD_REQUEST_MS',10000);
 const timed=(u,read)=>{const ac=typeof AbortController!=='undefined'?new AbortController():null;let tm;
  const work=(async()=>{const r=await fetchFn(u,{headers:H,signal:ac?ac.signal:undefined});if(!r||!r.ok)throw new Error('GitHub API '+(r&&r.status)+' '+u.replace(api,''));return read(r);})();work.catch(()=>{});
  return Promise.race([work,new Promise((_,rej)=>{tm=setTimeout(()=>{try{ac&&ac.abort();}catch(e){}rej(new TimeoutError('مهلة '+REQ_MS+'ms للطلب أو قراءة الرد: '+u.replace(api,'').slice(0,90)));},REQ_MS);})]).finally(()=>clearTimeout(tm));};
 const getJSON=u=>timed(u,r=>r.json()),getBuf=u=>timed(u,async r=>Buffer.from(await r.arrayBuffer()));
 try{
  if(!repo||!runId||!runNumber)throw new Error('متغيرات GitHub غير متاحة (GITHUB_REPOSITORY/GITHUB_RUN_ID/GITHUB_RUN_NUMBER)');
  /* الحالة الحالية نفسها يجب أن تكون سليمة قبل أي حكم */
  const CUR=inspectState(stateDir);if(!CUR.ok)throw new Error('ملفات الحالة الحالية تالفة: '+CUR.problems.join('، '));
  const anchor=CUR.files['last-saved.json']||null;res.anchor=anchor;
  if(anchor&&(anchor.incomplete===true||anchor.incomplete==='true'||(+anchor.openSaveIncidents||0)>0))
   res.unresolved.push({id:anchor.runId||null,attempt:+anchor.runAttempt||null,why:'المرساة last-saved.json تشير إلى حادثة حفظ غير محسومة (incomplete=true، runOutcome='+(anchor.runOutcome||'?')+') — الحفظ تم لكن الحالة غير مكتملة؛ لا دخول حتى يراجعها صالح ويشغّل clear-flags'});
  /* 7.2.15-dev (DEV-SAVE-03): مرساة ≥7.2.15 بلا إثبات الزوج، أو أي مرساة تقول pairVerified=false ⇒ غير مثبتة */
  if(anchor&&(anchor.pairVerified===false||((+anchor.anchorSchema||0)>=2&&anchor.pairVerified!==true)))
   res.unresolved.push({id:anchor.runId||null,attempt:+anchor.runAttempt||null,why:'المرساة لا تثبت اتساق سجل التشغيل وتقريره وإيصال الحفظ (pairVerified='+JSON.stringify(anchor.pairVerified===undefined?null:anchor.pairVerified)+(Array.isArray(anchor.problems)&&anchor.problems.length?'؛ '+anchor.problems.slice(0,3).join('، '):'')+') — لا دخول حتى يراجعها صالح ويشغّل clear-flags'});
  const aKey=[anchor&&+anchor.runNumber||0,anchor?(+anchor.runAttempt||1):0];const meKey=[runNumber,runAttempt];
  /* سرد التشغيلات حتى المرساة */
  const runs=[];let covered=false;
  for(let page=1;page<=5&&!covered;page++){const j=await getJSON(`${api}/repos/${repo}/actions/workflows/${wf}/runs?per_page=100&page=${page}`);const rs=j.workflow_runs||[];
   runs.push(...rs);if(!rs.length||rs.some(r=>r.run_number<aKey[0])||rs.length<100)covered=true;}
  if(!covered)throw new Error('تعذر تغطية كل التشغيلات بعد المرساة (أكثر من 500)');
  if(!runs.some(r=>String(r.id)===runId))runs.push({id:+runId||runId,run_number:runNumber,run_attempt:runAttempt,status:'in_progress'}); /* التشغيل الحالي قد لا يظهر بعد */
  const units=[];
  for(const r of runs){if(r.run_number<aKey[0])continue;const mine=String(r.id)===runId;const attempts=mine?runAttempt-1:(+r.run_attempt||1);
   if(!mine&&r.status!=='completed'){if(['queued','waiting','pending','requested'].includes(r.status))continue; /* لم يبدأ: لا حالة */
    res.unresolved.push({id:r.id,why:'تشغيل آخر غير مكتمل ('+r.status+')'});continue;}
   for(let n=1;n<=attempts;n++){const k=[r.run_number,n];if(keyCmp(k,aKey)<=0||keyCmp(k,meKey)===0)continue;units.push({r,n,k,multi:(mine?runAttempt:attempts)>1});}}
  units.sort((x,y)=>keyCmp(x.k,y.k));
  let curFiles=CUR.files;let curRegConflicts=isObj(CUR.files['trigger-registry.json'])&&isArr(CUR.files['trigger-registry.json'].conflicts)?CUR.files['trigger-registry.json'].conflicts.length:0;
  for(const u of units){const r=u.r,n=u.n;const item={id:r.id,number:r.run_number,attempt:n};res.checked.push(item);
   let jobs;try{jobs=(await getJSON(`${api}/repos/${repo}/actions/runs/${r.id}/attempts/${n}/jobs?per_page=100`)).jobs||[];}
   catch(e){item.state='تعذر قراءة الخطوات';res.unresolved.push({id:r.id,attempt:n,why:e.message});continue;}
   if(!jobs.length){item.state='لا job — لم يعمل المنفّذ';continue;}
   const steps=[].concat(...jobs.map(x=>x.steps||[]));const st=nm=>steps.find(s=>s.name===nm);const run=st('Run'),save=st('Save report');
   item.runStep=run?{conclusion:run.conclusion,started:!!run.started_at}:null;item.saveStep=save?save.conclusion:null;
   if(!run){item.state='خطوة Run غير موجودة — غموض';res.unresolved.push({id:r.id,attempt:n,why:'لا معلومات عن خطوة Run'});continue;}
   const notStarted=run.conclusion==='skipped'||(run.conclusion==='cancelled'&&!run.started_at)||(!run.started_at&&!run.conclusion);
   if(notStarted){item.state='لم يعمل المنفّذ ('+(run.conclusion||'لم يبدأ')+')';continue;}
   if(save&&save.conclusion==='success'){item.state='حُفظ';continue;}
   item.state='عمل المنفّذ ('+run.conclusion+') ولم تُحفظ حالته';res.lost.push({id:r.id,attempt:n});
   try{const aj=await getJSON(`${api}/repos/${repo}/actions/runs/${r.id}/artifacts?per_page=100`);const arts=(aj.artifacts||[]).filter(a=>!a.expired);
    let art=arts.find(a=>a.name===`report-${r.id}-${n}`);let legacy=false;
    if(!art&&!u.multi){art=arts.find(a=>a.name===`report-${r.id}`);legacy=!!art;}
    if(!art)throw new Error(u.multi?`لا artifact report-${r.id}-${n} (تشغيل بعدة محاولات: الاسم القديم لا يكفي للربط بالمحاولة)`:`لا artifact report-${r.id}`);
    const z=await getBuf(art.archive_download_url);
    const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'stguard-'));fs.writeFileSync(path.join(tmp,'a.zip'),z);
    try{cp.execFileSync('unzip',['-q','-o',path.join(tmp,'a.zip'),'-d',path.join(tmp,'x')],{stdio:'pipe'});}
    catch(e){cp.execFileSync('python3',['-m','zipfile','-e',path.join(tmp,'a.zip'),path.join(tmp,'x')],{stdio:'pipe'});}
    const sd=findStateDir(path.join(tmp,'x'));if(!sd)throw new Error('artifact بلا مجلد state');
    const A=inspectState(sd);if(!A.ok)throw new Error('artifact تالف: '+A.problems.join('، '));
    const id=A.files['last-run.json'];
    if(id){if(String(id.runId)!==String(r.id)||(+id.runAttempt||1)!==n)throw new Error('هوية artifact لا تطابق التشغيل '+r.id+' المحاولة '+n);}
    else if(u.multi)throw new Error('artifact بلا last-run.json لتشغيل بعدة محاولات — لا يمكن ربطه بالمحاولة');
    const missing=REQUIRED.filter(f=>f in curFiles&&!(f in A.files));if(missing.length)throw new Error('artifact ناقص: '+missing.join('، '));
    const absent=OPTIONAL.filter(f=>f in curFiles&&!(f in A.files));
    const ch=mergeValues(curFiles,A.files);if(ctl.expired)throw new TimeoutError('انتهت الميزانية قبل الدمج — لم يُكتب شيء');for(const [nm,v] of Object.entries(ch)){writeJ(path.join(stateDir,nm),v);curFiles=Object.assign({},curFiles,{[nm]:v});}
    /* 7.2.16-dev (DEV-SAVE-04): اتحاد state/evidence وreports من الـartifact (يشمل تقارير السجلات المستعادة كما في 7.2.15، وعلامات الحادثة وسجلات الحسم ونسخ
       التقارير غير المكتوبة والتقارير التي لا يشير إليها إلا الحادثة). لا كتابة فوق موجود، ولا حذف. أي فشل ⇒ استثناء ⇒ الوحدة غير مثبتة. */
    const unitProblems=[];const cRep=o.reportsDir||path.join(stateDir,'..','reports');const aRoot=path.dirname(sd);const aEv=path.join(sd,EVIDENCE_DIR),aRep=path.join(aRoot,'reports'),cEv=path.join(stateDir,EVIDENCE_DIR);
    const cfDir=path.join(cEv,'restore-conflicts',String(r.id)+'-'+n);
    const EV=unionRestore(aEv,cEv,cfDir,'evidence',ctl);const RP=unionRestore(aRep,cRep,cfDir,'reports',ctl);const restoredReports=RP.copied.filter(x=>!x.includes('/'));
    if(EV.conflicts.length||RP.conflicts.length)unitProblems.push('تعارض بين أدلة الـartifact والأدلة المحلية لملفات بالاسم نفسه ('+EV.conflicts.map(x=>'state/evidence/'+x).concat(RP.conflicts.map(x=>'reports/'+x)).slice(0,6).join('، ')+') — حُفظت النسختان (state/evidence/restore-conflicts/'+r.id+'-'+n+')؛ لا دخول حتى يراجعها صالح ويشغّل clear-flags');
    /* حوادث الحفظ المستعادة غير المحسومة ⇒ الوحدة غير مثبتة (استعادة ملفات سليمة لا تعني الحسم) */
    let curFlags=null;try{curFlags=JSON.parse(fs.readFileSync(path.join(stateDir,'flags.json'),'utf8'));}catch(e){curFlags=null;}
    const INC=restoredIncidents(aEv,aRep,cEv,cRep,RP.copied,curFlags&&isArr(curFlags.cleared)?curFlags.cleared:[]);
    if(INC.open.length)unitProblems.push('الـartifact يحمل حادثة حفظ غير محسومة ('+INC.open.map(x=>x.id).slice(0,5).join('، ')+') — استُعيدت أدلتها، ولا دخول حتى يراجعها صالح ويشغّل clear-flags');
    /* مرساة الـartifact الخاصة بهذه المحاولة تقول «غير مكتمل» ⇒ تُحترم */
    const aAnchor=A.files['last-saved.json'];const anchorMine=aAnchor&&String(aAnchor.runId)===String(r.id)&&(+aAnchor.runAttempt||1)===n;
    if(anchorMine&&anchorIncomplete(aAnchor))unitProblems.push('مرساة الـartifact لهذه المحاولة تقول إن حفظها غير مكتمل (incomplete='+JSON.stringify(aAnchor.incomplete)+'، pairVerified='+JSON.stringify(aAnchor.pairVerified===undefined?null:aAnchor.pairVerified)+'، حوادث='+(+aAnchor.openSaveIncidents||0)+') — لا دخول حتى clear-flags');
    /* تعارض جديد في سجل البوابة */
    const regBefore=curRegConflicts;const regNow=isObj(curFiles['trigger-registry.json'])&&isArr(curFiles['trigger-registry.json'].conflicts)?curFiles['trigger-registry.json'].conflicts.length:0;curRegConflicts=regNow;
    if(regNow>regBefore)unitProblems.push('تعارض في سجل البوابة trigger-registry.json (قيدان للتشغيل والمحاولة نفسهما بقرارين مختلفين) — حُفظ الاثنان؛ لا دخول حتى المراجعة');
    const manifest={kind:'state-guard-restore',manifestSchema:2,tool:'state_guard '+VERSION,at:res.at,guardRun:{runId,runAttempt},unit:{runId:String(r.id),runNumber:r.run_number,runAttempt:n},artifact:art.name,
     identity:id?'last-run.json':'run id from GitHub API (single attempt)',evidence:EV.files,reports:RP.files,openIncidents:INC.open,resolvedIncidents:INC.resolved,artifactAnchor:anchorMine?aAnchor:null,problems:unitProblems,
     note:'سجل استعادة: لا يحذف شيئًا ولا يحسم شيئًا. الحسم فقط بأمر clear-flags من صالح.'};
    /* 7.2.17-dev (DEV-SAVE-05): سجل مستقل لكل عملية استعادة؛ كتابة حصرية — لا كتابة فوق سجل موجود أبدًا */
    let manifestFile=null;try{fs.mkdirSync(cEv,{recursive:true});const base=manifestName(String(r.id),n,runId,runAttempt);const body=JSON.stringify(manifest,null,1);
     for(let k=1;k<=50&&!manifestFile;k++){const nm=k===1?base:base.replace(/\.json$/,'-'+k+'.json');try{fs.writeFileSync(path.join(cEv,nm),body,{flag:'wx'});manifestFile=nm;}catch(e){if(e.code!=='EEXIST')throw e;}}
     if(!manifestFile)throw new Error('أسماء سجل الاستعادة مستخدمة كلها');}catch(e){unitProblems.push('تعذر كتابة سجل الاستعادة: '+e.message);}
    res.recovered.push({id:r.id,number:r.run_number,attempt:n,artifact:art.name,identity:id?'last-run.json':'معرّف التشغيل من GitHub API (محاولة واحدة)',legacyName:legacy,changed:Object.keys(ch),absentOptional:absent,restoredReports,
     manifest:manifestFile?EVIDENCE_DIR+'/'+manifestFile:null,evidence:{copied:EV.copied.length,same:EV.same.length,distinctRecords:EV.distinct,conflicts:EV.conflicts},reports:{copied:RP.copied.length,same:RP.same.length,keptLocal:RP.keptLocal.length,conflicts:RP.conflicts},openIncidents:INC.open.map(x=>x.id),artifactAnchorIncomplete:!!(anchorMine&&anchorIncomplete(aAnchor))});
    for(const why of unitProblems)res.unresolved.push({id:r.id,attempt:n,why});}
   catch(e){res.unresolved.push({id:r.id,attempt:n,why:e.message});}}
  res.ok=!res.unresolved.length;
  res.reason=res.ok?(res.recovered.length?'استُعيدت حالة '+res.recovered.length+' وحدة لم تُحفظ':'لا تشغيل سابق فقد حالته'):'حالة لم تُثبت: '+res.unresolved.map(u=>'#'+u.id+(u.attempt?'/'+u.attempt:'')+' ('+u.why+')').join('، ');}
 catch(e){res.ok=false;res.reason='تعذر التحقق من استمرارية الحالة: '+e.message;res.unresolved.push({id:null,why:e.message});}
 return res;}
/* يكتب علم state-stale (إن لزم) وcontinuity.json مرة واحدة. الملف الفعال التالف يُحفظ دليلًا في state/evidence ثم يُستبدل بأعلام سليمة فيها العلم. */
function finalize(stateDir,res){
 if(!res.ok){const f=path.join(stateDir,'flags.json');const r=readStrict(f);let F=r.ok&&SCHEMA['flags.json'](r.value||{active:[],cleared:[]})?(r.value||{active:[],cleared:[]}):null;
  if(!F){if(r.exists){try{res.evidence=saveEvidence(stateDir,'flags.json',f,res.at);}catch(e){res.evidence='تعذر حفظ الدليل: '+e.message;}}F={active:[],cleared:[]};}
  const id='stale-'+res.runId+'-'+res.runAttempt;
  if(!F.active.some(x=>x.id===id)){F.active.push({id,kind:'state-stale',at:res.at,detail:{reason:res.reason,unresolved:res.unresolved,evidence:res.evidence||null}});writeJ(f,F);}}
 writeJ(path.join(stateDir,'continuity.json'),res);return res;}
/* O02: ميزانية كلية. عند انتهائها: نتيجة ok=false فورًا، ولا كتابة لاحقة من العمل المتأخر. */
async function guard(o){const env=o.env||process.env;const BUDGET=numEnv(env,'STATE_GUARD_BUDGET_MS',90000);const now=o.now||(()=>Date.now());const ctl={expired:false};let tm;
 const timeout=new Promise(res=>{tm=setTimeout(()=>{ctl.expired=true;res(null);},BUDGET);});
 const core=guardCore(o,ctl).catch(e=>({ok:false,reason:'خطأ داخلي في الحارس: '+e.message,unresolved:[{id:null,why:e.message}],runId:String(env.GITHUB_RUN_ID||''),runAttempt:+env.GITHUB_RUN_ATTEMPT||1,at:new Date(now()).toISOString()}));
 let r=await Promise.race([core,timeout]);clearTimeout(tm);
 if(!r){r={tool:'state_guard '+VERSION,runId:String(env.GITHUB_RUN_ID||''),runNumber:+env.GITHUB_RUN_NUMBER||0,runAttempt:+env.GITHUB_RUN_ATTEMPT||1,at:new Date(now()).toISOString(),
  ok:false,timedOut:true,budgetMs:BUDGET,reason:'تجاوز الحارس ميزانيته الزمنية ('+BUDGET+'ms) — لم تُثبت الاستمرارية؛ لا دخول جديد، والحماية تستمر',checked:[],lost:[],recovered:[],unresolved:[{id:null,why:'timeout'}]};}
 return finalize(o.stateDir,r);}
module.exports={guard,mergeState,inspectState,mergeValues,VERSION,EVIDENCE_DIR,manifestName};
if(require.main===module){(async()=>{const stateDir=path.join(__dirname,'state');const r=await guard({stateDir});
 console.log((r.ok?'✓ ':'✗ ')+'استمرارية الحالة: '+r.reason);if(r.recovered.length)console.log('استُعيد:',JSON.stringify(r.recovered));
 if(!r.ok)console.log('::warning::'+r.reason+' — لا دخول جديد حتى clear-flags (الحماية والمطابقة تستمران)');process.exit(0);})().catch(e=>{console.log('::warning::state_guard: '+e.message);process.exit(0);});} /* O02: لا ينتظر طلبات معلقة */
