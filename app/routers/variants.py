import os
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List , Optional
from app.models.user import User 
from datetime import datetime
from app.core.database import SessionLocal
from pydantic import BaseModel
from app.schemas.inventory import VariantUpdatePartial, VariantCreate,PaginatedVariantFilterResponse,VariantFilterItemResponse
from app.core.deps import RoleChecker
from app.core.websocket_manager import manager
from sqlalchemy import or_, and_
from fastapi import Query

from app.core.database import get_db
from app.core.deps import RoleChecker
from app.schemas.inventory import VariantUpdatePartial
from app.utils import generate_variant_qr, delete_old_image
from app.models.inventory import Product, ProductColor, ProductVariant, Size
from app.utils import generate_variant_qr
from app.crud.inventory_sync import sync_product_metrics
from app.services.order_service import get_inventory_dashboard_stats

# استيراد دوال المراقبة من ملفك
from app.services.audit_service import (
    create_inventory_log, 
    create_system_audit_log,
    log_color_action
)


router = APIRouter(tags=["Product Variants"])


@router.post("/batch-create")
def create_product_variants(
    product_color_id: int,
    variants_data: List[VariantCreate],
    background_tasks: BackgroundTasks, # سيستخدم السكيمة الموحدة من الملف الخارجي
    db: Session = Depends(get_db),
    current_user = Depends(RoleChecker([1, 2, 3]))
):
    # 1. التحقق من وجود اللون
    color_entry = db.query(ProductColor).filter(
        ProductColor.id == product_color_id, 
        ProductColor.deleted_at == None
    ).first()
    
    if not color_entry:
        raise HTTPException(status_code=404, detail="اللون المحدد غير موجود.")

    # 2. جلب بيانات المنتج للـ QR Code والمزامنة
    product = db.query(Product).filter(Product.id == color_entry.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="المنتج المرتبط بهذا اللون غير موجود.")
    
    created_count = 0
    try:
        for item in variants_data:
            # التحقق من عدم تكرار المقاس لنفس اللون (تفادي Duplicate Entries)
            exists = db.query(ProductVariant).filter(
                ProductVariant.product_color_id == product_color_id,
                ProductVariant.size_id == item.size_id,
                ProductVariant.deleted_at == None
            ).first()
            
            if exists: 
                continue

            # 3. إنشاء سجل المتغير الجديد
            new_variant = ProductVariant(
                product_color_id=product_color_id,
                size_id=item.size_id,
                quantity_available=max(0, item.qty),
                min_stock_threshold=item.min_stock
            )
            
            db.add(new_variant)
            db.flush() # الحصول على ID المتغير فوراً لاستخدامه في الـ QR

            # 4. توليد الـ QR Code
            qr_path = generate_variant_qr(new_variant.id, product.code)
            new_variant.qr_code = qr_path

            # --- [إضافة: مراقبة المخزون] ---
            # تسجيل الكمية المضافة كـ "رصيد افتتاحي"
            if item.qty > 0:
                create_inventory_log(
                    db=db, variant_id=new_variant.id, product_id=product.id,
                    user_id=current_user.id, movement_type='initial_stock',
                    quantity_change=item.qty, quantity_before=0,
                    notes="إضافة رصيد افتتاحي عند إنشاء المقاس",
                    details={"initial_qty": item.qty}
                )
                
            created_count += 1

        if created_count > 0:
            # 5. حفظ التغييرات ومزامنة إحصائيات المنتج الرئيسي
            db.flush()
            sync_product_metrics(db, product.id)

            # --- [إضافة: رقابة النظام] ---
            create_system_audit_log(
                db=db, user_id=current_user.id, action_target="product_color",
                target_id=product_color_id, action_type="bulk_variants_created",
                details={"count": created_count}
            )

            db.commit()
            background_tasks.add_task(refresh_dashboard_ws)
            return {
                "status": "success", 
                "message": f"تم إنشاء {created_count} مقاسات وتوليد أكواد QR بنجاح."
            }
        else:
            return {
                "status": "info", 
                "message": "لم يتم إضافة مقاسات جديدة (ربما المقاسات موجودة مسبقاً)."
            }

    except Exception as e:
        db.rollback()
        print(f"Error in batch-create: {str(e)}")
        raise HTTPException(status_code=500, detail=f"حدث خطأ أثناء الإنشاء: {str(e)}")



