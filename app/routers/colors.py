<<<<<<< HEAD
# app/routers/colors.py
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session
import os
from typing import Optional, List
=======
import os
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
from app.core.database import get_db
from app.models.inventory import Product, ProductColor, ProductVariant
from app.utils import process_and_save_color_image
from app.core.deps import RoleChecker
<<<<<<< HEAD
from datetime import datetime
=======
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
from app.crud.inventory_sync import sync_product_metrics

router = APIRouter(prefix="/colors", tags=["Colors"])

<<<<<<< HEAD
# --- 1. إضافة لون جديد لمنتج ---
@router.post("/", status_code=status.HTTP_201_CREATED)
async def add_color(
    product_id: int = Form(...),
    color_name: str = Form(...),
    image_file: Optional[UploadFile] = File(None), 
    db: Session = Depends(get_db),
    current_user = Depends(RoleChecker([1, 2]))
):

# --- 1. التنظيف والفحص الاحترافي للقيمة الافتراضية ---
# نقوم بتحويل النص لحروف صغيرة للمقارنة ثم إزالة المسافات

    check_name = color_name.strip().lower()
    
    if not color_name or check_name == "" or check_name == "string":
        raise HTTPException(
            status_code=400, 
            detail="عذراً، يجب إدخال اسم حقيقي للون. لا يمكن قبول القيمة الافتراضية أو ترك الحقل فارغاً."
        )

    # إعادة الاسم لشكلة الطبيعي بعد التأكد من صحته
    clean_color_name = color_name.strip()
    # التحقق من وجود المنتج
    product = db.query(Product).filter(Product.id == product_id, Product.deleted_at == None).first()
    if not product:
        raise HTTPException(status_code=404, detail=f"المنتج غير موجود.")

    # فحص تكرار اللون لنفس المنتج
    existing_color = db.query(ProductColor).filter(
        ProductColor.product_id == product_id,
        ProductColor.color_name == clean_color_name,
        ProductColor.deleted_at == None
    ).first()

    if existing_color:
        raise HTTPException(
            status_code=400, 
            detail=f"المنتج يحتوي بالفعل على لون باسم '{clean_color_name}'."
        )

    # معالجة الصورة
    saved_path = None
    if image_file:
        saved_path = await process_and_save_color_image(image_file)
        if saved_path == "ERROR_PROCESSING":
            raise HTTPException(status_code=422, detail="الملف المرفوع غير صالح كصورة.")

    try:
        new_color = ProductColor(
            product_id=product_id,
            color_name=clean_color_name,
            color_image=saved_path # تم التأكد من مطابقة الاسم لـ SQL
        )
        db.add(new_color)
        db.commit()
        db.refresh(new_color)
        
        return {
            "success": True,
            "message": "تمت إضافة اللون بنجاح.",
            "data": {"id": new_color.id, "color_name": new_color.color_name}
        }
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="خطأ داخلي أثناء الحفظ.")


# --- 2. تحديث بيانات لون ---
@router.patch("/{color_id}", status_code=status.HTTP_200_OK)
async def update_color(
    color_id: int,
    color_name: Optional[str] = Form(None),
    image_file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user = Depends(RoleChecker([1, 2]))
):
    # جلب السجل الحالي
    color_entry = db.query(ProductColor).filter(
        ProductColor.id == color_id, 
        ProductColor.deleted_at == None
    ).first()

    if not color_entry:
        raise HTTPException(status_code=404, detail="عذراً، سجل اللون غير موجود أو تم حذفه.")

    # --- الجزء الذكي لفحص الاسم ومنع "string" ---
    if color_name is not None:
        clean_name = color_name.strip()
        check_val = clean_name.lower()

        # إذا أرسل المستخدم "string" أو نصاً فارغاً، نتجاهل التعديل أو نرفضه
        if check_val == "string" or check_val == "":
             # هنا نختار تجاهل التعديل للاسم لضمان عدم تلف البيانات
             pass 
        elif clean_name != color_entry.color_name:
            # التحقق من عدم التكرار فقط إذا تغير الاسم فعلياً عن الاسم القديم
            duplicate = db.query(ProductColor).filter(
                ProductColor.product_id == color_entry.product_id,
                ProductColor.color_name == clean_name,
                ProductColor.id != color_id,
                ProductColor.deleted_at == None
            ).first()
            
            if duplicate:
                raise HTTPException(status_code=400, detail=f"فشل التحديث: الاسم '{clean_name}' مستخدم بالفعل لهذا المنتج.")
            
            color_entry.color_name = clean_name

    # --- معالجة الصورة ---
    if image_file and image_file.filename:
        new_path = await process_and_save_color_image(image_file)
        if new_path == "ERROR_PROCESSING":
            raise HTTPException(status_code=422, detail="الملف المرفوع ليس صورة صالحة.")
        
        # كود احترافي: حذف الصورة القديمة من السيرفر لتوفير المساحة
        if color_entry.color_image and os.path.exists(color_entry.color_image):
            try:
                os.remove(color_entry.color_image)
            except:
                pass # لا نعطل العملية إذا فشل الحذف الفيزيائي
                
        color_entry.color_image = new_path

    try:
        db.commit()
        db.refresh(color_entry)
        return {
            "success": True, 
            "message": "تم تحديث بيانات اللون بنجاح.",
            "data": {"id": color_entry.id, "color_name": color_entry.color_name}
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="حدث خطأ داخلي أثناء محاولة تحديث البيانات.")



@router.delete("/colors/{color_id}")
async def delete_color(
    color_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(RoleChecker([1]))
):
    color = db.query(ProductColor).filter(
        ProductColor.id == color_id,
        ProductColor.deleted_at == None
    ).first()

    if not color:
        raise HTTPException(status_code=404, detail="اللون غير موجود")

    product_id = color.product_id

    try:
        # 1. مسح صورة اللون من السيرفر
        if color.color_image:
            from app.utils import delete_old_image
            delete_old_image(color.color_image)

        # 2. حذف جميع المتغيرات (المقاسات) التابعة لهذا اللون
        variants = db.query(ProductVariant).filter(
            ProductVariant.product_color_id == color_id,
            ProductVariant.deleted_at == None
        ).all()

        for v in variants:
            if v.qr_code:
                delete_old_image(v.qr_code)
            v.deleted_at = datetime.utcnow()

        # 3. حذف اللون نفسه
        color.deleted_at = datetime.utcnow()
        
        db.commit()

        # 4. مزامنة المخزون للمنتج (لأن كميات الألوان المحذوفة يجب أن تُطرح)
        sync_product_metrics(db, product_id)

        return {"status": "success", "message": "تم حذف اللون وكافة مقاساته بنجاح"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
=======
@router.post("/", status_code=201)
async def add_color(product_id: int = Form(...), color_name: str = Form(...), image_file: Optional[UploadFile] = File(None), db: Session = Depends(get_db), current_user = Depends(RoleChecker([1, 2]))):
    if not db.query(Product).filter(Product.id == product_id, Product.deleted_at == None).first():
        raise HTTPException(status_code=404, detail="المنتج غير موجود")
    saved_path = await process_and_save_color_image(image_file) if image_file else None
    try:
        new_color = ProductColor(product_id=product_id, color_name=color_name.strip(), color_image=saved_path)
        db.add(new_color); db.commit(); db.refresh(new_color)
        return {"success": True, "data": new_color}
    except Exception:
        db.rollback()
        if saved_path and os.path.exists(saved_path): os.remove(saved_path)
        raise HTTPException(status_code=500)
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
