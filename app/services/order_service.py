from decimal import Decimal
import traceback
from app.core.websocket_manager import manager
from app.services.audit_service import create_system_audit_log
from typing import Optional
from sqlalchemy import func, case, and_
from sqlalchemy import or_, and_, func
from app.models.inventory import InventoryMovement
from sqlalchemy.exc import SQLAlchemyError
from fastapi.responses import StreamingResponse
import asyncio
from sqlalchemy.orm import Session
from sqlalchemy import func, case, and_, or_
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
from sqlalchemy.orm import Session, joinedload, selectinload
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


# =====================================================================
# دالة البيع السريع - تُنشئ طلبًا وتُحوّل المخزون فورًا لـ "مباع"
# =====================================================================
def quick_sale_logic(db: Session, customer_name: str, items: list, user_id: int,
                     customer_phone: str = None):
    """
    ينشئ طلبًا جديدًا بحالة 'prepared' مباشرةً مع تحويل الكميات فورًا:
      quantity_available → total_sold  (بدون مرحلة الحجز)
    items: قائمة من {"variant_id": int, "quantity": int}
    customer_phone: اختياري — يُحفظ ضمن هواتف الزبون ويظهر في الفاتورة
    """
    if not items:
        raise HTTPException(status_code=400, detail="قائمة المنتجات فارغة")

    try:
        total_order_price = Decimal('0.00')
        order_items_to_add = []
        movements_to_add = []
        unique_product_ids = set()

        sorted_items = sorted(items, key=lambda x: x["variant_id"])

        for item in sorted_items:
            quantity = int(item["quantity"])
            if quantity <= 0:
                continue

            variant = db.query(ProductVariant).filter(
                ProductVariant.id == int(item["variant_id"]),
                ProductVariant.deleted_at.is_(None)
            ).with_for_update().first()

            if not variant:
                raise HTTPException(status_code=404, detail=f"المتغير {item['variant_id']} غير موجود")

            if not variant.color:
                raise HTTPException(status_code=400, detail=f"بيانات المتغير {item['variant_id']} غير مكتملة")

            p_id = variant.color.product_id
            product = db.query(Product).filter(
                Product.id == p_id,
                Product.deleted_at.is_(None)
            ).with_for_update().first()

            if not product:
                raise HTTPException(status_code=404, detail="المنتج الرئيسي غير موجود")

            if variant.quantity_available < quantity:
                raise HTTPException(
                    status_code=400,
                    detail=f"المخزون غير كافٍ لـ '{product.name}' (متاح: {variant.quantity_available}, مطلوب: {quantity})"
                )

            q_before = variant.quantity_available
            # 🔥 تحويل مباشر: متاح → مباع (بدون مرحلة الحجز)
            variant.quantity_available -= quantity
            variant.total_sold = (variant.total_sold or 0) + quantity
            q_after = variant.quantity_available
            db.add(variant)

            current_price = Decimal(str(product.selling_price or 0))
            total_order_price += current_price * quantity
            unique_product_ids.add(product.id)

            order_items_to_add.append(OrderItem(
                variant_id=variant.id,
                product_id=product.id,
                quantity=quantity,
                picked_quantity=quantity,   # كل القطع "ممسوحة" فورًا
                price_at_order=current_price
            ))

            movements_to_add.append(InventoryMovement(
                variant_id=variant.id,
                product_id=product.id,
                user_id=user_id,
                # ✅ بالسالب: البيع يُنقص المخزون. كانت مسجّلة بالموجب هنا وحدها
                # بينما بقية مسارات البيع تسجّلها بالسالب، ما يكسر مطابقة الجرد
                # (check_stock_integrity) ويقلب إشارة تقارير الحركة.
                quantity_change=-quantity,
                quantity_before=q_before,
                quantity_after=q_after,
                movement_type='sale',
                notes="بيع سريع مباشر"
            ))

        phone_clean = (customer_phone or "").strip()
        new_order = Order(
            customer_name=customer_name,
            # نحفظ الرقم فعلياً بدل العلامة الثابتة "—" حتى يظهر في الفاتورة والبحث
            customer_phones=[phone_clean] if phone_clean else [],
            address="بيع مباشر",
            social_media_source="بيع سريع",
            notes="طلب بيع سريع مباشر",
            total_price=total_order_price,
            created_by=user_id,
            status='prepared'          # مُعدّ مباشرةً بدون مراحل
        )
        db.add(new_order)
        db.flush()

        for o_item in order_items_to_add:
            o_item.order_id = new_order.id
            db.add(o_item)

        for movement in movements_to_add:
            movement.related_order_id = new_order.id
            movement.notes = f"بيع سريع #Order{new_order.id}"
            db.add(movement)

        log_order_initialization(
            db=db,
            user_id=user_id,
            order_id=new_order.id,
            customer_name=customer_name,
            source="بيع سريع"
        )

        db.flush()
        for prod_id in unique_product_ids:
            sync_product_metrics(db, prod_id)

        db.commit()
        db.refresh(new_order)

        # بناء تفاصيل البنود للإرجاع الفوري
        items_detail = []
        for o_item in order_items_to_add:
            v = db.query(ProductVariant).filter(ProductVariant.id == o_item.variant_id).first()
            color_name = v.color.color_name if v and v.color else ""
            color_image = v.color.color_image if v and v.color else None
            size_name = v.size.name if v and v.size else "افتراضي"
            prod = db.query(Product).filter(Product.id == o_item.product_id).first()
            items_detail.append({
                "variant_id": o_item.variant_id,
                "product_name": prod.name if prod else "",
                "main_image": prod.main_image if prod else None,
                "color_image": color_image,
                "color_name": color_name,
                "size": size_name,
                "quantity": o_item.quantity,
                "price_at_order": float(o_item.price_at_order),
            })

        return {
            "order_id": new_order.id,
            "customer_name": new_order.customer_name,
            "total_price": float(new_order.total_price),
            "status": new_order.status,
            "items": items_detail,
        }

    except Exception as e:
        db.rollback()
        traceback.print_exc()
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"خطأ تقني في البيع السريع: {str(e)}")


