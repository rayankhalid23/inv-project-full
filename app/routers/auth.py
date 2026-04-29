<<<<<<< HEAD
# app/routers/auth.py

=======
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
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

@router.post("/login", response_model=Token)
def login_for_access_token(db: Session = Depends(get_db), form_data: OAuth2PasswordRequestForm = Depends()):
<<<<<<< HEAD
    # ملاحظة: OAuth2 يستخدم حقل 'username' افتراضياً في Swagger، نحن سنمرر فيه رقم الهاتف 'phone'
    user = authenticate_user(db, phone=form_data.username, password=form_data.password)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="رقم الهاتف أو كلمة المرور غير صحيحة",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    if not user.is_active:
        raise HTTPException(status_code=400, detail="حسابك موقوف، يرجى مراجعة الإدارة")

    # تحديد مدة صلاحية التوكن
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    # إنشاء التوكن وحفظ معرف المستخدم (id) والرتبة (role_id) بداخله
    access_token = create_access_token(
        data={"sub": str(user.id), "role_id": user.role_id}, 
        expires_delta=access_token_expires
    )
    
=======
    user = authenticate_user(db, phone=form_data.username, password=form_data.password)
    if not user:
        raise HTTPException(status_code=401, detail="رقم الهاتف أو كلمة المرور غير صحيحة")
    if not user.is_active:
        raise HTTPException(status_code=400, detail="حسابك موقوف")
    access_token = create_access_token(data={"sub": str(user.id), "role_id": user.role_id}, 
                                      expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
    return {"access_token": access_token, "token_type": "bearer"}