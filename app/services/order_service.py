from decimal import Decimal
import traceback
from app.core.websocket_manager import manager
from app.services.audit_service import create_system_audit_log
from typing import Optional
from sqlalchemy import or_, and_, func
from app.models.inventory import InventoryMovement
from sqlalchemy.exc import SQLAlchemyError
from fastapi.responses import StreamingResponse
import asyncio
from app.core.websocket_manager import ConnectionManager
import asyncio
from sqlalchemy.orm import joinedload
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.inventory import Product, ProductVariant, ProductColor, Size, Catalog
from app.models.order import Order, OrderItem, OrderAction
from app.models.user import User
import json
import logging
from datetime import datetime
from typing import List, Optional , Dict , Tuple
from sqlalchemy.orm import Session, joinedload
from fastapi import HTTPException, status
from app.models.inventory import  ProductColor, Product
import os
import io
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import portrait
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import arabic_reshaper
from bidi.algorithm import get_display

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
        movements_to_add = []
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
            
            q_before = variant.quantity_available
            variant.quantity_available -= item.quantity
            variant.quantity_reserved += item.quantity
            q_after = variant.quantity_available
            
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


            movements_to_add.append(InventoryMovement(
                variant_id=variant.id,
                product_id=product.id,        # موجود في جدولك
                user_id=user_id,
                quantity_change=item.quantity, # هذا هو الاسم الصحيح في جدولك
                quantity_before=q_before,     # ملء حقل القبل
                quantity_after=q_after,       # ملء حقل البعد
                movement_type='sale',          # الحقل في جدولك اسمه movement_type
                notes="سيتم التحديث برقم الطلب"
            ))

        # 4. معالجة الهواتف (تأكد أنها قائمة وليست نص)
        phones = order_data.customer_phones
        if isinstance(phones, str):
            try:
                phones = json.loads(phones)
            except:
                phones = [phones] # تحويلها لقائمة إذا كانت نصاً عادياً



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


        for movement in movements_to_add:
            movement.related_order_id = new_order.id
            movement.notes = f"Order #{new_order.id} - Sale"
            db.add(movement)   


        log_order_initialization(
            db=db,
            user_id=user_id,
            order_id=new_order.id,
            customer_name=order_data.customer_name,
            source=order_data.social_media_source or "غير محدد"
        )    

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

        
# 5. التوثيق (لا يتم الوصول لهذا السطر إلا في حالة النجاح التام)
        create_order_action_log(
            db=db,
            order_id=order_id,
            user_id=user_id,
            action_type="manual_scan" if variant_id else "qr_scan_success",
            details={
                "variant_id": variant.id, 
                "is_complete": is_order_complete,
                "picked_qty": order_item.picked_quantity
            }
        )
        
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

    q_before = variant.quantity_available
    variant.quantity_available += 1 # زيادة المخزن
    q_after = variant.quantity_available

    # استدعاء الخدمة الموحدة (تقوم بالتحديث والتوثيق والمزامنة في خطوة واحدة)
    record_return_to_stock(db, variant_id=variant.id, user_id=user_id, quantity=1, notes=note)

    create_system_audit_log(
        db=db,
        user_id=user_id,
        action_target="inventory_return",
        target_id=variant.id,
        action_type="return",
        details={"qr_code": qr_code, "note": note}
    )

    db.commit()
    return {"status": "success", "new_qty": variant.quantity_available}
   
