from sqlalchemy.orm import Session
from sqlalchemy.exc import OperationalError
from fastapi import HTTPException, status
from app.models.user import User
from app.models.role import Role
from app.schemas.user import UserCreate, UserUpdate
from app.core.security import get_password_hash
from datetime import datetime
<<<<<<< HEAD
from typing import Optional, List

# 1. جلب الموظفين بفلترة ذكية (نشط، غير نشط، محذوف، الكل)
def get_users(db: Session, status: Optional[str] = "active"):
    query = db.query(User)
    
    if status == "active":
        # الموظفون النشطون حالياً وغير المحذوفين
        return query.filter(User.is_active == True, User.deleted_at == None).all()
    elif status == "inactive":
        # الموظفون الموقوفون مؤقتاً وغير المحذوفين
        return query.filter(User.is_active == False, User.deleted_at == None).all()
    elif status == "deleted":
        # الأرشيف (سلة المحذوفات فقط)
        return query.filter(User.deleted_at != None).all()
    elif status == "all":
        # الجميع باستثناء المحذوفين ناعماً
        return query.filter(User.deleted_at == None).all()
    
    return query.filter(User.deleted_at == None).all()

# 2. وظيفة إنشاء مستخدم جديد
def create_user(db: Session, user_in: UserCreate):
    try:
        role_exists = db.query(Role).filter(Role.id == user_in.role_id).first()
        if not role_exists:
            raise HTTPException(status_code=400, detail=f"الرتبة رقم ({user_in.role_id}) غير موجودة")

        existing_user = db.query(User).filter((User.phone == user_in.phone) | (User.name == user_in.name)).first()
        if existing_user:
            detail = "رقم الهاتف مسجل مسبقاً" if existing_user.phone == user_in.phone else "اسم المستخدم موجود مسبقاً"
            raise HTTPException(status_code=400, detail=detail)

        hashed_pw = get_password_hash(user_in.password)
        db_user = User(
            name=user_in.name, 
            phone=user_in.phone, 
            password_hash=hashed_pw, 
=======
from typing import Optional

def get_users(db: Session, status: Optional[str] = "active"):
    """جلب الموظفين حسب الحالة المطلوبة (نشط، موقوف، أرشيف)."""
    query = db.query(User)
    
    filters = {
        "active": (User.is_active == True, User.deleted_at == None),
        "inactive": (User.is_active == False, User.deleted_at == None),
        "deleted": (User.deleted_at != None,),
        "all": (User.deleted_at == None,)
    }
    
    current_filter = filters.get(status, filters["active"])
    return query.filter(*current_filter).all()

def create_user(db: Session, user_in: UserCreate):
    """إضافة موظف جديد مع فحص الرتبة والبيانات الفريدة."""
    try:
        # 1. التأكد من صحة الرتبة
        if not db.query(Role).filter(Role.id == user_in.role_id).first():
            raise HTTPException(status_code=400, detail="الرتبة المحددة غير موجودة في النظام")

        # 2. التأكد من عدم تكرار الهاتف أو الاسم
        existing = db.query(User).filter((User.phone == user_in.phone) | (User.name == user_in.name)).first()
        if existing:
            field = "رقم الهاتف" if existing.phone == user_in.phone else "اسم المستخدم"
            raise HTTPException(status_code=400, detail=f"فشل التسجيل: {field} محجوز مسبقاً")

        # 3. حفظ البيانات
        db_user = User(
            name=user_in.name, 
            phone=user_in.phone, 
            password_hash=get_password_hash(user_in.password), 
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
            role_id=user_in.role_id, 
            is_active=True
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        return db_user
    except OperationalError:
        db.rollback()
<<<<<<< HEAD
        raise HTTPException(status_code=503, detail="فشل الاتصال بقاعدة البيانات")
    except HTTPException as e: raise e
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"خطأ تقني: {str(e)}")

# 3. وظيفة التحديث الجزئي (PATCH) مع حماية الأدمن
def update_user(db: Session, user_id: int, user_in: UserUpdate):
    try:
        db_user = db.query(User).filter(User.id == user_id).first()
        if not db_user:
            raise HTTPException(status_code=404, detail="الموظف غير موجود")

        update_data = user_in.model_dump(exclude_unset=True)

        # قيد أمني: منع تعطيل الأدمن عبر التحديث العام
        if db_user.role_id == 1 and update_data.get("is_active") is False:
             raise HTTPException(
                status_code=403, 
                detail="قيد أمني: لا يمكن تعطيل حساب المسؤول (Admin)"
            )

        if "name" in update_data:
            name_check = db.query(User).filter(User.name == update_data["name"], User.id != user_id).first()
            if name_check:
                raise HTTPException(status_code=400, detail="اسم المستخدم الجديد مستخدم من قبل موظف آخر")

        if "phone" in update_data:
            phone_check = db.query(User).filter(User.phone == update_data["phone"], User.id != user_id).first()
            if phone_check:
                raise HTTPException(status_code=400, detail="رقم الهاتف الجديد مسجل لموظف آخر")

        if "role_id" in update_data:
            role_exists = db.query(Role).filter(Role.id == update_data["role_id"]).first()
            if not role_exists:
                raise HTTPException(status_code=400, detail="الرتبة المختارة غير موجودة")

        if "password" in update_data:
            update_data["password_hash"] = get_password_hash(update_data.pop("password"))

        for field, value in update_data.items():
            setattr(db_user, field, value)

        db.commit()
        db.refresh(db_user)
        return db_user
    except OperationalError:
        db.rollback()
        raise HTTPException(status_code=503, detail="فشل الاتصال بقاعدة البيانات")
    except HTTPException as e: raise e
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")

# 4. تبديل حالة النشاط (تنشيط / تعطيل) مع حماية الأدمن
def toggle_user_status(db: Session, user_id: int):
    try:
        db_user = db.query(User).filter(User.id == user_id).first()
        if not db_user:
            raise HTTPException(status_code=404, detail="الموظف غير موجود")
        
        # قيد أمني: منع تعطيل الأدمن عبر التبديل السريع
        if db_user.role_id == 1 and db_user.is_active:
            raise HTTPException(status_code=403, detail="لا يمكن تعطيل حساب المسؤول (Admin)")
        
        db_user.is_active = not db_user.is_active
        
        db.commit()
        db.refresh(db_user)
        return db_user
    except OperationalError:
        db.rollback()
        raise HTTPException(status_code=503, detail="فشل الاتصال بقاعدة البيانات")
    except HTTPException as e: raise e
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"خطأ أثناء تغيير الحالة: {str(e)}")

