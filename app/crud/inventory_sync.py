from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import HTTPException
from app.models.inventory import Product, ProductVariant, ProductColor
def sync_product_metrics(db: Session, product_id: int):
    try:
        # استعلام المزامنة (تأكد من استخدام db.query مباشرة)
        metrics = db.query(
            func.coalesce(func.sum(ProductVariant.quantity_available), 0).label("av"),
            func.coalesce(func.sum(ProductVariant.quantity_reserved), 0).label("res"),
            func.coalesce(func.sum(ProductVariant.damaged_quantity), 0).label("dam"),
            func.coalesce(func.sum(ProductVariant.returned_quantity), 0).label("ret"),
            func.coalesce(func.sum(ProductVariant.total_sold), 0).label("sold")
        ).select_from(ProductVariant)\
        .join(ProductColor, ProductColor.id == ProductVariant.product_color_id)\
        .filter(
            ProductColor.product_id == product_id,
            ProductColor.deleted_at.is_(None),
            ProductVariant.deleted_at.is_(None)
        ).first()

        product = db.query(Product).filter(Product.id == product_id).with_for_update().first()

        if product and metrics:
            product.total_available = metrics.av
            product.total_reserved = metrics.res
            product.total_damaged = metrics.dam
            product.total_returns = metrics.ret
            product.total_sold = metrics.sold
            db.add(product) # تأكيد الإضافة
            db.flush()
            print(f"SUCCESS: Product {product_id} synced.")
            
    except Exception as e:
        print(f"SYNC ERROR: {str(e)}")
        raise e # نرفعه لكي تقوم الدالة الأم بعمل Rollback