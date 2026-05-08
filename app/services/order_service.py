from decimal import Decimal
import traceback
from typing import Optional
from sqlalchemy.exc import SQLAlchemyError
import json
import logging
from datetime import datetime
from typing import List, Optional , Dict , Tuple
from sqlalchemy.orm import Session, joinedload
from fastapi import HTTPException, status
from app.models.inventory import  ProductColor, Product

# استيراد الخدمات المركزية التي أنشأناها
from .audit_service import log_order_qr_scan, create_order_action_log, log_order_initialization
from .inventory_movement_service import record_return_to_stock, record_damage_entry
from app.crud.inventory_sync import sync_product_metrics

# استيراد الموديلات والسكيمات
from app.models.order import Order, OrderItem, OrderAction
from app.models.inventory import Product, ProductVariant
from app.schemas.order_schema import OrderCreate, OrderUpdate, DeliveryAssignRequest

logger = logging.getLogger(__name__)

def create_new_order_logic(db: Session, order_data: OrderCreate, user_id: int):
    if not order_data.items:
        raise HTTPException(status_code=400, detail="قائمة الطلب فارغة")

    try:
        total_order_price = Decimal('0.00')
        order_items_to_add = []
        unique_product_ids = set()

        # ترتيب العناصر لمنع التعارض (Deadlocks)
        sorted_items = sorted(order_data.items, key=lambda x: x.variant_id)

        for item in sorted_items:
            # 1. جلب وقفل المتغير
            variant = db.query(ProductVariant).filter(
                ProductVariant.id == item.variant_id,
                ProductVariant.deleted_at.is_(None)
            ).with_for_update().first()

            if not variant:
                raise HTTPException(status_code=404, detail=f"المتغير {item.variant_id} غير موجود")

            # التحقق من وجود اللون والمنتج يدوياً لضمان عدم حدوث NoneType Error
            if not variant.color:
                raise HTTPException(status_code=400, detail=f"خطأ في بيانات المتغير {item.variant_id}: اللون غير مرتبط")

            p_id = variant.color.product_id
            
            # 2. جلب وقفل المنتج الرئيسي
            product = db.query(Product).filter(
                Product.id == p_id,
                Product.deleted_at.is_(None)
            ).with_for_update().first()

            if not product:
                raise HTTPException(status_code=404, detail="المنتج الرئيسي غير موجود")

            # 3. تحديث المخزون
            if variant.quantity_available < item.quantity:
                raise HTTPException(status_code=400, detail=f"المخزون غير كافٍ لـ {product.name}")

            variant.quantity_available -= item.quantity
            variant.quantity_reserved += item.quantity
            
            # إبلاغ SQLAlchemy أن الكائن تغير (هام جداً)
            db.add(variant)

            current_price = Decimal(str(product.selling_price))
            total_order_price += (current_price * item.quantity)
            unique_product_ids.add(product.id)

            order_items_to_add.append(OrderItem(
                variant_id=variant.id,
                product_id=product.id,
                quantity=item.quantity,
                price_at_order=current_price
            ))

        # 4. معالجة الهواتف (تأكد أنها قائمة وليست نص)
        phones = order_data.customer_phones
        if isinstance(phones, str):
            try:
                phones = json.loads(phones)
            except:
                phones = [phones] # تحويلها لقائمة إذا كانت نصاً عادياً

        # 5. إنشاء الطلب
        new_order = Order(
            customer_name=order_data.customer_name,
            customer_phones=phones,
            address=order_data.address,
            social_media_source=order_data.social_media_source,
            notes=order_data.notes,
            total_price=total_order_price,
            created_by=user_id,
            status='pending'
        )

        db.add(new_order)
        db.flush() # دفع البيانات للـ DB للحصول على ID الطلب

        for o_item in order_items_to_add:
            o_item.order_id = new_order.id
            db.add(o_item)

        # 6. المزامنة (قبل الـ Commit)
        db.flush() # ضروري لكي ترى دالة المزامنة التغييرات التي حدثت أعلاه
        for prod_id in unique_product_ids:
            sync_product_metrics(db, prod_id)

        # 7. الحفظ النهائي
        db.commit()
        db.refresh(new_order)
        return new_order

    except Exception as e:
        db.rollback()
        print("!!! ERROR DETECTED !!!")
        traceback.print_exc() # هذا سيطبع لك في الـ Terminal السطر والخطأ بالضبط
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"خطأ تقني: {str(e)}")