def process_damage_logic(db: Session, qr_code: str, user_id: int, note: str = "تالف"):
    # 1. جلب البيانات
    variant = db.query(ProductVariant).filter(ProductVariant.qr_code == qr_code).with_for_update().first()
    if not variant: 
        raise HTTPException(status_code=404, detail="الرمز غير موجود")

    if variant.quantity_available <= 0:
        raise HTTPException(status_code=400, detail="لا توجد كمية متاحة لإتلافها")


    q_before = variant.quantity_available
    variant.quantity_available -= 1 # خصم من المخزن
    q_after = variant.quantity_available   

    # 2. تنفيذ عملية الإتلاف والمزامنة (التي أصلحناها سابقاً)
    record_damage_entry(db, variant.id, user_id, 1, "QR Scan Damage", note)

    create_system_audit_log(
        db=db,
        user_id=user_id,
        action_target="inventory_damage",
        target_id=variant.id,
        action_type="damaged_qr",
        details={"qr_code": qr_code, "note": note}
    )


    db.commit() # حفظ كل شيء في القاعدة

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

    create_order_action_log(
        db=db,
        order_id=order_id,
        user_id=user_id,
        action_type="delivery_assigned",
        details={"delivery_info": db_order.delivery_info, "company": delivery_data.delivery_name}
    )
    
    try:
        db.commit()
        db.refresh(db_order)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"فشل تحديث قاعدة البيانات: {str(e)}")
        
    return db_order
   


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
        create_order_action_log(
            db=db,
            order_id=order_id,
            user_id=user_id,
            action_type="order_cancelled",
            notes="تم إلغاء الطلب وإرجاع المنتجات للمخزون"
        )
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
    ).with_for_update().all() # ستقوم SQLAlchemy بقفل جميع الصفوف المسترجعة

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
    # جلب العناصر الحالية
    current_items = {item.variant_id: item for item in db_order.items if item.deleted_at is None}
    new_items_dict = {item['variant_id']: item for item in new_items if item['quantity'] > 0}
    to_be_removed_ids = [item['variant_id'] for item in new_items if item['quantity'] <= 0]
    
    total_price = Decimal('0.00')
    items_changed = False

    # 1. معالجة المحذوف والمعدل
    for v_id, db_item in current_items.items():
        # استخدام query مع populate_existing لضمان جلب أحدث بيانات للمخزن
        variant = db.query(ProductVariant).filter(ProductVariant.id == v_id).with_for_update().first()
        
        if v_id not in new_items_dict or v_id in to_be_removed_ids:
            _reverse_stock(db_order.status, variant, db_item.quantity)
            db_item.deleted_at = datetime.now()
            db_item.picked_quantity = 0 
            items_changed = True
        else:
            new_qty = new_items_dict[v_id]['quantity']
            if db_item.quantity != new_qty:
                _adjust_stock(db_order.status, variant, db_item.quantity, new_qty)
                db_item.quantity = new_qty # تحديث الكمية في الكائن
                
                if new_qty < db_item.picked_quantity: 
                    
                    removed_from_box = db_item.picked_quantity - new_qty
                    db_item.picked_quantity = new_qty
                    print(f"ALERT: Remove {removed_from_box} pieces of {variant.id} from box")
                items_changed = True
            
            # حساب السعر بناءً على الكمية الجديدة المحققة (new_qty)
            total_price += (db_item.price_at_order * Decimal(str(db_item.quantity)))
            del new_items_dict[v_id]

    # 2. معالجة المضاف الجديد
    for v_id, item_data in new_items_dict.items():
        variant = db.query(ProductVariant).filter(ProductVariant.id == v_id).with_for_update().first()
        if not variant or variant.quantity_available < item_data['quantity']:
            raise HTTPException(status_code=400, detail=f"المخزون غير كافٍ للمنتج {v_id}")
        
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
        total_price += (product_price * Decimal(str(item_data['quantity'])))
        items_changed = True

    # إجبار التغييرات على النزول لجدول الأصناف قبل العودة للدالة الأم
    db.flush() 
    return total_price, items_changed

def _reverse_stock(status, variant, qty):
    variant.quantity_available += qty
    if status == 'prepared':
        variant.total_sold = max(0, (variant.total_sold or 0) - qty)
    else:
        variant.quantity_reserved = max(0, (variant.quantity_reserved or 0) - qty)

