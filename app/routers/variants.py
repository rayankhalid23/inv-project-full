import os
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime
from pydantic import BaseModel

from app.core.database import get_db
from app.core.deps import RoleChecker
from app.models.inventory import Product, ProductColor, ProductVariant, Size
from app.utils import generate_variant_qr
from app.crud.inventory_sync import sync_product_metrics

router = APIRouter(prefix="/variants", tags=["Product Variants"])

class VariantCreate(BaseModel):
    size_id: int
    qty: int
    min_stock: int = 5

@router.post("/batch-create")
async def create_product_variants(
    product_color_id: int,
    variants_data: List[VariantCreate], 
    db: Session = Depends(get_db),
    current_user = Depends(RoleChecker([1, 2, 3]))
):
    color_entry = db.query(ProductColor).filter(ProductColor.id == product_color_id, ProductColor.deleted_at == None).first()
    if not color_entry:
        raise HTTPException(status_code=404, detail="اللون غير موجود.")

    product = db.query(Product).filter(Product.id == color_entry.product_id).first()
    
    for item in variants_data:
        # التأكد من عدم تكرار المقاس لنفس اللون
        exists = db.query(ProductVariant).filter(
            ProductVariant.product_color_id == product_color_id,
            ProductVariant.size_id == item.size_id,
            ProductVariant.deleted_at == None
        ).first()
        if exists: continue

        new_variant = ProductVariant(
            product_color_id=product_color_id,
            size_id=item.size_id,
            quantity_available=max(0, item.qty),
            min_stock_threshold=item.min_stock
        )
        db.add(new_variant)
        db.flush() # للحصول على ID المتغير الجديد

        # توليد الـ QR Code وربطه
        qr_path = await generate_variant_qr(new_variant.id, product.code)
        new_variant.qr_code = qr_path

    db.commit()
    sync_product_metrics(db, product.id)
    return {"status": "success", "message": "تم إنشاء المقاسات وتوليد أكواد QR بنجاح."}