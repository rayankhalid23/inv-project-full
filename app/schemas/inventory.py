from pydantic import BaseModel
from typing import List, Optional

class VariantOut(BaseModel):
    id: int
    size_name: str # سنقوم بجلب اسم المقاس بدلاً من الـ ID فقط
    quantity_available: int
    quantity_reserved: int
    qr_code: Optional[str]

    class Config:
        from_attributes = True

class ColorOut(BaseModel):
    id: int
    color_name: str
    color_image: Optional[str]
    variants: List[VariantOut] # مصفوفة المقاسات داخل اللون

    class Config:
        from_attributes = True

class ProductFullDetails(BaseModel):
    id: int
    name: str
    code: str
    main_image: Optional[str]
    total_available: int
    # قائمة الألوان التي تحتوي بداخلها على المقاسات
    colors: List[ColorOut] 

    class Config:
        from_attributes = True