@router.patch("/{variant_id}", status_code=status.HTTP_200_OK)
def update_variant_partial(
    variant_id: int,
    update_data: VariantUpdatePartial,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user = Depends(RoleChecker([1, 2])) # الصلاحيات للإدارة والمشرفين
):
    # 1. جلب المتغير من قاعدة البيانات
    variant = db.query(ProductVariant).filter(
        ProductVariant.id == variant_id,
        ProductVariant.deleted_at == None
    ).first()

    if not variant:
        raise HTTPException(status_code=404, detail="المقاس المطلوب غير موجود أو تم حذفه.")

    has_changes = False
    old_qty = variant.quantity_available
    old_min_stock = variant.min_stock_threshold
    audit_details = {}

    # مراقبة تغيير الكمية
    if update_data.qty is not None:
        if update_data.qty != old_qty:
            diff = update_data.qty - old_qty
            # --- [إضافة: مراقبة المخزون - جرد يدوي] ---
            color_entry = db.query(ProductColor).filter(ProductColor.id == variant.product_color_id).first()
            create_inventory_log(
                db=db, variant_id=variant.id, product_id=color_entry.product_id,
                user_id=current_user.id, movement_type='manual_adjust',
                quantity_change=diff, quantity_before=old_qty,
                notes="تعديل كمية يدوي من شاشة التحكم"
            )
            variant.quantity_available = update_data.qty
            audit_details["quantity_available"] = {"from": old_qty, "to": update_data.qty}
            has_changes = True

    # 3. تحديث حد المخزون الأدنى (min_stock)
    if update_data.min_stock is not None:
        if update_data.min_stock < 0:
            raise HTTPException(status_code=400, detail="حد المخزون لا يمكن أن يكون بالسالب.")
            
        audit_details["min_stock_threshold"] = {
            "from": variant.min_stock_threshold, 
            "to": update_data.min_stock
        }
           
        variant.min_stock_threshold = update_data.min_stock
        has_changes = True

    # إذا لم يتم إرسال أي حقول للتعديل
    if not has_changes:
        return {"status": "info", "message": "لم يتم إجراء أي تغييرات (الحقول مرسلة فارغة)."}

    try:
        # تحديث توقيت التعديل الأخير
        variant.updated_at = datetime.utcnow()
        db.flush()
        
        # 4. البحث عن سجل اللون المرتبط لتنفيذ المزامنة الشاملة للمنتج
        color_entry = db.query(ProductColor).filter(ProductColor.id == variant.product_color_id).first()

        if color_entry:
            # تحديث إحصائيات المنتج الرئيسي (الإجمالي، المتاح، إلخ) قبل الحفظ النهائي
            sync_product_metrics(db, color_entry.product_id)

        # --- [إضافة: رقابة النظام] ---
        create_system_audit_log(
            db=db, user_id=current_user.id, action_target="variant",
            target_id=variant.id, action_type="updated", details=audit_details
        )


        # 5. تثبيت كافة التغييرات في خطوة واحدة (Atomic Operation)
        db.commit()
        db.refresh(variant)
        background_tasks.add_task(refresh_dashboard_ws)

        return {
            "status": "success",
            "message": "تم تحديث بيانات المقاس ومزامنة إحصائيات المنتج بنجاح.",
            "data": {
                "id": variant.id,
                "new_qty": variant.quantity_available,
                "new_min_stock": variant.min_stock_threshold,
                "updated_at": variant.updated_at
            }
        }

    except Exception as e:
        db.rollback()
        # طباعة الخطأ في وحدة التحكم لتسهيل تصحيحه أثناء التطوير
        print(f"CRITICAL ERROR (Variant Update): {str(e)}")
        raise HTTPException(status_code=500, detail="فشل في حفظ التعديلات، يرجى مراجعة سجلات النظام.")





