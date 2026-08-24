from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, desc, func
from datetime import datetime, timedelta
from typing import Optional, List
import asyncio
import json
from fastapi import HTTPException, status
from app.models.inventory import InventoryMovement, ProductVariant, ProductColor, Product
from app.models.user import User
from app.services.audit_service import create_inventory_log, create_system_audit_log
from app.crud.inventory_sync import sync_product_metrics

# =====================================================================
# أولاً: وظائف إدارة حركة المخزون الفنية والعمليات المخزنية
# =====================================================================

def record_stock_addition(db: Session, variant_id: int, user_id: int, quantity: int, notes: str = None):
    """ إضافة بضاعة جديدة للمخزن (توريد) """
    # ✅ إصلاح BUG-06: رفض كمية صفر أو سالبة لمنع تلوث سجل المخزون
    if quantity <= 0:
        raise HTTPException(status_code=400, detail="يجب أن تكون الكمية المضافة أكبر من صفر")
    if quantity > 100000:
        raise HTTPException(status_code=400, detail="الكمية كبيرة جداً — تحقق من المدخل")
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


def record_direct_sale(db: Session, variant_id: int, user_id: int, quantity: int, notes: str = None):
    """ بيع مباشر: ينقص من المتاح ويزيد في إجمالي المبيعات """
    variant = db.query(ProductVariant).filter(ProductVariant.id == variant_id).with_for_update().first()
    if not variant:
        raise HTTPException(status_code=404, detail="المتغير غير موجود")

    quantity_before = variant.quantity_available or 0

    if quantity_before < quantity:
        raise HTTPException(status_code=400, detail="الكمية المتاحة في المخزن أقل من المراد بيعه")

    variant.quantity_available = quantity_before - quantity
    variant.total_sold = (variant.total_sold or 0) + quantity

    db.add(variant)
    db.flush()

    create_inventory_log(
        db=db,
        variant_id=variant_id,
        product_id=variant.product_id,
        user_id=user_id,
        movement_type='sale',
        quantity_change=-quantity,
        quantity_before=quantity_before,
        quantity_after=variant.quantity_available,
        notes=notes or 'بيع مباشر عبر الماسح'
    )

    sync_product_metrics(db, variant.product_id)
    return variant


