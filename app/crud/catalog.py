from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.inventory import Catalog
from app.services.audit_service import create_system_audit_log
from datetime import datetime
from typing import Optional

def get_catalogs(db: Session, status_filter: str = "الكل"):
    """
    جلب الكتالوجات بناءً على الحالة النشطة مع استبعاد المحذوف منطقياً (Soft Deleted).
    بناءً على مخطط الجدول في image_48595a.png
    """
    # القاعدة الأساسية: لا نجلب أي كتالوج تم حذفه (deleted_at ليس نول)
    query = db.query(Catalog).filter(Catalog.deleted_at == None)
    
    if status_filter == "نشط":
        return query.filter(Catalog.is_active == True).all()
    
    elif status_filter == "غير نشط":
        return query.filter(Catalog.is_active == False).all()
    
    # في حالة "الكل" يجلب كل ما هو غير محذوف (سواء نشط أو غير نشط)
    return query.all()
    
def create_catalog(db: Session, catalog_in: dict, user_id: int):
    """إنشاء كتالوج جديد مع تسجيل الرقابة الإدارية."""
    existing = db.query(Catalog).filter(Catalog.name == catalog_in.name, Catalog.deleted_at == None).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail=f"فشل الإنشاء: الاسم '{catalog_in.name}' مستخدم بالفعل"
        )

    new_catalog = Catalog(name=catalog_in.name, created_by=user_id)
    db.add(new_catalog)
    db.flush() # لحجز ID الكتالوج قبل استخدامه في سجل الرقابة
    
    # تسجيل عملية الإنشاء في الرقابة الإدارية
    create_system_audit_log(
        db=db, user_id=user_id, action_target='catalog', 
        target_id=new_catalog.id, action_type='create', 
        details={"name": new_catalog.name}
    )

    db.commit()
    db.refresh(new_catalog)
    return new_catalog

def update_catalog(db: Session, catalog_id: int, name: str, user_id: int):
    """تحديث بيانات الكتالوج وتسجيل القيم القديمة والجديدة."""
    catalog = db.query(Catalog).filter(Catalog.id == catalog_id, Catalog.deleted_at == None).first()
    if not catalog:
        raise HTTPException(status_code=404, detail="خطأ: لم يتم العثور على الكتالوج المطلوب")

    old_name = catalog.name

    existing = db.query(Catalog).filter(Catalog.name == name, Catalog.id != catalog_id, Catalog.deleted_at == None).first()
    if existing:
        raise HTTPException(status_code=400, detail="فشل التحديث: هذا الاسم محجوز لكتالوج آخر")

    catalog.name = name
    
    # تم تصحيح: admin_id -> user_id | new_name -> name
    create_system_audit_log(
        db=db, user_id=user_id, action_target='catalog', 
        target_id=catalog_id, action_type='update', 
        details={"old_name": old_name, "new_name": name}
    )    
    
    db.commit()
    db.refresh(catalog)
    return catalog

def toggle_catalog_status(db: Session, catalog_id: int, user_id: int):
    """تبديل حالة التنشيط وتسجيل الحركة."""
    catalog = db.query(Catalog).filter(Catalog.id == catalog_id).first()
    if not catalog:
        raise HTTPException(status_code=404, detail="الكتالوج غير موجود")
    
    catalog.is_active = not catalog.is_active

    # تم تصحيح: admin_id -> user_id
    create_system_audit_log(
        db=db, user_id=user_id, action_target='catalog', 
        target_id=catalog_id, action_type='toggle_status', 
        details={"is_active": catalog.is_active}
    )

    db.commit()
    db.refresh(catalog)
    return catalog

def get_catalogs_summary(db: Session):
    """جلب ملخص الكتالوجات لتحسين أداء القوائم المنسدلة."""
    results = db.query(Catalog.id, Catalog.name, Catalog.is_active).filter(
        Catalog.deleted_at == None
    ).all()
    
    return [
        {
            "id": item.id,
            "name": item.name,
            "status": "نشط" if item.is_active else "معطل",
            "is_active": item.is_active 
        } for item in results
    ]