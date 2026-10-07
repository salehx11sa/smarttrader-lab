# SmartTrader PAPER LAB 0.1 — مستودع المختبر الورقي

مستودع جديد مقترح: `salehx11sa/smarttrader-lab` (منفصل عن مستودع المنفّذ). **حساب ورقي فقط.**

## ما فيه
| الملف | ما هو |
|---|---|
| `runner/lab.cjs` | المحرّك (الأوامر: lab-overnight، lab-postopen، lab-status، lab-clear-flags) |
| `runner/lab_strats.cjs` | قواعد اللاعبين السبعة والظلال — **مجمّد** |
| `runner/lab-config.json` | الإعداد: تاريخ البداية `labStart` والمراكز القديمة |
| `runner/lab-freeze.json` | بصمات ملفات القواعد. المحرّك يمنع الشراء إن تغيّرت |
| `runner/lab_pick.sh` و`runner/lab_preflight.cjs` | اختيار الأمر حسب الوقت، وفحص ما قبل التشغيل |
| `runner/caps.cjs` و`runner/runner.cjs` و`runner/state_guard.cjs` و`runner/daily_strat.js` | نسخ حرفية من 7.2.19-dev المقبول (السقوف، والحفظ، والحارس، وإشارات S1) |
| `.github/workflows/smarttrader-lab.yml` | 12 خانة: 5 ليل، و3 حماية، و4 إغلاق للّيلي |

## خطوات صالح (بالترتيب)
1. أنشئ المستودع وارفع هذا المجلد كما هو.
2. **Secrets:** `APCA_API_KEY_ID` و`APCA_API_SECRET_KEY` — مفاتيح **الحساب الورقي** نفسها المستعملة في S08. **لا تُنشئ مفاتيح جديدة**، لأن ذلك يُبطل القديمة ويوقف S08.
3. **Variables:** `RUNNER_MODE=lab`. اترك `TRADING_ENABLED` فارغًا أولًا ⇒ تشغيل جاف (لا أوامر). شغّل `lab-status` يدويًا وراجع التقرير.
4. حدد تاريخ البداية في `runner/lab-config.json` ⇒ `"labStart": "2026-10-15"` (مثال).
5. حين تقرر البدء: ضع `TRADING_ENABLED=true` بنفسك.
6. للإيقاف الفوري: `HALT=true` (لا شراء؛ الخروج والحماية مستمران).

## أين أرى النتائج
- اللوحة: `runner/lab-reports/lab-status.json`
- يومي: `runner/lab-reports/daily/<اليوم>/<اللاعب>.json`
- أسبوعي: `runner/lab-reports/weekly/<الأسبوع>/<اللاعب>.md`

## تنبيهات
- GitHub قد يتأخر ساعات. المختبر مصمم لذلك، لكن يومًا بلا أي تشغيل ليلي = لا أوامر افتتاح ذلك اليوم.
- حدود Alpaca الزمنية لأوامر `opg` و`cls` **لم تُتحقق** على الحساب الحقيقي. حدودنا أبكر للاحتياط.
- علم توقف (مثل فرق كمية) يوقف الشراء حتى تراجعه وتشغّل `lab-clear-flags` يدويًا.
