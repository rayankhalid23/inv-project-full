from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, desc, func
from datetime import datetime, timedelta
from typing import Optional, List
import asyncio
from fastapi import HTTPException, status
from app.models.inventory import InventoryMovement, ProductVariant, ProductColor
from app.models.user import User
from app.services.audit_service import create_inventory_log
from app.crud.inventory_sync import sync_product_metrics

# =====================================================================
# أولاً: وظائف إدارة حركة المخزون الفنية والعمليات المخزنية
# =====================================================================

def record_stock_addition(db: Session, variant_id: int, user_id: int, quantity: int, notes: str = None):
    """ إضافة بضاعة جديدة للمخزن (توريد) """
    variant = db.query(ProductVariant).filter(ProductVariant.id == variant_id).with_for_update().first()
    if not variant:
        raise HTTPException(status_code=404, detail="المتغير غير موجود")

    quantity_before = variant.quantity_available or 0
    variant.quantity_available = quantity_before + quantity
    
    db.add(variant)
    db.flush()
    
    create_inventory_log(
        db=db, 
        variant_id=variant_id, 
        product_id=variant.product_id, 
        user_id=user_id,
        movement_type='add_stock', 
        quantity_change=quantity,
        quantity_before=quantity_before, 
        quantity_after=variant.quantity_available,
        notes=notes
    )
    
    sync_product_metrics(db, variant.product_id)
    return variant


def record_damage_entry(db: Session, variant_id: int, user_id: int, quantity: int, reason: str, notes: str = None):
    """ تسجيل تالف: ينقص من المتاح ويزيد في سجل التوالف """
    variant = db.query(ProductVariant).filter(ProductVariant.id == variant_id).with_for_update().first()
    if not variant:
        raise HTTPException(status_code=404, detail="المتغير غير موجود")

    quantity_before = variant.quantity_available or 0

    if quantity_before < quantity:
        raise HTTPException(status_code=400, detail="الكمية المتاحة في المخزن أقل من المراد إتلافه")

    variant.quantity_available = quantity_before - quantity
    variant.damaged_quantity = (variant.damaged_quantity or 0) + quantity

    db.add(variant)
    db.flush()
    
    create_inventory_log(
        db=db, 
        variant_id=variant_id, 
        product_id=variant.product_id, 
        user_id=user_id,
        movement_type='damage', 
        quantity_change=-quantity,
        quantity_before=quantity_before, 
        quantity_after=variant.quantity_available,
        damage_reason=reason, 
        notes=notes
    )
    
    sync_product_metrics(db, variant.product_id)
    return variant


def record_return_to_stock(db: Session, variant_id: int, user_id: int, quantity: int, order_id: int = None, notes: str = None):
    """ إرجاع بضاعة للمخزن (مرتجع) """
    variant = db.query(ProductVariant).filter(ProductVariant.id == variant_id).with_for_update().first()
    if not variant:
        raise HTTPException(status_code=404, detail="المتغير غير موجود")

    quantity_before = variant.quantity_available or 0
    variant.quantity_available = quantity_before + quantity
    variant.total_sold = max(0, (variant.total_sold or 0) - quantity) 
    variant.returned_quantity = (variant.returned_quantity or 0) + quantity

    db.add(variant)
    db.flush() 

    create_inventory_log(
        db=db, 
        variant_id=variant_id, 
        product_id=variant.product_id, 
        user_id=user_id,
        movement_type='return', 
        quantity_change=quantity,
        quantity_before=quantity_before, 
        quantity_after=variant.quantity_available,
        related_order_id=order_id, 
        notes=notes
    )
    
    sync_product_metrics(db, variant.product_id)
    return variant