def process_qr_scan_logic(
    db: Session, 
    order_id: int, 
    user_id: int, 
    qr_code: Optional[str] = None, 
    variant_id: Optional[int] = None
):
    # نضع الدالة بالكامل داخل try لضمان التراجع عن أي تغيير في حال حدوث أي خطأ
    try:
        # 1. تحديد المتغير (البحث يدوي أو عبر QR أو الكود)
        variant = None
        
        if variant_id:
            variant = db.query(ProductVariant).filter(
                ProductVariant.id == variant_id,
                ProductVariant.deleted_at.is_(None)
            ).with_for_update().first()
        elif qr_code and isinstance(qr_code, str):
            clean_qr = qr_code.strip()
            filename = clean_qr.replace("\\", "/").split("/")[-1]
            stripped_digits = clean_qr.lstrip("0")

            # أ) فحص مطابقة QR الكود المباشر أو اسم الملف في جدول ProductVariant
            variant = db.query(ProductVariant).filter(
                or_(
                    ProductVariant.qr_code == clean_qr,
                    ProductVariant.qr_code.like(f"%{filename}")
                ),
                ProductVariant.deleted_at.is_(None)
            ).with_for_update().first()

            # ب) إذا كان المدخل رقماً، فحص المطابقة مع ID المتغير المباشر
            if not variant and clean_qr.isdigit():
                variant = db.query(ProductVariant).filter(
                    ProductVariant.id == int(clean_qr),
                    ProductVariant.deleted_at.is_(None)
                ).with_for_update().first()

            # جـ) إذا لم يجد بالـ ID أو الـ QR، يبحث برمز المنتج الأب Product.code
            if not variant:
                conds = [Product.code == clean_qr, Product.code.like(f"%{clean_qr}%")]
                if stripped_digits:
                    conds.append(Product.code.like(f"%{stripped_digits}%"))

                v_candidate = db.query(ProductVariant).join(ProductColor).join(Product).filter(
                    or_(*conds),
                    ProductVariant.deleted_at.is_(None),
                    Product.deleted_at.is_(None)
                ).first()
                
                if v_candidate:
                    # ترجيح المتغير الموجود ضمن بنود هذا الطلب تحديداً
                    order_match_v = db.query(ProductVariant).join(OrderItem, OrderItem.variant_id == ProductVariant.id).join(ProductColor).join(Product).filter(
                        OrderItem.order_id == order_id,
                        or_(*conds),
                        OrderItem.deleted_at.is_(None),
                        ProductVariant.deleted_at.is_(None)
                    ).first()
                    variant = order_match_v or v_candidate
        
        if not variant:
            error_msg = f"المنتج غير موجود (ID: {variant_id})" if variant_id else f"الكود الممسوح ({qr_code}) غير مسجل في النظام"
            raise HTTPException(status_code=404, detail=error_msg)

        # 2. التحقق من انتماء المنتج للطلب (أولاً الأصناف التي لم يكتمل سحبها بعد)
        order_item = db.query(OrderItem).filter(
            OrderItem.order_id == order_id, 
            OrderItem.variant_id == variant.id,
            OrderItem.deleted_at.is_(None),
            OrderItem.picked_quantity < OrderItem.quantity
        ).with_for_update().first()
        
        if not order_item:
            # التحقق إن كان المنتج ينتمي للطلب ولكنه مكتمل التجهيز بالفعل
            already_picked_item = db.query(OrderItem).filter(
                OrderItem.order_id == order_id, 
                OrderItem.variant_id == variant.id,
                OrderItem.deleted_at.is_(None)
            ).first()
            if already_picked_item:
                raise HTTPException(status_code=400, detail="تم مسح كافة القطع المطلوبة لهذا المنتج في هذا الطلب")
            else:
                raise HTTPException(status_code=400, detail="هذا المنتج لا ينتمي لأصناف هذا الطلب")

        # 3. تحديث الكمية الممسوحة
        order_item.picked_quantity += 1

        # جلب الطلب لتحديث حالته
        order = db.query(Order).filter(Order.id == order_id).with_for_update().first()
        if not order:
            raise HTTPException(status_code=404, detail="الطلب غير موجود")

        if order.status == 'pending':
            order.status = 'in_preparation'

        # 4. التحقق من اكتمال كافة بنود الطلب
        all_items = db.query(OrderItem).filter(OrderItem.order_id == order_id).all()
        is_order_complete = all(item.picked_quantity == item.quantity for item in all_items)

        if is_order_complete:
            affected_product_ids = set()
            variant_ids = [item.variant_id for item in all_items]
            variants_map = {
                v.id: v for v in db.query(ProductVariant)
                .filter(ProductVariant.id.in_(variant_ids))
                .with_for_update()
                .all()
            }
            for item in all_items:
                v = variants_map.get(item.variant_id)
                if v:
                    v.quantity_reserved = max(0, v.quantity_reserved - item.quantity)
                    v.total_sold = (v.total_sold or 0) + item.quantity
                    if v.color:
                        affected_product_ids.add(v.color.product_id)
            
            db.flush()
            for p_id in affected_product_ids:
                sync_product_metrics(db, p_id)
                
            order.status = 'prepared'

        # 5. توثيق عملية المسح
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
        
        db.commit()
        
        return {
            "status": order.status, 
            "is_complete": is_order_complete,
            "message": f"تم مسح قطعة من {order_item.product_name or 'المنتج'} بنجاح ({order_item.picked_quantity}/{order_item.quantity})",
            "picked_quantity": order_item.picked_quantity,
            "total_quantity": order_item.quantity,
            "variant_id": variant.id
        }
        

    except Exception as e:
        db.rollback() # تراجع عن أي شيء في حال فشل أي خطوة
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"خطأ تقني في المعالجة: {str(e)}")



