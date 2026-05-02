from pydantic import BaseModel
from typing import List, Optional

class VariantOut(BaseModel):
    id: int
    size_name: str  # اسم المقاس (مثل: XL, L) يتم جلبه عبر العلاقة (Relationship) في SQLAlchemy
    quantity_available: int
    quantity_reserved: int = 0  # الكمية المحجوزة في طلبات قيد التنفيذ
    qr_code: Optional[str] = None

    class Config:
        from_attributes = True

class ColorOut(BaseModel):
    id: int
    color_name: str
    color_image: Optional[str] = None
    variants: List[VariantOut]  # ربط قائمة المقاسات باللون المخصص لها

    class Config:
        from_attributes = True

class ProductFullDetails(BaseModel):
    
    id: int
    name: str
    code: str
    main_image: Optional[str] = None
    total_available: int = 0
    selling_price: Optional[float] = 0.0 # أضفت سعر البيع هنا لأهميته في العرض
    
    # الهيكلية الهرمية: المنتج -> الألوان -> المقاسات
    colors: List[ColorOut] 

    class Config:
        from_attributes = True