# -------------------------------------------------------------------
# الدالة الأولى: حذف "مجموعة" (اللون وجميع مقاساته المرتبطة)
# -------------------------------------------------------------------
@router.delete("/color/{color_id}", status_code=status.HTTP_200_OK)
def delete_color_group(
    color_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user = Depends(RoleChecker([1, 2])) # صلاحيات الإدارة فقط
):
    # 1. البحث عن اللون
    color = db.query(ProductColor).filter(
        ProductColor.id == color_id,
        ProductColor.deleted_at == None
    ).first()

    if not color:
        raise HTTPException(status_code=404, detail="اللون غير موجود أو تم حذفه مسبقاً.")

    # 2. جلب جميع المقاسات (Variants) المرتبطة بهذا اللون
    variants = db.query(ProductVariant).filter(
        ProductVariant.product_color_id == color.id,
        ProductVariant.deleted_at == None
    ).all()

    # 3. صمام الأمان: التحقق من عدم وجود طلبات قيد التنفيذ لأي مقاس ضمن هذا اللون
    for variant in variants:
        if variant.quantity_reserved > 0:
            raise HTTPException(
                status_code=400, 
                detail=f"لا يمكن حذف هذا اللون لوجود طلبات معلقة على أحد مقاساته. يرجى معالجة الطلبات أولاً."
            )

    try:
        # 4. تطبيق الحذف الناعم (Soft Delete)
        delete_time = datetime.utcnow()

        for v in variants:
            # --- [نقطة مراقبة المخزون: سحب رصيد المقاسات التابعة لهذا اللون] ---
            if v.quantity_available > 0:
                create_inventory_log(
                    db=db, 
                    variant_id=v.id, 
                    product_id=color.product_id, 
                    user_id=current_user.id,
                    movement_type='system_deduction', 
                    quantity_change=-v.quantity_available, 
                    quantity_before=v.quantity_available,
                    notes=f"سحب رصيد بسبب حذف مجموعة اللون (ID:{color_id})"
                )

        
        for variant in variants:
            variant.deleted_at = delete_time
            # تصفير الكمية المتاحة حتى لا تظهر في المخزون (اختياري ولكنه مفضل برمجياً)
            variant.quantity_available = 0
        

        color.deleted_at = delete_time # [تعديل] نقلها خارج حلقة المقاسات لتحسين الأداء
        db.flush()
        sync_product_metrics(db, color.product_id)
       

        log_color_action(
            db=db, 
            user_id=current_user.id, 
            color_id=color_id, 
            action_type="deleted",
            details={"product_id": color.product_id, "variants_count": len(variants)}
        )

        

        db.commit()
        background_tasks.add_task(refresh_dashboard_ws)

        return {"status": "success", "message": "تم حذف اللون وجميع مقاساته بنجاح."}

    except Exception as e:
        db.rollback()
        print(f"Error deleting color group: {str(e)}")
        raise HTTPException(status_code=500, detail="حدث خطأ أثناء عملية الحذف.")


# -------------------------------------------------------------------
# الدالة الثانية: حذف "ارتباط واحد" (مقاس محدد للون محدد)
# -------------------------------------------------------------------
@router.delete("/{variant_id}", status_code=status.HTTP_200_OK)
def delete_single_variant(
    variant_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user = Depends(RoleChecker([1, 2]))
):
    # 1. البحث عن المقاس
    variant = db.query(ProductVariant).filter(
        ProductVariant.id == variant_id,
        ProductVariant.deleted_at == None
    ).first()

    if not variant:
        raise HTTPException(status_code=404, detail="المقاس غير موجود أو تم حذفه مسبقاً.")

    # 2. صمام الأمان: التحقق من عدم وجود كمية محجوزة في طلبات
    if variant.quantity_reserved > 0:
        raise HTTPException(
            status_code=400, 
            detail="لا يمكن حذف هذا المقاس لوجود طلبات قيد التنفيذ تعتمد عليه."
        )

    try:
        # 3. تطبيق الحذف الناعم
        
        
        # 4. جلب معرف المنتج لعمل المزامنة
        color = db.query(ProductColor).filter(ProductColor.id == variant.product_color_id).first()
        # --- [إضافة: مراقبة المخزون - سحب الكمية من النظام] ---
        if variant.quantity_available > 0:
            create_inventory_log(
                db=db, variant_id=variant.id, product_id=color.product_id if color else 0,
                user_id=current_user.id, movement_type='system_deduction',
                quantity_change=-variant.quantity_available,
                quantity_before=variant.quantity_available,
                notes="تصفير الكمية بسبب حذف سجل المقاس"
        ) 
        
        variant.deleted_at = datetime.utcnow()
        variant.quantity_available = 0
        db.flush()
         
        if color:
            sync_product_metrics(db, color.product_id) # المزامنة والعملية لا تزال مفتوحة

        # --- [إضافة: رقابة النظام] ---
        create_system_audit_log(
            db=db, user_id=current_user.id, action_target="variant",
            target_id=variant.id, action_type="deleted"
        )    

        # 5. الحفظ والمزامنة
        db.commit()
        background_tasks.add_task(refresh_dashboard_ws)
        
        return {"status": "success", "message": "تم حذف المقاس المخصص بنجاح."}

    except Exception as e:
        db.rollback()
        print(f"Error deleting single variant: {str(e)}")
        raise HTTPException(status_code=500, detail="حدث خطأ أثناء عملية الحذف.")