def standalone_return_logic(db: Session, qr_code: str, user_id: int, note: str = "مرتجع"):
    """منطق المرتجعات المباشرة للمخزن"""
    # ✅ محلّل موحّد يدعم نص الـ QR المطبوع (VAR:id|SKU:code) إضافةً للمسار والكود
    from app.services.inventory_movement_service import resolve_variant_by_scan
    variant = resolve_variant_by_scan(db, qr_code, lock=True)
    if not variant: raise HTTPException(status_code=404, detail="الرمز غير موجود")

    if variant.total_sold <= 0:
        raise HTTPException(status_code=400, detail="لا يوجد قطع مبيوعة لإعادة استرجاعها")    

    q_before = variant.quantity_available

    # ✅ تنفيذ العملية أولاً ثم حساب q_after لضمان صحة سجلات حركات المخزون
    record_return_to_stock(db, variant_id=variant.id, user_id=user_id, quantity=1, notes=note)
    q_after = variant.quantity_available

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
    # 1. جلب البيانات — محلّل موحّد يدعم كل أشكال الرمز الممسوح
    from app.services.inventory_movement_service import resolve_variant_by_scan
    variant = resolve_variant_by_scan(db, qr_code, lock=True)
    if not variant:
        raise HTTPException(status_code=404, detail="الرمز غير موجود")

    if variant.quantity_available <= 0:
        raise HTTPException(status_code=400, detail="لا توجد كمية متاحة لإتلافها")


    q_before = variant.quantity_available

    # ✅ إصلاح: تنفيذ عملية الإتلاف أولاً ثم حساب q_after لضمان صحة سجلات حركات المخزون
    record_damage_entry(db, variant.id, user_id, 1, "QR Scan Damage", note)
    q_after = variant.quantity_available  # الآن بعد الخصم

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

def assign_delivery_logic(db: Session, order_id: int, delivery_data: DeliveryAssignRequest, user_id: int):
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
   

def delete_order_logic(db: Session, order_id: int, user_id: int):
    """
    إلغاء الطلب وإعادة المخزون بناءً على حالة الطلب الحالية.
    يسمح بحذف الطلبات بمختلف الحالات (بما فيها المشحونة والجاهزة) 
    ويقوم بإعادة ضبط الكميات في المستودع بدقة تلقائياً.
    """
    from datetime import datetime
    from fastapi import HTTPException
    from app.models.inventory import ProductVariant # تأكد من مطابقة مسار الـ Import لبيئتك
    from app.models.order import OrderAction # تأكد من مطابقة مسار الـ Import لبيئتك
    from app.services.order_service import sync_product_metrics # أو المسار الفعلي لدالة المزامنة لديك

    # 1. جلب الطلب مع قفل (Row-level Lock) لضمان عدم تعديله بالتزامن من مستخدم آخر
    db_order = db.query(Order).filter(
        Order.id == order_id, 
        Order.deleted_at.is_(None)
    ).with_for_update().first()

    if not db_order:
        raise HTTPException(status_code=404, detail="الطلب غير موجود أو تم حذفه مسبقاً")

    try:
        affected_product_ids = set()

        # 2. معالجة عناصر الطلب وعكس الكميات في المستودع
        # ✅ إصلاح: تجاهل العناصر المحذوفة مسبقاً (soft-deleted) لمنع إعادة إضافة كمياتها للمخزون مرتين
        for item in db_order.items:
            if item.deleted_at is not None:
                continue
            variant = db.query(ProductVariant).filter(
                ProductVariant.id == item.variant_id
            ).with_for_update().first()

            if variant:
                # الاحتفاظ بمعرف المنتج الأب لمزامنة المؤشرات الكلية لاحقاً
                if variant.color:
                    affected_product_ids.add(variant.color.product_id)

                # المنطق الرياضي المحدث:
                # أ. إذا كان الطلب جاهزاً أو مشحوناً: نعيد الكمية للمتاح ونخصمها من المباع الكلي
                if db_order.status in ('prepared', 'shipped'):
                    variant.quantity_available += item.quantity
                    variant.total_sold = max(0, (variant.total_sold or 0) - item.quantity)
                
                # ب. إذا كان الطلب معلقاً أو قيد التجهيز: نعيد الكمية للمتاح ونخصمها من المحجوز
                else:
                    variant.quantity_available += item.quantity
                    variant.quantity_reserved = max(0, (variant.quantity_reserved or 0) - item.quantity)

                db.add(variant)

        # 3. تنفيذ الحذف الناعم (Soft Delete) للطلب وعناصره
        now = datetime.now()
        
        db_order.deleted_at = now
        db_order.status = 'cancelled' # تحديث الحالة لـ ملغي للتقارير الدفترية

        for item in db_order.items:
            item.deleted_at = now
        
        # تحديث الحذف الناعم للعمليات اللوجستية المرتبطة بالطلب
        db.query(OrderAction).filter(OrderAction.order_id == order_id).update({"deleted_at": now})
        
        # تسجيل العملية في سجل التدقيق (Audit Log)
        create_order_action_log(
            db=db,
            order_id=order_id,
            user_id=user_id,
            action_type="order_cancelled",
            notes="تم إلغاء الطلب وإعادة المنتجات للمخزون تلقائياً بناءً على حالته قبل الحذف"
        )
        
        # 4. دفع التعديلات مؤقتاً ومزامنة مؤشرات المنتج الأب (Product Metrics)
        db.flush()
        for p_id in affected_product_ids:
            sync_product_metrics(db, p_id)

        # 5. الحفظ النهائي للمجالس والتأكيد في قاعدة البيانات
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
    if status in ('prepared', 'shipped'):
        variant.total_sold = max(0, (variant.total_sold or 0) - qty)
    else:
        variant.quantity_reserved = max(0, (variant.quantity_reserved or 0) - qty)

