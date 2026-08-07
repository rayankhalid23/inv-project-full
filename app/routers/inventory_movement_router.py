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
from app.schemas.inventory_movement_schema import InventoryMovementRead, PaginatedInventoryMovementResponse

from app.schemas.inventory_movement_schema import (
    InventoryMovementRead, 
    StockAddRequest, 
    DamageRecordRequest, 
    ManualReturnRequest,
    DirectSaleRequest,
    MovementResponse
)
from app.services.inventory_movement_service import (
    record_stock_addition,
    record_damage_entry,
    record_return_to_stock,
    record_direct_sale,
    record_manual_adjustment,get_advanced_inventory_ledger,get_movement_details_service

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

@router.post("/direct-sale", response_model=MovementResponse)
def direct_sale_product(
    *,
    db: Session = Depends(get_db),
    sale_in: DirectSaleRequest,
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    بيع مباشر للمنتج: خصم من المخزون المتاح وإضافة لإجمالي المبيعات.
    """
    variant = record_direct_sale(
        db=db,
        variant_id=sale_in.variant_id,
        user_id=current_user.id,
        quantity=sale_in.quantity,
        notes=sale_in.notes
    )
    db.commit()
    return {
        "status": "success",
        "message": "تم تسجيل البيع المباشر وخصم الكمية من المخزون",
        "new_quantity": variant.quantity_available,
        "movement_id": 0
    }

@router.post("/direct-sale-by-qr", response_model=MovementResponse)
def direct_sale_by_qr(
    qr_code: str = Query(..., description="رمز QR للمنتج"),
    note: str = Query("بيع مباشر عبر الماسح", description="ملاحظة البيع"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    بيع مباشر عبر رمز QR: يبحث عن الـ variant ثم يخصم قطعة واحدة من المخزون.
    """
    from app.models.inventory import ProductVariant
    # ✅ إصلاح BUG-12: فلترة deleted_at لمنع بيع منتجات محذوفة من النظام
    variant = db.query(ProductVariant).filter(
        ProductVariant.qr_code == qr_code,
        ProductVariant.deleted_at.is_(None)
    ).first()
    if not variant:
        raise HTTPException(status_code=404, detail="لم يتم العثور على منتج نشط برمز QR هذا")

    updated_variant = record_direct_sale(
        db=db,
        variant_id=variant.id,
        user_id=current_user.id,
        quantity=1,
        notes=note
    )
    db.commit()
    # جلب ID الحركة الحقيقية
    last_mv = db.query(InventoryMovement).filter(
        InventoryMovement.variant_id == variant.id
    ).order_by(InventoryMovement.id.desc()).first()
    return {
        "status": "success",
        "message": f"تم بيع قطعة من {variant.qr_code} وخصمها من المخزون",
        "new_quantity": updated_variant.quantity_available,
        "movement_id": last_mv.id if last_mv else 0
    }

@router.get("/logs", response_model=List[InventoryMovementRead])
def get_inventory_logs(
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    جلب سجل حركات المخزن بالكامل (للمدير فقط).
    """
    # ✅ إصلاح BUG-13: حماية النقطة لتكون للمدير (رول 1 أو 2) فقط
    if not hasattr(current_user, 'role_id') or current_user.role_id not in [1, 2]:
        raise HTTPException(status_code=403, detail="هذه العملية متاحة للمديرين فقط")
    logs = db.query(InventoryMovement).order_by(InventoryMovement.created_at.desc()).offset(skip).limit(limit).all()
    return logs



@router.get("/ledger")
def read_inventory_ledger(
    user_id: Optional[int] = None,
    product_id: Optional[int] = None,
    variant_id: Optional[int] = None,
    movement_type: Optional[str] = None,
    order_id: Optional[int] = None,
    time_preset: Optional[str] = Query(None, description="today, week, month, 3_months"),
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    search: Optional[str] = None,
    skip: int = Query(0, ge=0), 
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    نقطة الاتصال الموحدة والذكية لجلب سجل الحركات والنظام بالكامل.
    """
    return get_advanced_inventory_ledger(
        db=db,
        user_id=user_id,
        product_id=product_id,
        variant_id=variant_id,
        movement_type=movement_type,
        order_id=order_id,
        time_preset=time_preset,
        start_date=start_date,
        end_date=end_date,
        search=search,
        skip=skip,
        limit=limit
    )

@router.post("/clear-returns")
def clear_returns(
    variant_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    from app.services.inventory_movement_service import clear_returns_service
    return clear_returns_service(db=db, variant_id=variant_id, user_id=current_user.id)

@router.post("/clear-damages")
def clear_damages(
    variant_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    from app.services.inventory_movement_service import clear_damages_service
    return clear_damages_service(db=db, variant_id=variant_id, user_id=current_user.id)

@router.delete("/movement/{movement_id}")
def delete_movement(
    movement_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    from app.services.inventory_movement_service import delete_movement_service
    return delete_movement_service(db=db, movement_id=movement_id, user_id=current_user.id)

@router.get("/summary", response_model=Dict[str, Any])
def get_movements_summary(
    month: int = Query(None, ge=1, le=12),
    year: int = Query(None, ge=2020),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    return get_movement_summary(db, month=month, year=year)

@router.get("/reconcile/{variant_id}", response_model=Dict[str, Any])
def verify_stock_integrity(
    variant_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    return check_stock_integrity(db, variant_id=variant_id)

