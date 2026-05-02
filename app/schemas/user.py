from pydantic import BaseModel, Field, field_validator
from typing import Optional
import re



class UserCreate(BaseModel):
    name: str = Field(..., min_length=3, max_length=255)
    phone: str = Field(..., description="رقم الهاتف يجب أن يبدأ بـ 09 ويتكون من 10 أرقام")
    password: str = Field(..., min_length=6)
    role_id: int

    @field_validator('name')
    @classmethod
    def validate_name(cls, v: str) -> str:
        # 1. حذف المسافات الزائدة
        v = v.strip()
        # 2. التأكد أن الاسم ليس فارغاً بعد الحذف
        if not v:
            raise ValueError('خطأ في البيانات: لا يمكن ترك حقل الاسم فارغاً')
        # 3. التأكد أن الاسم يحتوي على أحرف (عربية أو إنجليزية) وليس فقط أرقام
        if not any(char.isalpha() for char in v):
            raise ValueError('صيغة الاسم غير مقبولة: يجب أن يحتوي الاسم على أحرف')
        return v
# فاحص الهاتف (منع الفراغ وتدقيق الصيغة)
    @field_validator('phone')
    @classmethod
    def validate_phone(cls, v: str) -> str:
        v = v.strip() # حذف المسافات من الطرفين أولاً
        if not v:
            raise ValueError('خطأ: لا يمكن ترك حقل رقم الهاتف فارغاً')
        if not v.startswith("09"):
            raise ValueError('صيغة غير صحيحة: يجب أن يبدأ رقم الهاتف بـ 09')
        if len(v) != 10:
            raise ValueError(f'خطأ: طول الرقم {len(v)} خانات، المطلوب 10 خانات بالضبط')
        if not v.isdigit():
            raise ValueError('خطأ: رقم الهاتف يجب أن يحتوي على أرقام فقط')
        return v

        
class UserUpdate(BaseModel):
    # نستخدم Optional ليسمح بترك الحقل فارغاً
    # نستخدم None كقيمة بدائية لكي لا يعترض النظام إذا لم يتم إرسال الحقل
    name: Optional[str] = Field(None, min_length=3, description="اسم الموظف")
    phone: Optional[str] = Field(None, min_length=10, max_length=15, description="رقم هاتف الموظف")
    password: Optional[str] = Field(None, min_length=6, description="كلمة المرور الجديدة")
    role_id: Optional[int] = Field(None, description="رقم الرتبة (الصلاحية)")



class UserResponse(BaseModel):
    id: int
    name: str
    phone: str
    role_id: int
    is_active: bool

    class Config:
        from_attributes = True