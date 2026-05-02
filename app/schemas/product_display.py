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
    color_image: Optional[str]
    variants: List[VariantDisplay]

class ProductFullDetails(BaseModel):
    id: int
    name: str
    code: str
    selling_price: float
    total_available: int
    main_image: Optional[str]
    colors: List[ColorDisplay]

    class Config:
        from_attributes = True