@router.delete("/product/{product_id}")
def delete_full_product(product_id: int,background_tasks: BackgroundTasks, db: Session = Depends(get_db),current_user: User = Depends(RoleChecker([1, 2]))):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product or product.deleted_at:
        raise HTTPException(status_code=404, detail="المنتج غير موجود")

    try:
        # حذف الصور والارتباطات (الألوان والمقاسات)
        colors = db.query(ProductColor).filter(ProductColor.product_id == product_id).all()
        for c in colors:
            variants = db.query(ProductVariant).filter(ProductVariant.product_color_id == c.id).all()
            for v in variants:

                # [إضافة] توثيق خروج بضاعة المنتج بالكامل من المخزن
                if v.quantity_available > 0:
                    create_inventory_log(
                        db=db, variant_id=v.id, product_id=product_id, user_id=current_user.id,
                        movement_type='system_deduction', quantity_change=-v.quantity_available,
                        quantity_before=v.quantity_available, notes=f"حذف شامل للمنتج: {product.name}"
                    )

                if v.qr_code: delete_old_image(v.qr_code)
                v.deleted_at = datetime.utcnow()
                v.quantity_available = 0
                
            if c.color_image: delete_old_image(c.color_image)
            c.deleted_at = datetime.utcnow()

        if product.main_image: delete_old_image(product.main_image)
        product.deleted_at = datetime.utcnow()

        sync_product_metrics(db, product_id)

        # --- [نقطة المراقبة الإدارية: تسجيل عملية الحذف الكبرى] ---
        create_system_audit_log(
            db=db, 
            user_id=current_user.id, 
            action_target="product",
            target_id=product_id, 
            action_type="deleted",
            details={"product_name": product.name, "message": "تم حذف المنتج وكافة ملحقاته وتصفير مخزونه"}
        )

        db.commit()
        background_tasks.add_task(refresh_dashboard_ws)
        return {"detail": "تم حذف المنتج وكافة ملحقاته بنجاح"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))



async def refresh_dashboard_ws():
    # نتخطى العمل كلياً إن لم يوجد متصل، ونحسب خارج حلقة الأحداث إن وُجد
    if not manager.has_connections:
        return

    from fastapi.concurrency import run_in_threadpool

    def _compute():
        db = SessionLocal()
        try:
            return get_inventory_dashboard_stats(db)
        finally:
            db.close()

    try:
        stats = await run_in_threadpool(_compute)
        await manager.broadcast(stats)
    except Exception as e:
        print(f"WS refresh error: {e}")



