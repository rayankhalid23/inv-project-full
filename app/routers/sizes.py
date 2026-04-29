from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from typing import List, Optional
from datetime import datetime
from app.core.database import get_db
from app.core.deps import RoleChecker
from app.models.inventory import Size
<<<<<<< HEAD
from app.models.user import User

router = APIRouter(prefix="/sizes", tags=["Sizes"])

# --- 1. إضافة مقاس جديد (الترتيب تلقائي إذا لم يدخله المستخدم) ---
@router.post("/", status_code=status.HTTP_201_CREATED)
def add_size(
    name: str, 
    sort_order: Optional[int] = None, 
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker([1, 2]))
):


    if not name or name.strip() == "" or name == "string":
        raise HTTPException(status_code=400, detail="عذراً، يجب إدخال اسم المنتج، لا يمكن ترك الحقل فارغاً.")

    # تطهير الاسم وتوحيده (أحرف كبيرة وبدون فراغات زائدة)
    clean_name = name.strip().upper()
    
    # أ. منع التكرار: البحث عن مقاس نشط بنفس الاسم
    existing = db.query(Size).filter(
        Size.name == clean_name, 
        Size.deleted_at == None
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail=f"المقاس '{clean_name}' موجود بالفعل في النظام."
        )

    # ب. الترتيب الذكي: إذا لم يحدد المستخدم الترتيب، نضعه في نهاية القائمة تلقائياً
    if sort_order is None:
        max_order = db.query(func.max(Size.sort_order)).filter(Size.deleted_at == None).scalar()
        sort_order = (max_order or 0) + 1

    new_size = Size(
        name=clean_name,
        sort_order=sort_order
    )
    
    try:
        db.add(new_size)
        db.commit()
        db.refresh(new_size)
        return new_size
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"خطأ أثناء حفظ المقاس: {str(e)}")


# --- 2. جلب قائمة المقاسات (مرتبة منطقياً) ---
@router.get("/")
def list_sizes(db: Session = Depends(get_db)):
    # الترتيب حسب sort_order يضمن ظهور S, M, L بشكل صحيح في واجهة المستخدم
    return db.query(Size).filter(
        Size.deleted_at == None
    ).order_by(Size.sort_order.asc()).all()



# --- 4. حذف المقاس (Soft Delete) ---
@router.delete("/{size_id}")
def delete_size(
    size_id: int, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(RoleChecker([1, 2]))
):
    size = db.query(Size).filter(Size.id == size_id, Size.deleted_at == None).first()
    
    if not size:
        raise HTTPException(status_code=404, detail="المقاس غير موجود أو محذوف مسبقاً.")

    # وسم المقاس كمحذوف بدلاً من مسحه فيزيائياً
    size.deleted_at = datetime.now()
    db.commit()
    return {"detail": "تم حذف المقاس بنجاح من القوائم النشطة."}
=======

router = APIRouter(prefix="/sizes", tags=["Sizes"])

@router.post("/", status_code=201)
def add_size(name: str, sort_order: Optional[int] = None, db: Session = Depends(get_db), current_user = Depends(RoleChecker([1, 2]))):
    clean_name = name.strip().upper()
    if db.query(Size).filter(Size.name == clean_name, Size.deleted_at == None).first():
        raise HTTPException(status_code=400, detail="المقاس موجود")
    if sort_order is None:
        max_order = db.query(func.max(Size.sort_order)).filter(Size.deleted_at == None).scalar()
        sort_order = (max_order or 0) + 1
    new_size = Size(name=clean_name, sort_order=sort_order)
    db.add(new_size); db.commit(); db.refresh(new_size)
    return new_size

@router.get("/")
def list_sizes(db: Session = Depends(get_db)):
    return db.query(Size).filter(Size.deleted_at == None).order_by(Size.sort_order.asc()).all()
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
