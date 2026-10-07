/* M1 1.0 — زخم مقطعي شهري (S11، البروتوكول v3). ملف واحد يُستخدم حرفيًا في المنفّذ وفي إعادة التشغيل.
   مدخلات: شموع يومية مكتملة بأساس يوم القرار [{t,o,h,l,c,v}] (السعر الأخير = السعر الفعلي). لا شبكة ولا حالة.
   القواعد (مثبتة قبل أي بيانات):
   - الأهلية عند يوم i: ≥ 273 شمعة حتى i • إغلاق ≥ 5$ • متوسط قيمة التداول 20 يومًا ≥ 20 مليون$ • إغلاق > SMA200 • ATR14 > 0.
   - الدرجة = إغلاق(i−21) ÷ إغلاق(i−252) − 1 (بالشموع، أي جلسات). التعادل يُكسر بالرمز أبجديًا.
   - الحجم: 24% من eq، حد النقد، كمية صحيحة للأسفل. الوقف: سعر التعبئة − 3×ATR14 ليوم الإشارة؛ ≤ 0 ⇒ لا دخول.
   - الإبقاء: المملوك يبقى إن كان ترتيبه ≤ 8 بين المؤهلين يوم M؛ غير مؤهل أو ترتيبه > 8 ⇒ بيع. بلا شمعة يوم M ⇒ لا قرار ترتيب (قاعدة التوقف/الشطب). */
const M1Strat=(()=>{
 const VERSION="1.0";
 const P={minBars:273,minPx:5,minAdv:20e6,lookback:252,skip:21,keepRank:8,maxPos:4,posPct:24,atrMult:3};
 function smaExact(x,n){const r=new Float64Array(x.length).fill(NaN);let big=false;for(const v of x)if(Math.abs(v)*1e6*n>9e15){big=true;break;}
  if(big){for(let i=n-1;i<x.length;i++){let s=0;for(let k=i-n+1;k<=i;k++)s+=x[k];r[i]=s/n;}return r;}
  const q=Float64Array.from(x,v=>Math.round(v*1e6));let s=0;for(let i=0;i<x.length;i++){s+=q[i];if(i>=n)s-=q[i-n];if(i>=n-1)r[i]=s/n/1e6;}return r;}
 function atr(b,n){const r=new Float64Array(b.length).fill(NaN);let a=0;
  for(let i=1;i<b.length;i++){const tr=Math.max(b[i].h-b[i].l,Math.abs(b[i].h-b[i-1].c),Math.abs(b[i].l-b[i-1].c));
   if(i<n){a+=tr;continue;}if(i===n){a=(a+tr)/n;}else a=(a*(n-1)+tr)/n;r[i]=a;}return r;}
 function ind(b){const c=Float64Array.from(b,x=>x.c);return{c,sma200:smaExact(c,200),adv20:smaExact(Float64Array.from(b,x=>x.c*x.v),20),atr14:atr(b,14)};}
 /* تقييم سهم عند آخر شمعة في b (يجب أن تكون شمعة اليوم المطلوب) */
 function evaluate(b){const i=b.length-1;if(i+1<P.minBars)return{eligible:false,why:'شموع أقل من '+P.minBars};
  const I=ind(b);const c=b[i].c;
  if(!(c>=P.minPx))return{eligible:false,why:'سعر < 5$'};
  if(!(I.adv20[i]>=P.minAdv))return{eligible:false,why:'قيمة تداول < 20 مليون$'};
  if(!(c>I.sma200[i]))return{eligible:false,why:'تحت SMA200'};
  if(!(I.atr14[i]>0))return{eligible:false,why:'ATR غير صالح'};
  const score=b[i-P.skip].c/b[i-P.lookback].c-1;return{eligible:true,score,close:c,atr:I.atr14[i]};}
 /* ترتيب: [{sym,score,...}] تنازليًا بالدرجة، التعادل أبجديًا */
 function rank(list){return list.slice().sort((a,b)=>b.score-a.score||(a.sym<b.sym?-1:a.sym>b.sym?1:0)).map((x,k)=>Object.assign({},x,{rank:k+1}));}
 function stopFor(entry,atrSig){const v=entry-P.atrMult*atrSig;return +v.toFixed(v<1?4:2);}
 return{VERSION,P,ind,evaluate,rank,stopFor};
})();
if(typeof module!=="undefined")module.exports=M1Strat;
