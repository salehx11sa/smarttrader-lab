#!/bin/bash
# اختيار أمر المختبر. الاستخدام: lab_pick.sh "<manual>" "<RUNNER_MODE>" "<HHMM نيويورك>"
# - RUNNER_MODE غير lab ⇒ lab-status دائمًا (قراءة فقط) — مهما كان الأمر اليدوي، عدا lab-clear-flags.
# - RUNNER_MODE=lab:
#   • اليدوي: lab-status | lab-overnight | lab-postopen | lab-clear-flags يُنفذ كما هو (المحرّك يفرض النوافذ بنفسه)؛ أي شيء آخر ⇒ lab-status.
#   • المجدول (lab-0.2، OPG-WINDOW-01): من 19:05 حتى 09:15 ⇒ lab-overnight • من 09:16 حتى 09:34 ⇒ lab-status • من 09:35 حتى 16:14 ⇒ lab-postopen (حماية + cls لليلي)
#     • من 16:15 حتى 19:04 ⇒ lab-status (Alpaca ترفض أوامر OPG المرسلة بين 09:28 و19:00 نيويورك؛ كانت lab-overnight في lab-0.1).
#     الأمر اليدوي lab-overnight في 16:15–19:04 يُقبل كما هو: المحرّك يعيد «outside-window» مع معاينة خطة وحماية ومطابقة، بلا أي أمر افتتاح.
# - HALT لا يغيّر الاختيار: المحرّك يمنع كل شراء تحت HALT، والخروج والحماية مستمران (قاعدة المختبر).
M="$1"; MODE="$2"; H="$3"
if [ "$MODE" != "lab" ]; then
  if [ "$M" = "lab-clear-flags" ]; then echo "lab-clear-flags"; else echo "lab-status"; fi; exit 0
fi
case "$M" in
  "") ;;
  lab-status|lab-overnight|lab-postopen|lab-clear-flags) echo "$M"; exit 0 ;;
  *) echo "lab-status"; exit 0 ;;
esac
case "$H" in ''|*[!0-9]*) echo "lab-status"; exit 0 ;; esac
H=$((10#$H))
if [ "$H" -ge 1905 ] || [ "$H" -le 915 ]; then echo "lab-overnight"; elif [ "$H" -lt 935 ]; then echo "lab-status"; elif [ "$H" -le 1614 ]; then echo "lab-postopen"; else echo "lab-status"; fi
