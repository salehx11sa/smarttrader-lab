#!/bin/bash
# اختيار أمر المختبر. الاستخدام: lab_pick.sh "<manual>" "<RUNNER_MODE>" "<HHMM نيويورك>"
# - RUNNER_MODE غير lab ⇒ lab-status دائمًا (قراءة فقط) — مهما كان الأمر اليدوي، عدا lab-clear-flags.
# - RUNNER_MODE=lab:
#   • اليدوي: lab-status | lab-overnight | lab-postopen | lab-clear-flags يُنفذ كما هو (المحرّك يفرض النوافذ بنفسه)؛ أي شيء آخر ⇒ lab-status.
#   • المجدول: من 16:15 حتى 09:15 ⇒ lab-overnight • من 09:16 حتى 09:34 ⇒ lab-status • من 09:35 حتى 16:14 ⇒ lab-postopen (حماية + cls لليلي).
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
if [ "$H" -ge 1615 ] || [ "$H" -le 915 ]; then echo "lab-overnight"; elif [ "$H" -lt 935 ]; then echo "lab-status"; else echo "lab-postopen"; fi
