from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.config import SECRET_KEY, ALGORITHM
from app.models.user import User

# تعريف مخطط الأمان لاستخراج التوكن من الـ Header (Bearer Token)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")
def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """
    التحقق من هوية المستخدم، فك تشفير التوكن، والتأكد من حالة الحساب (نشط وغير محذوف).
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="تعذر التحقق من الهوية: الجلسة انتهت أو التوكن غير صالح",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        # فك تشفير التوكن
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        
        if user_id is None:
            raise credentials_exception
            
    except JWTError:
        raise credentials_exception
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"خطأ تقني في معالجة التوكن: {str(e)}"
        )
        
    # جلب المستخدم من قاعدة البيانات (البحث بالـ ID أولاً)
    user = db.query(User).filter(User.id == int(user_id)).first()
    
    # التحقق الصارم من حالة الحساب:
    # 1. هل المستخدم موجود؟
    # 2. هل تم حذفه (Soft Delete)؟
    # 3. هل حسابه معطل (is_active == False)؟
    if user is None or user.deleted_at is not None or user.is_active == False:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, # نستخدم 401 للطرد الفوري
            detail="عذراً، هذا الحساب لم يعد متاحاً في النظام (تم حذفه).",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    return user

def get_current_active_user(current_user: User = Depends(get_current_user)):
    """التأكد من أن حساب الموظف نشط وغير موقوف من الإدارة"""
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="عذراً، هذا الحساب معطل حالياً من قبل الإدارة"
        )
    return current_user

class RoleChecker:
    """إدارة الوصول بناءً على الرتب الوظيفية (Role Based Access Control)"""
    def __init__(self, allowed_roles: list):
        self.allowed_roles = allowed_roles

    def __call__(self, current_user: User = Depends(get_current_active_user)):
        # التحقق من صلاحية رتبة المستخدم للدخول لهذا المسار
        if current_user.role_id not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"وصول مرفوض: دورك الوظيفي لا يسمح بدخول هذا القسم"
            )
        return current_user


from fastapi import Depends, HTTPException, status
from app.models import User


def get_reporting_user(current_user: User = Depends(get_current_user)):
    # هذه الدالة فقط تمرر المستخدم للخدمة لنتحقق من رتبته هناك
    return current_user       