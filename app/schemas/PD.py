from pydantic import BaseModel
from typing import List, Optional

class VariantSchema(BaseModel):
    id: int
    size_id: int
    size_name: str
    quantity_available: int
    qr_code: Optional[str]
    variant_sku: Optional[str] = None

    class Config:
        from_attributes = True

class ColorSchema(BaseModel):
    id: int
    color_name: str
    color_image: Optional[str]
    variants: List[VariantSchema]

    class Config:
        from_attributes = True

class ProductFullDetailSchema(BaseModel):
    id: int
    name: str
    code: str
    description: Optional[str]
    main_image: Optional[str]
    
    # معلومات الكتالوج
    catalog_id: int
    catalog_name: str
    
    # المعلومات المالية والمخزون
    selling_price: float
    cost_price: float
    min_stock_threshold: int
    
    # الإجماليات (من جدول المنتجات مباشرة حسب المخطط)
    total_available: int
    total_reserved: int
    total_sold: int
    
    # الشجرة المتداخلة
    colors: List[ColorSchema]

    class Config:
        from_attributes = True



        