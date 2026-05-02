from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from typing import List, Optional
from datetime import datetime

from app.core.database import get_db
from app.core.deps import RoleChecker
from app.models.inventory import Size
from app.models.user import User

router = APIRouter(prefix="/sizes", tags=["Sizes"])

@router.post("/", status_code=status.HTTP_201_CREATED)
def add_size(
    name: str, 
    sort_order: Optional[int] = None, 
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker([1, 2]))
):
    if not name or name.strip() == "" or name.lower() == "string":
        raise HTTPException(status_code=400, detail="يجب إدخال اسم المقاس بشكل صحيح.")

    clean_name = name.strip().upper()
    
    # منع التكرار في المقاسات النشطة
    existing = db.query(Size).filter(Size.name == clean_name, Size.deleted_at == None).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"المقاس '{clean_name}' موجود بالفعل.")

    # الترتيب التلقائي في نهاية القائمة
    if sort_order is None:
        max_order = db.query(func.max(Size.sort_order)).filter(Size.deleted_at == None).scalar()
        sort_order = (max_order or 0) + 1

    new_size = Size(name=clean_name, sort_order=sort_order)
    db.add(new_size)
    db.commit()
    db.refresh(new_size)
    return new_size

@router.get("/")
def list_sizes(db: Session = Depends(get_db)):
    return db.query(Size).filter(Size.deleted_at == None).order_by(Size.sort_order.asc()).all()

@router.delete("/{size_id}")
def delete_size(size_id: int, db: Session = Depends(get_db), current_user: User = Depends(RoleChecker([1, 2]))):
    size = db.query(Size).filter(Size.id == size_id, Size.deleted_at == None).first()
    if not size:
        raise HTTPException(status_code=404, detail="المقاس غير موجود.")
    
    size.deleted_at = datetime.now()
    db.commit()
    return {"detail": "تم حذف المقاس بنجاح."}