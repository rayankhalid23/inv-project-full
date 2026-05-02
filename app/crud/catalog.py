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


    return {
        "status": "success",
        "message": "تم انشاء كاتولاج جديد بنجاح" 
    }

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


    return {
        "status": "success",
        "message": "تم التعديل بنجاح"
    }

# 3. تبديل الحالة (تنشيط / إلغاء تنشيط)
def toggle_catalog_status(db: Session, catalog_id: int):
    catalog = db.query(Catalog).filter(Catalog.id == catalog_id).first()
    if not catalog:
        raise HTTPException(status_code=404, detail="الكتالوج غير موجود")
    
    # عكس الحالة الحالية
    catalog.is_active = not catalog.is_active
    db.commit()
    db.refresh(catalog)
    
    status_text = "تنشيطه" if catalog.is_active else "تعطيله"
    return {"status": "success", "message": f"تم {status_text} الكتالوج بنجاح", "is_active": catalog.is_active}




def get_catalogs_summary(db: Session):
    """
    جلب ملخص الكتالوجات (المعرف، الاسم، الحالة) فقط.
    يتم استثناء المحذوف منها (deleted_at == None).
    """
    # جلب الحقول المحددة فقط لتحسين الأداء
    results = db.query(Catalog.id, Catalog.name, Catalog.is_active).filter(
        Catalog.deleted_at == None
    ).all()
    
    # تحويل النتائج إلى قائمة مرتبة
    return [
        {
            "id": item.id,
            "name": item.name,
            "status": "نشط" if item.is_active else "معطل",
            "is_active": item.is_active # مفيد للاستخدام البرمجي في Frontend
        } for item in results
    ]