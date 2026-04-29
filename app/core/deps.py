<<<<<<< HEAD
# app/core/deps.py

=======
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.config import SECRET_KEY, ALGORITHM
from app.models.user import User

<<<<<<< HEAD
# يخبر FastAPI أين يجد مسار تسجيل الدخول للحصول على التوكن
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="الجلسة انتهت أو التوكن غير صالح",
        headers={"WWW-Authenticate": "Bearer"},
    )
=======
# تعريف مخطط الأمان لاستخراج التوكن من الـ Header
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """
    التحقق من هوية المستخدم من خلال فك تشفير توكن JWT.
    
    التحققات:
    1. سلامة التوكن (JWT Integrity).
    2. وجود معرف المستخدم (sub).
    3. وجود المستخدم في قاعدة البيانات وعدم كونه "محذوفاً منطقياً".
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="تعذر التحقق من الهوية: الجلسة انتهت أو التوكن غير صالح",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
    try:
        # فك تشفير التوكن للحصول على الـ ID
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
<<<<<<< HEAD
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    # جلب بيانات الموظف من قاعدة البيانات
    user = db.query(User).filter(User.id == int(user_id), User.deleted_at == None).first()
    if user is None:
        raise credentials_exception
    return user

def get_current_active_user(current_user: User = Depends(get_current_user)):
    """التحقق من أن الحساب غير معطل"""
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="هذا الحساب معطل حالياً")
    return current_user

# --- الكلاس المفقود الذي سبب الخطأ (RoleChecker) ---
class RoleChecker:
    def __init__(self, allowed_roles: list):
        """يستقبل قائمة الأرقام المسموح لها (مثلاً [1, 2])"""
        self.allowed_roles = allowed_roles

    def __call__(self, current_user: User = Depends(get_current_active_user)):
        """يتحقق مما إذا كانت رتبة المستخدم ضمن القائمة المسموحة"""
        if current_user.role_id not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="ليس لديك صلاحية الوصول لهذا القسم"
=======
        
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, 
                detail="فشل التحقق: التوكن لا يحتوي على بيانات المستخدم"
            )
            
    except JWTError:
        raise credentials_exception
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"خطأ تقني غير متوقع في معالجة التوكن: {str(e)}"
        )
        
    # جلب بيانات الموظف من قاعدة البيانات مع التأكد من أنه غير محذوف
    user = db.query(User).filter(User.id == int(user_id), User.deleted_at == None).first()
    
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="المستخدم غير موجود في النظام أو تم حذف حسابه"
        )
        
    return user

def get_current_active_user(current_user: User = Depends(get_current_user)):
    """
    التأكد من أن حساب المستخدم نشط (is_active).
    يُستخدم لمنع الموظفين الموقوفين من الوصول.
    """
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="عذراً، هذا الحساب معطل حالياً من قبل الإدارة"
        )
    return current_user

class RoleChecker:
    """
    كلاس لإدارة الصلاحيات (RBAC).
    يسمح بالوصول فقط للرتب المحددة في قائمة allowed_roles.
    """
    def __init__(self, allowed_roles: list):
        self.allowed_roles = allowed_roles

    def __call__(self, current_user: User = Depends(get_current_active_user)):
        # التحقق مما إذا كانت رتبة المستخدم الحالية ضمن الصلاحيات المسموحة لهذا المسار
        if current_user.role_id not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"وصول مرفوض: دورك الوظيفي ({current_user.role_id}) لا يسمح بدخول هذا القسم"
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
            )
        return current_user