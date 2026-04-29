<<<<<<< HEAD
# app/schemas/product_display.py
=======
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
from pydantic import BaseModel
from typing import List, Optional

class VariantDisplay(BaseModel):
    id: int
    size_name: str
    quantity_available: int
    min_stock_threshold: Optional[int]

class ColorDisplay(BaseModel):
    id: int
    color_name: str
<<<<<<< HEAD
    color_image: Optional[str] # تم التغيير من image_path إلى color_image
    variants: List[VariantDisplay]

class ProductFullDetails(BaseModel):
=======
    color_image: Optional[str]
    variants: List[VariantDisplay]

class ProductFullDetails(BaseModel):
    """مخطط شامل لعرض صفحة المنتج بالكامل مع مخزونه"""
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
    id: int
    name: str
    code: str
    selling_price: float
    total_available: int
    main_image: Optional[str]
    colors: List[ColorDisplay]