def record_manual_adjustment(db: Session, variant_id: int, user_id: int, new_total: int, notes: str):
    """ تعديل يدوي (جرد للكمية المتاحة) """
    variant = db.query(ProductVariant).filter(ProductVariant.id == variant_id).with_for_update().first()
    if not variant:
        raise HTTPException(status_code=404, detail="المتغير غير موجود")

    quantity_before = variant.quantity_available or 0
    diff = new_total - quantity_before
    variant.quantity_available = new_total
    
    db.add(variant)
    db.flush()
    
    create_inventory_log(
        db=db, 
        variant_id=variant_id, 
        product_id=variant.product_id, 
        user_id=user_id,
        movement_type='manual_adjust', 
        quantity_change=diff,
        quantity_before=quantity_before, 
        quantity_after=variant.quantity_available,
        notes=f"جرد يدوي: {notes}"
    )
    
    sync_product_metrics(db, variant.product_id)
    return variant


# =====================================================================
# ثانياً: محركات الاستعلام والفلترة والتقارير المتقدمة (تم حل مشكلة الـ Joinedload)
# =====================================================================

from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy.orm import Session, joinedload

def get_advanced_inventory_ledger(
    db: Session,
    user_id: Optional[int] = None,
    product_id: Optional[int] = None,
    variant_id: Optional[int] = None,
    movement_type: Optional[str] = None,
    order_id: Optional[int] = None,
    time_preset: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    skip: int = 0,
    limit: int = 20
):
    """
    المحرك الذكي الموحد لجلب سجلات المخزون.
    يعتمد على الفحص الديناميكي للعلاقات لمنع أي افتراضات مسبقة لأسماء الكلاسات،
    ومطابق تماماً لأعمدة جدول MySQL الحقيقي.
    """
    
    # 1. بناء الاستعلام الأساسي على موديل حركات المخزون
    query = db.query(InventoryMovement)

    # 2. جلب علاقة المستخدم ديناميكياً إذا كانت معرفة في الموديل
    if hasattr(InventoryMovement, "user"):
        query = query.options(joinedload(InventoryMovement.user))

    # 3. جلب علاقة الـ variant والـ color والـ product ديناميكياً بدون افتراض أسماء الكلاسات
    if hasattr(InventoryMovement, "variant"):
        variant_attr = InventoryMovement.variant
        load_option = joinedload(variant_attr)
        
        try:
            # استخراج الكلاس الحقيقي للـ Variant من الـ Mapper الخاص بـ SQLAlchemy مباشرة
            VariantClass = variant_attr.property.mapper.class_
            
            if hasattr(VariantClass, "color"):
                color_attr = getattr(VariantClass, "color")
                load_option = load_option.joinedload(color_attr)
                
                # استخراج الكلاس الحقيقي للـ Color للوصول إلى المنتج الأب
                ColorClass = color_attr.property.mapper.class_
                if hasattr(ColorClass, "product"):
                    product_attr = getattr(ColorClass, "product")
                    load_option = load_option.joinedload(product_attr)
        except Exception:
            # حماية للمشروع في حال كانت شجرة العلاقات غير مكتملة الربط في ملف الموديلات
            pass
            
        query = query.options(load_option)

    # 4. بناء مصفوفة الفلاتر الديناميكية بناءً على أسماء أعمدة الجدول في الصورة تماماً
    filters = []
    if user_id: 
        filters.append(InventoryMovement.user_id == user_id)
    if product_id: 
        filters.append(InventoryMovement.product_id == product_id)
    if variant_id: 
        filters.append(InventoryMovement.variant_id == variant_id)
    if movement_type: 
        filters.append(InventoryMovement.movement_type == movement_type)
    if order_id: 
        filters.append(InventoryMovement.related_order_id == order_id)

    # 5. إدارة الفلاتر الزمنية بدقة عالية الاعتماد على عمود created_at
    now = datetime.now()
    if time_preset:
        if time_preset == "today":
            filters.append(InventoryMovement.created_at >= now.replace(hour=0, minute=0, second=0, microsecond=0))
        elif time_preset == "week":
            filters.append(InventoryMovement.created_at >= now - timedelta(days=7))
        elif time_preset == "month":
            filters.append(InventoryMovement.created_at >= now - timedelta(days=30))
    elif start_date: 
        filters.append(InventoryMovement.created_at >= start_date)
        
    if end_date: 
        filters.append(InventoryMovement.created_at <= end_date)

    # 6. تنفيذ الاستعلام النهائي مع الترتيب التنازلي والـ Pagination والـ Offset
    return query.filter(*filters)\
                .order_by(InventoryMovement.created_at.desc())\
                .offset(skip)\
                .limit(limit)\
                .all()         
