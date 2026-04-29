<<<<<<< HEAD
# app/routers/variants.py
import os
# أضف Size إلى القائمة
from app.models.inventory import Product, ProductColor, ProductVariant, Size
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Dict
from datetime import datetime
from pydantic import BaseModel

from app.core.database import get_db
from app.core.deps import RoleChecker
from app.models.inventory import Product, ProductColor, ProductVariant
from app.utils import generate_variant_qr
=======
from fastapi import APIRouter, Depends, HTTPException, Form
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.deps import RoleChecker
from app.models.inventory import ProductColor, Size, ProductVariant
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
from app.crud.inventory_sync import sync_product_metrics

router = APIRouter(prefix="/variants", tags=["Product Variants"])

<<<<<<< HEAD
class VariantCreate(BaseModel):
    size_id: int
    qty: int
    min_stock: int = 5

class VariantUpdateQty(BaseModel):
    new_qty: int # الكمية الجديدة الكلية التي أصبحت في المخزن
    
    
@router.post("/batch-create", status_code=status.HTTP_201_CREATED)
async def create_product_variants(
    product_color_id: int,
    variants_data: List[VariantCreate], 
    db: Session = Depends(get_db),
    current_user = Depends(RoleChecker([1, 2, 3]))
):
    # 1. التحقق من وجود اللون
    color_entry = db.query(ProductColor).filter(
        ProductColor.id == product_color_id, 
        ProductColor.deleted_at == None
    ).first()
    
    if not color_entry:
        raise HTTPException(status_code=404, detail="عذراً، سجل اللون غير موجود.")

    # جلب المنتج الأب لاستخدام الكود الخاص به في الـ QR
    product = db.query(Product).filter(Product.id == color_entry.product_id).first()
    
    created_qr_files = []

    try:
        for item in variants_data:
            size_id = item.size_id
            qty = item.qty

            # أ. السطر السحري: التحقق من وجود المقاس وصلاحيته
            valid_size = db.query(Size).filter(Size.id == size_id, Size.deleted_at == None).first()
            if not valid_size:
                # سنستخدم raise هنا لإيقاف العملية كاملة إذا كان هناك مقاس واحد خطأ لضمان سلامة البيانات
                raise HTTPException(status_code=400, detail=f"المقاس ذو الرقم {size_id} غير موجود أو تم حذفه مسبقاً.")

            # ب. منع التكرار لنفس اللون والمقاس
            exists = db.query(ProductVariant).filter(
                ProductVariant.product_color_id == product_color_id,
                ProductVariant.size_id == size_id,
                ProductVariant.deleted_at == None
            ).first()

            if exists:
                continue # تخطي هذا المقاس لأنه موجود مسبقاً لهذا اللون

            # ج. تجهيز سجل المتغير
            new_variant = ProductVariant(
                product_color_id=product_color_id,
                size_id=size_id,
                quantity_available=max(0, qty), 
                min_stock_threshold=item.min_stock
            )
            db.add(new_variant)
            
            # د. الحصول على الـ ID فوراً لتوليد الـ QR
            db.flush() 

            # هـ. توليد الـ QR Code
            qr_path = await generate_variant_qr(new_variant.id, product.code)
            created_qr_files.append(qr_path)
            
            # و. ربط مسار الصورة بالسجل
            new_variant.qr_code = qr_path

        # 2. الحفظ النهائي لجميع المتغيرات دفعة واحدة
        db.commit()

        # 3. مزامنة إجمالي المخزن للمنتج
        sync_product_metrics(db, product.id)

        return {
            "status": "success",
            "message": f"تمت العملية بنجاح. تم إنشاء {len(created_qr_files)} متغير جديد.",
            "product_id": product.id
        }

    except HTTPException as http_exc:
        db.rollback()
        # مسح صور QR التي قد تكون أنشئت قبل حدوث الخطأ (تصحيح: إزالة self)
        _cleanup_qr_files(created_qr_files)
        raise http_exc

    except Exception as e:
        db.rollback() 
        # مسح صور QR التي قد تكون أنشئت قبل حدوث الخطأ (تصحيح: إزالة self)
        _cleanup_qr_files(created_qr_files)
        print(f"DEBUG ERROR: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail=f"فشل إنشاء المتغيرات. السبب: {str(e)}"
        )

# دالة مساعدة لتنظيف الملفات في حال الفشل
def _cleanup_qr_files(file_paths):
    for path in file_paths:
        if os.path.exists(path):
            try: os.remove(path)
            except: pass

@router.patch("/{variant_id}/update-qty")
async def update_variant_quantity(
    variant_id: int,
    data: VariantUpdateQty,
    db: Session = Depends(get_db),
    current_user = Depends(RoleChecker([1, 2]))
):
    # 1. البحث عن المتغير والتأكد من وجوده
    variant = db.query(ProductVariant).filter(
        ProductVariant.id == variant_id,
        ProductVariant.deleted_at == None
    ).first()

    if not variant:
        raise HTTPException(status_code=404, detail="هذا المتغير غير موجود.")

    try:
        # 2. تحديث الكمية وتوقيت التعديل
        variant.quantity_available = max(0, data.new_qty)
        variant.updated_at = datetime.utcnow() # هنا كان مكمن الخطأ، والآن تم إصلاحه

        # 3. حفظ التغيير للمتغير
        db.commit()

        # 4. المزامنة مع المنتج الأساسي
        # تأكد من مراجعة اسم العلاقة في موديل ProductVariant (هل هي color أم product_color؟)
        # إذا كانت العلاقة تسمى color استخدم variant.color.product_id
        product_id = variant.color.product_id
        
        sync_product_metrics(db, product_id)

        return {
            "status": "success",
            "message": "تم التحديث بنجاح",
            "new_qty": variant.quantity_available
        }

    except Exception as e:
        db.rollback()
        # طباعة الخطأ في الكونسول للمطور لمعرفة إذا كان هناك خطأ في أسماء العلاقات
        print(f"Update Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"فشل التحديث: {str(e)}")
=======
@router.post("/link")
async def link_color_with_size(color_id: int = Form(...), size_id: int = Form(...), quantity: int = Form(...), db: Session = Depends(get_db), current_user = Depends(RoleChecker([1, 2]))):
    color = db.query(ProductColor).get(color_id)
    if not color: raise HTTPException(status_code=404)
    new_variant = ProductVariant(product_color_id=color_id, size_id=size_id, quantity_available=quantity)
    db.add(new_variant); db.commit()
    sync_product_metrics(db, color.product_id)
    return {"success": True}
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
