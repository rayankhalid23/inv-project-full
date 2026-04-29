from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

<<<<<<< HEAD


class CatalogBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=255, examples=[""])
    is_active: Optional[bool] = True

class CatalogCreate(CatalogBase):
    pass

class CatalogUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=255)
    is_active: Optional[bool] = True


 
class CatalogResponse(CatalogBase):
    id: int
    created_by: int
    creator_name: str # سيتم استخراجه ديناميكياً
=======
class CatalogBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=255, description="اسم الكتالوج")

class CatalogCreate(CatalogBase):
    """بيانات إنشاء كتالوج جديد"""
    pass

class CatalogUpdate(BaseModel):
    """بيانات تحديث الكتالوج - جميع الحقول اختيارية"""
    name: Optional[str] = Field(None, min_length=2, max_length=255)

class CatalogResponse(CatalogBase):
    """تنسيق البيانات الخارجة للمستخدم"""
    id: int
    created_by: int
    creator_name: str  # تم إضافته ليعرض اسم الموظف بدلاً من رقمه فقط
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
    created_at: datetime

    class Config:
        from_attributes = True

<<<<<<< HEAD


# كلاس مخصص لاستجابة الخطأ 409 (حالة وجود منتجات عند الحذف)
class CatalogAlternative(BaseModel):
    id: int
    name: str


=======
class CatalogAlternative(BaseModel):
    """يستخدم عند الحذف لعرض كتالوجات بديلة لنقل المنتجات إليها"""
    id: int
    name: str
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
