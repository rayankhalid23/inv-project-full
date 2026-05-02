from passlib.context import CryptContext
from datetime import datetime, timedelta
from typing import Optional
from jose import jwt
from app.core.config import SECRET_KEY, ALGORITHM

# إعداد سياق تشفير كلمات المرور باستخدام bcrypt
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password: str) -> str:
    """توليد هاش مشفر لكلمة المرور (غير قابل للفك)"""
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """مطابقة كلمة المرور النصية مع الهاش المخزن"""
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except Exception:
        return False



from datetime import datetime, timedelta, timezone

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    
    # استخدام timezone.utc لضمان التوافق العالمي
    now = datetime.now(timezone.utc)
    
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=15)
        
    to_encode.update({"exp": expire, "iat": now}) # iat هو وقت الإصدار
    
    try:
        # تأكد أن SECRET_KEY و ALGORITHM مستوردان بشكل صحيح
        encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
        return encoded_jwt
    except Exception as e:
        raise RuntimeError(f"Internal Security Error: {e}")