def _adjust_stock(status, variant, old_qty, new_qty):
    diff = new_qty - old_qty
    abs_diff = abs(diff)

    if status == 'prepared':
        # --- القاعدة الذهبية للطلبات الجاهزة (التعامل مع المباع) ---
        if diff > 0: # زيادة في طلب مكتمل (نأخذ من المتاح ونضيف للمباع)
            if variant.quantity_available < diff:
                raise HTTPException(status_code=400, detail="المخزون لا يكفي للزيادة")
            variant.quantity_available -= diff
            variant.total_sold = (variant.total_sold or 0) + diff
        else: # تقليل في طلب مكتمل (نطرح من المباع ونعيد للمتاح)
            variant.quantity_available += abs_diff
            variant.total_sold = max(0, (variant.total_sold or 0) - abs_diff)
    else:
        # --- القاعدة الذهبية للطلبات المعلقة أو قيد التجهيز (التعامل مع المحجوز) ---
        if diff > 0: # زيادة (نأخذ من المتاح ونضيف للمحجوز)
            if variant.quantity_available < diff:
                raise HTTPException(status_code=400, detail="المخزون لا يكفي للزيادة")
            variant.quantity_available -= diff
            variant.quantity_reserved = (variant.quantity_reserved or 0) + diff
        else: # تقليل (نطرح من المحجوز ونعيد للمتاح)
            variant.quantity_available += abs_diff
            variant.quantity_reserved = max(0, (variant.quantity_reserved or 0) - abs_diff)

async def update_order_master_logic(db: Session, order_id: int, update_data: Dict, user_id: int):
    new_item_ids = [it['variant_id'] for it in update_data.get('items', [])] if 'items' in update_data else []
    db_order = _get_locked_order_and_variants(db, order_id, new_item_ids)

    if db_order.status == 'shipped' and 'items' in update_data:
        raise HTTPException(status_code=400, detail="ممنوع تعديل منتجات طلب تم شحنه")

    try:
        _update_basic_info(db_order, update_data)

        if 'items' in update_data:
            new_total, changed = _apply_inventory_delta(db, db_order, update_data['items'])
            db_order.total_price = new_total
            
            # إجبار تحديث كائنات OrderItem داخل db_order.items
            db.expire(db_order, ['items']) 
            
            if changed:
                # جلب العناصر النشطة بعد التعديل مباشرة من DB
                active_items = db.query(OrderItem).filter(
                    OrderItem.order_id == order_id, 
                    OrderItem.deleted_at.is_(None)
                ).all()
                
                if not active_items:
                    db_order.status = 'pending'
                else:
                    total_qty = sum(it.quantity for it in active_items)
                    total_picked = sum(it.picked_quantity for it in active_items)
                    
                    if total_picked == 0:
                        db_order.status = 'pending'
                    elif total_picked >= total_qty: # استخدام >= للأمان
                        db_order.status = 'prepared'
                    else:
                        db_order.status = 'in_preparation'

        db_order.updated_at = datetime.now()
        db.add(OrderAction(order_id=order_id, user_id=user_id, action_type="order_edit_full"))

        create_order_action_log(
            db=db,
            order_id=order_id,
            user_id=user_id,
            action_type="order_edit_full",
            details={"updated_keys": list(update_data.keys())} # يسجل ما هي الحقول التي تم تعديلها
        )

        db.commit() # الحفظ النهائي
        db.refresh(db_order)
        return db_order

    except Exception as e:
        db.rollback()
        raise e
  #===================================================
  #                 دوال العرض للطلب     
  #===================================================

def get_time_ago_ar(dt: datetime) -> str:
    """تحويل التاريخ إلى صيغة مقروءة (منذ دقيقة، منذ ساعة...)"""
    if not dt:
        return ""
    
    diff = datetime.now() - dt
    seconds = diff.total_seconds()
    
    if seconds < 60:
        return "منذ لحظات"
    elif seconds < 3600:
        minutes = int(seconds / 60)
        return f"منذ {minutes} دقيقة"
    elif seconds < 86400:
        hours = int(seconds / 3600)
        return f"منذ {hours} ساعة"
    else:
        days = int(seconds / 86400)
        return f"منذ {days} يوم"   


