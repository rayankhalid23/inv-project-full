<<<<<<< HEAD
from fastapi import APIRouter, Depends, HTTPException, Query, status
=======
from fastapi import APIRouter, Depends, HTTPException, Query
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
from sqlalchemy.orm import Session
from typing import List, Optional
from app.core.database import get_db
from app.schemas.user import UserCreate, UserResponse, UserUpdate
from app.models.user import User
from app.core.deps import get_current_active_user, RoleChecker
<<<<<<< HEAD

# استيراد كافة الدوال من الـ CRUD
from app.crud.user import (
    create_user, 
    update_user, 
    toggle_user_status, 
    get_users, 
    soft_delete_user, 
    restore_user
)

router = APIRouter(prefix="/users", tags=["Users"])

# 1. عرض الموظفين: مسموح للأدمن (1) والمدير (2) فقط
@router.get("/", response_model=List[UserResponse])
def read_users(
    status: Optional[str] = Query("active"),
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker([1, 2]))
):
    return get_users(db, status=status)

# 2. إضافة موظف جديد: المدير يضيف موظف فقط (3)
@router.post("/", response_model=UserResponse)
def add_new_user(
    user: UserCreate, 
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker([1, 2]))
):
    if current_user.role_id == 2 and user.role_id != 3:
        raise HTTPException(status_code=403, detail="كمدير، يمكنك إضافة موظفين عاديين فقط")
    return create_user(db=db, user_in=user)

# 3. تحديث بيانات موظف: حماية الأقدمية والذات
@router.patch("/{user_id}", response_model=UserResponse)
def update_existing_user(
    user_id: int, 
    user: UserUpdate, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user) # مسموح للكل مبدئياً لفحص المنطق بالداخل
):
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")

    # منطق الصلاحيات في التحديث
    if current_user.role_id == 3 and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="كموظف، يمكنك تعديل بياناتك الشخصية فقط")
    
    if current_user.role_id == 2:
        if target_user.role_id in [1, 2] and current_user.id != user_id:
            raise HTTPException(status_code=403, detail="لا يمكنك تعديل بيانات حسابات الإدارة")

    if current_user.role_id == 1 and target_user.role_id == 1:
        if current_user.id > target_user.id:
            raise HTTPException(status_code=403, detail="لا يمكنك تعديل بيانات مسؤول أقدم منك")

    return update_user(db=db, user_id=user_id, user_in=user)

# 4. تبديل حالة النشاط: منع "الانتحار الرقمي" وقاعدة الأقدمية
@router.post("/{user_id}/toggle-status", response_model=UserResponse)
def toggle_status(
    user_id: int, 
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker([1, 2]))
):
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")

    if current_user.id == user_id:
        raise HTTPException(status_code=403, detail="قيد أمني: لا يمكنك تعطيل حسابك الخاص")

    if current_user.role_id == 1 and target_user.role_id == 1:
        if current_user.id > target_user.id:
            raise HTTPException(status_code=403, detail="لا تملك صلاحية تعطيل حساب مسؤول أقدم منك")

    if current_user.role_id == 2 and target_user.role_id in [1, 2]:
        raise HTTPException(status_code=403, detail="لا يمكنك تعديل حالة حسابات الإدارة")

    return toggle_user_status(db=db, user_id=user_id)

# 5. حذف موظف: منع حذف النفس وقاعدة الأقدمية
@router.delete("/{user_id}", response_model=UserResponse)
def delete_user(
    user_id: int, 
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker([1, 2]))
):
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")

    if current_user.id == user_id:
        raise HTTPException(status_code=403, detail="قيد أمني: لا يمكنك حذف حسابك الخاص")

    if current_user.role_id == 1 and target_user.role_id == 1:
        if current_user.id > target_user.id:
            raise HTTPException(status_code=403, detail="لا تملك صلاحية حذف مسؤول أقدم منك")

    if current_user.role_id == 2 and target_user.role_id in [1, 2]:
        raise HTTPException(status_code=403, detail="لا يمكنك حذف حسابات الإدارة")

    return soft_delete_user(db=db, user_id=user_id)

# 6. استعادة موظف: قاعدة الأقدمية
@router.post("/{user_id}/restore", response_model=UserResponse)
def restore_existing_user(
    user_id: int, 
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker([1, 2]))
):
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")

    if current_user.role_id == 1 and target_user.role_id == 1:
        if current_user.id > target_user.id:
            raise HTTPException(status_code=403, detail="لا تملك صلاحية استعادة حساب مسؤول أقدم منك")

    if current_user.role_id == 2 and target_user.role_id in [1, 2]:
        raise HTTPException(status_code=403, detail="لا يمكنك استعادة حسابات الإدارة")

    return restore_user(db=db, user_id=user_id)
=======
from app.crud.user import create_user, update_user, toggle_user_status, get_users, soft_delete_user, restore_user

router = APIRouter(prefix="/users", tags=["Users"])

@router.get("/", response_model=List[UserResponse])
def read_users(status: Optional[str] = Query("active"), db: Session = Depends(get_db), current_user: User = Depends(RoleChecker([1, 2]))):
    return get_users(db, status=status)

@router.post("/", response_model=UserResponse)
def add_new_user(user: UserCreate, db: Session = Depends(get_db), current_user: User = Depends(RoleChecker([1, 2]))):
    if current_user.role_id == 2 and user.role_id != 3:
        raise HTTPException(status_code=403, detail="يمكنك إضافة موظفين فقط")
    return create_user(db=db, user_in=user)

@router.patch("/{user_id}", response_model=UserResponse)
def update_existing_user(user_id: int, user: UserUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user: raise HTTPException(status_code=404, detail="الموظف غير موجود")
    if current_user.role_id == 3 and current_user.id != user_id: raise HTTPException(status_code=403)
    return update_user(db=db, user_id=user_id, user_in=user)

@router.post("/{user_id}/toggle-status")
def toggle_status(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(RoleChecker([1, 2]))):
    if current_user.id == user_id: raise HTTPException(status_code=403, detail="لا يمكنك تعطيل نفسك")
    return toggle_user_status(db=db, user_id=user_id)

@router.delete("/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(RoleChecker([1, 2]))):
    if current_user.id == user_id: raise HTTPException(status_code=403)
    return soft_delete_user(db=db, user_id=user_id)
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
