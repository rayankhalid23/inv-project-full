from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, desc
from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import HTTPException, status
from app.models.inventory import Product, ProductVariant,InventoryMovement
from app.services.audit_service import create_inventory_log
from app.models.user import User
from sqlalchemy import func

# ==========================================
# وظائف إدارة حركة المخزون الفنية
# ==========================================

def sync_product_metrics(db: Session, product_id: int):
    """
    دالة داخلية لضمان مطابقة إجمالي الكميات في جدول Product 
    مع مجموع الكميات في جدول ProductVariant.
    """
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        return

    # حساب المجاميع من كافة المتغيرات (Variants) التابعة للمنتج
    variants = db.query(ProductVariant).filter(ProductVariant.product_id == product_id).all()
    
    product.total_available = sum(v.quantity_available for v in variants)
    product.total_damaged = sum(v.damaged_quantity for v in variants)
    product.total_returns = sum(v.returned_quantity for v in variants)
    product.total_sold = sum(v.total_sold for v in variants)
    # لا نقوم بعمل commit هنا، ننتظر العملية الأساسية

def record_stock_addition(db: Session, variant_id: int, user_id: int, quantity: int, notes: str = None):
    """
    إضافة بضاعة جديدة للمخزن (توريد).
    """
    variant = db.query(ProductVariant).filter(ProductVariant.id == variant_id).with_for_update().first()
    if not variant:
        raise HTTPException(status_code=404, detail="المتغير غير موجود")

    quantity_before = variant.quantity_available
    
    # تحديث الكمية في المتغير
    variant.quantity_available += quantity
    
    # توثيق الحركة في السجلات
    create_inventory_log(
        db=db, variant_id=variant_id, product_id=variant.product_id, user_id=user_id,
        movement_type='add_stock', quantity_change=quantity,
        quantity_before=quantity_before, notes=notes
    )
    
    # مزامنة إجمالي المنتج
    sync_product_metrics(db, variant.product_id)
    return variant

def record_damage_entry(db: Session, variant_id: int, user_id: int, quantity: int, reason: str, notes: str = None):
    """
    تسجيل تالف: ينقص من المتاح ويزيد في سجل التوالف.
    """
    variant = db.query(ProductVariant).filter(ProductVariant.id == variant_id).with_for_update().first()
    if not variant:
        raise HTTPException(status_code=404, detail="المتغير غير موجود")

    if variant.quantity_available < quantity:
        raise HTTPException(status_code=400, detail="الكمية المتاحة أقل من المراد إتلافه")

    quantity_before = variant.quantity_available
    
    # العملية الحسابية
    variant.quantity_available -= quantity
    variant.damaged_quantity += quantity
    
    # توثيق الحركة[cite: 1]
    create_inventory_log(
        db=db, variant_id=variant_id, product_id=variant.product_id, user_id=user_id,
        movement_type='damage', quantity_change=-quantity,
        quantity_before=quantity_before, damage_reason=reason, notes=notes
    )
    
    sync_product_metrics(db, variant.product_id)
    return variant

def record_return_to_stock(db: Session, variant_id: int, user_id: int, quantity: int, order_id: int = None, notes: str = None):
    """
    إعادة قطعة للمخزن (مرتجع): يزيد المتاح ويزيد سجل المرتجعات.
    """
    variant = db.query(ProductVariant).filter(ProductVariant.id == variant_id).with_for_update().first()
    if not variant:
        raise HTTPException(status_code=404, detail="المتغير غير موجود")

    quantity_before = variant.quantity_available
    
    # العملية الحسابية
    variant.quantity_available += quantity
    variant.returned_quantity += quantity
    
    # توثيق الحركة وربطها بالطلب إن وجد[cite: 1]
    create_inventory_log(
        db=db, variant_id=variant_id, product_id=variant.product_id, user_id=user_id,
        movement_type='return_to_stock', quantity_change=quantity,
        quantity_before=quantity_before, related_order_id=order_id, notes=notes
    )
    
    sync_product_metrics(db, variant.product_id)
    return variant

def record_manual_adjustment(db: Session, variant_id: int, user_id: int, new_total: int, notes: str):
    """
    تعديل يدوي (جرد): يضبط الكمية المتاحة لرقم محدد ويسجل الفرق.
    """
    variant = db.query(ProductVariant).filter(ProductVariant.id == variant_id).with_for_update().first()
    if not variant:
        raise HTTPException(status_code=404, detail="المتغير غير موجود")

    quantity_before = variant.quantity_available
    diff = new_total - quantity_before
    
    # ضبط القيمة الجديدة
    variant.quantity_available = new_total
    
    # توثيق الفرق (سواء كان زيادة أو نقص)[cite: 1]
    create_inventory_log(
        db=db, variant_id=variant_id, product_id=variant.product_id, user_id=user_id,
        movement_type='manual_adjust', quantity_change=diff,
        quantity_before=quantity_before, notes=f"جرد يدوي: {notes}"
    )
    
    sync_product_metrics(db, variant.product_id)
    return variant