@router.get("/filter", response_model=PaginatedVariantFilterResponse, status_code=status.HTTP_200_OK)
def filter_product_variants(
    search: Optional[str] = Query(None, description="البحث باسم المنتج أو كود المنتج"),
    catalog_id: Optional[int] = Query(None, description="معرف الكتالوج/القسم الافتراضي None يعطي الكل"),
    size_id: Optional[int] = Query(None, description="فلترة بحسب معرف المقاس المحدود"),
    low_stock_only: bool = Query(False, description="عرض المخزون الناقص فقط (الكمية <= حد الأمان)"),
    qr_code: Optional[str] = Query(None, description="فلتر رمز الـ QR خاص بالمنتج"),
    page: int = Query(1, ge=1, description="رقم الصفحة"),
    page_size: int = Query(20, ge=1, le=100, description="عدد العناصر في الصفحة الواحده"),
    db: Session = Depends(get_db),
    current_user = Depends(RoleChecker([1, 2, 3]))
):
    """
    نظام فلترة ذكي وشامل ومطور:
    1. يدعم الفلترة بالكتالوج ومسح الـ QR.
    2. يعيد قائمة بكافة معرفات المنتجات الفريدة المطابقة لخيارات البحث الحالية.
    """
    
    # 1. بناء الاستعلام الأساسي مع عمل الروابط (Joins) وعزل المحذوف ناعماً
    query = db.query(
        ProductVariant,
        Product.id.label("product_id"),
        Product.name.label("product_name"),
        Product.code.label("product_code"),
        Size.name.label("size_name"),
        ProductColor.id.label("color_id")
    ).join(
        ProductColor, ProductVariant.product_color_id == ProductColor.id
    ).join(
        Product, ProductColor.product_id == Product.id
    ).join(
        Size, ProductVariant.size_id == Size.id
    ).filter(
        ProductVariant.deleted_at == None,
        ProductColor.deleted_at == None,
        Product.deleted_at == None
    )

    # 2. فلتر الكتالوج (إذا كان None أو لم يرسل، يتخطى الشرط تلقائياً ويعرض الكل)
    if catalog_id is not None:
        query = query.filter(Product.catalog_id == catalog_id)

    # 3. تطبيق فلتر البحث الذكي (اسم المنتج أو كود المنتج أو رمز الـ QR)
    if search:
        clean_s = search.strip()
        search_filter = f"%{clean_s}%"
        conditions = [
            Product.name.ilike(search_filter),
            Product.code.ilike(search_filter),
            ProductVariant.qr_code.ilike(search_filter)
        ]
        digits_only = clean_s.lstrip("0")
        if digits_only and digits_only != clean_s:
            digits_filter = f"%{digits_only}%"
            conditions.extend([
                Product.code.ilike(digits_filter),
                ProductVariant.qr_code.ilike(digits_filter)
            ])
        query = query.filter(or_(*conditions))

    # 3.5 تطبيق فلتر الـ QR المباشر
    if qr_code:
        clean_qr = qr_code.strip()
        filename = clean_qr.replace("\\", "/").split("/")[-1]
        query = query.filter(
            or_(
                ProductVariant.qr_code == clean_qr,
                ProductVariant.qr_code.like(f"%{filename}")
            )
        )

    # 4. تطبيق فلتر المقاس
    if size_id:
        query = query.filter(ProductVariant.size_id == size_id)

    # 5. تطبيق الفلتر الذكي للمخزون الناقص
    if low_stock_only:
        query = query.filter(ProductVariant.quantity_available <= ProductVariant.min_stock_threshold)

    # [مهم جداً] 6. استخراج معرفات المنتجات الفريدة المطابقة للفلاتر بالكامل قبل الـ Pagination
    # التابع with_entities يغير حقول الـ SELECT بذكاء ليعيد فقط الـ ID الخاص بالمنتج بصيغة DISTINCT
    matched_product_ids = [
        row[0] for row in query.with_entities(Product.id).distinct().all()
    ]

    # 7. حساب العدادات الكلية
    total_count = query.count()
    low_stock_count = query.filter(
        ProductVariant.quantity_available <= ProductVariant.min_stock_threshold
    ).count()

    # 8. تطبيق نظام التنقيل (Pagination) وترتيب النتائج بحسب النقص أولاً
    offset = (page - 1) * page_size
    results = query.order_by(
        ProductVariant.quantity_available.asc()
    ).offset(offset).limit(page_size).all()

    # 9. تحويل المخرجات إلى الهيكل المطلوب
    items = []
    for row in results:
        variant, p_id, p_name, p_code, s_name, c_id = row
        is_low = variant.quantity_available <= variant.min_stock_threshold
        
        items.append(
            VariantFilterItemResponse(
                variant_id=variant.id,
                product_id=p_id,
                product_name=p_name,
                product_code=p_code,
                color_id=c_id,
                size_id=variant.size_id,
                size_name=s_name,
                quantity_available=variant.quantity_available,
                min_stock_threshold=variant.min_stock_threshold,
                quantity_reserved=variant.quantity_reserved,
                is_low_stock=is_low,
                qr_code=variant.qr_code
            )
        )

    return PaginatedVariantFilterResponse(
        total_count=total_count,
        low_stock_count=low_stock_count,
        page=page,
        page_size=page_size,
        matched_product_ids=matched_product_ids, # الحقل الجديد المضاف
        items=items
    )