def _adjust_stock(status, variant, old_qty, new_qty):
    diff = new_qty - old_qty
    abs_diff = abs(diff)

    if status in ('prepared', 'shipped'):
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

def transition_order_status(db: Session, db_order: Order, old_status: str, new_status: str):
    """منطق تحويل المخزون عند تغير حالة الطلب"""
    # الحالات التي يعتبر فيها المخزون محجوزاً
    reserved_statuses = ('pending', 'in_preparation')
    # الحالات التي يعتبر فيها المخزون مباعاً ومخصوماً نهائياً
    sold_statuses = ('prepared', 'shipped')

    if old_status in reserved_statuses and new_status in sold_statuses:
        # من محجوز إلى مباع
        affected_product_ids = set()
        active_items = [item for item in db_order.items if item.deleted_at is None]
        # ✅ إصلاح N+1: جلب كل variants دفعة واحدة
        variant_ids = [item.variant_id for item in active_items]
        variants_map = {
            v.id: v for v in db.query(ProductVariant)
            .filter(ProductVariant.id.in_(variant_ids))
            .with_for_update()
            .all()
        }
        for item in active_items:
            variant = variants_map.get(item.variant_id)
            if variant:
                variant.quantity_reserved = max(0, (variant.quantity_reserved or 0) - item.quantity)
                variant.total_sold = (variant.total_sold or 0) + item.quantity
                db.add(variant)
                if variant.color:
                    affected_product_ids.add(variant.color.product_id)
        db.flush()
        for p_id in affected_product_ids:
            sync_product_metrics(db, p_id)

    elif old_status in sold_statuses and new_status in reserved_statuses:
        # إرجاع من مباع إلى محجوز
        affected_product_ids = set()
        active_items = [item for item in db_order.items if item.deleted_at is None]
        # ✅ إصلاح N+1: جلب كل variants دفعة واحدة
        variant_ids = [item.variant_id for item in active_items]
        variants_map = {
            v.id: v for v in db.query(ProductVariant)
            .filter(ProductVariant.id.in_(variant_ids))
            .with_for_update()
            .all()
        }
        for item in active_items:
            variant = variants_map.get(item.variant_id)
            if variant:
                variant.total_sold = max(0, (variant.total_sold or 0) - item.quantity)
                variant.quantity_reserved = (variant.quantity_reserved or 0) + item.quantity
                db.add(variant)
                if variant.color:
                    affected_product_ids.add(variant.color.product_id)
        db.flush()
        for p_id in affected_product_ids:
            sync_product_metrics(db, p_id)

def update_order_master_logic(db: Session, order_id: int, update_data: Dict, user_id: int):
    new_item_ids = [it['variant_id'] for it in update_data.get('items', [])] if 'items' in update_data else []
    db_order = _get_locked_order_and_variants(db, order_id, new_item_ids)

    if db_order.status == 'shipped' and 'items' in update_data:
        raise HTTPException(status_code=400, detail="ممنوع تعديل منتجات طلب تم شحنه")

    # حفظ الحالة القديمة للتحقق من الانتقال
    old_status = db_order.status

    try:
        _update_basic_info(db_order, update_data)

        if 'status' in update_data:
            db_order.status = update_data['status']

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
        
        # تشغيل انتقال الحالة إذا تغيرت
        transition_order_status(db, db_order, old_status, db_order.status)

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