def resolve_variant_by_scan(db: Session, scanned: str, lock: bool = False):
    """
    يحوّل أي قيمة ممسوحة إلى المتغير (variant) الصحيح.

    سبب وجودها: بيانات qr_code في قاعدة البيانات غير موحّدة الشكل —
    معظم الصفوف تخزّن *مسار صورة* الـ QR (/static/uploads/qrcodes/qr_30_x.png)
    بينما صورة الـ QR المطبوعة تُرمّز نصاً مختلفاً تماماً: "VAR:30|SKU:PRD-123".
    لذلك كان مسح الملصق المطبوع لا يطابق أي صف إطلاقاً.

    نجرّب بالترتيب: معرف المتغير من نص VAR، ثم تطابق تام، ثم اسم ملف
    الصورة، ثم كود المنتج (SKU) — فيعمل المسح مع كل الأشكال الموجودة.
    """
    import re

    code = (scanned or "").strip()
    if not code:
        return None

    # مهم جداً للأداء والتزامن: البحث يتم **بدون** أي قفل.
    # استخدام with_for_update مع LIKE '%...%' يمنع استعمال الفهرس فيمسح
    # InnoDB الجدول كاملاً ويقفل كل صفوفه، فتتعطل كل عمليات المسح المتزامنة
    # حتى تنتهي مهلة القفل (50 ثانية) — وهو سبب تعليق واجهة المبيعات.
    # بعد تحديد الصف الصحيح نقفله وحده بالمفتاح الأساسي فقط.
    def _q():
        return db.query(ProductVariant).filter(ProductVariant.deleted_at.is_(None))

    def _finish(v):
        if v is None:
            return None
        if not lock:
            return v
        # قفل صف واحد بالمفتاح الأساسي: سريع ولا يمس بقية الجدول
        return (db.query(ProductVariant)
                  .filter(ProductVariant.id == v.id)
                  .with_for_update()
                  .first())

    # 0) الصيغة الجديدة: {product_id:05d}-{color_pos}-{size_pos}  مثل  00076-1-2
    #    تقبل أيضاً بدون أصفار أمامية: 76-1-2  ←  يُطابق  00076-1-2
    m_sku = re.match(r"^(\d+)-(\d+)-(\d+)$", code)
    if m_sku:
        # محاولة مطابقة مباشرة أولاً
        v = _q().filter(ProductVariant.variant_sku == code).first()
        if v:
            return _finish(v)
        # تطبيع رقم المنتج إلى 5 خانات ثم إعادة المحاولة (76-1-2 → 00076-1-2)
        try:
            normalized = f"{int(m_sku.group(1)):05d}-{m_sku.group(2)}-{m_sku.group(3)}"
            v = _q().filter(ProductVariant.variant_sku == normalized).first()
            if v:
                return _finish(v)
        except Exception:
            pass

    # 1) نص الـ QR المطبوع: VAR:{variant_id}|SKU:{product_code}
    m = re.match(r"^VAR:(\d+)", code, re.IGNORECASE)
    if m:
        v = _q().filter(ProductVariant.id == int(m.group(1))).first()
        if v:
            return _finish(v)

    # 2) إذا كانت القيمة الممسوحة أو المدخلة رقماً فقط (مثل معرف الصنف: 3 أو 30)
    if code.isdigit():
        v = _q().filter(ProductVariant.id == int(code)).first()
        if v:
            return _finish(v)

    # 3) تطابق تام مع القيمة المخزّنة في حقل qr_code
    v = _q().filter(ProductVariant.qr_code == code).first()
    if v:
        return _finish(v)

    # 4) كود المنتج المباشر (SKU)
    m_sku = re.search(r"SKU:([^|]+)", code, re.IGNORECASE)
    sku_val = m_sku.group(1).strip() if m_sku else code
    if sku_val and not sku_val.isdigit():
        v = (_q().join(ProductColor, ProductVariant.product_color_id == ProductColor.id)
                 .join(Product, ProductColor.product_id == Product.id)
                 .filter(Product.code == sku_val).first())
        if v:
            return _finish(v)

    # 5) مطابقة مسار صورة الـ QR أو اسم الملف (عندما يُمرّر مسار ملف أو qr_XX_...)
    if "/" in code or "\\" in code or code.lower().endswith((".png", ".jpg", ".webp")) or code.startswith("qr_"):
        filename = code.replace("\\", "/").split("/")[-1]
        m_qr_id = re.search(r"qr_(\d+)_", filename, re.IGNORECASE)
        if m_qr_id:
            v = _q().filter(ProductVariant.id == int(m_qr_id.group(1))).first()
            if v:
                return _finish(v)
        
        if filename:
            v = _q().filter(ProductVariant.qr_code.like(f"%/{filename}")).first()
            if v:
                return _finish(v)

    return None


