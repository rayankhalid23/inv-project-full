import os, uuid, shutil
from fastapi import APIRouter, Depends, Form, File, UploadFile, status, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import Optional, List
from datetime import datetime

from app.core.database import get_db
from app.core.deps import RoleChecker
from app.models.inventory import Product, ProductColor, ProductVariant, Catalog
from app.crud.inventory_sync import sync_product_metrics
from app.utils import delete_old_image

router = APIRouter(prefix="/products", tags=["Products"])
UPLOAD_DIR = "static/uploads/products"

@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_product(
    name: str = Form(...),
    catalog_id: int = Form(...),
    selling_price: float = Form(...),
    cost_price: Optional[float] = Form(0.0),
    min_stock_threshold: int = Form(5),
    description: Optional[str] = Form(None),
    image_file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user = Depends(RoleChecker([1, 2]))
):
    # تحققات السلامة (Validation)
    if not name or name.strip().lower() == "string":
        raise HTTPException(status_code=400, detail="اسم المنتج غير صالح")
    
    if db.query(Product).filter(Product.name == name, Product.deleted_at == None).first():
        raise HTTPException(status_code=400, detail="هذا الاسم موجود مسبقاً")

    # حفظ الصورة
    image_path = None
    if image_file and image_file.filename:
        ext = os.path.splitext(image_file.filename)[1]
        filename = f"{uuid.uuid4().hex}{ext}"
        image_path = os.path.join(UPLOAD_DIR, filename)
        with open(image_path, "wb") as buffer:
            shutil.copyfileobj(image_file.file, buffer)

    # إنشاء المنتج مع كود تلقائي
    last_p = db.query(Product).order_by(Product.id.desc()).first()
    product_code = str((last_p.id + 1) if last_p else 1)

    new_product = Product(
        name=name, catalog_id=catalog_id, selling_price=selling_price,
        cost_price=cost_price, min_stock_threshold=min_stock_threshold,
        description=description, code=product_code, main_image=image_path,
        created_by=current_user.id
    )
    db.add(new_product)
    db.commit()
    db.refresh(new_product)
    return {"status": "success", "data": new_product}

@router.delete("/product/{product_id}")
async def delete_full_product(product_id: int, db: Session = Depends(get_db)):
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
        db.commit()
        return {"detail": "تم حذف المنتج وكافة ملحقاته بنجاح"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))