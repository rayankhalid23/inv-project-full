from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import List, Optional
from app.crud import user as crud_user  # أضف 'as crud_user' ليعرف الكود هذا الاسم

from app.core.database import get_db
from app.schemas.user import UserCreate, UserResponse, UserUpdate
from app.models.user import User
from app.core.deps import get_current_active_user, RoleChecker,get_current_user
from app.crud.user import create_user, update_user,  get_users, soft_delete_user, restore_user,get_employee_info
from app.crud import user as crud_user

router = APIRouter(prefix="/users", tags=["Users"])

@router.post("/")
def add_new_user(
    user: UserCreate, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(RoleChecker([1, 2]))
):
    # المدير (Role 2) يضيف موظفين (Role 3) فقط
    if current_user.role_id == 2 and user.role_id != 3:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="صلاحياتك كمدير تسمح لك بإضافة موظفين (الرتبة 3) فقط."
        )
    return create_user(db=db, user_in=user , admin_id=current_user.id)





@router.patch("/{user_id}") # أو المسار الذي تستخدمينه
def update_existing_user(
    user_id: int, 
    user_in: UserUpdate, 
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user) # 👈 أضفنا هذا لنجلب بيانات من يقوم بالتعديل
):
    """
    تعديل بيانات موظف (يدعم التعديل الجزئي والصلاحيات)
    """
    # 👈 هنا نمرر البيانات بالأسماء الجديدة التي تتطابق مع دالة CRUD
    return update_user(
        db=db, 
        target_user_id=user_id, 
        user_in=user_in, 
        current_user=current_user
    )


# ---------------------------------------------------------
# 2. الحذف الناعم (إرسال للأرشيف)
# ---------------------------------------------------------
# 5. الحذف الناعم (إرسال للأرشيف مع الرقابة)
# ---------------------------------------------------------
@router.delete("/{user_id}")
def delete_user(
    user_id: int, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(RoleChecker([1, 2]))
):
    # جلب المستخدم للتأكد من وجوده ورتبته قبل الحذف
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="الموظف غير موجود.")

    # أ. منع الحذف الذاتي
    if current_user.id == user_id:
        raise HTTPException(status_code=403, detail="إجراء محظور: لا يمكنك حذف حسابك الشخصي.")

    # ب. قيود المدير (Role 2): يحذف الموظفين (Role 3) فقط
    if current_user.role_id == 2 and target_user.role_id != 3:
        raise HTTPException(status_code=403, detail="صلاحياتك كمدير تسمح لك بحذف الموظفين فقط.")

    # ج. حماية إضافية للمسؤول الرئيسي من الحذف
    if target_user.role_id == 1:
         raise HTTPException(status_code=403, detail="أمن النظام: يحظر حذف حساب المسؤول الرئيسي.")

    # تمرير admin_id لضمان تسجيل العملية في SystemAuditLog
    deleted_user = soft_delete_user(db=db, user_id=user_id, admin_id=current_user.id)
    
    return {
        "status": "success",
        "message": f"تم نقل الموظف ({deleted_user.name}) إلى سلة المحذوفات بنجاح."
    }

# ---------------------------------------------------------
# 6. الاستعادة من الأرشيف (مع الرقابة)
# ---------------------------------------------------------
@router.post("/{user_id}/restore")
def restore_deleted_user(
    user_id: int, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(RoleChecker([1, 2]))
):
    # نتحقق من وجود المستخدم في الأرشيف أولاً لمعرفة رتبته
    target_user = db.query(User).filter(User.id == user_id, User.deleted_at != None).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="الموظف غير موجود في الأرشيف.")

    # أ. منع الاستعادة الذاتية للحماية الإضافية
    if current_user.id == user_id:
        raise HTTPException(status_code=403, detail="إجراء غير منطقي: لا يمكنك استعادة حسابك بنفسك.")

    # ب. قيود المدير (Role 2): يستعيد الموظفين (Role 3) فقط
    if current_user.role_id == 2 and target_user.role_id != 3:
        raise HTTPException(status_code=403, detail="صلاحياتك كمدير تسمح لك باستعادة الموظفين فقط.")

    # تمرير admin_id لضمان تسجيل عملية الاستعادة في SystemAuditLog
    restored_user = restore_user(db=db, user_id=user_id, admin_id=current_user.id)
    
    return {
        "status": "success",
        "message": f"تمت استعادة الموظف ({restored_user.name}) بنجاح."
    }


@router.get("/mini-list", summary="جلب قائمة الموظفين المختصرة")
def read_users_mini(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user), 
    q: Optional[str] = Query(None, description="البحث بالاسم أو الهاتف"),
    role_id: Optional[int] = Query(None, description="فلترة حسب الرتبة"),
    is_active: Optional[bool] = Query(None, description="فلترة حسب حالة الحساب"),
    show_deleted: bool = Query(False, description="عرض الموظفين المحذوفين فقط (سلة المحذوفات)"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, le=100)
):
    # تمرير كل المعاملات لدالة الـ CRUD المطورة
    return crud_user.get_all_users_mini(
        db=db, 
        query=q, 
        role_id=role_id, 
        is_active=is_active, 
        include_deleted=show_deleted, 
        page=page, 
        limit=limit
    )


@router.get("/{user_id}/details", summary="معلومات الموظف التفصيلية")
def read_user_details(
    user_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_active_user)
):
    """
    عرض بيانات الموظف الأساسية فقط:
    الاسم، الهاتف، التاريخ، الرتبة، والحالة.
    """
    return get_employee_info(db, user_id=user_id)