def record_direct_sale_with_order(
    db: Session,
    variant_id: int,
    user_id: int,
    quantity: int = 1,
    notes: str = None,
    customer_phone: str = None,
):
    """
    بيع مباشر عبر الماسح مع إنشاء طلب حقيقي.

    سبب وجودها: record_direct_sale كانت تخصم المخزون وتسجّل حركة فقط بلا أي
    طلب، ومسار الفاتورة يحتاج order_id — فلم يكن ممكناً إصدار فاتورة لبيع
    الماسح السريع إطلاقاً. هنا ننشئ طلباً مكتملاً (shipped) بعنصر واحد،
    فتعمل الفاتورة ويُربط سجل الحركة بالطلب.

    رقم الزبون اختياري تماماً؛ إن لم يُدخل يُحفظ الطلب بقائمة هواتف فارغة.
    """
    from app.models.order import Order, OrderItem
    from decimal import Decimal

    if quantity <= 0:
        raise HTTPException(status_code=400, detail="الكمية يجب أن تكون أكبر من صفر")

    variant = db.query(ProductVariant).filter(
        ProductVariant.id == variant_id
    ).with_for_update().first()
    if not variant:
        raise HTTPException(status_code=404, detail="المتغير غير موجود")

    quantity_before = variant.quantity_available or 0
    if quantity_before < quantity:
        raise HTTPException(status_code=400, detail="الكمية المتاحة في المخزن أقل من المراد بيعه")

    product = db.query(Product).filter(Product.id == variant.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="المنتج الرئيسي غير موجود")

    unit_price = Decimal(str(product.selling_price or 0))
    total_price = unit_price * quantity

    phones = []
    if customer_phone:
        cleaned = str(customer_phone).strip()
        if cleaned:
            phones = [cleaned]

    # الطلب يُنشأ مباشرة بحالة shipped لأن البضاعة سُلّمت فعلاً في البيع المباشر
    order = Order(
        customer_name="زبون بيع مباشر",
        customer_phones=phones,
        address="بيع مباشر من المتجر",
        social_media_source=None,
        notes=notes or "بيع مباشر عبر الماسح السريع",
        total_price=total_price,
        status="shipped",
        created_by=user_id,
    )
    db.add(order)
    db.flush()

    db.add(OrderItem(
        order_id=order.id,
        variant_id=variant.id,
        product_id=product.id,
        quantity=quantity,
        picked_quantity=quantity,   # مسحوب بالكامل — العملية تمت فوراً
        price_at_order=unit_price,
    ))

    # تحديث المخزون
    variant.quantity_available = quantity_before - quantity
    variant.total_sold = (variant.total_sold or 0) + quantity
    db.add(variant)
    db.flush()

    # حركة المخزون مرتبطة بالطلب حتى يظهرا معاً في السجل ويُحذفا معاً لاحقاً
    create_inventory_log(
        db=db,
        variant_id=variant.id,
        product_id=product.id,
        user_id=user_id,
        movement_type='sale',
        quantity_change=-quantity,
        quantity_before=quantity_before,
        quantity_after=variant.quantity_available,
        related_order_id=order.id,
        notes=notes or 'بيع مباشر عبر الماسح',
    )

    sync_product_metrics(db, product.id)
    return variant, order


def record_manual_adjustment(db: Session, variant_id: int, user_id: int, new_total: int, notes: str):
    """ تعديل يدوي (جرد للكمية المتاحة) """
    # ✅ إصلاح BUG-05: رفض قيمة سالبة لمنع مخزون سالب يكسر جميع التنبيهات
    if new_total < 0:
        raise HTTPException(status_code=400, detail="لا يمكن أن يكون المخزون بقيمة سالبة")
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

from sqlalchemy import String, or_

def standardize_inventory_movement(item, user, variant, color, product):
    variant_info = None
    if variant:
        variant_info = {
            "id": variant.id,
            "quantity_available": variant.quantity_available,
            "size": variant.size.name if variant.size else "—",
            "qr_code": variant.qr_code,
            "color": {
                "id": color.id,
                "name": color.color_name
            } if color else None
        }
        
    product_info = None
    if product:
        product_info = {
            "id": product.id,
            "name": product.name,
            "code": product.code
        }

    # friendly labels
    labels = {
        'initial_stock': 'وارد',
        'add_stock': 'وارد',
        'sale': 'صادر',
        'damage': 'تالف',
        'manual_adjust': 'تعديل',
        'return': 'إرجاع',
        'clear_returns': 'مسح رواجع',
        'clear_damages': 'مسح توالف'
    }
    type_label = labels.get(item.movement_type, item.movement_type)

    return {
        "id": item.id, # keep database integer ID for Pydantic schema validation
        "unified_id": f"inv_{item.id}",
        "source": "inventory",
        "created_at": item.created_at,
        "user_id": item.user_id,
        "user": {"id": user.id, "name": user.name} if user else {"id": item.user_id, "name": "النظام"},
        "movement_type": item.movement_type,
        "type_label": type_label,
        "quantity_change": item.quantity_change,
        "quantity_before": item.quantity_before,
        "quantity_after": item.quantity_after,
        "related_order_id": item.related_order_id,
        "damage_reason": item.damage_reason,
        "notes": item.notes or "لا توجد ملاحظات",
        "product": product_info,
        "variant": variant_info,
        "details": None
    }