def get_orders_comprehensive_logic(db: Session, skip: int = 0, limit: int = 100, status: Optional[str] = None, search: Optional[str] = None):
    """جلب كافة الطلبات مع دعم فلترة متقدمة وتشكيل البيانات للوحة التحكم"""
    
    # 1. بناء الاستعلام مع استبعاد المحذوفات وجلب كافة العلاقات اللازمة في ضربة واحدة لمنع مشكلة N+1
    query = db.query(Order).filter(Order.deleted_at.is_(None)).options(
        joinedload(Order.creator), # جلب بيانات الموظف (المستخدم الذي أنشأ الطلب)
        joinedload(Order.items).joinedload(OrderItem.variant).joinedload(ProductVariant.color), # لجلب صورة اللون
        joinedload(Order.items).joinedload(OrderItem.product) # لجلب صورة المنتج الأساسية
    )
    
    # 2. الفلترة حسب الحالة
    if status:
        query = query.filter(Order.status == status)
    
    # 3. نظام البحث المتقدم
    if search:
        search_term = f"%{search.strip()}%"
        conditions = [
            Order.customer_name.ilike(search_term),
            Order.social_media_source.ilike(search_term),
            # ✅ تحويل العمود JSON إلى String ليعمل بشكل آمن عبر جميع قواعد البيانات
            func.cast(Order.customer_phones, String).ilike(search_term) 
        ]
        
        # إذا كان مصطلح البحث عبارة عن رقم فقط، نضيف البحث بكود الطلب (ID)
        if search.strip().isdigit():
            conditions.append(Order.id == int(search.strip()))
            
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
            if item.deleted_at is not None:
                continue
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




