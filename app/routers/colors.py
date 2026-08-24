from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status, Request
from sqlalchemy.orm import Session
import os
from app.core.database import SessionLocal
from typing import Optional
from datetime import datetime
from app.core.database import get_db
from app.models.inventory import Product, ProductColor, ProductVariant
from app.services.audit_service import log_color_action
from app.utils import process_and_save_color_image, delete_old_image
from app.core.deps import RoleChecker
from app.crud.inventory_sync import sync_product_metrics

router = APIRouter(tags=["Colors"])

@router.post("/", status_code=status.HTTP_201_CREATED)
async def add_color(
    request: Request,
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
        db.flush() # الحصول على ID اللون قبل الـ commit

        # --- تسجيل العملية في الرقابة ---
        log_color_action(
            db=db,
            user_id=current_user.id,
            color_id=new_color.id,
            action_type="created",
            details={"color_name": clean_name, "product_id": product_id},
            ip=request.client.host
        )

        db.commit()
        db.refresh(new_color)
        return {"success": True, "data": new_color}
    except Exception:
        db.rollback()
        if saved_path: delete_old_image(saved_path)
        raise HTTPException(status_code=500, detail="فشل حفظ اللون")


@router.put("/{color_id}")
async def update_color(
    request: Request,
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
    old_name = color.color_name
    old_image_path = color.color_image
    saved_path = None

    changes = {} # القاموس الذي سيتم ملؤه الآن

    if not clean_name or clean_name.lower() == "string":
        raise HTTPException(status_code=400, detail="خطأ: اسم اللون الجديد غير صالح.")

    try:
        # 3. معالجة الصورة الجديدة إذا رُفعت
        if image_file:
            saved_path = await process_and_save_color_image(image_file)
            color.color_image = saved_path
            # --- إضافة التغيير للمراقبة ---
            changes["image"] = "updated" 
            
            # حذف الصورة القديمة من السيرفر بعد نجاح الحفظ الجديد
            if old_image_path:
                delete_old_image(old_image_path)

        # 4. تحديث الاسم والحفظ (مع تتبع التغيير)
        if old_name != clean_name:
            # --- إضافة التغيير للمراقبة ---
            changes["color_name"] = {"from": old_name, "to": clean_name}
            color.color_name = clean_name

        # --- لا يتم التسجيل أو الحفظ إلا إذا حدث تغيير فعلي ---
        if changes:
            log_color_action(
                db=db,
                user_id=current_user.id,
                color_id=color.id,
                action_type="updated",
                details=changes,
                ip=request.client.host
            )
            db.commit()
            db.refresh(color)
            return {"success": True, "message": "تم تحديث بيانات اللون بنجاح", "data": color}
        
        return {"success": True, "message": "لم يتم إجراء أي تغييرات"}

    except Exception as e:
        db.rollback()
        if saved_path:
            delete_old_image(saved_path)
        raise HTTPException(status_code=500, detail=f"حدث خطأ أثناء تحديث البيانات: {str(e)}")
