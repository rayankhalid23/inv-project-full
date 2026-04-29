import traceback
import json
from decimal import Decimal
from typing import List, Optional
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from fastapi import HTTPException, status
# في أعلى ملف order_service.py
from app.models.inventory import ProductVariant, Product, InventoryMovement

from app.models.order import Order, OrderItem, OrderAction
from app.models.inventory import Product, ProductVariant, ProductColor, Size
from app.schemas.order_schema import OrderCreate, OrderUpdate, DeliveryAssignRequest, QRScanRequest
from app.crud.inventory_sync import sync_product_metrics

def create_new_order_logic(db: Session, order_data: OrderCreate, user_id: int):
    try:
        if not order_data.items:
            raise HTTPException(status_code=400, detail="قائمة المنتجات فارغة")

        total_price = Decimal('0.00')
        order_items_to_add = []
        affected_product_ids = set()

        for item in order_data.items:
            variant = db.query(ProductVariant).filter(
                ProductVariant.id == item.variant_id,
                ProductVariant.deleted_at == None
            ).with_for_update().first()
            
            if not variant:
                raise HTTPException(status_code=404, detail=f"المنتج ذو الرقم {item.variant_id} غير متوفر")
            
            if variant.quantity_available < item.quantity:
                product_name = variant.color.product.name if variant.color and variant.color.product else "منتج غير معروف"
                raise HTTPException(status_code=400, detail=f"الكمية من {product_name} غير كافية")

            product = variant.color.product
            current_price = Decimal(str(product.selling_price))
            affected_product_ids.add(product.id)

            # تحديث آمن للمخزون
            variant.quantity_available -= item.quantity
            variant.quantity_reserved += item.quantity
            
            total_price += (current_price * item.quantity)

            new_item = OrderItem(
                variant_id=variant.id,
                product_id=product.id,
                quantity=item.quantity,
                picked_quantity=0, # التأكد من تصفير حقل المسح
                price_at_order=current_price
            )
            order_items_to_add.append(new_item)

        new_order = Order(
            customer_name=order_data.customer_name,
            customer_phones=order_data.customer_phones,
            address=order_data.address,
            notes=order_data.notes,
            social_media_source=order_data.social_media_source,
            total_price=total_price,
            created_by=user_id,
            status='pending'
        )
        
        db.add(new_order)
        db.flush() 

        for o_item in order_items_to_add:
            o_item.order_id = new_order.id
            db.add(o_item)

        db.add(OrderAction(
            order_id=new_order.id,
            user_id=user_id,
            action_type='created',
            details={"msg": "تم إنشاء الطلب"}
        ))

        db.commit()

        for p_id in affected_product_ids:
            sync_product_metrics(db, p_id)

        db.refresh(new_order)
        return new_order

    except HTTPException as he:
        db.rollback()
        raise he 
    except Exception as e:
        db.rollback()
        print(f"CRITICAL ERROR: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"خطأ في إنشاء الطلب: {str(e)}")

def process_order_items_update(db: Session, db_order: Order, new_items_data: list, affected_products: set):
    current_items_map = {item.variant_id: item for item in db_order.items}
    new_variant_ids = [item['variant_id'] for item in new_items_data]

    # حذف العناصر الملغاة
    for var_id, db_item in current_items_map.items():
        if var_id not in new_variant_ids:
            variant = db.query(ProductVariant).filter(ProductVariant.id == var_id).with_for_update().first()
            if variant:
                variant.quantity_available += db_item.quantity
                variant.quantity_reserved = max(0, variant.quantity_reserved - db_item.quantity)
                if variant.color: affected_products.add(variant.color.product_id)
            db.delete(db_item)

    total_price_accumulator = Decimal('0.00')
    for item_in in new_items_data:
        v_id = item_in['variant_id']
        qty = item_in['quantity']

        variant = db.query(ProductVariant).filter(ProductVariant.id == v_id).with_for_update().first()
        if not variant: raise HTTPException(status_code=404, detail="المنتج غير موجود")

        product = variant.color.product
        affected_products.add(product.id)
        selling_price = Decimal(str(product.selling_price))

        if v_id in current_items_map:
            db_item = current_items_map[v_id]
            diff = qty - db_item.quantity
            if diff != 0:
                if diff > 0 and variant.quantity_available < diff:
                    raise HTTPException(status_code=400, detail=f"المخزن لا يكفي لـ {product.name}")
                variant.quantity_available -= diff
                variant.quantity_reserved += diff
                db_item.quantity = qty
            db_item.price_at_order = selling_price
        else:
            if variant.quantity_available < qty:
                raise HTTPException(status_code=400, detail=f"المخزن لا يكفي")
            variant.quantity_available -= qty
            variant.quantity_reserved += qty
            db.add(OrderItem(order_id=db_order.id, variant_id=v_id, product_id=product.id, quantity=qty, price_at_order=selling_price, picked_quantity=0))
        
        total_price_accumulator += (selling_price * qty)
    
    db_order.total_price = total_price_accumulator

def update_order_logic(db: Session, order_id: int, order_data: any, user_id: int):
    db_order = db.query(Order).filter(Order.id == order_id).with_for_update().first()
    if not db_order: raise HTTPException(status_code=404, detail="الطلب غير موجود")

    update_data = order_data.dict(exclude_unset=True)
    clean_update_data = {k: v for k, v in update_data.items() if v not in ["string", ["string"]]}
    items_data = clean_update_data.pop('items', None)

    for key, value in clean_update_data.items():
        setattr(db_order, key, value)

    affected_products = set()
    try:
        if items_data is not None:
            process_order_items_update(db, db_order, items_data, affected_products)

        db.add(OrderAction(order_id=db_order.id, user_id=user_id, action_type='updated', details={"fields": list(clean_update_data.keys())}))
        db.commit()
        for p_id in affected_products: sync_product_metrics(db, p_id)
        db.refresh(db_order)
        return db_order
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

def delete_order_logic(db: Session, order_id: int, user_id: int):
    db_order = db.query(Order).filter(Order.id == order_id).with_for_update().first()
    if not db_order: raise HTTPException(status_code=404, detail="الطلب غير موجود")
    if db_order.status in ['shipped', 'delivered']:
        raise HTTPException(status_code=400, detail="لا يمكن حذف طلب مشحون")

    affected_products = set()
    try:
        for item in db_order.items:
            variant = db.query(ProductVariant).filter(ProductVariant.id == item.variant_id).with_for_update().first()
            if variant:
                variant.quantity_reserved = max(0, variant.quantity_reserved - item.quantity)
                variant.quantity_available += item.quantity
                if variant.color: affected_products.add(variant.color.product_id)

        db.query(OrderItem).filter(OrderItem.order_id == order_id).delete()
        db.delete(db_order)
        db.commit()
        for p_id in affected_products: sync_product_metrics(db, p_id)
        return {"status": "success", "message": "تم الحذف واستعادة المخزن"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

def process_qr_scan_logic(db: Session, order_id: int, qr_code: str, user_id: int):
    # 1. البحث عن المتغير مع قفل السجل لضمان دقة العمليات الحسابية
    variant = db.query(ProductVariant).filter(ProductVariant.qr_code == qr_code).with_for_update().first()
    if not variant: 
        raise HTTPException(status_code=404, detail="الرمز (QR) غير مسجل في النظام")

    # 2. البحث عن العنصر داخل الطلب
    order_item = db.query(OrderItem).filter(
        OrderItem.order_id == order_id, 
        OrderItem.variant_id == variant.id
    ).first()

    if not order_item: 
        raise HTTPException(status_code=400, detail="هذا المنتج لا ينتمي لهذا الطلب")

    if order_item.picked_quantity >= order_item.quantity:
        raise HTTPException(status_code=400, detail="تم مسح الكمية المطلوبة من هذا المنتج بالكامل")

    # 3. تحديث الكمية الممسوحة في الطلب
    order_item.picked_quantity += 1
    
    # 4. تحديث حالة الطلب وتسجيل الموظف
    order = db.query(Order).filter(Order.id == order_id).first()
    if order.status == 'pending':
        order.status = 'in_preparation'
        order.inventory_employee_id = user_id

    # 5. تحديث المخزون والإحصائيات (الحقول الجديدة)
    # تحديث المتغير (Variant)
    variant.quantity_reserved = max(0, variant.quantity_reserved - 1)
    # إضافة تحديث العمود الجديد هنا لضمان دقة مبيعات المقاس/اللون
    if hasattr(variant, 'total_sold'):
        variant.total_sold += 1 

    # تحديث المنتج الأب (Product)
    product = variant.color.product if variant.color and variant.color.product else None
    if product:
        product.total_reserved = max(0, product.total_reserved - 1)
        product.total_sold += 1 # تحديث المبيعات الإجمالية للمنتج

    # 6. التحقق من اكتمال الطلب
    all_items = db.query(OrderItem).filter(OrderItem.order_id == order_id).all()
    is_fully_prepared = all(item.picked_quantity == item.quantity for item in all_items)
    
    if is_fully_prepared:
        order.status = 'prepared'

    # 7. تسجيل الحركة
    db.add(OrderAction(
        order_id=order_id, 
        user_id=user_id, 
        action_type='qr_scanned', 
        details={"variant_id": variant.id, "current_picked": order_item.picked_quantity}
    ))
    
    db.commit()

    # 8. الاستجابة مع إشارة الصوت/الاهتزاز للواجهة الأمامية
    return {
        "status": order.status, 
        "message": "تم المسح بنجاح", 
        "is_complete": is_fully_prepared,
        "play_sound": True,  # إشارة للتطبيق لإصدار صوت نجاح
        "vibrate": True      # إشارة للتطبيق للاهتزاز
    }


def assign_delivery_logic(db: Session, order_id: int, data: DeliveryAssignRequest, user_id: int):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order or order.status != 'prepared':
        raise HTTPException(status_code=400, detail="الطلب يجب أن يكون (جاهز) أولاً")

    order.status = 'out_for_delivery'
    
    # الآن نحفظ اسم السائق أو جهة التوصيل مباشرة في العمود الجديد
    # افترضنا أن اسم العمود أصبح delivery_info
    order.delivery_info = f"{data.delivery_type}: {data.delivery_name}"
    
    # تسجيل الحركة في جدول الأكشن للرقابة
    db.add(OrderAction(
        order_id=order_id,
        user_id=user_id,
        action_type='assigned_to_delivery',
        details={"driver": data.delivery_name, "type": data.delivery_type}
    ))
    
    db.commit()
    return order


def get_orders_comprehensive_logic(db: Session, skip: int = 0, limit: int = 50, status: str = None):
    """
    جلب كافة الطلبات مع تحميل كافة البيانات المرتبطة (المنتجات، الألوان، المقاسات)
    بضمان أعلى أداء عبر تقنية joinedload (Eager Loading).
    """
    query = db.query(Order).options(
        joinedload(Order.items)
            .joinedload(OrderItem.variant)
            .joinedload(ProductVariant.color)
            .joinedload(ProductColor.product)
    )

    if status:
        query = query.filter(Order.status == status)

    return query.order_by(Order.created_at.desc()).offset(skip).limit(limit).all()    
def standalone_return_logic(db: Session, qr_code: str, user_id: int, note: str = "مرتجع عام عبر المسح"):
    """
    إرجاع منتج للمخزن المتاح عبر مسح QR فقط.
    متوافق تماماً مع نسخة قاعدة البيانات النهائية.
    """
    # 1. جلب المتغير مع قفل السجل لضمان عدم حدوث تضارب في الكميات
    variant = db.query(ProductVariant).filter(
        ProductVariant.qr_code == qr_code,
        ProductVariant.deleted_at == None
    ).with_for_update().first()
    
    if not variant:
        raise HTTPException(status_code=404, detail="الرمز (QR) غير مسجل في النظام")

    # جلب معرف المنتج الأب (لأن جدول inventory_movements يتطلبه)
    # نستخدم Join بسيط للوصول للمنتج من خلال اللون
    product_id = db.query(ProductColor.product_id).filter(
        ProductColor.id == variant.product_color_id
    ).scalar()

    # 2. تحديث الحقول في جدول product_variants
    variant.quantity_available += 1    # زيادة المتاح
    variant.returned_quantity += 1     # زيادة إجمالي المرتجعات لهذا الصنف
    
    # تحديث إجمالي المبيعات (العمود الذي أضفته أنت يدوياً بالـ ALTER)
    if hasattr(variant, 'total_sold'):
        variant.total_sold = max(0, variant.total_sold - 1)

    # 3. تسجيل الحركة في جدول inventory_movements (مطابق للـ ENUM الخاص بك)
    new_movement = InventoryMovement(
        variant_id=variant.id,
        product_id=product_id,
        quantity_change=1,
        movement_type='return',  # موجودة في ENUM قاعدة بياناتك
        user_id=user_id,
        notes=note
    )
    db.add(new_movement)

    # 4. المزامنة الشاملة للمنتج (تحديث الحقول الإجمالية في جدول products)
    # نقوم بعمل flush لضمان أن الاستعلام في دالة المزامنة يرى التغييرات الجديدة
    db.flush()
    
    from app.crud.inventory_sync import sync_product_metrics
    sync_product_metrics(db, product_id)

    db.commit()
    
    return {
        "status": "success",
        "message": "تمت عملية الإرجاع بنجاح وتحديث المخزن",
        "details": {
            "variant_id": variant.id,
            "new_available_qty": variant.quantity_available,
            "product_id": product_id
        },
        "play_sound": True
    }


def process_damage_logic(db: Session, qr_code: str, user_id: int, note: str = "إتلاف قطعة"):
    """
    تسجيل قطعة تالفة عبر مسح الـ QR.
    القيود: يجب أن تكون الكمية المتاحة > 0.
    """
    # 1. جلب المتغير مع قفل السجل (For Update) لمنع التضارب الحسابي
    variant = db.query(ProductVariant).filter(
        ProductVariant.qr_code == qr_code,
        ProductVariant.deleted_at == None
    ).with_for_update().first()
    
    if not variant:
        raise HTTPException(status_code=404, detail="الرمز (QR) غير صحيح أو غير موجود")

    # 2. القيد الأساسي: هل يوجد مخزن متاح لإتلافه؟
    if variant.quantity_available <= 0:
        raise HTTPException(
            status_code=400, 
            detail=f"لا يمكن إتمام العملية. المخزن المتاح لهذا المنتج (0). المنتج نفذ فعلياً."
        )

    # 3. العمليات الحسابية الدقيقة
    # خصم من المتاح
    variant.quantity_available -= 1
    
    # إضافة إلى حقل التوالف في المتغير (الذي يظهر في الإحصائيات)
    variant.damaged_quantity += 1

    # جلب معرف المنتج الأب للمزامنة ولتسجيل الحركة
    product_id = db.query(ProductColor.product_id).filter(
        ProductColor.id == variant.product_color_id
    ).scalar()

    # 4. تسجيل الحركة في جدول inventory_movements (كاميرا المراقبة)
    new_movement = InventoryMovement(
        variant_id=variant.id,
        product_id=product_id,
        quantity_change=-1, # خصم
        movement_type='damage', # مطابق للـ ENUM في قاعدتك
        user_id=user_id,
        notes=note
    )
    db.add(new_movement)

    # 5. المزامنة الشاملة لتحديث جدول المنتجات (Products)
    db.flush()
    sync_product_metrics(db, product_id)

    db.commit()
    
    return {
        "status": "success",
        "message": "تم تسجيل القطعة كـ تالفة وخصمها من المخزن بنجاح",
        "details": {
            "remaining_available": variant.quantity_available,
            "total_damaged_now": variant.damaged_quantity
        },
        "play_sound": True,
        "vibrate": True
    }    