# app/schemas/inventory.py
from pydantic import BaseModel, Field
from typing import List, Optional

class VariantOut(BaseModel):
    id: int
    size_name: str 
    quantity_available: int
    quantity_reserved: int = 0 
    qr_code: Optional[str] = None

    class Config:
        from_attributes = True

class ColorOut(BaseModel):
    id: int
    color_name: str
    color_image: Optional[str] = None
    variants: List[VariantOut] 

    class Config:
        from_attributes = True

class ProductFullDetails(BaseModel):
    id: int
    name: str
    code: str
    main_image: Optional[str] = None
    total_available: int = 0
    selling_price: Optional[float] = 0.0 
    colors: List[ColorOut] 

    class Config:
        from_attributes = True



class VariantCreate(BaseModel):
    size_id: int
    qty: int
    min_stock: int = 5

# التعديل الجوهري هنا ليتوافق مع الـ CURL الخاص بك
class VariantUpdatePartial(BaseModel):
    # نستخدم qty و min_stock لتطابق طلبك
    qty: Optional[int] = None 
    min_stock: Optional[int] = None
    # إذا كنت تريد تغيير السعر أو المقاس مستقبلاً
    price: Optional[float] = None
    size: Optional[str] = None

    class Config:
        from_attributes = True