async def process_qr_scan_logic(
    db: Session, 
    order_id: int, 
    user_id: int, 
    qr_code: Optional[str] = None, 
    variant_id: Optional[int] = None
):
    # نضع الدالة بالكامل داخل try لضمان التراجع عن أي تغيير في حال حدوث أي خطأ
    try:
        # 1. تحديد المتغير (البحث يدوي أو عبر QR)
        variant = None
        
        if variant_id:
            variant = db.query(ProductVariant).filter(
                ProductVariant.id == variant_id,
                ProductVariant.deleted_at.is_(None)
            ).with_for_update().first()
        elif qr_code and isinstance(qr_code, str):
            # تنظيف المسار واستخراج اسم الملف
            filename = qr_code.replace("\\", "/").split("/")[-1]
            variant = db.query(ProductVariant).filter(
                ProductVariant.qr_code.like(f"%{filename}"),
                ProductVariant.deleted_at.is_(None)
            ).with_for_update().first()
        
        if not variant:
            error_msg = f"المنتج غير موجود (ID: {variant_id})" if variant_id else f"الرمز {qr_code} غير مسجل"
            raise HTTPException(status_code=404, detail=error_msg)

        # 2. التحقق من انتماء المنتج للطلب
        order_item = db.query(OrderItem).filter(
            OrderItem.order_id == order_id, 
            OrderItem.variant_id == variant.id,
            OrderItem.deleted_at.is_(None)
        ).with_for_update().first()
        
        if not order_item:
            raise HTTPException(status_code=400, detail="هذا المنتج لا ينتمي لهذا الطلب")

        # 3. منع تجاوز الكمية المطلوبة
        if order_item.picked_quantity >= order_item.quantity:
            raise HTTPException(status_code=400, detail="تم مسح الكمية المطلوبة بالكامل")

        # 4. تحديث الكمية الممسوحة
        order_item.picked_quantity += 1

        # جلب الطلب لتحديث حالته
        order = db.query(Order).filter(Order.id == order_id).with_for_update().first()
        if not order:
            raise HTTPException(status_code=404, detail="الطلب غير موجود")

        if order.status == 'pending':
            order.status = 'in_preparation'

        # 5. التحقق من اكتمال الطلب
        all_items = db.query(OrderItem).filter(OrderItem.order_id == order_id).all()
        is_order_complete = all(item.picked_quantity == item.quantity for item in all_items)

        if is_order_complete:
            affected_product_ids = set()
            for item in all_items:
                v = db.query(ProductVariant).filter(ProductVariant.id == item.variant_id).with_for_update().first()
                if v:
                    # تحويل من محجوز إلى مباع
                    v.quantity_reserved = max(0, v.quantity_reserved - item.quantity)
                    v.total_sold = (v.total_sold or 0) + item.quantity
                    if v.color:
                        affected_product_ids.add(v.color.product_id)
            
            db.flush()
            # مزامنة الإحصائيات للمنتج الأب
            for p_id in affected_product_ids:
                sync_product_metrics(db, p_id)
                
            order.status = 'prepared'

        # 6. توثيق العملية (Audit Log)
        new_action = OrderAction(
            order_id=order_id,
            user_id=user_id,
            action_type="manual_scan" if variant_id else "qr_scan_success",
            details={
                "variant_id": variant.id, 
                "is_complete": is_order_complete,
                "method": "manual" if variant_id else "qr_camera",
                "scanned_by": user_id
            }
        )
        db.add(new_action)
        
        # حفظ كل شيء دفعة واحدة
        db.commit()
        
        return {
            "status": order.status, 
            "is_complete": is_order_complete,
            "message": "تم التحديث بنجاح",
            "picked_quantity": order_item.picked_quantity,
            "total_quantity": order_item.quantity
        }

    except Exception as e:
        db.rollback() # تراجع عن أي شيء في حال فشل أي خطوة
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"خطأ تقني في المعالجة: {str(e)}")



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
    if not db_order: 
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    
    # تحديث معلومات التوصيل
    db_order.delivery_info = f"{delivery_data.delivery_name} - {delivery_data.delivery_type}"
    
    # تأكد أن 'shipped' مضافة في الـ ENUM الخاص بقاعدة البيانات قبل تنفيذ هذا السطر
    db_order.status = "shipped" 
    
    try:
        db.commit()
        db.refresh(db_order)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"فشل تحديث قاعدة البيانات: {str(e)}")
        
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
    """
    إلغاء الطلب وإعادة المخزون بناءً على حالة الطلب الحالية.
    يمنع الحذف إذا كانت الحالة 'shipped'.
    """
    
    # 1. جلب الطلب مع قفل (Row-level Lock) لضمان عدم تعديله أثناء المعالجة
    db_order = db.query(Order).filter(
        Order.id == order_id, 
        Order.deleted_at.is_(None)
    ).with_for_update().first()

    if not db_order:
        raise HTTPException(status_code=404, detail="الطلب غير موجود أو تم حذفه مسبقاً")

    # 2. جدار الحماية: منع حذف الطلبات المشحونة
    if db_order.status == 'shipped':
        raise HTTPException(
            status_code=400, 
            detail="لا يمكن حذف الطلب بعد خروجه للتوصيل (حالة shipped). يرجى استخدام نظام المرتجعات."
        )

    try:
        affected_product_ids = set()

        # 3. معالجة عناصر الطلب وإعادة المخزون
        for item in db_order.items:
            variant = db.query(ProductVariant).filter(
                ProductVariant.id == item.variant_id
            ).with_for_update().first()

            if variant:
                # الاحتفاظ بمعرف المنتج الأب للمزامنة لاحقاً
                if variant.color:
                    affected_product_ids.add(variant.color.product_id)

                # المنطق الرياضي:
                # أ. إذا كان الطلب مكتمل التجهيز (prepared)، فالكمية خصمت من المحجوز وأضيفت للمباع
                if db_order.status == 'prepared':
                    variant.quantity_available += item.quantity
                    variant.total_sold = max(0, (variant.total_sold or 0) - item.quantity)
                
                # ب. إذا كان الطلب (pending) أو (in_preparation)، فالكمية لا تزال في المحجوز
                else:
                    variant.quantity_available += item.quantity
                    variant.quantity_reserved = max(0, (variant.quantity_reserved or 0) - item.quantity)

                db.add(variant)

        # 4. تنفيذ الحذف الناعم (Soft Delete) كما هو موضح في هيكلة جدولك
        # تحديث توقيت الحذف للطلب وعناصره
        now = datetime.now()
        
        db_order.deleted_at = now
        db_order.status = 'cancelled' # تغيير الحالة لتمييزه في التقارير

        for item in db_order.items:
            item.deleted_at = now
        
        # حذف العمليات المرتبطة بالطلب (اختياري حسب رغبتك في الاحتفاظ بالسجل)
        db.query(OrderAction).filter(OrderAction.order_id == order_id).update({"deleted_at": now})

        # 5. المزامنة مع المنتج الأب (Product Metrics)
        db.flush()
        for p_id in affected_product_ids:
            sync_product_metrics(db, p_id)

        # 6. الحفظ النهائي
        db.commit()
        
        return {
            "status": "success", 
            "message": f"تم إلغاء الطلب رقم {order_id} وإعادة الكميات للمخزن بنجاح"
        }

    except Exception as e:
        db.rollback()
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"خطأ أثناء عملية الحذف: {str(e)}")