async def get_orders_comprehensive_logic(db: Session, skip: int = 0, limit: int = 100, status: Optional[str] = None, search: Optional[str] = None):
    """جلب كافة الطلبات مع دعم فلترة متقدمة وتشكيل البيانات للوحة التحكم"""
    
    # 1. بناء الاستعلام مع جلب كافة العلاقات اللازمة في ضربة واحدة لمنع مشكلة N+1
    query = db.query(Order).options(
        joinedload(Order.creator), # جلب بيانات الموظف (المستخدم الذي أنشأ الطلب)
        joinedload(Order.items).joinedload(OrderItem.variant).joinedload(ProductVariant.color), # لجلب صورة اللون
        joinedload(Order.items).joinedload(OrderItem.product) # لجلب صورة المنتج الأساسية
    )
    
    # 2. الفلترة حسب الحالة
    if status:
        query = query.filter(Order.status == status)
    
    # 3. نظام البحث المتقدم
    if search:
        search_term = f"%{search}%"
        conditions = [
            Order.customer_name.ilike(search_term),
            Order.social_media_source.ilike(search_term),
            # ملاحظة: إذا كان customer_phones مخزن كـ JSON في قاعدة بيانات Postgres، قد تحتاج لاستخدام cast للبحث بداخله
            # لكن إذا كان نص عادي (String) فهذا السطر سيعمل فوراً
            Order.customer_phones.ilike(search_term) 
        ]
        
        # إذا كان مصطلح البحث عبارة عن رقم فقط، نضيف البحث بكود الطلب (ID)
        if search.isdigit():
            conditions.append(Order.id == int(search))
            
        query = query.filter(or_(*conditions))
    
    # 4. تنفيذ الاستعلام
    db_orders = query.order_by(Order.created_at.desc()).offset(skip).limit(limit).all()
    
    # 5. تشكيل المخرجات (Formatting Data)
    result = []

    for order in db_orders:
        total_qty = 0
        total_picked = 0
        product_images = []
        
        for item in order.items:
            total_qty += item.quantity
            total_picked += (item.picked_quantity or 0)
            
            image = None

            # 1. الأولوية لصورة اللون (Variant Color Image)
            if item.variant and item.variant.color and item.variant.color.color_image:
                image = item.variant.color.color_image

            # 2. إذا لم يجد صورة للون، يبحث عن صورة المنتج الأساسي (Fallback)
            if not image:
                product = getattr(item, 'product', None)
                if product and product.main_image:
                    image = product.main_image
            
            # 3. إضافة الصورة للقائمة النهائية "فقط إذا وجدت" ومع "منع التكرار"
            if image and image not in product_images:
                product_images.append(image)


        # تجهيز نص الحالة (مثال: "قيد التجهيز - تم سحب 2/4")
        status_with_progress = f"{order.status} ({total_picked}/{total_qty})" if total_qty > 0 else order.status

        # تجهيز اسم الموظف
        employee_name = order.creator.name if order.creator else "غير معروف"

        # بناء القاموس النهائي لكل طلب
        result.append({
            "order_id": order.id,
            "customer_name": order.customer_name,
            "social_media_source": order.social_media_source,
            "customer_phones": order.customer_phones,
            "total_price": order.total_price,
            "status": order.status,
            "progress_status": status_with_progress, # مثال: 4/2
            "employee_name": employee_name,
            "time_ago": get_time_ago_ar(order.created_at),
            "product_images": product_images # مصفوفة تحتوي على روابط/مسارات الصور
        })

    return result

def get_item_image(item):
    """منطق الشلال: صورة اللون -> صورة المنتج الأساسية -> None"""
    # 1. محاولة جلب صورة اللون من الـ variant
    if item.variant and item.variant.color and item.variant.color.color_image:
        return item.variant.color.color_image
    
    # 2. التراجع لصورة المنتج الأساسية
    if item.product and item.product.main_image:
        return item.product.main_image
        
    return None




