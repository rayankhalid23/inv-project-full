from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from datetime import datetime
from app.core.database import get_db
from app.core.deps import RoleChecker
from app.services.Reporting import ReportingService # استيراد الكلاس
from app.services.time_helper import get_report_time_range
from app.models.inventory import Product, ProductVariant
from app.services.reports_pdf_generator import ReportsPDFGenerator

router = APIRouter(prefix="/reports", tags=["Reports"])

@router.get("/comprehensive")
async def get_comprehensive_report(
    period: str = "1m", 
    db: Session = Depends(get_db),
    current_user = Depends(RoleChecker([1, 2])) 
):
    start_date, end_date = get_report_time_range(period)
    
    # حساب قيمة المخزون الحالي
    inventory_val = db.query(
        func.sum(ProductVariant.quantity_available * Product.cost_price).label("cost"),
        func.sum(ProductVariant.quantity_available * Product.selling_price).label("sale")
    ).join(ProductVariant.color).join(ProductColor.product)\
     .filter(ProductVariant.deleted_at.is_(None), Product.deleted_at.is_(None)).first()

    perf_data = ReportingService.get_inventory_performance_report(db, start_date, end_date)
    emp_data = ReportingService.get_employee_audit_report(db, start_date, end_date)

    return {
        "summary": {
            "inventory_total_cost": float(inventory_val.cost or 0),
            "inventory_total_sale": float(inventory_val.sale or 0),
            "potential_profit": float((inventory_val.sale or 0) - (inventory_val.cost or 0)),
            "loss_from_damage": perf_data["loss_value"],
            "period": period
        },
        "product_rankings": {
            "top_selling": perf_data["top_selling"],
            "least_selling": perf_data["least_selling"],
            "most_returned": perf_data["top_returns"],
            "most_damaged": perf_data["top_damaged"]
        },
        "employee_performance": emp_data
    }

@router.get("/employee-statistics")
def get_employee_statistics(
    db: Session = Depends(get_db),
    current_user = Depends(RoleChecker([1, 2]))
):
    """
    إحصائيات الموظفين: العدد الإجمالي، عدد المفعلين، عدد المحذوفين، والعدد حسب الرتب (Admin, Manager, Employee).
    """
    try:
        return ReportingService.get_employee_statistics(db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/performance-analytics")
def get_performance_analytics(
    period: Optional[str] = Query(None, description="الفترة الزمنية: 7d, 1m, 3m, 6m"),
    start_date: Optional[str] = Query(None, description="تاريخ البداية مخصص (تنسيق YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="تاريخ النهاية مخصص (تنسيق YYYY-MM-DD)"),
    db: Session = Depends(get_db),
    current_user = Depends(RoleChecker([1, 2]))
):
    """
    تحليل أداء الموظفين: تحديد الموظف الأفضل والأسوأ بناءً على إجمالي العمليات المسجلة،
    مع قائمة مرتبة للموظفين تحتوي على تفاصيل العمليات (إضافة/تعديل/حذف) لكل صنف.
    """
    try:
        from app.services.time_helper import get_report_time_range
        from datetime import datetime
        
        s_date, e_date = None, None
        if period:
            s_date, e_date = get_report_time_range(period)
        else:
            if start_date:
                s_date = datetime.fromisoformat(start_date)
            if end_date:
                e_date = datetime.fromisoformat(end_date)
                
        return ReportingService.get_performance_analytics(db, s_date, e_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="تنسيق التاريخ غير صحيح. يرجى استخدام YYYY-MM-DD")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/export-pdf")
async def export_comprehensive_report_pdf(
    period: str = "7d",
    db: Session = Depends(get_db),
    current_user = Depends(RoleChecker([1, 2]))
):
    try:
        pdf_buffer = await ReportsPDFGenerator.generate_report_pdf(db, period)
        filename = f"Bellagio_Comprehensive_Report_{period}_{datetime.now().strftime('%Y%m%d')}.pdf"
        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        import traceback
        print("ERROR GENERATING REPORTS PDF:")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"فشل تصدير التقرير كـ PDF: {str(e)}")

