<<<<<<< HEAD
# app/core/security.py

=======
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
from passlib.context import CryptContext
from datetime import datetime, timedelta
from typing import Optional
from jose import jwt
from app.core.config import SECRET_KEY, ALGORITHM

<<<<<<< HEAD
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

# --- الدالة الجديدة لإنشاء التوكن (JWT) ---
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15) # الافتراضي 15 دقيقة
        
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt
=======
# إعداد سياق تشفير كلمات المرور باستخدام خوارزمية bcrypt
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password: str) -> str:
    """تحويل كلمة المرور النصية إلى هاش مشفر غير قابل للفك"""
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """مطابقة كلمة المرور المدخلة مع الهاش المخزن في قاعدة البيانات"""
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except Exception:
        return False

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """
    توليد توكن JWT جديد للمستخدم.
    
    Args:
        data: البيانات المراد تشفيرها (مثل user_id).
        expires_delta: مدة الصلاحية الاختيارية.
    """
    to_encode = data.copy()
    
    # حساب وقت انتهاء الصلاحية
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
        
    to_encode.update({"exp": expire})
    
    try:
        encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
        return encoded_jwt
    except Exception as e:
        # خطأ في حال فشل التشفير بسبب المفاتيح أو الإعدادات
        raise RuntimeError(f"Internal Security Error: Failed to sign token. {e}")
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