def get_advanced_inventory_ledger(
    db: Session,
    # فلاتر الهوية
    user_id: Optional[int] = None,
    product_id: Optional[int] = None,
    variant_id: Optional[int] = None,
    # فلاتر النوع والمصدر
    movement_type: Optional[str] = None,
    order_id: Optional[int] = None,
    # فلاتر الزمن
    time_preset: Optional[str] = None, # today, week, month, 3_months
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    # التجزئة (Pagination)
    skip: int = 0,
    limit: int = 20
):
    """
    المحرك الذكي لجلب سجلات المخزون مع فلاتر ديناميكية وتحميل متقدم.
    """
    
    # 1. بدء الاستعلام مع ربط الجداول (Eager Loading) لتقليل استعلامات SQL الناتجة (N+1 Problem)
    query = db.query(InventoryMovement).options(
        joinedload(InventoryMovement.product),
        joinedload(InventoryMovement.user),
        joinedload(InventoryMovement.variant)
    )

    filters = []

    # 2. بناء فلاتر الهوية ديناميكياً
    if user_id:
        filters.append(InventoryMovement.user_id == user_id)
    if product_id:
        filters.append(InventoryMovement.product_id == product_id)
    if variant_id:
        filters.append(InventoryMovement.variant_id == variant_id)
    
    # 3. فلاتر النوع والمصدر
    if movement_type:
        filters.append(InventoryMovement.movement_type == movement_type)
    if order_id:
        filters.append(InventoryMovement.related_order_id == order_id)

    # 4. معالجة النطاق الزمني (Time Logic)
    now = datetime.now()
    
    if time_preset:
        if time_preset == "today":
            start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
            filters.append(InventoryMovement.created_at >= start_of_day)
        elif time_preset == "week":
            filters.append(InventoryMovement.created_at >= now - timedelta(days=7))
        elif time_preset == "month":
            filters.append(InventoryMovement.created_at >= now - timedelta(days=30))
        elif time_preset == "3_months":
            filters.append(InventoryMovement.created_at >= now - timedelta(days=90))
    
    # إذا تم تحديد تاريخ مخصص (يدوي)
    if start_date:
        filters.append(InventoryMovement.created_at >= start_date)
    if end_date:
        filters.append(InventoryMovement.created_at <= end_date)

    # 5. تطبيق الفلترة والترتيب (الأحدث أولاً) والتجزئة
    movements = query.filter(and_(*filters))\
                     .order_by(desc(InventoryMovement.created_at))\
                     .offset(skip)\
                     .limit(limit)\
                     .all()

    return movements


def get_movement_details_service(db: Session, movement_id: int):
    """
    جلب البطاقة التقنية الكاملة لحركة مخزنية معينة.
    """
    movement = db.query(InventoryMovement).options(
        joinedload(InventoryMovement.user),
        joinedload(InventoryMovement.product),
        joinedload(InventoryMovement.variant)
    ).filter(InventoryMovement.id == movement_id).first()

    if not movement:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"الحركة ذات الرقم {movement_id} غير موجودة في السجلات"
        )
    
    ret
    

def get_movement_summary(db: Session, month: int = None, year: int = None):
    now = datetime.now()
    m = month or now.month
    y = year or now.year

    # إجمالي المضاف (Stock In)
    total_added = db.query(func.sum(InventoryMovement.quantity_change))\
        .filter(InventoryMovement.movement_type == 'addition',
                func.extract('month', InventoryMovement.created_at) == m,
                func.extract('year', InventoryMovement.created_at) == y).scalar() or 0

    # إجمالي التالف وقيمته التقديرية
    # نقوم بربط جدول الحركة بجدول المنتج لجلب سعر التكلفة
    damage_data = db.query(
        func.sum(InventoryMovement.quantity_change),
        func.sum(InventoryMovement.quantity_change * Product.cost_price)
    ).join(Product, InventoryMovement.product_id == Product.id)\
     .filter(InventoryMovement.movement_type == 'damage',
             func.extract('month', InventoryMovement.created_at) == m).first()

    # نسبة المرتجعات
    total_returns = db.query(func.sum(InventoryMovement.quantity_change))\
        .filter(InventoryMovement.movement_type == 'return',
                func.extract('month', InventoryMovement.created_at) == m).scalar() or 0

    return {
        "month": m,
        "total_added": abs(total_added),
        "total_damaged": abs(damage_data[0] or 0),
        "estimated_damage_loss": abs(damage_data[1] or 0),
        "return_rate": (abs(total_returns) / abs(total_added) * 100) if total_added != 0 else 0
    }


def check_stock_integrity(db: Session, variant_id: int):
    # 1. جلب الكمية الحالية المسجلة في جدول المتغيرات
    variant = db.query(ProductVariant).filter(ProductVariant.id == variant_id).first()
    
    # 2. حساب مجموع الحركات من جدول inventory_movement لهذا المتغير
    # ملاحظة: نفترض أننا نسجل الزيادة بـ + والنقص بـ -
    calculated_stock = db.query(func.sum(InventoryMovement.quantity_change))\
        .filter(InventoryMovement.variant_id == variant_id).scalar() or 0
    
    is_match = (variant.stock_quantity == calculated_stock)
    
    return {
        "variant_id": variant_id,
        "current_in_db": variant.stock_quantity,
        "calculated_from_history": calculated_stock,
        "integrity_status": "MATCH" if is_match else "DISCREPANCY_DETECTED",
        "difference": variant.stock_quantity - calculated_stock
    }

