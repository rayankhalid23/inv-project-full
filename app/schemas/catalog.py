from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class CatalogBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    is_active: Optional[bool] = True

class CatalogCreate(CatalogBase):
    pass

class CatalogUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=255)
    is_active: Optional[bool] = None

class CatalogResponse(CatalogBase):
    id: int
    created_by: int
    creator_name: str # لربط اسم الموظف في الرد
    created_at: datetime

    class Config:
        from_attributes = True

class CatalogAlternative(BaseModel):
    """تستخدم لعرض بدائل عند حذف كتالوج يحتوي على منتجات"""
    id: int
    name: str