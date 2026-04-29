from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.inventory import Catalog, Product
<<<<<<< HEAD
from app.models.user import User
=======
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
from datetime import datetime
from typing import Optional

def get_catalogs(db: Session, status: str = "active"):
<<<<<<< HEAD
=======
    """جلب قائمة الكتالوجات بناءً على حالتها (نشط/محذوف)."""
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
    query = db.query(Catalog)
    if status == "active":
        return query.filter(Catalog.deleted_at == None).all()
    elif status == "deleted":
        return query.filter(Catalog.deleted_at != None).all()
    return query.all()
    
def create_catalog(db: Session, catalog_in: dict, user_id: int):
<<<<<<< HEAD
    # التحقق من تفرد الاسم
    existing = db.query(Catalog).filter(Catalog.name == catalog_in.name, Catalog.deleted_at == None).first()
    if existing:
        raise HTTPException(status_code=400, detail="اسم الكتالوج موجود مسبقاً")

    new_catalog = Catalog(
        name=catalog_in.name,
        created_by=user_id
    )
=======
    """إنشاء كتالوج جديد مع التحقق من تكرار الاسم."""
    existing = db.query(Catalog).filter(Catalog.name == catalog_in.name, Catalog.deleted_at == None).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail=f"فشل الإنشاء: الاسم '{catalog_in.name}' مستخدم بالفعل في كتالوج آخر"
        )

    new_catalog = Catalog(name=catalog_in.name, created_by=user_id)
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
    db.add(new_catalog)
    db.commit()
    db.refresh(new_catalog)
    return new_catalog

def update_catalog(db: Session, catalog_id: int, name: str):
<<<<<<< HEAD
    catalog = db.query(Catalog).filter(Catalog.id == catalog_id, Catalog.deleted_at == None).first()
    if not catalog:
        raise HTTPException(status_code=404, detail="الكتالوج غير موجود")

    # التحقق من أن الاسم الجديد غير مستخدم في كتالوج آخر
    existing = db.query(Catalog).filter(Catalog.name == name, Catalog.id != catalog_id, Catalog.deleted_at == None).first()
    if existing:
        raise HTTPException(status_code=400, detail="اسم الكتالوج موجود مسبقاً")
=======
    """تحديث بيانات الكتالوج مع فحص القيود."""
    catalog = db.query(Catalog).filter(Catalog.id == catalog_id, Catalog.deleted_at == None).first()
    if not catalog:
        raise HTTPException(status_code=404, detail="خطأ: لم يتم العثور على الكتالوج المطلوب لتحديثه")

    # منع تكرار الاسم عند التعديل
    existing = db.query(Catalog).filter(Catalog.name == name, Catalog.id != catalog_id, Catalog.deleted_at == None).first()
    if existing:
        raise HTTPException(status_code=400, detail="فشل التحديث: الاسم الجديد محجوز لكتالوج آخر")
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac

    catalog.name = name
    db.commit()
    db.refresh(catalog)
    return catalog

def delete_catalog(db: Session, catalog_id: int, action: Optional[str] = None, transfer_to_id: Optional[int] = None):
<<<<<<< HEAD
    catalog = db.query(Catalog).filter(Catalog.id == catalog_id, Catalog.deleted_at == None).first()
    if not catalog:
        raise HTTPException(status_code=404, detail="الكتالوج غير موجود")

    # الكشف عن وجود منتجات مرتبطة
=======
    """
    حذف الكتالوج مع معالجة المنتجات المرتبطة به.
    يدعم: (النقل إلى كتالوج آخر، الحذف الإجباري، أو الحذف السلس).
    """
    catalog = db.query(Catalog).filter(Catalog.id == catalog_id, Catalog.deleted_at == None).first()
    if not catalog:
        raise HTTPException(status_code=404, detail="خطأ: الكتالوج غير موجود أو قد تم حذفه مسبقاً")

    # فحص الارتباط بالمنتجات لضمان سلامة البيانات (Data Integrity)
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
    products = db.query(Product).filter(Product.catalog_id == catalog_id, Product.deleted_at == None).all()
    
    if products:
        if action == "transfer" and transfer_to_id:
            target_catalog = db.query(Catalog).filter(Catalog.id == transfer_to_id, Catalog.deleted_at == None).first()
            if not target_catalog:
<<<<<<< HEAD
                raise HTTPException(status_code=404, detail="الكتالوج البديل غير موجود")
            
            # نقل المنتجات
            for product in products:
                product.catalog_id = transfer_to_id
            
            # حذف الكتالوج القديم (Soft Delete)
            catalog.deleted_at = datetime.now()
            db.commit()
            return {"message": "تم نقل المنتجات وحذف الكتالوج بنجاح"}

        elif action == "force_delete":
            # حذف المنتجات المرتبطة (Soft Delete) ثم الكتالوج
=======
                raise HTTPException(status_code=404, detail="فشل النقل: الكتالوج الوجهة غير موجود")
            
            # نقل المنتجات للكتالوج الجديد
            for product in products:
                product.catalog_id = transfer_to_id
            
            catalog.deleted_at = datetime.now()
            db.commit()
            return {"status": "success", "message": f"تم نقل {len(products)} منتج وحذف الكتالوج بنجاح"}

        elif action == "force_delete":
            # حذف الكتالوج وما يتبعه (Cascade Soft Delete)
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
            for product in products:
                product.deleted_at = datetime.now()
            catalog.deleted_at = datetime.now()
            db.commit()
<<<<<<< HEAD
            return {"message": "تم حذف الكتالوج مع كافة منتجاته"}

        else:
            # إذا لم يحدد إجراء، نعيد 409 مع خيارات الكتالوجات المتاحة للـ Frontend
=======
            return {"status": "warning", "message": "تم حذف الكتالوج وجميع المنتجات المرتبطة به نهائياً"}

        else:
            # إرجاع تفاصيل الخطأ للـ Frontend لاتخاذ قرار (Conflict 409)
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
            available_catalogs = db.query(Catalog).filter(Catalog.id != catalog_id, Catalog.deleted_at == None).all()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
<<<<<<< HEAD
                    "message": "لا يمكن الحذف. الكتالوج يحتوي على منتجات.",
=======
                    "message": "لا يمكن حذف الكتالوج لوجود منتجات مرتبطة",
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
                    "requires_action": True,
                    "options": ["transfer", "force_delete"],
                    "available_catalogs": [{"id": c.id, "name": c.name} for c in available_catalogs]
                }
            )
    else:
<<<<<<< HEAD
        # حذف سلس لعدم وجود منتجات
        catalog.deleted_at = datetime.now()
        db.commit()
        return {"message": "تم حذف الكتالوج بسلاسة لعدم وجود منتجات مرتبطة به"}
=======
        # حذف مباشر في حال كان الكتالوج فارغاً
        catalog.deleted_at = datetime.now()
        db.commit()
        return {"status": "success", "message": "تم حذف الكتالوج الفارغ بنجاح"}
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
