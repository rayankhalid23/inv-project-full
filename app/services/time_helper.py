from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta

def get_report_time_range(period: str):
    """
    تقوم هذه الدالة بتحويل الفترة المختارة إلى تاريخ بداية ونهاية.
    الفترات المدعومة: 7d, 1m, 3m, 6m
    """
    end_date = datetime.utcnow()
    
    if period == "7d":
        start_date = end_date - timedelta(days=7)
    elif period == "1m":
        start_date = end_date - relativedelta(months=1)
    elif period == "3m":
        start_date = end_date - relativedelta(months=3)
    elif period == "6m":
        start_date = end_date - relativedelta(months=6)
    else:
        # افتراضياً نرجع بيانات آخر شهر إذا كان المدخل غير معروف
        start_date = end_date - relativedelta(months=1)
    
    # تصفير الساعات والدقائق لبداية اليوم لضمان دقة التقارير
    start_date = start_date.replace(hour=0, minute=0, second=0, microsecond=0)
    
    return start_date, end_date