def standardize_system_audit_log(item, user):
    product_info = None
    variant_info = None
    target_name = ""
    
   raw_details = item.details or {}
    if isinstance(raw_details, str):
        try:
            details = json.loads(raw_details)
            if not isinstance(details, dict):
                details = {"message": raw_details}
        except Exception:
            details = {"message": raw_details}
    elif isinstance(raw_details, dict):
        details = raw_details
    else:
        details = {}
    
    if item.action_target == 'product':
        product_info = {
            "id": item.target_id,
            "name": details.get("product_name") or details.get("name") or "منتج",
            "code": details.get("code") or "—"
        }
        target_name = product_info["name"]
    elif item.action_target == 'variant':
        variant_info = {
            "id": item.target_id,
            "size": details.get("size") or "—",
            "color": {"name": details.get("color") or "—"}
        }
        target_name = f"مقاس {variant_info['size']}"
    elif item.action_target == 'catalog':
        target_name = details.get("catalog_name") or details.get("name") or details.get("old_name") or details.get("new_name") or f"كتالوج #{item.target_id}"

    # friendly labels
    movement_type = f"{item.action_target}_{item.action_type}"
    
    # Calculate Arabic label
    type_label = "عملية إدارية"
    if item.action_target == 'user':
        target_name = details.get("name") or f"موظف #{item.target_id}"
        if item.action_type in ['create', 'created']:
            type_label = "إضافة موظف"
            movement_type = 'employee_add'
        elif item.action_type in ['update', 'updated']:
            type_label = "تعديل موظف"
            movement_type = 'employee_edit'
        elif item.action_type in ['delete', 'deleted']:
            type_label = "حذف موظف"
            movement_type = 'employee_delete'
        elif item.action_type in ['restore', 'restored']:
            type_label = "استعادة موظف"
            movement_type = 'employee_restore'
    elif item.action_target == 'catalog':
        if item.action_type in ['create', 'created']:
            type_label = "إضافة كتالوج"
            movement_type = 'catalog_add'
        elif item.action_type in ['update', 'updated']:
            type_label = "تعديل كتالوج"
            movement_type = 'catalog_edit'
        elif item.action_type in ['toggle_status']:
            is_act = details.get("is_active", True)
            type_label = "تنشيط كتالوج" if is_act else "إيقاف كتالوج"
            movement_type = 'catalog_activate' if is_act else 'catalog_deactivate'
    elif item.action_target == 'product':
        if item.action_type in ['create', 'created']:
            type_label = "إضافة منتج"
            movement_type = 'product_add'
        elif item.action_type in ['update', 'updated']:
            type_label = "تعديل منتج"
            movement_type = 'product_edit'
        elif item.action_type in ['delete', 'deleted']:
            type_label = "حذف منتج"
            movement_type = 'product_delete'
        elif item.action_type in ['restore', 'restored']:
            type_label = "استعادة منتج"
            movement_type = 'product_restore'
    elif item.action_target == 'inventory':
        if item.action_type == 'clear_returns':
            type_label = "مسح رواجع"
            movement_type = 'clear_returns'
        elif item.action_type == 'clear_damages':
            type_label = "مسح توالف"
            movement_type = 'clear_damages'

    # notes description
    notes = details.get("message") or f"عملية {type_label} للمستهدف {target_name}"
    if 'changes' in details:
        changes_str = ", ".join([f"{k}: {v.get('from')} -> {v.get('to')}" if isinstance(v, dict) else f"{k}: {v}" for k, v in details['changes'].items()])
        notes += f" (التعديلات: {changes_str})"

    return {
        "id": item.id,
        "unified_id": f"audit_{item.id}",
        "source": "audit",
        "created_at": item.created_at,
        "user_id": item.user_id,
        "user": {"id": user.id, "name": user.name} if user else {"id": item.user_id, "name": "النظام"},
        "movement_type": movement_type,
        "type_label": type_label,
        "quantity_change": 0,
        "quantity_before": 0,
        "quantity_after": 0,
        "related_order_id": None,
        "damage_reason": None,
        "notes": notes,
        "product": product_info,
        "variant": variant_info,
        "details": details
    }

