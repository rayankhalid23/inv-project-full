from sqlalchemy.orm import Session
from app.models.user import User
from app.core.security import verify_password

def authenticate_user(db: Session, phone: str, password: str):
    """
    التحقق من صحة بيانات دخول الموظف.
    يتم فحص: وجود رقم الهاتف، أن الحساب غير محذوف، ومطابقة كلمة المرور.
    """
    # البحث عن المستخدم برقم الهاتف مع التأكد من أنه غير محذوف (Soft Deleted)
    user = db.query(User).filter(User.phone == phone, User.deleted_at == None).first()
    
    # إذا لم يوجد المستخدم
    if not user:
        return False
        
    # مطابقة الهاش المشفر لكلمة المرور المدخلة
    if not verify_password(password, user.password_hash):
        return False
        
    return user