# 5. وظيفة الحذف الناعم (Soft Delete) مع حماية الأدمن
def soft_delete_user(db: Session, user_id: int):
    try:
        db_user = db.query(User).filter(User.id == user_id, User.deleted_at == None).first()
        if not db_user:
            raise HTTPException(status_code=404, detail="الموظف غير موجود أو محذوف مسبقاً")
        
        # قيد أمني: منع حذف الأدمن
        if db_user.role_id == 1:
            raise HTTPException(status_code=403, detail="ممنوع حذف حساب المسؤول الرئيسي")
            
        db_user.deleted_at = datetime.now()
        db_user.is_active = False 
        
        db.commit()
        db.refresh(db_user)
        return db_user
    except OperationalError:
        db.rollback()
        raise HTTPException(status_code=503, detail="فشل الاتصال بقاعدة البيانات")
    except HTTPException as e: raise e
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"خطأ أثناء الحذف: {str(e)}")

# 6. وظيفة استعادة الموظف المحذوف (Restore)
def restore_user(db: Session, user_id: int):
    try:
        db_user = db.query(User).filter(User.id == user_id, User.deleted_at != None).first()
        if not db_user:
            raise HTTPException(status_code=404, detail="الموظف غير موجود في سلة المحذوفات")
        
        db_user.deleted_at = None 
        db_user.is_active = True  
        
        db.commit()
        db.refresh(db_user)
        return db_user
    except OperationalError:
        db.rollback()
        raise HTTPException(status_code=503, detail="فشل الاتصال بقاعدة البيانات")
    except HTTPException as e: raise e
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"خطأ أثناء الاستعادة: {str(e)}")
=======
        raise HTTPException(status_code=503, detail="قاعدة البيانات لا تستجيب حالياً")

def update_user(db: Session, user_id: int, user_in: UserUpdate):
    """تحديث جزئي لبيانات الموظف مع حماية رتبة المسؤول."""
    db_user = db.query(User).filter(User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")

    update_data = user_in.model_dump(exclude_unset=True)

    # حماية: منع تعطيل حساب الـ Admin الرئيسي
    if db_user.role_id == 1 and update_data.get("is_active") is False:
        raise HTTPException(status_code=403, detail="لا يمكن تعطيل حساب المسؤول الرئيسي (Admin)")

    # التحقق من تكرار البيانات الجديدة
    for field in ["name", "phone"]:
        if field in update_data:
            if db.query(User).filter(getattr(User, field) == update_data[field], User.id != user_id).first():
                raise HTTPException(status_code=400, detail=f"البيانات الجديدة ({field}) مستخدمة لدى موظف آخر")

    if "password" in update_data:
        update_data["password_hash"] = get_password_hash(update_data.pop("password"))

    for field, value in update_data.items():
        setattr(db_user, field, value)

    db.commit()
    db.refresh(db_user)
    return db_user

def toggle_user_status(db: Session, user_id: int):
    """تبديل حالة الحساب (نشط/معطل)."""
    db_user = db.query(User).filter(User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")
    
    if db_user.role_id == 1 and db_user.is_active:
        raise HTTPException(status_code=403, detail="لا يمكن تغيير حالة المسؤول الرئيسي")
    
    db_user.is_active = not db_user.is_active
    db.commit()
    return db_user

def soft_delete_user(db: Session, user_id: int):
    """نقل الموظف إلى سلة المحذوفات (Soft Delete)."""
    db_user = db.query(User).filter(User.id == user_id, User.deleted_at == None).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="الموظف غير موجود أو محذوف مسبقاً")
    
    if db_user.role_id == 1:
        raise HTTPException(status_code=403, detail="قيد أمني: لا يسمح بحذف حساب الإدارة")
        
    db_user.deleted_at = datetime.now()
    db_user.is_active = False 
    db.commit()
    return db_user

def restore_user(db: Session, user_id: int):
    """استعادة حساب موظف من الأرشيف."""
    db_user = db.query(User).filter(User.id == user_id, User.deleted_at != None).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="الموظف غير موجود في قائمة المحذوفات")
    
    db_user.deleted_at = None 
    db_user.is_active = True  
    db.commit()
    return db_user
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
