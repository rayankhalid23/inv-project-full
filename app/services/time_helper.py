from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta

# أقدم تاريخ ممكن للنظام — يُستخدم لفترة "الكل" حتى تشمل كل السجلات
# مهما بلغ عمر قاعدة البيانات.
_EPOCH = datetime(2000, 1, 1)


def get_report_time_range(period: str):
    """
    تحويل الفترة المختارة إلى تاريخ بداية ونهاية.
    الفترات المدعومة: 7d, 1m, 3m, 6m, all

    ملاحظتان مهمتان لدقة التقارير:

    1) نستخدم datetime.now() لا datetime.utcnow(). أعمدة التواريخ في قاعدة
       البيانات تُملأ بـ MySQL NOW() أي بتوقيت الخادم المحلي، فكان استعمال
       التوقيت العالمي يجعل نهاية الفترة متأخرة عن الزمن الفعلي بمقدار فرق
       المنطقة الزمنية (ساعتان في ليبيا). النتيجة أن كل عملية تُنفَّذ خلال
       آخر ساعتين كانت تختفي من التقارير حتى يمرّ الفارق.

    2) الفترة "all" لم تكن معالَجة إطلاقاً فكانت تسقط في الفرع الافتراضي
       وتُرجع بيانات شهر واحد. أي أن اختيار "الكل" في الواجهة كان يعرض
       شهراً فقط دون أن يُنبَّه المستخدم.
    """
    end_date = datetime.now()

    normalized = (period or "").strip().lower()

    if normalized == "7d":
        start_date = end_date - timedelta(days=7)
    elif normalized == "1m":
        start_date = end_date - relativedelta(months=1)
    elif normalized == "3m":
        start_date = end_date - relativedelta(months=3)
    elif normalized == "6m":
        start_date = end_date - relativedelta(months=6)
    elif normalized in ("all", "كل", "الكل"):
        start_date = _EPOCH
    else:
        # افتراضياً نرجع بيانات آخر شهر إذا كان المدخل غير معروف
        start_date = end_date - relativedelta(months=1)

    # تصفير الساعات والدقائق لبداية اليوم لضمان دقة التقارير
    start_date = start_date.replace(hour=0, minute=0, second=0, microsecond=0)

    return start_date, end_date