# استبدل دالة تفاصيل الحركة بالتعديل الجديد أيضاً:
def get_movement_details_service(db: Session, movement_id: int):
    """ جلب البطاقة التفصيلية الكاملة لحركة مخزنية معينة عبر سلسلة العلاقات الثلاثية """
    movement = db.query(InventoryMovement).options(
        joinedload(InventoryMovement.user),
        joinedload(InventoryMovement.variant).joinedload(ProductVariant.color).joinedload(ProductColor.product)
    ).filter(InventoryMovement.id == movement_id).first()

    if not movement:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"الحركة ذات الرقم {movement_id} غير موجودة في السجلات"
        )
    return movement
def get_movement_summary(db: Session, month: int = None, year: int = None):
    """ إحصائيات لوحة التحكم الشهرية لنسب الهدر والتالف والمرتجعات المالية """
    now = datetime.now()
    m = month or now.month
    y = year or now.year

    total_added = db.query(func.sum(InventoryMovement.quantity_change))\
        .filter(InventoryMovement.movement_type == 'add_stock',
                func.extract('month', InventoryMovement.created_at) == m,
                func.extract('year', InventoryMovement.created_at) == y).scalar() or 0

    # هنا نستخدم الـ Explicit Join اليدوي وهو يعمل بكفاءة تامة بناءً على الـ Schema الخاصة بك
    damage_data = db.query(
        func.sum(InventoryMovement.quantity_change),
        func.sum(InventoryMovement.quantity_change * Product.cost_price)
    ).join(Product, InventoryMovement.product_id == Product.id)\
     .filter(InventoryMovement.movement_type == 'damage',
             func.extract('month', InventoryMovement.created_at) == m,
             func.extract('year', InventoryMovement.created_at) == y).first()

    total_returns = db.query(func.sum(InventoryMovement.quantity_change))\
        .filter(InventoryMovement.movement_type == 'return',
                func.extract('month', InventoryMovement.created_at) == m,
                func.extract('year', InventoryMovement.created_at) == y).scalar() or 0

    total_added_val = abs(int(total_added))
    total_damaged_val = abs(int(damage_data[0] or 0))
    estimated_loss_val = abs(float(damage_data[1] or 0))
    total_returns_val = abs(int(total_returns))

    return {
        "month": m,
        "year": y,
        "total_added": total_added_val,
        "total_damaged": total_damaged_val,
        "estimated_damage_loss": estimated_loss_val,
        "return_rate": (total_returns_val / total_added_val * 100) if total_added_val != 0 else 0.0
    }


def check_stock_integrity(db: Session, variant_id: int):
    """ نظام كشف التلاعب ومطابقة الجرد الفيزيائي ضد العمليات التاريخية المسجلة """
    variant = db.query(ProductVariant).filter(ProductVariant.id == variant_id).first()
    if not variant:
        raise HTTPException(status_code=404, detail="المتغير غير موجود")
        
    calculated_stock = db.query(func.sum(InventoryMovement.quantity_change))\
        .filter(InventoryMovement.variant_id == variant_id).scalar() or 0
    
    current_stock = variant.quantity_available or 0
    is_match = (current_stock == calculated_stock)
    
    return {
        "variant_id": variant_id,
        "current_in_db": current_stock,
        "calculated_from_history": int(calculated_stock),
        "integrity_status": "MATCH" if is_match else "DISCREPANCY_DETECTED",
        "difference": int(current_stock - calculated_stock)
    }