from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.crud.auth import authenticate_user
from app.core.security import create_access_token
from app.core.database import SessionLocal
from app.core.config import ACCESS_TOKEN_EXPIRE_MINUTES
from app.schemas.token import Token
from app.models.user import User
from app.models.role import Role

router = APIRouter()

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
    access_token = create_access_token(
        data={"sub": str(user.id)}, 
        expires_delta=access_token_expires
    )

    role_name = user.role.name if user.role else "بدون رتبة"
    
    # الإرجاع المعدل ليشمل بيانات المستخدم الضرورية للفرونت إند
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "name": user.name,
            "role_id":user.role_id ,
            "role": role_name,  # تأكد أن الحقل يسمى role في قاعدة بياناتك
            "phone": user.phone
        },
        "message": f"أهلاً بك يا {user.name}، تم تسجيل الدخول بنجاح!"
    }