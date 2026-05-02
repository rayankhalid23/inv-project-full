from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import HTTPException
from app.models.inventory import Product, ProductVariant, ProductColor

def sync_product_metrics(db: Session, product_id: int):
    """
    تحديث إحصائيات المنتج الكلية (متوفر، محجوز، تالف، مرتجع، مباع) بناءً على المتغيرات.
    """
    try:
        # حساب الإحصائيات بضربة واحدة باستخدام التجميع (Aggregation)
        metrics = db.query(
            func.coalesce(func.sum(ProductVariant.quantity_available), 0).label("av"),
            func.coalesce(func.sum(ProductVariant.quantity_reserved), 0).label("res"),
            func.coalesce(func.sum(ProductVariant.damaged_quantity), 0).label("dam"),
            func.coalesce(func.sum(ProductVariant.returned_quantity), 0).label("ret"),
            func.coalesce(func.sum(ProductVariant.total_sold), 0).label("sold")
        ).join(ProductColor, ProductColor.id == ProductVariant.product_color_id)\
         .filter(
            ProductColor.product_id == product_id,
            ProductColor.deleted_at == None,
            ProductVariant.deleted_at == None
        ).first()

        # تحديث سجل المنتج الرئيسي (Batch Update لسرعة الأداء)
        db.query(Product).filter(Product.id == product_id).update({
            "total_available": metrics.av,
            "total_reserved": metrics.res,
            "total_damaged": metrics.dam,
            "total_returns": metrics.ret,
            "total_sold": metrics.sold
        }, synchronize_session=False)

        db.commit()
        
    except Exception as e:
        db.rollback()
        print(f"CRITICAL ERROR [sync_product_metrics] ID {product_id}: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail="فشل تحديث إحصائيات المخزون، يرجى مراجعة سجلات النظام"
        )