async def get_order_full_details_logic(db: Session, order_id: int):
    # 1. جلب الطلب مع كل العلاقات في استعلام واحد (Performance optimization)
    order = db.query(Order).options(
        joinedload(Order.creator),
        joinedload(Order.items).joinedload(OrderItem.product),
        joinedload(Order.items).joinedload(OrderItem.variant).joinedload(ProductVariant.color)
    ).filter(Order.id == order_id).first()

    if not order:
        return None

    # 2. حساب إجمالي الكميات للمسح (Total Progress)
    total_ordered = sum(item.quantity for item in order.items)
    total_picked = sum(item.picked_quantity or 0 for item in order.items)

    # 3. معالجة بيانات الموظفين (المنطق الشرطي لرجل التوصيل)
    personnel = {
        "created_by": order.creator.name if order.creator else "النظام",
        "inventory_employee": "موظف المخزن" # يمكنك جلب اسمه بنفس طريقة الـ creator
    }
    
    # شرطك: لا يظهر رجل التوصيل إلا إذا كانت الحالة 'shipped'
    if order.status.lower() == "shipped":
        personnel["delivery_man"] = order.delivery_info or "جاري التعيين"
    else:
        personnel["delivery_man"] = None

    # 4. تجهيز قائمة المنتجات مع الصور والمسح الجزئي
    items_list = []
    for item in order.items:
        items_list.append({
            "product_name": item.product.name,
            "quantity": item.quantity,
            "picked_quantity": item.picked_quantity or 0,
            "price": item.price_at_order,
            "image": get_item_image(item), # استخدام الدالة المساعدة
            "is_fully_picked": (item.picked_quantity or 0) >= item.quantity
        })

    # 5. تجميع الرد النهائي
    return {
        "order_id": order.id,
        "status": order.status,
        "time_ago": get_time_ago_ar(order.created_at),
        "customer": {
            "name": order.customer_name,
            "phones": order.customer_phones,
            "address": order.address,
            "source": order.social_media_source,
            "notes": order.notes
        },
        "personnel": personnel,
        "items": items_list,
        "summary": {
            "total_price": order.total_price,
            "total_items_count": len(order.items),
            "total_ordered_qty": total_ordered,
            "total_picked_qty": total_picked,
            "overall_progress_percentage": (total_picked / total_ordered * 100) if total_ordered > 0 else 0
        }
    }

def get_inventory_dashboard_stats(db: Session):
    # الربط الصحيح باستخدام المسميات الموجودة في الـ Schema الخاصة بك
    stats = db.query(
        func.sum(ProductVariant.quantity_available).label("total_available"),
        func.sum(ProductVariant.quantity_reserved).label("total_reserved"),
        func.sum(ProductVariant.total_sold).label("total_sold")
    ).join(ProductColor, ProductColor.id == ProductVariant.product_color_id) \
     .join(Product, Product.id == ProductColor.product_id) \
     .filter(
         ProductVariant.deleted_at.is_(None), 
         ProductColor.deleted_at.is_(None), 
         Product.deleted_at.is_(None)
     ).first()

    return {
        "total_available": int(stats.total_available or 0),
        "total_reserved": int(stats.total_reserved or 0),
        "total_sold": int(stats.total_sold or 0)
    }



# --- الإعدادات العامة (نفس التي استعملناها سابقاً) ---
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FONT_PATH = os.path.join(BASE_DIR, "static", "fonts", "Amiri-Regular.ttf")
MAROON_COLOR = colors.HexColor("#800000")

try:
    pdfmetrics.registerFont(TTFont('ArabicFont', FONT_PATH))
    ARABIC_FONT = "ArabicFont"
except:
    ARABIC_FONT = "Helvetica"

def format_ar(text):
    if not text: return ""
    reshaped_text = arabic_reshaper.reshape(str(text))
    return get_display(reshaped_text)

def get_abs_img_path(relative_path):
    if not relative_path: return None
    clean_path = relative_path.lstrip('/')
    abs_path = os.path.join(BASE_DIR, clean_path)
    return abs_path if os.path.exists(abs_path) else None