def standardize_order_action(item, user, order):
    details = item.details or {}
    movement_type = f"order_{item.action_type}"
    type_label = "عملية طلب"
    
    if item.action_type in ['created', 'order_created']:
        type_label = "إضافة طلب"
        movement_type = 'order_add'
    elif item.action_type in ['order_edit_full', 'updated', 'delivery_assigned']:
        type_label = "تعديل طلب"
        movement_type = 'order_edit'
    elif item.action_type in ['order_cancelled', 'cancelled']:
        type_label = "حذف طلب"
        movement_type = 'order_delete'
    elif item.action_type == 'item_removed':
        type_label = "مسح صنف"
        movement_type = 'item_delete'
    elif item.action_type == 'item_added':
        type_label = "إضافة صنف للطلب"
        movement_type = 'item_add'

    # السطر الجديد الآمن
    notes = details.get("message") or getattr(item, "notes", None) or f"عملية {type_label} للطلب ORD-{item.order_id}"
    
    return {
        "id": item.id,
        "unified_id": f"order_act_{item.id}",
        "source": "order",
        "created_at": item.created_at,
        "user_id": item.user_id,
        "user": {"id": user.id, "name": user.name} if user else {"id": item.user_id, "name": "النظام"},
        "movement_type": movement_type,
        "type_label": type_label,
        "quantity_change": details.get("quantity") or 0,
        "quantity_before": 0,
        "quantity_after": 0,
        "related_order_id": item.order_id,
        "damage_reason": None,
        "notes": notes,
        "product": None,
        "variant": None,
        "details": details
    }

