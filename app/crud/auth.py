<<<<<<< HEAD
# app/crud/auth.py

=======
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
from sqlalchemy.orm import Session
from app.models.user import User
from app.core.security import verify_password

def authenticate_user(db: Session, phone: str, password: str):
<<<<<<< HEAD
    # نبحث عن الموظف برقم الهاتف ونتأكد أنه غير محذوف
    user = db.query(User).filter(User.phone == phone, User.deleted_at == None).first()
    
    if not user:
        return False
        
    # نتحقق من صحة كلمة المرور
    if not verify_password(password, user.password_hash):
=======
    """
    التحقق من صحة بيانات دخول الموظف.
    
    Args:
        db: جلسة قاعدة البيانات.
        phone: رقم الهاتف المستخدم كاسم دخول.
        password: كلمة المرور الخام المدخلة.
        
    Returns:
        User object في حال نجاح المصادقة، وإلا False.
    """
    # البحث عن المستخدم برقم الهاتف مع التأكد من أنه غير محذوف (Soft Deleted)
    user = db.query(User).filter(User.phone == phone, User.deleted_at == None).first()
    
    # حالة 1: المستخدم غير موجود في النظام
    if not user:
        return False
        
    # حالة 2: مطابقة الهاش المشفر لكلمة المرور
    if not verify_password(password, user.password_hash):
        # تم الفصل منطقياً لتسهيل عملية الـ Debugging مستقبلاً
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
        return False
        
    return user