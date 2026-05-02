from decimal import Decimal
from typing import List, Optional
from sqlalchemy.orm import Session, joinedload
from fastapi import HTTPException, status

# استيراد الخدمات المركزية التي أنشأناها
from .audit_service import log_order_qr_scan, create_order_action_log, log_order_initialization
from .inventory_movement_service import record_return_to_stock, record_damage_entry, sync_product_metrics

# استيراد الموديلات والسكيمات
from app.models.order import Order, OrderItem, OrderAction
from app.models.inventory import Product, ProductVariant
from app.schemas.order_schema import OrderCreate, OrderUpdate, DeliveryAssignRequest

def create_new_order_logic(db: Session, order_data: OrderCreate, user_id: int):
    """إنشاء طلب جديد مع حجز المخزن آلياً"""
    try:
        total_price = Decimal('0.00')
        order_items_to_add = []
        affected_product_ids = set()

        for item in order_data.items:
            variant = db.query(ProductVariant).filter(
                ProductVariant.id == item.variant_id,
                ProductVariant.deleted_at == None
            ).with_for_update().first()
            
            if not variant:
                raise HTTPException(status_code=404, detail=f"المنتج {item.variant_id} غير متوفر")
            
            if variant.quantity_available < item.quantity:
                raise HTTPException(status_code=400, detail="الكمية في المخزن غير كافية")

            product = variant.product # الوصول المباشر عبر العلاقة في الموديل
            current_price = Decimal(str(product.selling_price))
            affected_product_ids.add(product.id)

            # حجز الكمية (Reserved)
            variant.quantity_available -= item.quantity
            variant.quantity_reserved += item.quantity
            
            total_price += (current_price * item.quantity)

            order_items_to_add.append(OrderItem(
                variant_id=variant.id,
                product_id=product.id,
                quantity=item.quantity,
                picked_quantity=0,
                price_at_order=current_price
            ))

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

        # توثيق البداية
        log_order_initialization(db, user_id, new_order.id, new_order.customer_name, new_order.social_media_source)

        db.commit()
        # تحديث إحصائيات المنتج الكلي
        for p_id in affected_product_ids: sync_product_metrics(db, p_id)
        
        db.refresh(new_order)
        return new_order

    except Exception as e:
        db.rollback()
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=f"فشل إنشاء الطلب: {str(e)}")

def process_qr_scan_logic(db: Session, order_id: int, qr_code: str, user_id: int):
    """تحضير الطلب عبر مسح الـ QR Code"""
    variant = db.query(ProductVariant).filter(ProductVariant.qr_code == qr_code).with_for_update().first()
    if not variant: raise HTTPException(status_code=404, detail="الرمز غير مسجل")

    order_item = db.query(OrderItem).filter(OrderItem.order_id == order_id, OrderItem.variant_id == variant.id).first()
    if not order_item: raise HTTPException(status_code=400, detail="هذه القطعة لا تنتمي لهذا الطلب")

    if order_item.picked_quantity >= order_item.quantity:
        raise HTTPException(status_code=400, detail="تم مسح الكمية المطلوبة بالكامل مسبقاً")

    # تحديث الحالة: خصم من المحجوز وإضافة للمباع
    order_item.picked_quantity += 1
    variant.quantity_reserved = max(0, variant.quantity_reserved - 1)
    variant.total_sold += 1
    
    # تحديث المنتج الأب
    if variant.product: variant.product.total_sold += 1

    order = db.get(Order, order_id)
    if order.status == 'pending': order.status = 'in_preparation'

    # التحقق من اكتمال الطلب
    all_items = db.query(OrderItem).filter(OrderItem.order_id == order_id).all()
    if all(item.picked_quantity == item.quantity for item in all_items):
        order.status = 'prepared'

    log_order_qr_scan(db, user_id=user_id, order_id=order_id, variant_id=variant.id, qr_code=qr_code)
    db.commit()
    return {"status": order.status, "is_complete": order.status == 'prepared'}

def standalone_return_logic(db: Session, qr_code: str, user_id: int, note: str = "مرتجع"):
    """منطق المرتجعات المباشرة للمخزن (أصلاح أخطاء المسافات)"""
    variant = db.query(ProductVariant).filter(ProductVariant.qr_code == qr_code).with_for_update().first()
    if not variant: raise HTTPException(status_code=404, detail="الرمز غير موجود")

    # استدعاء الخدمة الموحدة (تقوم بالتحديث والتوثيق والمزامنة في خطوة واحدة)
    record_return_to_stock(db, variant_id=variant.id, user_id=user_id, quantity=1, notes=note)
    
    db.commit()
    return {"status": "success", "new_qty": variant.quantity_available}

