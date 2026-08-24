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


# ==========================================
# 1. قوالب عرض الدالة الشاملة (Dashboard)
# ==========================================
class ProductDashboardItem(BaseModel):
    id: int
    name: str
    code: str
    main_image: Optional[str]
    selling_price: float
    total_available: int
    total_reserved: int
    total_sold: int
    color_images: List[Optional[str]] # مصفوفة تحتوي على صور الألوان فقط

    class Config:
        from_attributes = True

class PaginatedProductDashboard(BaseModel):
    total_items: int
    total_pages: int
    current_page: int
    items: List[ProductDashboardItem]

# ==========================================
# 2. قوالب العرض التفصيلي (Deep-Dive)
# ==========================================
class VariantDetailOut(BaseModel):
    id: int
    size_name: str
    quantity_available: int
    qr_code: Optional[str]
    variant_sku: Optional[str] = None

    class Config:
        from_attributes = True

class ColorDetailOut(BaseModel):
    id: int
    color_name: str
    color_image: Optional[str]
    variants: List[VariantDetailOut]

    class Config:
        from_attributes = True

class ProductDeepDiveOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    selling_price: float
    main_image: Optional[str]
    colors: List[ColorDetailOut]

    class Config:
        from_attributes = True
