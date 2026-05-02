from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.inventory import Catalog, Product
from datetime import datetime
from typing import Optional

def get_catalogs(db: Session, status: str = "active"):
    """جلب قائمة الكتالوجات بناءً على حالتها (نشط/محذوف)."""
    query = db.query(Catalog)
    if status == "active":
        return query.filter(Catalog.deleted_at == None).all()
    elif status == "deleted":
        return query.filter(Catalog.deleted_at != None).all()
    return query.all()
    
def create_catalog(db: Session, catalog_in: dict, user_id: int):
    """إنشاء كتالوج جديد مع التحقق من تكرار الاسم لضمان عدم التضارب."""
    existing = db.query(Catalog).filter(Catalog.name == catalog_in.name, Catalog.deleted_at == None).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail=f"فشل الإنشاء: الاسم '{catalog_in.name}' مستخدم بالفعل"
        )

    new_catalog = Catalog(name=catalog_in.name, created_by=user_id)
    db.add(new_catalog)
    db.commit()
    db.refresh(new_catalog)
    return new_catalog

def update_catalog(db: Session, catalog_id: int, name: str):
    """تحديث بيانات الكتالوج مع فحص القيود لضمان تفرد الأسماء."""
    catalog = db.query(Catalog).filter(Catalog.id == catalog_id, Catalog.deleted_at == None).first()
    if not catalog:
        raise HTTPException(status_code=404, detail="خطأ: لم يتم العثور على الكتالوج المطلوب")

    existing = db.query(Catalog).filter(Catalog.name == name, Catalog.id != catalog_id, Catalog.deleted_at == None).first()
    if existing:
        raise HTTPException(status_code=400, detail="فشل التحديث: هذا الاسم محجوز لكتالوج آخر")

    catalog.name = name
    db.commit()
    db.refresh(catalog)
    return catalog

def delete_catalog(db: Session, catalog_id: int, action: Optional[str] = None, transfer_to_id: Optional[int] = None):
    """حذف الكتالوج مع معالجة المنتجات المرتبطة (نقل، حذف إجباري، أو منع الحذف)."""
    catalog = db.query(Catalog).filter(Catalog.id == catalog_id, Catalog.deleted_at == None).first()
    if not catalog:
        raise HTTPException(status_code=404, detail="الكتالوج غير موجود أو محذوف مسبقاً")

    # فحص وجود منتجات مرتبطة لضمان سلامة البيانات
    products = db.query(Product).filter(Product.catalog_id == catalog_id, Product.deleted_at == None).all()
    
    if products:
        if action == "transfer" and transfer_to_id:
            target_catalog = db.query(Catalog).filter(Catalog.id == transfer_to_id, Catalog.deleted_at == None).first()
            if not target_catalog:
                raise HTTPException(status_code=404, detail="فشل النقل: الكتالوج الوجهة غير موجود")
            
            for product in products:
                product.catalog_id = transfer_to_id
            
            catalog.deleted_at = datetime.now()
            db.commit()
            return {"status": "success", "message": f"تم نقل {len(products)} منتج وحذف الكتالوج بنجاح"}

        elif action == "force_delete":
            for product in products:
                product.deleted_at = datetime.now()
            catalog.deleted_at = datetime.now()
            db.commit()
            return {"status": "warning", "message": "تم حذف الكتالوج وجميع منتجاته المرتبطة"}

        else:
            # إذا وُجدت منتجات ولم يحدد المستخدم إجراءً، نرسل خيارات الحل للواجهة الأمامية
            available_catalogs = db.query(Catalog).filter(Catalog.id != catalog_id, Catalog.deleted_at == None).all()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "message": "لا يمكن حذف الكتالوج لوجود منتجات مرتبطة",
                    "requires_action": True,
                    "options": ["transfer", "force_delete"],
                    "available_catalogs": [{"id": c.id, "name": c.name} for c in available_catalogs]
                }
            )
    
    # حذف مباشر إذا كان الكتالوج فارغاً
    catalog.deleted_at = datetime.now()
    db.commit()
    return {"status": "success", "message": "تم حذف الكتالوج الفارغ بنجاح"}