def _get_locked_order_and_variants(db: Session, order_id: int, new_item_ids: List[int]):
    # جلب الطلب مع القفل
    db_order = db.query(Order).filter(Order.id == order_id).with_for_update().first()
    if not db_order:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")

    # جلب جميع الـ variants المرتبطة (القديمة الموجودة في الطلب + الجديدة المراد إضافتها)
    current_variant_ids = [item.variant_id for item in db_order.items if item.deleted_at is None]
    all_target_ids = list(set(current_variant_ids + new_item_ids))
    
    # قفل الـ variants لضمان دقة الحسابات الرياضية
    locked_variants = db.query(ProductVariant).filter(
        ProductVariant.id.in_(all_target_ids)
    ).with_for_update().first() # ستقوم SQLAlchemy بقفل جميع الصفوف المسترجعة

    return db_order


def _update_basic_info(db_order: Order, update_data: Dict):
    fields = ["customer_name", "address", "social_media_source", "notes", "delivery_info", "inventory_employee_id"]
    for field in fields:
        if field in update_data:
            setattr(db_order, field, update_data[field])
    
   # 2. تطبيق مفهوم assign_delivery_logic (الدمج في حقل delivery_info)
    d_name = update_data.get("delivery_name")
    d_type = update_data.get("delivery_type")
    
    if d_name and d_type:
        # دمج بنفس الطريقة التي نجحت معك
        db_order.delivery_info = f"{d_name} - {d_type}"
    elif d_name:
        db_order.delivery_info = d_name
             
    
    # معالجة الهواتف بشكل خاص لأنها JSON
    if "customer_phones" in update_data:
        db_order.customer_phones = update_data["customer_phones"]    