def get_best_image(product, color_obj):
    """
    1. يجلب صورة اللون (color_image) إذا كانت موجودة.
    2. إذا لم توجد، يجلب الصورة الرئيسية للمنتج (main_image).
    3. إذا لم يوجد أي شيء، يعيد None.
    """
    if color_obj and hasattr(color_obj, 'color_image') and color_obj.color_image:
        return color_obj.color_image
    if product and hasattr(product, 'main_image') and product.main_image:
        return product.main_image
    return None    

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
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 20
):
    from app.models.inventory import SystemAuditLog, Product, ProductVariant, ProductColor
    from app.models.order import Order, OrderAction, OrderItem
    from app.models.user import User

    # 1. Date filters
    now = datetime.now()
    date_filter_inv = []
    date_filter_audit = []
    date_filter_order = []
    
    if time_preset:
        if time_preset == "today":
            start_t = now.replace(hour=0, minute=0, second=0, microsecond=0)
            date_filter_inv.append(InventoryMovement.created_at >= start_t)
            date_filter_audit.append(SystemAuditLog.created_at >= start_t)
            date_filter_order.append(OrderAction.created_at >= start_t)
        elif time_preset == "week":
            start_t = now - timedelta(days=7)
            date_filter_inv.append(InventoryMovement.created_at >= start_t)
            date_filter_audit.append(SystemAuditLog.created_at >= start_t)
            date_filter_order.append(OrderAction.created_at >= start_t)
        elif time_preset == "month":
            start_t = now - timedelta(days=30)
            date_filter_inv.append(InventoryMovement.created_at >= start_t)
            date_filter_audit.append(SystemAuditLog.created_at >= start_t)
            date_filter_order.append(OrderAction.created_at >= start_t)
        elif time_preset == "3_months":
            start_t = now - timedelta(days=90)
            date_filter_inv.append(InventoryMovement.created_at >= start_t)
            date_filter_audit.append(SystemAuditLog.created_at >= start_t)
            date_filter_order.append(OrderAction.created_at >= start_t)
    else:
        if start_date:
            date_filter_inv.append(InventoryMovement.created_at >= start_date)
            date_filter_audit.append(SystemAuditLog.created_at >= start_date)
            date_filter_order.append(OrderAction.created_at >= start_date)
        if end_date:
            date_filter_inv.append(InventoryMovement.created_at <= end_date)
            date_filter_audit.append(SystemAuditLog.created_at <= end_date)
            date_filter_order.append(OrderAction.created_at <= end_date)

    search_inv = []
    search_audit = []
    search_order = []
    if search:
        search = search.strip()
        if search.isdigit():
            search_num = int(search)
            search_inv.append(or_(
                InventoryMovement.related_order_id == search_num,
                InventoryMovement.variant_id == search_num,
                InventoryMovement.product_id == search_num
            ))
            search_audit.append(or_(
                SystemAuditLog.target_id == search_num,
                SystemAuditLog.user_id == search_num
            ))
            search_order.append(or_(
                OrderAction.order_id == search_num,
                OrderAction.user_id == search_num
            ))
        else:
            search_term = f"%{search}%"
            search_inv.append(or_(
                Product.name.ilike(search_term),
                Product.code.ilike(search_term),
                User.name.ilike(search_term),
                InventoryMovement.notes.ilike(search_term),
                InventoryMovement.movement_type.ilike(search_term)
            ))
            search_audit.append(or_(
                User.name.ilike(search_term),
                SystemAuditLog.action_target.ilike(search_term),
                SystemAuditLog.action_type.ilike(search_term),
                func.cast(SystemAuditLog.details, String).ilike(search_term)
            ))
            search_order.append(or_(
                User.name.ilike(search_term),
                Order.customer_name.ilike(search_term),
                OrderAction.action_type.ilike(search_term),
                func.cast(OrderAction.details, String).ilike(search_term)
            ))

    query_inv = db.query(InventoryMovement, User, ProductVariant, ProductColor, Product) \
                  .join(User, InventoryMovement.user_id == User.id) \
                  .outerjoin(ProductVariant, InventoryMovement.variant_id == ProductVariant.id) \
                  .outerjoin(ProductColor, ProductVariant.product_color_id == ProductColor.id) \
                  .outerjoin(Product, ProductColor.product_id == Product.id)          
    query_audit = db.query(SystemAuditLog, User).join(User, SystemAuditLog.user_id == User.id)
    
    query_order = db.query(OrderAction, User, Order).join(User, OrderAction.user_id == User.id) \
                    .join(Order, OrderAction.order_id == Order.id)

    # Apply product/variant/order filters
    if product_id:
        query_inv = query_inv.filter(or_(InventoryMovement.product_id == product_id, Product.id == product_id))
        query_audit = query_audit.filter(and_(SystemAuditLog.action_target == 'product', SystemAuditLog.target_id == product_id))
        query_order = query_order.join(OrderItem, OrderAction.order_id == OrderItem.order_id).filter(OrderItem.product_id == product_id).distinct()
        
    if variant_id:
        query_inv = query_inv.filter(InventoryMovement.variant_id == variant_id)
        query_audit = query_audit.filter(and_(SystemAuditLog.action_target == 'variant', SystemAuditLog.target_id == variant_id))
        query_order = query_order.join(OrderItem, OrderAction.order_id == OrderItem.order_id).filter(OrderItem.variant_id == variant_id).distinct()
        
    if order_id:
        query_inv = query_inv.filter(InventoryMovement.related_order_id == order_id)
        query_audit = query_audit.filter(and_(SystemAuditLog.action_target == 'order', SystemAuditLog.target_id == order_id))
        query_order = query_order.filter(OrderAction.order_id == order_id)

    if user_id:
        query_inv = query_inv.filter(InventoryMovement.user_id == user_id)
        query_audit = query_audit.filter(SystemAuditLog.user_id == user_id)
        query_order = query_order.filter(OrderAction.user_id == user_id)

    if date_filter_inv:
        query_inv = query_inv.filter(*date_filter_inv)
    if date_filter_audit:
        query_audit = query_audit.filter(*date_filter_audit)
    if date_filter_order:
        query_order = query_order.filter(*date_filter_order)

    if search_inv:
        query_inv = query_inv.filter(*search_inv)
    if search_audit:
        query_audit = query_audit.filter(*search_audit)
    if search_order:
        query_order = query_order.filter(*search_order)

    run_inv = True
    run_audit = True
    run_order = True
    
    if movement_type:
        if movement_type in ['add_stock', 'damage', 'return', 'manual_adjust', 'sale', 'initial_stock']:
            run_audit = False
            run_order = False
            if movement_type == 'add_stock':
                query_inv = query_inv.filter(InventoryMovement.movement_type.in_(['add_stock', 'initial_stock']))
            else:
                query_inv = query_inv.filter(InventoryMovement.movement_type == movement_type)
        elif movement_type == 'employee':
            run_inv = False
            run_order = False
            query_audit = query_audit.filter(SystemAuditLog.action_target == 'user')
        elif movement_type == 'catalog':
            run_inv = False
            run_order = False
            query_audit = query_audit.filter(SystemAuditLog.action_target == 'catalog')
        elif movement_type == 'product':
            run_inv = False
            run_order = False
            query_audit = query_audit.filter(SystemAuditLog.action_target.in_(['product', 'product_color', 'variant']))
        elif movement_type == 'order':
            run_inv = False
            run_audit = False
        elif movement_type == 'clear_returns':
            run_order = False
            query_inv = query_inv.filter(InventoryMovement.movement_type == 'clear_returns')
            query_audit = query_audit.filter(and_(SystemAuditLog.action_target == 'inventory', SystemAuditLog.action_type == 'clear_returns'))
        elif movement_type == 'clear_damages':
            run_order = False
            query_inv = query_inv.filter(InventoryMovement.movement_type == 'clear_damages')
            query_audit = query_audit.filter(and_(SystemAuditLog.action_target == 'inventory', SystemAuditLog.action_type == 'clear_damages'))

    count_inv = query_inv.count() if (run_inv and query_inv) else 0
    count_audit = query_audit.count() if (run_audit and query_audit) else 0
    count_order = query_order.count() if (run_order and query_order) else 0
    total_count = count_inv + count_audit + count_order

    fetch_limit = skip + limit
    items_inv = query_inv.order_by(InventoryMovement.created_at.desc()).limit(fetch_limit).all() if (run_inv and query_inv) else []
    items_audit = query_audit.order_by(SystemAuditLog.created_at.desc()).limit(fetch_limit).all() if (run_audit and query_audit) else []
    items_order = query_order.order_by(OrderAction.created_at.desc()).limit(fetch_limit).all() if (run_order and query_order) else []

    all_items = []
    
    # 1. معالجة حركات المخزن (التوالف، الرواجع، التوريد، إلخ)
    for item, usr, var, col, prod in items_inv:
        # جلب القاموس الأساسي للحفاظ على بنية العلاقات القديمة
        base_movement = standardize_inventory_movement(item, usr, var, col, prod)
        
        # استخراج المقاس ديناميكياً وبشكل آمن تماماً
        size_value = "N/A"
        if var : 
            raw_size = getattr(var, 'size', None)
            if raw_size:
                size_value = raw_size if isinstance(raw_size, str) else getattr(raw_size, 'name', getattr(raw_size, 'value', str(raw_size)))
       
        # خريطة ترجمة أنواع العمليات للغة العربية للعرض المباشر
        type_mapping = {
            "damage": "توالف",
            "return": "رواجع",
            "clear_damages": "تصفير توالف",
            "clear_returns": "تصفير رواجع",
            "add_stock": "توريد مخزون",
            "initial_stock": "مخزون أول المدة",
            "sale": "مبيعات",
            "manual_adjust": "تعديل يدوي"
        }
        movement_type_ar = type_mapping.get(item.movement_type, item.movement_type)

        # دمج الحقول الجديدة المطلوبة في جذر الكائن (Root) لسرعة القراءة
        base_movement.update({
            "movement_type_display": movement_type_ar,
            "product_name": prod.name if prod else "منتج غير معروف",
            "variant_color": getattr(col, 'name', getattr(col, 'color_name', 'N/A')) if col else "N/A",
            "variant_size": size_value,
            "responsible_user": usr.name if usr else "غير معروف",
            "affected_quantity": abs(item.quantity_change),  # تحويل الكمية لقيمة موجبة واضحة للعرض
            "product_image": get_best_image(prod, col)
        })
        all_items.append(base_movement)

    # 2. معالجة سجلات الرقابة (System Audit Logs) للحفاظ على وحدة هيكل البيانات
    for item, usr in items_audit:
        base_audit = standardize_system_audit_log(item, usr)
        base_audit.update({
            "movement_type_display": f"سجل نظام ({item.action_type})",
            "product_name": prod.name if prod else "N/A",
            "variant_size": "N/A",
            "variant_color": "N/A",
            "responsible_user": usr.name if usr else "غير معروف",
            "affected_quantity": 0,
            "product_image": None
        })
        all_items.append(base_audit)

    # 3. معالجة حركات الطلبات (Order Actions)
    for item, usr, ord_obj in items_order:
        base_order = standardize_order_action(item, usr, ord_obj)
        base_order.update({
            "movement_type_display": f"حركة طلب ({item.action_type})",
            "product_name": f"طلب عميل: {ord_obj.customer_name}" if ord_obj else "N/A",
            "variant_size": "N/A",
            "variant_color": "N/A",
            "responsible_user": usr.name if usr else "غير معروف",
            "affected_quantity": 0,
            "product_image": None 
        })
        all_items.append(base_order)

    all_items.sort(key=lambda x: x["created_at"], reverse=True)
    sliced_items = all_items[skip : skip + limit]

    return {
        "total": total_count,
        "items": sliced_items
    }

