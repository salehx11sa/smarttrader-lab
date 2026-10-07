/* DailyStrat v1.0 — منطق الدخول والخروج للنسخة المرشحة (PROTOCOL.md).
   ملف واحد يُستخدم حرفيًا في الاختبار التاريخي (Node) وفي المنصة (يُضمَّن كما هو).
   مدخلات: شموع يومية مكتملة [{t:'YYYY-MM-DD',o,h,l,c,v}] مرتبة تصاعديًا. لا شبكة ولا حالة خارجية. */
const DailyStrat=(()=>{
 const VERSION="1.0.1"; /* 1.0.1 (4/10/2026): متوسطات بلا انجراف الفاصلة — نتيجة مستقلة عن بداية النافذة (فرق GDRX). لا تغيير في القواعد. */
 const CONFIGS=[
  {id:"S0",fam:"S0"},
  {id:"S1-x5-h5",fam:"S1",X:5,H:5},{id:"S1-x5-h10",fam:"S1",X:5,H:10},
  {id:"S1-x10-h5",fam:"S1",X:10,H:5},{id:"S1-x10-h10",fam:"S1",X:10,H:10},
  {id:"S2-h5",fam:"S2",H:5},{id:"S2-h10",fam:"S2",H:10},
  {id:"S3-l20-h10",fam:"S3",L:20,H:10},{id:"S3-l20-h20",fam:"S3",L:20,H:20},
  {id:"S3-l50-h10",fam:"S3",L:50,H:10},{id:"S3-l50-h20",fam:"S3",L:50,H:20}
 ];
 const UNIVERSES={
  "U-LOW":{minPx:1,maxPx:15,minAdv:2e6,minBars:250,costSide:0.0020},
  "U-LIQ":{minPx:5,maxPx:Infinity,minAdv:20e6,minBars:250,costSide:0.0005}
 };
 /* المتوسط المتحرك: جمع متدحرج بأعداد صحيحة (القيمة × 1e6 مقربة) ⇒ الجمع دقيق تمامًا فلا يتوقف الناتج على أول شمعة في النافذة.
    القيم الكبيرة (قيمة التداول) تتجاوز دقة الأعداد الصحيحة ⇒ تُجمع مباشرة على النافذة (n ≤ 20). */
 function sma(a,n){const r=new Float64Array(a.length).fill(NaN);
  let big=false;for(let i=0;i<a.length;i++)if(Math.abs(a[i])*1e6*n>9e15){big=true;break;}
  if(big){for(let i=n-1;i<a.length;i++){let s=0;for(let k=i-n+1;k<=i;k++)s+=a[k];r[i]=s/n;}return r;}
  let s=0;const q=new Float64Array(a.length);for(let i=0;i<a.length;i++)q[i]=Math.round(a[i]*1e6);
  for(let i=0;i<a.length;i++){s+=q[i];if(i>=n)s-=q[i-n];if(i>=n-1)r[i]=s/n/1e6;}return r;}
 /* RSI بتنعيم Wilder */
 function rsi(c,n){const r=new Float64Array(c.length).fill(NaN);let g=0,l=0;
  for(let i=1;i<c.length;i++){const d=c[i]-c[i-1],up=d>0?d:0,dn=d<0?-d:0;
   if(i<=n){g+=up;l+=dn;if(i===n){g/=n;l/=n;r[i]=l===0?100:100-100/(1+g/l);}}
   else{g=(g*(n-1)+up)/n;l=(l*(n-1)+dn)/n;r[i]=l===0?100:100-100/(1+g/l);}}
  return r;}
 function atr(b,n){const r=new Float64Array(b.length).fill(NaN);let a=0;
  for(let i=1;i<b.length;i++){const tr=Math.max(b[i].h-b[i].l,Math.abs(b[i].h-b[i-1].c),Math.abs(b[i].l-b[i-1].c));
   if(i<=n){a+=tr;if(i===n){a/=n;r[i]=a;}}else{a=(a*(n-1)+tr)/n;r[i]=a;}}
  return r;}
 function ind(b){
  const c=Float64Array.from(b,x=>x.c),v=Float64Array.from(b,x=>x.v),dv=Float64Array.from(b,x=>x.c*x.v);
  const hc20=new Float64Array(b.length).fill(NaN),hc50=new Float64Array(b.length).fill(NaN);
  for(let i=0;i<b.length;i++){if(i>=19){let m=-Infinity;for(let k=i-19;k<=i;k++)m=Math.max(m,c[k]);hc20[i]=m;}
   if(i>=49){let m=-Infinity;for(let k=i-49;k<=i;k++)m=Math.max(m,c[k]);hc50[i]=m;}}
  return{c,sma5:sma(c,5),sma20:sma(c,20),sma50:sma(c,50),sma200:sma(c,200),rsi2:rsi(c,2),atr14:atr(b,14),
   adv20:sma(dv,20),vol20:sma(v,20),hc20,hc50,n:b.length};
 }
 function eligible(u,b,I,i){const U=UNIVERSES[u];const c=b[i].c;
  return i+1>=U.minBars&&c>=U.minPx&&c<=U.maxPx&&I.adv20[i]>=U.minAdv&&I.atr14[i]>0;}
 /* إشارة دخول على إغلاق اليوم i — rank أعلى = أولوية أعلى */
 function signal(cfg,b,I,i){
  const c=I.c;if(i<200)return null;
  if(cfg.fam==="S0"){
   if(!(c[i]>I.sma20[i]&&I.sma20[i]>I.sma50[i]))return null;const m5=(c[i]-c[i-5])/c[i-5];
   if(!(m5>0.02&&c[i]>=I.hc20[i]*0.99))return null;return{rank:m5};}
  if(cfg.fam==="S1"){if(!(c[i]>I.sma200[i]&&I.rsi2[i]<cfg.X))return null;return{rank:-I.rsi2[i]};}
  if(cfg.fam==="S2"){const rng=b[i].h-b[i].l;if(!(rng>0))return null;const ibs=(b[i].c-b[i].l)/rng;
   if(!(c[i]>I.sma200[i]&&c[i]<c[i-1]&&c[i-1]<c[i-2]&&c[i-2]<c[i-3]&&ibs<0.25))return null;return{rank:-ibs};}
  if(cfg.fam==="S3"){const hc=cfg.L===20?I.hc20:I.hc50;const vr=I.vol20[i-1]>0?b[i].v/I.vol20[i-1]:0;
   if(!(c[i]>=hc[i]&&vr>=1.5&&c[i]>I.sma50[i]))return null;return{rank:vr};}
  return null;
 }
 /* خطة الصفقة عند الدخول بسعر entry (افتتاح اليوم التالي) — atr من يوم الإشارة */
 function plan(cfg,entry,atrSig){
  if(cfg.fam==="S0"){const stop=entry-Math.max(1.3*atrSig,entry*0.01);return{stop,target:entry+1.5*(entry-stop),maxDays:2,mode:"S0"};}
  return{stop:entry-3*atrSig,target:null,maxDays:cfg.H,mode:cfg.fam};
 }
 /* إدارة يومية لمركز مفتوح: تُستدعى على شمعة اليوم k المكتملة (k ≥ يوم الدخول).
    pos: {entry, stop, target, maxDays, entryIdx, peak, atrSig}
    تعيد: {exit:"stop"|"target"|"gap-stop"|"gap-target", px} (خروج داخل اليوم)
          أو {exitNextOpen:"cond"|"time"|"trail"} أو null. */
 function manage(cfg,pos,b,I,k){
  const x=b[k],held=k-pos.entryIdx+1;
  if(k>pos.entryIdx&&x.o<=pos.stop)return{exit:"gap-stop",px:x.o};
  if(pos.target!=null&&k>pos.entryIdx&&x.o>=pos.target)return{exit:"gap-target",px:x.o};
  if(x.l<=pos.stop)return{exit:"stop",px:pos.stop}; /* لمس الوقف والهدف معًا = الوقف (متحفظ) */
  if(pos.target!=null&&x.h>=pos.target)return{exit:"target",px:pos.target};
  if(cfg.fam==="S0"){if(held>=pos.maxDays)return{exit:"time-close",px:x.c};return null;}
  pos.peak=Math.max(pos.peak||pos.entry,x.c);
  if((cfg.fam==="S1"||cfg.fam==="S2")&&I.c[k]>I.sma5[k])return{exitNextOpen:"cond"};
  if(cfg.fam==="S3"&&I.c[k]<pos.peak-2*I.atr14[k])return{exitNextOpen:"trail"};
  if(held>=pos.maxDays)return{exitNextOpen:"time"};
  return null;
 }
 return{VERSION,CONFIGS,UNIVERSES,ind,eligible,signal,plan,manage,sma,rsi,atr};
})();
if(typeof module!=="undefined"&&module.exports)module.exports=DailyStrat;
