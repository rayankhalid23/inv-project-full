from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.crud.auth import authenticate_user
from app.core.security import create_access_token
from app.core.config import ACCESS_TOKEN_EXPIRE_MINUTES
from app.schemas.token import Token

router = APIRouter(tags=["Authentication"])


@router.post("/login", response_model=dict)
def login_for_access_token(db: Session = Depends(get_db), form_data: OAuth2PasswordRequestForm = Depends()):
    user = authenticate_user(db, phone=form_data.username, password=form_data.password)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="⚠️ عذراً، رقم الهاتف أو كلمة المرور غير صحيحة.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="🚫 حسابك موقوف حالياً."
        )

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    # إنشاء التوكن
    access_token = create_access_token(
        data={"sub": str(user.id)}, 
        expires_delta=access_token_expires
    )
    
    # التعديل الجوهري هنا: يجب إرجاع access_token و token_type
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "message": f"أهلاً بك يا {user.name}، تم تسجيل الدخول بنجاح!"
    }