def clear_returns_service(db: Session, variant_id: Optional[int], user_id: int):
    from app.models.inventory import ProductVariant
    if variant_id:
        variants = db.query(ProductVariant).filter(ProductVariant.id == variant_id, ProductVariant.deleted_at == None).all()
        if not variants:
            raise HTTPException(status_code=404, detail="المتغير غير موجود")
    else:
        variants = db.query(ProductVariant).filter(ProductVariant.returned_quantity > 0, ProductVariant.deleted_at == None).all()
        
    cleared_count = 0
    for v in variants:
        old_qty = v.returned_quantity or 0
        if old_qty > 0:
            v.returned_quantity = 0
            db.add(v)
            db.flush()
            
            create_inventory_log(
                db=db,
                variant_id=v.id,
                product_id=v.product_id,
                user_id=user_id,
                movement_type='clear_returns',
                quantity_change=-old_qty,
                quantity_before=old_qty,
                quantity_after=0,
                notes=f"تصفير الرواجع للمقاس #{v.id}"
            )
            
            create_system_audit_log(
                db=db,
                user_id=user_id,
                action_target='inventory',
                target_id=v.id,
                action_type='clear_returns',
                details={"variant_id": v.id, "old_qty": old_qty, "notes": "تم تصفير الرواجع"}
            )
            cleared_count += 1
            sync_product_metrics(db, v.product_id)
            
    if cleared_count > 0:
        db.commit()
        
    return {"status": "success", "message": f"تم تصفير الرواجع لـ {cleared_count} مقاس بنجاح"}

