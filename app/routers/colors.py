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