from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session
import os
from typing import Optional
from datetime import datetime
from app.core.database import get_db
from app.models.inventory import Product, ProductColor, ProductVariant
from app.utils import process_and_save_color_image, delete_old_image
from app.core.deps import RoleChecker
from app.crud.inventory_sync import sync_product_metrics

router = APIRouter(prefix="/colors", tags=["Colors"])

@router.post("/", status_code=status.HTTP_201_CREATED)
async def add_color(
    product_id: int = Form(...),
    color_name: str = Form(...),
    image_file: Optional[UploadFile] = File(None), 
    db: Session = Depends(get_db),
    current_user = Depends(RoleChecker([1, 2]))
):
    clean_name = color_name.strip()
    if not clean_name or clean_name.lower() == "string":
        raise HTTPException(status_code=400, detail="اسم اللون غير صالح")

    product = db.query(Product).filter(Product.id == product_id, Product.deleted_at == None).first()
    if not product:
        raise HTTPException(status_code=404, detail="المنتج غير موجود")

    saved_path = await process_and_save_color_image(image_file) if image_file else None
    
    try:
        new_color = ProductColor(product_id=product_id, color_name=clean_name, color_image=saved_path)
        db.add(new_color)
        db.commit()
        db.refresh(new_color)
        return {"success": True, "data": new_color}
    except Exception:
        db.rollback()
        if saved_path: delete_old_image(saved_path)
        raise HTTPException(status_code=500, detail="فشل حفظ اللون")


@router.put("/{color_id}")
async def update_color(
    color_id: int,
    color_name: str = Form(...),
    image_file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user = Depends(RoleChecker([1, 2])) # المدير والمشرف
):
    # 1. البحث عن اللون والتأكد من وجوده
    color = db.query(ProductColor).filter(ProductColor.id == color_id).first()
    if not color:
        raise HTTPException(status_code=404, detail="خطأ: لم يتم العثور على اللون المطلوب.")

    # 2. تنظيف الاسم الجديد
    clean_name = color_name.strip()
    if not clean_name or clean_name.lower() == "string":
        raise HTTPException(status_code=400, detail="خطأ: اسم اللون الجديد غير صالح.")

    old_image_path = color.color_image
    saved_path = None

    try:
        # 3. معالجة الصورة الجديدة إذا رُفعت
        if image_file:
            saved_path = await process_and_save_color_image(image_file)
            color.color_image = saved_path
            # حذف الصورة القديمة من السيرفر بعد نجاح الحفظ الجديد
            if old_image_path:
                delete_old_image(old_image_path)

        # 4. تحديث الاسم والحفظ
        color.color_name = clean_name
        db.commit()
        db.refresh(color)
        
        return {"success": True, "message": "تم تحديث بيانات اللون بنجاح", "data": color}

    except Exception as e:
        db.rollback()
        # إذا فشلت العملية وكان هناك صورة جديدة رُفعت، نحذفها فوراً
        if saved_path:
            delete_old_image(saved_path)
        raise HTTPException(status_code=500, detail=f"حدث خطأ أثناء تحديث البيانات: {str(e)}")



@router.delete("/{color_id}")
def delete_color(
    color_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(RoleChecker([1,2])) # المدير فقط (للحماية القصوى)
):
    # 1. البحث عن اللون
    color = db.query(ProductColor).filter(ProductColor.id == color_id).first()
    if not color:
        raise HTTPException(status_code=404, detail="خطأ: اللون غير موجود أو تم حذفه مسبقاً.")

    # 2. التحقق من وجود تنوعات مرتبطة (Variants)
    # ملاحظة: إذا كان هناك مخزون مرتبط بهذا اللون، يفضل عدم الحذف أو التنبيه
    has_variants = db.query(ProductVariant).filter(ProductVariant.color_id == color_id).first()
    if has_variants:
        raise HTTPException(
            status_code=400, 
            detail="لا يمكن حذف اللون لارتباطه بتنوعات منتجات ومخزون حالي. قم بحذف التنوعات أولاً."
        )

    try:
        # 3. احتفاظ بمسار الصورة لحذفها بعد نجاح حذف السجل
        image_to_delete = color.color_image
        
        db.delete(color)
        db.commit()

        # 4. حذف الملف الفيزيائي من السيرفر
        if image_to_delete:
            delete_old_image(image_to_delete)

        return {"success": True, "message": f"تم حذف اللون '{color.color_name}' وكافة ملفاته بنجاح."}

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="فشل تنفيذ عملية الحذف في قاعدة البيانات.")