def clear_damages_service(db: Session, variant_id: Optional[int], user_id: int):
    from app.models.inventory import ProductVariant
    if variant_id:
        variants = db.query(ProductVariant).filter(ProductVariant.id == variant_id, ProductVariant.deleted_at == None).all()
        if not variants:
            raise HTTPException(status_code=404, detail="المتغير غير موجود")
    else:
        variants = db.query(ProductVariant).filter(ProductVariant.damaged_quantity > 0, ProductVariant.deleted_at == None).all()
        
    cleared_count = 0
    for v in variants:
        old_qty = v.damaged_quantity or 0
        if old_qty > 0:
            v.damaged_quantity = 0
            db.add(v)
            db.flush()
            
            create_inventory_log(
                db=db,
                variant_id=v.id,
                product_id=v.product_id,
                user_id=user_id,
                movement_type='clear_damages',
                quantity_change=-old_qty,
                quantity_before=old_qty,
                quantity_after=0,
                notes=f"تصفير التوالف للمقاس #{v.id}"
            )
            
            create_system_audit_log(
                db=db,
                user_id=user_id,
                action_target='inventory',
                target_id=v.id,
                action_type='clear_damages',
                details={"variant_id": v.id, "old_qty": old_qty, "notes": "تم تصفير التوالف"}
            )
            cleared_count += 1
            sync_product_metrics(db, v.product_id)
            
    if cleared_count > 0:
        db.commit()
        
    return {"status": "success", "message": f"تم تصفير التوالف لـ {cleared_count} مقاس بنجاح"}

def delete_movement_service(db: Session, movement_id: int, user_id: int):
    movement = db.query(InventoryMovement).filter(InventoryMovement.id == movement_id).first()
    if not movement:
        raise HTTPException(status_code=404, detail="الحركة غير موجودة")
        
    variant = db.query(ProductVariant).filter(ProductVariant.id == movement.variant_id).with_for_update().first()
    if variant:
        # عكس تأثير الحركة بالمخزن
        variant.quantity_available = max(0, variant.quantity_available - movement.quantity_change)
        db.add(variant)
        db.flush()
        sync_product_metrics(db, variant.product_id)
        
    create_system_audit_log(
        db=db,
        user_id=user_id,
        action_target='inventory',
        target_id=movement.variant_id,
        action_type='delete_movement',
        details={
            "movement_id": movement.id,
            "movement_type": movement.movement_type,
            "quantity_change": movement.quantity_change,
            "notes": "تم حذف سجل الحركة وعكس الكمية بالمخزن"
        }
    )
    
    db.delete(movement)
    db.commit()
    
    return {"status": "success", "message": "تم حذف سجل الحركة بنجاح"}         
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