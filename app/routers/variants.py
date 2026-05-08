import os
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List , Optional
from app.models.user import User 
from datetime import datetime
from pydantic import BaseModel
from app.schemas.inventory import VariantUpdatePartial, VariantCreate

from app.core.database import get_db
from app.core.deps import RoleChecker
from app.schemas.inventory import VariantUpdatePartial
from app.utils import generate_variant_qr, delete_old_image
from app.models.inventory import Product, ProductColor, ProductVariant, Size
from app.utils import generate_variant_qr
from app.crud.inventory_sync import sync_product_metrics

router = APIRouter(tags=["Product Variants"])


@router.post("/batch-create")
async def create_product_variants(
    product_color_id: int,
    variants_data: List[VariantCreate], # سيستخدم السكيمة الموحدة من الملف الخارجي
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

            # 4. توليد الـ QR Code (يجب أن تكون الدالة async)
            qr_path = await generate_variant_qr(new_variant.id, product.code)
            new_variant.qr_code = qr_path
            created_count += 1

        if created_count > 0:
            # 5. حفظ التغييرات ومزامنة إحصائيات المنتج الرئيسي
            db.flush()

            sync_product_metrics(db, product.id)

            db.commit()
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


@router.delete("/product/{product_id}")
async def delete_full_product(product_id: int, db: Session = Depends(get_db),current_user: User = Depends(RoleChecker([1, 2]))):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product or product.deleted_at:
        raise HTTPException(status_code=404, detail="المنتج غير موجود")

    try:
        # حذف الصور والارتباطات (الألوان والمقاسات)
        colors = db.query(ProductColor).filter(ProductColor.product_id == product_id).all()
        for c in colors:
            variants = db.query(ProductVariant).filter(ProductVariant.product_color_id == c.id).all()
            for v in variants:
                if v.qr_code: delete_old_image(v.qr_code)
                v.deleted_at = datetime.utcnow()
            if c.color_image: delete_old_image(c.color_image)
            c.deleted_at = datetime.utcnow()

        if product.main_image: delete_old_image(product.main_image)
        product.deleted_at = datetime.utcnow()

        sync_product_metrics(db, product_id)

        db.commit()
        return {"detail": "تم حذف المنتج وكافة ملحقاته بنجاح"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))




@router.patch("/{variant_id}", status_code=status.HTTP_200_OK)
async def update_variant_partial(
    variant_id: int,
    update_data: VariantUpdatePartial,
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

    # 2. تحديث الكمية المتاحة (qty)
    if update_data.qty is not None:
        if update_data.qty < 0:
            raise HTTPException(status_code=400, detail="لا يمكن أن تكون الكمية بالسالب.")
        variant.quantity_available = update_data.qty
        has_changes = True

    # 3. تحديث حد المخزون الأدنى (min_stock)
    if update_data.min_stock is not None:
        if update_data.min_stock < 0:
            raise HTTPException(status_code=400, detail="حد المخزون لا يمكن أن يكون بالسالب.")
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

        # 5. تثبيت كافة التغييرات في خطوة واحدة (Atomic Operation)
        db.commit()
        db.refresh(variant)

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
async def delete_color_group(
    color_id: int,
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
        color.deleted_at = delete_time
        
        for variant in variants:
            variant.deleted_at = delete_time
            # تصفير الكمية المتاحة حتى لا تظهر في المخزون (اختياري ولكنه مفضل برمجياً)
            variant.quantity_available = 0 

        db.flush()
        # 5. الحفظ والمزامنة
        
        sync_product_metrics(db, color.product_id)
        db.commit()

        return {"status": "success", "message": "تم حذف اللون وجميع مقاساته بنجاح."}

    except Exception as e:
        db.rollback()
        print(f"Error deleting color group: {str(e)}")
        raise HTTPException(status_code=500, detail="حدث خطأ أثناء عملية الحذف.")


# -------------------------------------------------------------------
# الدالة الثانية: حذف "ارتباط واحد" (مقاس محدد للون محدد)
# -------------------------------------------------------------------
@router.delete("/{variant_id}", status_code=status.HTTP_200_OK)
async def delete_single_variant(
    variant_id: int,
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
        variant.deleted_at = datetime.utcnow()
        variant.quantity_available = 0 # تصفير الكمية لسحبها من إجمالي المنتج
        
        # 4. جلب معرف المنتج لعمل المزامنة
        color = db.query(ProductColor).filter(ProductColor.id == variant.product_color_id).first()

        if color:
            sync_product_metrics(db, color.product_id) # المزامنة والعملية لا تزال مفتوحة

        # 5. الحفظ والمزامنة
        db.commit()
        
        return {"status": "success", "message": "تم حذف المقاس المخصص بنجاح."}

    except Exception as e:
        db.rollback()
        print(f"Error deleting single variant: {str(e)}")
        raise HTTPException(status_code=500, detail="حدث خطأ أثناء عملية الحذف.")