def get_order_full_details_logic(db: Session, order_id: int):
    # 1. جلب الطلب مع كل العلاقات في استعلام واحد (Performance optimization)
    order = db.query(Order).options(
        joinedload(Order.creator),
        joinedload(Order.items).joinedload(OrderItem.product),
        joinedload(Order.items).joinedload(OrderItem.variant).joinedload(ProductVariant.color),
        joinedload(Order.actions).joinedload(OrderAction.user)
    ).filter(Order.id == order_id).first()

    if not order:
        return None

    # 2. حساب إجمالي الكميات للمسح (Total Progress)
    total_ordered = sum(item.quantity for item in order.items if item.deleted_at is None)
    total_picked = sum(item.picked_quantity or 0 for item in order.items if item.deleted_at is None)

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
        if item.deleted_at is not None:
            continue
        color_name = item.variant.color.color_name if item.variant and item.variant.color else None
        size_name = item.variant.size.name if item.variant and item.variant.size else None
        
        items_list.append({
            "product_name": item.product.name,
            "variant_id": item.variant_id,
            "color_name": color_name,
            "size": size_name,
            "quantity": item.quantity,
            "picked_quantity": item.picked_quantity or 0,
            "price": item.price_at_order,
            "image": get_item_image(item), # استخدام الدالة المساعدة
            "is_fully_picked": (item.picked_quantity or 0) >= item.quantity
        })

    # 4.5. تجهيز قائمة الحركات (Actions)
    actions_list = []
    for action in sorted(order.actions, key=lambda x: x.created_at or datetime.min, reverse=True):
        actions_list.append({
            "action_type": action.action_type,
            "user_name": action.user.name if action.user else "النظام",
            "created_at": action.created_at.isoformat() if action.created_at else None,
            "details": action.details
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
        "actions": actions_list,
        "summary": {
            "total_price": order.total_price,
            "total_items_count": len(order.items),
            "total_ordered_qty": total_ordered,
            "total_picked_qty": total_picked,
            "overall_progress_percentage": (total_picked / total_ordered * 100) if total_ordered > 0 else 0
        }
    }
from sqlalchemy.orm import Session
from sqlalchemy import func, case, and_, or_
import traceback
# الاستدعاءات صحيحة ومطابقة للمخطط بنسبة 100%
from app.models.inventory import Product, ProductVariant, ProductColor, Size
from app.models.order import Order
from app.models.user import User 

from sqlalchemy.orm import Session
from sqlalchemy import func, case, and_, or_
import traceback
from app.models.inventory import Product, ProductVariant, ProductColor, Size
from app.models.order import Order
from app.models.user import User
from fastapi import HTTPException
import traceback
import traceback
from datetime import datetime, timedelta
from sqlalchemy import func, case, and_, or_
from sqlalchemy.orm import Session
from sqlalchemy import func, case, String
from fastapi import HTTPException
 
# ✅ كاش بسيط في الذاكرة لمنع تشغيل 4 استعلامات DB عند كل تحديث
# TTL = 30 ثانية — يُحافظ على دقة البيانات مع تقليل الضغط بشكل كبير
_stats_cache: dict = {}
_STATS_CACHE_TTL_SECONDS = 30

def _get_cached_stats(key: str):
    entry = _stats_cache.get(key)
    if entry and (datetime.now() - entry['ts']).total_seconds() < _STATS_CACHE_TTL_SECONDS:
        return entry['data']
    return None

def _set_cached_stats(key: str, data):
    _stats_cache[key] = {'data': data, 'ts': datetime.now()}

def get_inventory_dashboard_stats(db: Session, period: str = '7d'):
    try:
        # ✅ تحقق من الكاش أولاً قبل تشغيل أي استعلام
        cached = _get_cached_stats(f'dashboard_{period}')
        if cached:
            return cached

        # حساب تاريخ بداية الفترة
        now = datetime.now()
        start_date = None
        if period and period != "all":
            if period == "today":
                start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
            elif period in ["7d", "week"]:
                start_date = now - timedelta(days=7)
            elif period in ["1m", "month", "30d"]:
                start_date = now - timedelta(days=30)
            elif period == "3m":
                start_date = now - timedelta(days=90)
            elif period == "6m":
                start_date = now - timedelta(days=180)
            elif period in ["1y", "year"]:
                start_date = now - timedelta(days=365)
            else:
                from app.services.time_helper import get_report_time_range
                start_date, _ = get_report_time_range(period)

        # =========================================================================
        # 1. إحصائيات المخزون العامة
        # =========================================================================
        inventory_stats = db.query(
            func.count(Product.id).label("total_products_count"),
            func.coalesce(func.sum(Product.total_available), 0).label("total_inventory"),
            func.coalesce(func.sum(Product.total_reserved), 0).label("total_reserved"),
            func.coalesce(func.sum(Product.total_sold), 0).label("total_sold"),
            func.coalesce(func.sum(Product.total_damaged), 0).label("total_damaged"),
            func.coalesce(func.sum(Product.total_returns), 0).label("total_returns")
        ).filter(Product.deleted_at.is_(None)).first()

        # 2. إحصائيات الطلبات (مطابقة تماماً لحالات الـ Enum في الصورة المرفقة)
        # =========================================================================
        order_query = db.query(
            # حساب العدد الإجمالي للطلبات وضمان عدم رجوعه كـ None
            func.coalesce(func.count(Order.id), 0).label("total_orders"),
    
            # حالة: معلق (pending)
            func.coalesce(
                func.sum(
                    case(
                        ((func.cast(Order.status, String) == 'pending', 1)),
                        else_=0
                    )
                ), 0
            ).label("pending_orders"),
    
            # حالة: قيد التجهيز (in_preparation) - مربوط بـ processing في الواجهات القديمة
            func.coalesce(
                func.sum(
                    case(
                        ((func.cast(Order.status, String) == 'in_preparation', 1)),
                        else_=0
                    )
                ), 0
            ).label("processing_orders"),

            # حالة: تم التجهيز (prepared) - مطابقة للصورة والفرونت إند المحدث
            func.coalesce(
                func.sum(
                    case(
                        ((func.cast(Order.status, String) == 'prepared', 1)),
                        else_=0
                    )
                ), 0
            ).label("ready_orders"),

            # حالة: تم الشحن/التوصيل (shipped) - مطابقة للصورة والفرونت إند المحدث
            func.coalesce(
                func.sum(
                    case(
                        ((func.cast(Order.status, String) == 'shipped', 1)),
                        else_=0
                    )
                ), 0
            ).label("shipping_orders"),

            # حالة: ملغي (cancelled) - تمت إضافتها احتياطاً لربطها بأي كروت مستقبلية
            func.coalesce(
                func.sum(
                    case(
                        ((func.cast(Order.status, String) == 'cancelled', 1)),
                        else_=0
                    )
                ), 0
            ).label("cancelled_orders")
        ).filter(Order.deleted_at.is_(None))

        # تطبيق شرط التاريخ إذا كانت الفترة الزمنية محددة
        if start_date:
            order_query = order_query.filter(Order.created_at >= start_date)

        order_stats = order_query.first()

        # =========================================================================
        # 3. إحصائيات المستخدمين
        # =========================================================================
        user_stats = db.query(
            func.count(User.id).label("total_users"),
            func.sum(case(((User.is_active == True) & (User.deleted_at.is_(None)), 1), else_=0)).label("active_users"),
            func.sum(case((User.deleted_at.is_not(None), 1), else_=0)).label("deleted_users"),
            func.sum(case((User.role_id == 2, 1), else_=0)).label("managers_count"),
            func.sum(case((User.role_id == 3, 1), else_=0)).label("staff_count")
        ).first()

        # =========================================================================
        # 4. استعلام تنبيهات المتغيرات (Variants Alerts)
        # =========================================================================
        variants_alerts_query = db.query(
            ProductVariant,
            Product.name.label("product_name"),
            Product.code.label("product_code"),
            ProductColor.color_name.label("color_name"),
            ProductColor.color_image.label("color_image"),
            Size.name.label("size_name")
        ).select_from(ProductVariant)\
         .join(ProductColor, ProductVariant.product_color_id == ProductColor.id, isouter=True)\
         .join(Product, ProductColor.product_id == Product.id, isouter=True)\
         .join(Size, ProductVariant.size_id == Size.id, isouter=True)\
         .filter(
             and_(
                 ProductVariant.deleted_at.is_(None),
                 Product.deleted_at.is_(None),
                 or_(
                     # الشرط الأول: نفاد تام (الكمية صفر) + مبيعات المتغير أكبر من صفر
                     and_(ProductVariant.quantity_available == 0, ProductVariant.total_sold > 0),
                     # الشرط الثاني: قارب على النفاد (الكمية أكبر من صفر وأقل من أو تساوي الحد الأدنى)
                     and_(ProductVariant.quantity_available > 0, ProductVariant.quantity_available <= ProductVariant.min_stock_threshold)
                 )
             )
         ).all()

        out_of_stock_variants_list = []
        low_stock_variants_list = []

        for row in variants_alerts_query:
            v = row.ProductVariant
            variant_data = {
                "variant_id": v.id,
                "product_name": row.product_name or "بدون اسم",
                "product_code": row.product_code or "N/A",
                "color": row.color_name or "افتراضي",
                "size": row.size_name or "افتراضي",
                "image": row.color_image,
                "available_quantity": int(v.quantity_available or 0),
                "total_sold": int(v.total_sold or 0),
                "min_threshold": v.min_stock_threshold
            }
            if v.quantity_available == 0:
                out_of_stock_variants_list.append(variant_data)
            else:
                low_stock_variants_list.append(variant_data)

        # =========================================================================
        # 5. استعلام تنبيهات المنتجات الأساسية (Products Alerts)
        # =========================================================================
        products_alerts_query = db.query(Product).filter(
            and_(
                Product.deleted_at.is_(None),
                or_(
                    # الشرط الأول: نفاد تام (الكمية صفر) + مبيعات المنتج أكبر من صفر
                    and_(Product.total_available == 0, Product.total_sold > 0),
                    # الشرط الثاني: قارب على النفاد (الكمية أكبر من صفر وأقل من أو تساوي الحد الأدنى)
                    and_(Product.total_available > 0, Product.total_available <= Product.min_stock_threshold)
                )
            )
        ).all()

        out_of_stock_products_list = []
        low_stock_products_list = []

        for p in products_alerts_query:
            product_data = {
                "product_id": p.id,
                "name": p.name,
                "code": p.code,
                "image": p.main_image,
                "available_quantity": int(p.total_available or 0),
                "total_sold": int(p.total_sold or 0),
                "min_threshold": p.min_stock_threshold
            }
            if p.total_available == 0:
                out_of_stock_products_list.append(product_data)
            else:
                low_stock_products_list.append(product_data)

        # =========================================================================
        # 6. إرجاع القاموس المنظم الموحد للفرونت إند
        # =========================================================================
        # ✅ حفظ النتيجة في الكاش قبل الإرجاع
        result = {
            "inventory": {
                "total_products": int((inventory_stats.total_products_count if inventory_stats else 0) or 0),
                "total_inventory": int((inventory_stats.total_inventory if inventory_stats else 0) or 0),
                "total_reserved": int((inventory_stats.total_reserved if inventory_stats else 0) or 0),
                "total_sold": int((inventory_stats.total_sold if inventory_stats else 0) or 0),
                "damaged": int((inventory_stats.total_damaged if inventory_stats else 0) or 0),
                "returns": int((inventory_stats.total_returns if inventory_stats else 0) or 0),
                "waste_rate": round(((inventory_stats.total_damaged if inventory_stats else 0) or 0) / ((inventory_stats.total_inventory if inventory_stats else 1) or 1) * 100, 2)
            },
            "orders": {
                "total": int((order_stats.total_orders if order_stats else 0) or 0),
                "pending": int((order_stats.pending_orders if order_stats else 0) or 0),
                "processing": int((order_stats.processing_orders if order_stats else 0) or 0),
                "ready": int((order_stats.ready_orders if order_stats else 0) or 0),
                "shipping": int((order_stats.shipping_orders if order_stats else 0) or 0),
                "cancelled": int((order_stats.cancelled_orders if order_stats else 0) or 0)
            },
            "users": {
                "total_system_users": int((user_stats.total_users if user_stats else 0) or 0),
                "active_now": int((user_stats.active_users if user_stats else 0) or 0),
                "deleted_history": int((user_stats.deleted_users if user_stats else 0) or 0),
                "managers_level": int((user_stats.managers_count if user_stats else 0) or 0),
                "staff_level": int((user_stats.staff_count if user_stats else 0) or 0)
            },
            "alerts": {
                "counters": {
                    "out_of_stock_products_count": len(out_of_stock_products_list or []),
                    "low_stock_products_count": len(low_stock_products_list or []),
                    "out_of_stock_variants_count": len(out_of_stock_variants_list or []),
                    "low_stock_variants_count": len(low_stock_variants_list or [])
                },
                "products": {
                    "out_of_stock": out_of_stock_products_list or [],
                    "low_stock": low_stock_products_list or []
                },
                "variants": {
                    "out_of_stock": out_of_stock_variants_list or [],
                    "low_stock": low_stock_variants_list or []
                }
            }
        }
        _set_cached_stats(f'dashboard_{period}', result)
        return result

    except Exception as e:
        print("!!! DASHBOARD LOGIC ERROR !!!")
        print(traceback.format_exc())
        raise HTTPException(
            status_code=500, 
            detail=f"Error in stats: {str(e)}" 
        )
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


from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_
import traceback

def get_products_with_variants_logic(db: Session):
    try:
        # ✅ إصلاح: استبدال joinedload بـ selectinload لمنع Cartesian Product
        # joinedload على علاقات متداخلة 3 مستويات = ضرب الصفوف أسياً في SQL
        # selectinload = استعلام IN منفصل لكل مستوى — أسرع بـ 3-5x للعلاقات المتداخلة
        from sqlalchemy.orm import selectinload
        products = db.query(Product).options(
            selectinload(Product.colors).selectinload(ProductColor.variants).selectinload(ProductVariant.size)
        ).filter(
            Product.deleted_at.is_(None)
        ).order_by(Product.created_at.desc()).all()

        result_list = []

        # 2. المرور على المنتجات وتجميع البيانات والإجماليات
        for p in products:
            
            # مصفوفة لتجميع كافة المتغيرات الخاصة بهذا المنتج عبر ألوانه المختلفة
            product_variants_list = []
            
            # المرور عبر الألوان غير المحذوفة للمنتج لإنتاج شجرة المتغيرات
            for color in p.colors:
                if color.deleted_at is not None:
                  continue
                
                for v in color.variants:
                    # تصفية المتغيرات غير المحذوفة فقط
                    if v.deleted_at is not None:
                        continue
                        
                    product_variants_list.append({
                        "variant_id": v.id,
                        "color_name": color.color_name,      # من جدول product_colors
                        "color_image": color.color_image,    # من جدول product_colors
                        "size_name": v.size.name if v.size else "افتراضي", # من جدول sizes
                        "quantity_available": int(v.quantity_available or 0),
                        "quantity_reserved": int(v.quantity_reserved or 0),
                        "total_sold": int(v.total_sold or 0),
                        "returned_quantity": int(v.returned_quantity or 0),
                        "damaged_quantity": int(v.damaged_quantity or 0),
                        "qr_code": v.qr_code,
                        "sku": v.qr_code or str(v.id)
                    })

            # 3. بناء هيكل الرد الخاص بالمنتج الرئيسي والإجماليات المخزنة (Cache Columns)
            product_data = {
                "product_id": p.id,
                "product_name": p.name,
                "product_code": p.code or "N/A",
                "main_image": p.main_image,
                "prices": {
                    "cost_price": float(p.cost_price or 0.0),
                    "selling_price": float(p.selling_price or 0.0)
                },
                "inventory_summary": {
                    "total_available": int(p.total_available or 0),   # المتوفر حالياً
                    "total_reserved": int(p.total_reserved or 0),     # المحجوز في طلبات قيد التحضير
                    "total_sold": int(p.total_sold or 0),             # تم بيعه
                    "total_returns": int(p.total_returns or 0),       # الراجع
                    "total_damaged": int(p.total_damaged or 0)        # التالف
                },
                # دمج كافة المتغيرات التابعة له
                "variants": product_variants_list
            }

            result_list.append(product_data)

        # 4. إرجاع النتيجة النهائية المنظمة للفرونت إند
        return {
            "success": True,
            "total_active_products": len(result_list),
            "products": result_list
        }

    except Exception as e:
        print("!!! GET PRODUCTS WITH VARIANTS LOGIC ERROR !!!")
        print(traceback.format_exc())
        return {
            "success": False,
            "message": "حدث خطأ أثناء جلب المنتجات والمخزون",
            "error": str(e)
        }


def get_top_and_bottom_inventory_report_logic(db: Session):
    """
    دالة تقارير متقدمة: تجلب أفضل وأقل المتغيرات أداءً في (المبيعات، التوالف، الرواجع)
    بناءً على العلاقات المباشرة ومعالجة البيانات بشكل تجميعي فائق السرعة.
    """
    try:
        # 1. جلب المنتجات النشطة مع كافة العلاقات المرتبطة بها في استعلام واحد محسن
        # ✅ إصلاح N+1: بدون selectinload كانت الحلقات أدناه (p.colors ثم
        # color.variants ثم v.size) تُطلق استعلاماً منفصلاً لكل منتج ولون ومقاس
        # عبر الكتالوج بالكامل. نستخدم selectinload لا joinedload لتفادي
        # الضرب الديكارتي (نفس النمط المستخدم في get_products_with_variants_logic).
        products = (
            db.query(Product)
            .options(
                selectinload(Product.colors)
                .selectinload(ProductColor.variants)
                .selectinload(ProductVariant.size)
            )
            .filter(Product.deleted_at == None)
            .all()
        )
        
        all_variants_flat_list = []
        
        # 2. تحويل البيانات إلى قائمة مسطحة (Flat List) لسهولة الفرز البرمجي السريع
        for p in products:
            for color in p.colors:
                if color.deleted_at is not None:
                    continue
                    
                for v in color.variants:
                    if v.deleted_at is not None:
                        continue
                        
                    # تجميع كل بيانات المتغير المطلوبة في قاموس موحد
                    all_variants_flat_list.append({
                        "product_id": p.id,
                        "product_name": p.name,
                        "product_code": p.code,
                        "main_image": p.main_image,
                        "variant_id": v.id,
                        "color_name": color.color_name,
                        "color_image": color.color_image,
                        "size_name": v.size.name if v.size else "افتراضي",
                        "quantity_available": int(v.quantity_available or 0),
                        "quantity_reserved": int(v.quantity_reserved or 0),
                        "total_sold": int(v.total_sold or 0),
                        "damaged_quantity": int(v.damaged_quantity or 0),
                        "returned_quantity": int(v.returned_quantity or 0)
                    })
        
        # 3. عمليات الفرز الذكي (Sorting) بناءً على شروط التقارير المطلوبة
        
        # أ - أعلى 5 متغيرات مبيعاً (ترتيب تنازلي حسب total_sold)
        top_5_selling = sorted(all_variants_flat_list, key=lambda x: x["total_sold"], reverse=True)[:5]
        
        # ب - أقل 5 متغيرات مبيعاً (ترتيب تصاعدي حسب total_sold)
        bottom_5_selling = sorted(all_variants_flat_list, key=lambda x: x["total_sold"])[:5]
        
        # ج - أعلى 5 متغيرات في التوالف (ترتيب تنازلي حسب damaged_quantity)
        top_5_damaged = sorted(all_variants_flat_list, key=lambda x: x["damaged_quantity"], reverse=True)[:5]
        
        # د - أعلى 5 متغيرات في الرواجع (ترتيب تنازلي حسب returned_quantity)
        top_5_returned = sorted(all_variants_flat_list, key=lambda x: x["returned_quantity"], reverse=True)[:5]
        
        return {
            "success": True,
            "data": {
                "top_5_selling": top_5_selling,
                "bottom_5_selling": bottom_5_selling,
                "top_5_damaged": top_5_damaged,
                "top_5_returned": top_5_returned
            }
        }
        
    except Exception as e:
        print(f"🔴 Analytics Service Error: {str(e)}")
        return {
            "success": False,
            "message": f"حدث خطأ أثناء إعداد تقارير المخزن: {str(e)}"
        }        