from pydantic import BaseModel, Field, field_validator
from typing import Optional
import re

class UserCreate(BaseModel):
    name: str = Field(..., min_length=3, max_length=255)
<<<<<<< HEAD
    phone: str = Field(..., description="Phone number must start with 09 and be 10 digits")
=======
    phone: str = Field(..., description="رقم الهاتف يجب أن يبدأ بـ 09")
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
    password: str = Field(..., min_length=6)
    role_id: int

    @field_validator('phone')
    @classmethod
    def validate_phone(cls, v: str) -> str:
<<<<<<< HEAD
        if not re.fullmatch(r"09\d{8}", v):
            raise ValueError('رقم الهاتف يجب أن يتكون من 10 أرقام ويبدأ بـ 09 ويحتوي أرقاماً فقط')
        return v

# --- الكلاس الجديد للتحديث الجزئي ---
class UserUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=3, max_length=255)
=======
        # التحقق من أن الرقم ليبي (09xxxxxxxx)
        if not re.fullmatch(r"09\d{8}", v):
            raise ValueError('رقم الهاتف غير صحيح (يجب أن يبدأ بـ 09 ويتكون من 10 أرقام)')
        return v

class UserUpdate(BaseModel):
    """تسمح بتحديث أي حقل بشكل منفصل"""
    name: Optional[str] = Field(None, min_length=3)
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
    phone: Optional[str] = Field(None)
    password: Optional[str] = Field(None, min_length=6)
    role_id: Optional[int] = Field(None)
    is_active: Optional[bool] = Field(None)

    @field_validator('phone')
    @classmethod
    def validate_phone(cls, v: Optional[str]) -> Optional[str]:
<<<<<<< HEAD
        if v is not None:
            if not re.fullmatch(r"09\d{8}", v):
                raise ValueError('رقم الهاتف يجب أن يتكون من 10 أرقام ويبدأ بـ 09 ويحتوي أرقاماً فقط')
=======
        if v and not re.fullmatch(r"09\d{8}", v):
            raise ValueError('رقم الهاتف المحدث غير صحيح')
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
        return v

class UserResponse(BaseModel):
    id: int
    name: str
    phone: str
    role_id: int
    is_active: bool

    class Config:
        from_attributes = True