class OrderInvoiceService:
    # حجم الورق الحراري القياسي (80mm عرض، والارتفاع يتمدد حسب الطلب)
    # سنفترض ارتفاع 200mm كبداية ونعدله برمجياً
    PAGE_WIDTH = 80 * mm
    
    @classmethod
    def generate_order_pdf(cls, order_data):
        """
        order_data: القاموس الذي يخرج من دالة get_order_full_details_logic
        """
        buffer = io.BytesIO()
        
        # تقدير الارتفاع بناءً على عدد المنتجات (تقريباً 30mm لكل منتج + 100mm للهيدر والفوتر)
        estimated_height = 100 * mm + (len(order_data['items']) * 25 * mm)
        custom_size = (cls.PAGE_WIDTH, estimated_height)
        
        c = canvas.Canvas(buffer, pagesize=custom_size)
        width, height = custom_size

        # --- 1. الهيدر (خلفية عنابي وشعار بيلاجو) ---
        c.setFillColor(MAROON_COLOR)
        c.rect(0, height - 25*mm, width, 25*mm, fill=1, stroke=0)
        
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 18)
        c.drawCentredString(width/2, height - 12*mm, "BELLAGIO")
        c.setFont("Helvetica", 8)
        c.drawCentredString(width/2, height - 18*mm, "PREMIUM DELIVERY SLIP")

        # --- 2. بيانات العميل (محاذاة لليمين) ---
        y = height - 32*mm
        c.setFillColor(colors.black)
        
        # رقم الطلب (كبير وواضح لرجل التوصيل)
        c.setFont(ARABIC_FONT, 12)
        c.drawRightString(width - 5*mm, y, format_ar(f"رقم الطلب: #{order_data['order_id']}"))
        
        y -= 7*mm
        c.setFont(ARABIC_FONT, 10)
        c.drawRightString(width - 5*mm, y, format_ar(f"العميل: {order_data['customer']['name']}"))
        
        y -= 6*mm
        c.drawRightString(width - 5*mm, y, format_ar(f"الهاتف: {order_data['customer']['phones']}"))
        
        y -= 6*mm
        # العنوان (دعم الالتفاف البسيط أو تصغير الخط)
        c.setFont(ARABIC_FONT, 9)
        c.drawRightString(width - 5*mm, y, format_ar(f"العنوان: {order_data['customer']['address']}"))
        
        y -= 8*mm
        c.setLineWidth(0.1)
        c.line(5*mm, y, width - 5*mm, y) # خط فاصل

        # --- 3. جدول المنتجات ---
        y -= 7*mm
        c.setFont(ARABIC_FONT, 9)
        c.drawRightString(width - 5*mm, y, format_ar("المنتجات:"))
        y -= 5*mm

        for item in order_data['items']:
            # إطار خفيف لكل منتج
            c.setStrokeColor(colors.lightgrey)
            c.roundRect(4*mm, y - 20*mm, width - 8*mm, 18*mm, 2, stroke=1, fill=0)
            
            # صورة المنتج (على اليسار)
            img_path = get_abs_img_path(item['image'])
            if img_path:
                try:
                    c.drawImage(img_path, 5*mm, y - 18*mm, width=15*mm, height=15*mm, preserveAspectRatio=True)
                except:
                    pass

            # تفاصيل المنتج (على اليمين)
            c.setFillColor(colors.black)
            c.setFont(ARABIC_FONT, 8)
            # اسم المنتج
            p_name = item['product_name'][:30] + ".." if len(item['product_name']) > 30 else item['product_name']
            c.drawRightString(width - 7*mm, y - 5*mm, format_ar(p_name))
            
            # الكمية والسعر
            detail_str = f"الكمية: {item['quantity']} | السعر: {item['price']} LYD"
            c.setFont(ARABIC_FONT, 7)
            c.drawRightString(width - 7*mm, y - 10*mm, format_ar(detail_str))
            
            # الإجمالي الفرعي للمنتج
            subtotal = item['quantity'] * item['price']
            c.setFont("Helvetica-Bold", 8)
            c.drawRightString(width - 7*mm, y - 16*mm, f"Total: {subtotal} LYD")
            
            y -= 22*mm
            
            # التحقق من نهاية الصفحة
            if y < 20*mm:
                c.showPage()
                y = height - 20*mm

        # --- 4. الملخص النهائي (Total) ---
        y -= 5*mm
        c.setFillColor(MAROON_COLOR)
        c.rect(4*mm, y - 12*mm, width - 8*mm, 10*mm, fill=1, stroke=0)
        
        c.setFillColor(colors.white)
        c.setFont(ARABIC_FONT, 11)
        c.drawRightString(width - 10*mm, y - 8*mm, format_ar(f"إجمالي الطلب: {order_data['summary']['total_price']} LYD"))

        # --- 5. تذييل الإيصال ---
        y -= 20*mm
        c.setFillColor(colors.grey)
        c.setFont(ARABIC_FONT, 7)
        c.drawCentredString(width/2, y, format_ar("شكراً لتبضعكم من بيلاجو"))
        

        c.save()
        buffer.seek(0)
        return buffer