def process_damage_logic(db: Session, qr_code: str, user_id: int, note: str = "تالف"):
    """منطق تسجيل المنتجات التالفة (أصلاح أخطاء المسافات)"""
    variant = db.query(ProductVariant).filter(ProductVariant.qr_code == qr_code).with_for_update().first()
    if not variant: raise HTTPException(status_code=404, detail="الرمز غير موجود")

    if variant.quantity_available <= 0:
        raise HTTPException(status_code=400, detail="لا توجد كمية متاحة لإتلافها")

    record_damage_entry(db, variant_id=variant.id, user_id=user_id, quantity=1, reason="QR Scan Damage", notes=note)
    
    db.commit()
    return {"status": "success", "new_qty": variant.quantity_available}

async def assign_delivery_logic(db: Session, order_id: int, delivery_data: DeliveryAssignRequest, user_id: int):
    """إسناد شركة شحن وتحديث الحالة"""
    db_order = db.get(Order, order_id)
    if not db_order: raise HTTPException(status_code=404, detail="الطلب غير موجود")
    
    db_order.delivery_info = f"{delivery_data.delivery_name} - {delivery_data.delivery_type}"
    db_order.status = "shipped"
    
    create_order_action_log(db, order_id=order_id, user_id=user_id, action_type='assigned_to_delivery', details={"delivery": db_order.delivery_info})
    
    db.commit()
    db.refresh(db_order)
    return db_order




async def get_orders_comprehensive_logic(db: Session, skip: int = 0, limit: int = 100, status: Optional[str] = None, search: Optional[str] = None):
    """جلب كافة الطلبات مع دعم الفلترة والبحث (Optimized Query)"""
    # استخدام joinedload لجلب الأصناف مع الطلب في استعلام واحد لتسريع الأداء
    query = db.query(Order).options(joinedload(Order.items))
    
    if status:
        query = query.filter(Order.status == status)
    
    if search:
        # البحث في اسم العميل أو الهاتف
        query = query.filter(
            (Order.customer_name.ilike(f"%{search}%")) | 
            (Order.customer_phones.ilike(f"%{search}%"))
        )
    
    return query.order_by(Order.created_at.desc()).offset(skip).limit(limit).all()



async def get_order_details_logic(db: Session, order_id: int):
    """جلب تفاصيل طلب محدد مع كافة الحركات والمنتجات التابعة له"""
    order = db.query(Order).options(
        joinedload(Order.items).joinedload(OrderItem.variant), # جلب بيانات المنتج والمقاس
        joinedload(Order.actions) # جلب سجل الأكشن (من جهزه، متى شحن، إلخ)
    ).filter(Order.id == order_id).first()
    
    if not order:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    return order    


async def delete_order_logic(db: Session, order_id: int):
    """حذف الطلب نهائياً مع كافة متعلقاته (سجلات الأكشن والأصناف)"""
    db_order = db.query(Order).filter(Order.id == order_id).first()
    if not db_order:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")

    try:
        # 1. حذف سجلات الأفعال المرتبطة بالطلب أولاً (OrderActions)
        db.query(OrderAction).filter(OrderAction.order_id == order_id).delete()
        
        # 2. حذف أصناف الطلب (OrderItems)
        db.query(OrderItem).filter(OrderItem.order_id == order_id).delete()
        
        # 3. حذف الطلب نفسه
        db.delete(db_order)
        
        db.commit()
        return {"message": "تم حذف الطلب وكافة سجلاته بنجاح"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"فشل عملية الحذف: {str(e)}")



async def update_order_logic(db: Session, order_id: int, obj_in: OrderUpdate, user_id: int):
    """
    تحديث بيانات الطلب وتغيير حالته مع التوثيق التلقائي لأي تغيير.
    """
    # جلب الطلب مع قفل التحديث لضمان عدم التضارب
    db_order = db.query(Order).filter(Order.id == order_id).with_for_update().first()
    
    if not db_order:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")

    # تحويل البيانات القادمة إلى قاموس واستبعاد القيم غير المرسلة
    update_data = obj_in.model_dump(exclude_unset=True)
    
    # حفظ الحالة القديمة للتوثيق في حال تغيرت
    old_status = db_order.status
    new_status = update_data.get("status")

    try:
        # تحديث الحقول النصية (اسم العميل، الهاتف، العنوان، إلخ)
        for field in update_data:
            if field != "items":  # تعديل الأصناف يحتاج منطقاً منفصلاً (سنتطرق له لاحقاً)
                setattr(db_order, field, update_data[field])

        # إذا تم تغيير حالة الطلب، نقوم بتوثيق ذلك في سجل الحركات[cite: 2]
        if new_status and new_status != old_status:
            create_order_action_log(
                db=db, 
                order_id=order_id, 
                user_id=user_id, 
                action_type="status_changed", 
                details={
                    "from": old_status, 
                    "to": new_status,
                    "message": f"تم تغيير حالة الطلب من {old_status} إلى {new_status}"
                }
            )

        db.commit()
        db.refresh(db_order)
        return db_order

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"فشل تحديث الطلب: {str(e)}")
