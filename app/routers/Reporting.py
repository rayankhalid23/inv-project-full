from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.core.database import get_db
from app.core.deps import RoleChecker
from app.services.Reporting import ReportingService # استيراد الكلاس
from app.services.time_helper import get_report_time_range
from app.models.inventory import Product, ProductVariant

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
    ).join(Product, Product.id == ProductVariant.product_id).first()

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