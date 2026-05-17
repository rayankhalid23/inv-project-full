from typing import List, Any, Optional, Dict
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from datetime import datetime
from app.core.database import SessionLocal

from app.core.database import init_db
from app.core.database import get_db
from app.core.deps import get_current_active_user
from app.services import inventory_movement_service as service

from app.models.user import User
from app.models.inventory import Product, ProductVariant,InventoryMovement
from app.schemas.inventory_movement_schema import InventoryMovementRead

from app.schemas.inventory_movement_schema import (
    InventoryMovementRead, 
    StockAddRequest, 
    DamageRecordRequest, 
    ManualReturnRequest,
    MovementResponse
)
from app.services.inventory_movement_service import (
    record_stock_addition,
    record_damage_entry,
    record_return_to_stock,
    record_manual_adjustment
)



router = APIRouter()

@router.post("/add-stock", response_model=MovementResponse, status_code=status.HTTP_201_CREATED)
def add_inventory_stock(
    *,
    db: Session = Depends(get_db),
    stock_in: StockAddRequest,
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    إضافة كمية جديدة للمخزن (توريد بضاعة).
    """
    variant = record_stock_addition(
        db=db,
        variant_id=stock_in.variant_id,
        user_id=current_user.id,
        quantity=stock_in.quantity,
        notes=stock_in.notes
    )
    db.commit() # الحفظ النهائي هنا لضمان الـ Atomicity
    return {
        "status": "success",
        "message": "تم إضافة الكمية للمخزن بنجاح",
        "new_quantity": variant.quantity_available,
        "movement_id": 0 # يمكن جلب معرف الحركة الأخير إذا لزم الأمر
    }

@router.post("/report-damage", response_model=MovementResponse)
def report_product_damage(
    *,
    db: Session = Depends(get_db),
    damage_in: DamageRecordRequest,
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    تسجيل كمية تالفة من منتج معين.
    """
    variant = record_damage_entry(
        db=db,
        variant_id=damage_in.variant_id,
        user_id=current_user.id,
        quantity=damage_in.quantity,
        reason=damage_in.reason,
        notes=damage_in.notes
    )
    db.commit()
    return {
        "status": "success",
        "message": "تم تسجيل التالف وتحديث المخزن",
        "new_quantity": variant.quantity_available,
        "movement_id": 0
    }

@router.post("/return-stock", response_model=MovementResponse)
def return_product_to_inventory(
    *,
    db: Session = Depends(get_db),
    return_in: ManualReturnRequest,
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    إرجاع منتج للمخزن يدوياً (خارج سياق مسح الـ QR للطلبات).
    """
    variant = record_return_to_stock(
        db=db,
        variant_id=return_in.variant_id,
        user_id=current_user.id,
        quantity=return_in.quantity,
        notes=return_in.notes
    )
    db.commit()
    return {
        "status": "success",
        "message": "تم استلام المرتجع وإضافته للمتاح",
        "new_quantity": variant.quantity_available,
        "movement_id": 0
    }

@router.get("/logs", response_model=List[InventoryMovementRead])
def get_inventory_logs(
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    جلب سجل حركات المخزن بالكامل (للرقابة).
    """
    # يفضل أن يكون للأدمن فقط، يمكنك إضافة تحقق هنا
    logs = db.query(InventoryMovement).order_by(InventoryMovement.created_at.desc()).offset(skip).limit(limit).all()
    return logs



@router.get("/ledger", response_model=List[InventoryMovementRead])
def read_inventory_ledger(
    # فلاتر البحث (Query Parameters)
    user_id: Optional[int] = None,
    product_id: Optional[int] = None,
    variant_id: Optional[int] = None,
    movement_type: Optional[str] = None,
    order_id: Optional[int] = None,
    time_preset: Optional[str] = Query(None, description="today, week, month, 3_months"),
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    # معاملات التجزئة (Pagination) - أهم جزء للتحميل التلقائي
    skip: int = Query(0, ge=0), 
    limit: int = Query(20, ge=1, le=100),
    # التأكد من هوية الموظف
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_active_user)
):
    """
    نقطة الوصول لجلب سجل حركات المخزون.
    تستخدم 'skip' لتحديد من أين يبدأ الجلب، و 'limit' لتحديد عدد السجلات.
    """
    movements = get_advanced_inventory_ledger(
        db=db,
        user_id=user_id,
        product_id=product_id,
        variant_id=variant_id,
        movement_type=movement_type,
        order_id=order_id,
        time_preset=time_preset,
        start_date=start_date,
        end_date=end_date,
        skip=skip,
        limit=limit
    )
    return movements


@router.get("/{movement_id}", response_model=InventoryMovementRead)
def read_movement_details(
    movement_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_active_user)
):
    return get_movement_details_service(db, movement_id)




# 1. دالة ملخص الحركات (Analytics)
@router.get("/summary", response_model=Dict[str, Any])
def get_movements_summary(
    month: int = Query(None, ge=1, le=12),
    year: int = Query(None, ge=2020),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_active_user)
):
    """
    عرض أرقام تجميعية: إجمالي المضاف، التالف، ونسبة المرتجعات لشهر محدد.
    """
    return service.get_movement_summary(db, month=month, year=year)


# 2. دالة التحقق من التوافق (Reconciliation)
@router.get("/reconcile/{variant_id}", response_model=Dict[str, Any])
def verify_stock_integrity(
    variant_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_active_user)
):
    
    return service.check_stock_integrity(db, variant_id=variant_id)


