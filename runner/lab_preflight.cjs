/* SmartTrader PAPER LAB 0.1 — فحص ما قبل التشغيل (لا شبكة، ولا يطبع المفاتيح). يفشل برمز 1 عند أي تركيبة خطرة أو ناقصة. */
'use strict';const fs=require('fs'),path=require('path'),crypto=require('crypto');
function check(env,dir){const out=[];const F=(id,ok,msg)=>out.push({id,ok:!!ok,msg:msg||''});const W=(id,msg)=>out.push({id,ok:true,warn:true,msg});
 let cfg=null;try{cfg=JSON.parse(fs.readFileSync(path.join(dir,'lab-config.json'),'utf8'));F('L1 lab-config.json صالح',true);}catch(e){F('L1 lab-config.json صالح',false,e.message);return{out,mode:null};}
 let L=null,ST=null,CAPS=null;try{L=require(path.join(dir,'lab.cjs'));ST=require(path.join(dir,'lab_strats.cjs'));CAPS=require(path.join(dir,'caps.cjs'));F('L2 المحرّك والقواعد والسقوف تُحمَّل',true,L.VERSION);}catch(e){F('L2 المحرّك والقواعد والسقوف تُحمَّل',false,e.message);return{out,mode:null};}
 for(const f of ['runner.cjs','daily_strat.js','state_guard.cjs',cfg.freezeFile||'lab-freeze.json'])F('L3 ملف موجود: '+f,fs.existsSync(path.join(dir,f)));
 F('L4 LIVE_CAPS كلها null (المال الحقيقي مقفل)',Object.values(CAPS.LIVE_CAPS).every(v=>v===null));
 const src=fs.readFileSync(path.join(dir,'lab.cjs'),'utf8');F('L5 لا عنوان حي في المحرّك',!/https:\/\/api\.alpaca\.markets/.test(src)&&/https:\/\/paper-api\.alpaca\.markets/.test(src));
 /* التجميد */
 let fz=null;try{fz=JSON.parse(fs.readFileSync(path.join(dir,cfg.freezeFile||'lab-freeze.json'),'utf8'));}catch(e){}
 const bad=[];if(fz&&fz.files)for(const [n,h] of Object.entries(fz.files)){let g=null;try{g=crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,n))).digest('hex');}catch(e){}if(g!==h)bad.push(n);}
 F('L6 القواعد مطابقة للتجميد',fz&&fz.files&&Object.keys(fz.files).length>0&&!bad.length,bad.length?'تغيّرت: '+bad.join('، '):'');
 F('L7 المسار المعتمد github-actions',(cfg.approvedPath||'github-actions')==='github-actions');
 const TR=String(env.TRADING_ENABLED||'').toLowerCase()==='true',MODE=String(env.RUNNER_MODE||''),HALT=String(env.HALT||'').toLowerCase()==='true';
 F('L8 المفتاحان موجودان كأسرار',!!(env.APCA_API_KEY_ID&&env.APCA_API_SECRET_KEY));
 if(env.RUNNER_PATH!=null)F('L9 RUNNER_PATH في هذا التشغيل',env.RUNNER_PATH==='github-actions','RUNNER_PATH='+(env.RUNNER_PATH||'(فارغ)'));
 let mode='قراءة فقط';
 if(TR){if(MODE!=='lab')W('L10','TRADING_ENABLED=true بلا RUNNER_MODE=lab ⇒ lab-status فقط (والمحرّك يرفض الإرسال)');else mode='مختبر ورقي (تداول ورقي مفعّل)';
  if(cfg.labStart==null)W('L11','labStart غير محدد ⇒ لا دخول (حماية ومطابقة فقط)');else F('L11 labStart تاريخ صالح',/^\d{4}-\d{2}-\d{2}$/.test(String(cfg.labStart))&&!isNaN(Date.parse(cfg.labStart)),String(cfg.labStart));
  const fb=cfg.foreignBaseline||{};F('L12 المراكز القديمة معرّفة (لا تُمس)',['AMD','CAT','MSFT','NVDA'].every(s=>fb[s]>0),JSON.stringify(fb));
  F('L13 ميزانية كل لاعب 13,000 وعددهم 7',ST.PLAYERS.length===7&&ST.PLAYERS.every(p=>p.budget===13000));
  const cmd=String(env.RUNNER_CMD||'');if(cmd)F('L14 أمر معروف للمختبر',Object.prototype.hasOwnProperty.call(L.COMMANDS,cmd),cmd);}
 if(String(env.ENTRIES_ENABLED||'').toLowerCase()==='false')W('L15','ENTRIES_ENABLED=false ⇒ لا دخول جديد');
 if(HALT)mode='HALT: لا شراء؛ الخروج والحماية والمطابقة مستمرة';
 return{out,mode,version:L.VERSION};}
if(require.main===module){const X=check(process.env,__dirname);for(const c of X.out)console.log((c.ok?(c.warn?'! ':'✓ '):'✗ ')+c.id+(c.msg?' — '+c.msg:''));
 console.log('الوضع: '+(X.mode||'غير معروف')+(X.version?' • المحرّك '+X.version:''));process.exitCode=X.out.every(c=>c.ok)?0:1;}
module.exports={check};
