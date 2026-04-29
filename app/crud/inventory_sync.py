<<<<<<< HEAD
# app/crud/inventory_sync.py
=======
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.inventory import Product, ProductVariant, ProductColor

def sync_product_metrics(db: Session, product_id: int):
<<<<<<< HEAD
    """تحديث شامل لجميع إحصائيات المنتج بضربة واحدة بما في ذلك المبيعات الجديدة"""
    try:
        # حساب جميع الحالات (متوفر، محجوز، تالف، مرتجع، والمباع حديثاً) 
        # مع ضمان عدم وجود قيم Null باستخدام func.coalesce
        metrics = db.query(
            func.coalesce(func.sum(ProductVariant.quantity_available), 0).label("av"),
            func.coalesce(func.sum(ProductVariant.quantity_reserved), 0).label("res"),
            func.coalesce(func.sum(ProductVariant.damaged_quantity), 0).label("dam"),
            func.coalesce(func.sum(ProductVariant.returned_quantity), 0).label("ret"),
            func.coalesce(func.sum(ProductVariant.total_sold), 0).label("sold") # العمود الجديد
=======
    """
    تحديث إحصائيات المنتج الكلية بناءً على تفاصيل المتغيرات (Variants).
    يتم حساب: المتوفر، المحجوز، التالف، والمرتجعات.
    """
    try:
        # حساب الإحصائيات عبر Join بين الألوان والمتغيرات
        metrics = db.query(
            func.sum(ProductVariant.quantity_available).label("av"),
            func.sum(ProductVariant.quantity_reserved).label("res"),
            func.sum(ProductVariant.damaged_quantity).label("dam"),
            func.sum(ProductVariant.returned_quantity).label("ret")
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
        ).join(ProductColor, ProductColor.id == ProductVariant.product_color_id)\
         .filter(
            ProductColor.product_id == product_id,
            ProductColor.deleted_at == None,
            ProductVariant.deleted_at == None
        ).first()

<<<<<<< HEAD
        # تحديث الجدول الرئيسي للمنتج (Product) بناءً على نتائج التجميع
        # تم الحفاظ على synchronize_session=False لأداء أسرع في العمليات المجمعة
        db.query(Product).filter(Product.id == product_id).update({
            "total_available": metrics.av,
            "total_reserved": metrics.res,
            "total_damaged": metrics.dam,
            "total_returns": metrics.ret,
            "total_sold": metrics.sold  # مزامنة إجمالي المبيعات الجديد
=======
        # تحديث سجل المنتج بضربة واحدة لتحسين الأداء (Batch Update)
        db.query(Product).filter(Product.id == product_id).update({
            "total_available": (metrics.av if metrics and metrics.av else 0),
            "total_reserved": (metrics.res if metrics and metrics.res else 0),
            "total_damaged": (metrics.dam if metrics and metrics.dam else 0),
            "total_returns": (metrics.ret if metrics and metrics.ret else 0)
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
        }, synchronize_session=False)

        db.commit()
        
    except Exception as e:
        db.rollback()
<<<<<<< HEAD
        # طباعة تفصيلية للخطأ للمساعدة في التشخيص السريع
        print(f"CRITICAL ERROR in sync_product_metrics for product {product_id}: {str(e)}")
        raise e
=======
        # طباعة تفاصيل الخطأ للـ Logger لمساعدة المطور
        print(f"SYSTEM ERROR [sync_product_metrics]: ID {product_id} - Details: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail="فشل تحديث إحصائيات المخزون، يرجى مراجعة سجلات النظام"
        )
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