def _apply_inventory_delta(db: Session, db_order: Order, new_items: List[Dict]):
    current_items = {item.variant_id: item for item in db_order.items if item.deleted_at is None}
    # فصل المنتجات المطلوبة عن المنتجات المراد حذفها (التي كميتها 0)
    new_items_dict = {item['variant_id']: item for item in new_items if item['quantity'] > 0}
    to_be_removed_ids = [item['variant_id'] for item in new_items if item['quantity'] <= 0]
    total_price = Decimal('0.00')
    items_changed = False

    # 1. معالجة المحذوف والمعدل
    for v_id, db_item in current_items.items():
        variant = db.query(ProductVariant).filter(ProductVariant.id == v_id).first()
        
        if v_id not in new_items_dict or v_id in to_be_removed_ids:
            # صنف محذوف: إعادة الكمية للمخزن
            _reverse_stock(db_order.status, variant, db_item.quantity)
            db_item.deleted_at = datetime.now()
            items_changed = True
        else:
            # صنف موجود: فحص تغير الكمية
            new_qty = new_items_dict[v_id]['quantity']
            if db_item.quantity != new_qty:
                _adjust_stock(db_order.status, variant, db_item.quantity, new_qty)
                db_item.quantity = new_qty
                db_item.picked_quantity = 0 # إعادة ضبط المسح للصفر
                items_changed = True
            
            total_price += (db_item.price_at_order * db_item.quantity)
            del new_items_dict[v_id] # إزالته ليبقى المضاف حديثاً فقط

    # 2. معالجة المضاف الجديد
    for v_id, item_data in new_items_dict.items():
        variant = db.query(ProductVariant).filter(ProductVariant.id == v_id).first()
        if variant.quantity_available < item_data['quantity']:
            raise HTTPException(status_code=400, detail=f"المخزون غير كافٍ للمنتج {v_id}")
        
        # حجز الكمية للمنتج الجديد
        variant.quantity_available -= item_data['quantity']
        variant.quantity_reserved += item_data['quantity']
        
        product_price = Decimal(str(variant.color.product.selling_price))
        new_item = OrderItem(
            order_id=db_order.id,
            variant_id=v_id,
            product_id=variant.color.product_id,
            quantity=item_data['quantity'],
            price_at_order=product_price,
            picked_quantity=0
        )
        db.add(new_item)
        total_price += (product_price * item_data['quantity'])
        items_changed = True

    return total_price, items_changed

def _reverse_stock(status, variant, qty):
    variant.quantity_available += qty
    if status == 'prepared':
        variant.total_sold = max(0, (variant.total_sold or 0) - qty)
    else:
        variant.quantity_reserved = max(0, (variant.quantity_reserved or 0) - qty)

def _adjust_stock(status, variant, old_qty, new_qty):
    diff = new_qty - old_qty
    if diff > 0: # زيادة طلب
        if variant.quantity_available < diff:
            raise HTTPException(status_code=400, detail="المخزون لا يكفي للزيادة")
        variant.quantity_available -= diff
        variant.quantity_reserved += diff
    else: # تقليل طلب
        variant.quantity_available += abs(diff)
        variant.quantity_reserved -= abs(diff)



async def update_order_master_logic(db: Session, order_id: int, update_data: Dict, user_id: int):
    # 1. التحقق والقفل
    new_item_ids = [it['variant_id'] for it in update_data.get('items', [])]
    db_order = _get_locked_order_and_variants(db, order_id, new_item_ids)

    # 2. حماية حالة الشحن
    if db_order.status == 'shipped' and 'items' in update_data:
        raise HTTPException(status_code=400, detail="ممنوع تعديل منتجات طلب تم شحنه")

    try:
        # 3. تحديث البيانات الأساسية
        _update_basic_info(db_order, update_data)

        # 4. مزامنة المخزون والسعر
        if 'items' in update_data:
            new_total, changed = _apply_inventory_delta(db, db_order, update_data['items'])
            db_order.total_price = new_total
            
            # 5. التصحيح التلقائي للحالة (Status Auto-Correction)
            if changed and db_order.status in ['prepared', 'in_preparation']:
                db_order.status = 'pending' # العودة للبداية لإعادة المسح والتجهيز

        # 6. توثيق وتحديث التوقيت
        db_order.updated_at = datetime.now()
        db.add(OrderAction(
            order_id=order_id, 
            user_id=user_id, 
            action_type="order_edit_full"
        ))

        db.commit()
        db.refresh(db_order)
        return db_order

    except Exception as e:
        db.rollback()
        raise e