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

# التعديل الجوهري هنا ليتوافق مع جميع صيغ الواجهة الأمامية والـ CURL
class VariantUpdatePartial(BaseModel):
    qty: Optional[int] = None 
    quantity_available: Optional[int] = None
    min_stock: Optional[int] = None
    min_stock_threshold: Optional[int] = None
    price: Optional[float] = None
    size: Optional[str] = None

    class Config:
        from_attributes = True



from pydantic import BaseModel, Field
from typing import List, Optional

# سكيمة عنصر المتغير داخل المصفوفة
class VariantFilterItemResponse(BaseModel):
    variant_id: int
    product_id: int
    product_name: str
    product_code: str
    color_id: int
    color_name: Optional[str] = None
    size_id: int
    size_name: str
    quantity_available: int
    min_stock_threshold: int
    quantity_reserved: int
    is_low_stock: bool
    qr_code: Optional[str] = None
    variant_sku: Optional[str] = None

    class Config:
        from_attributes = True

# سكيمة الاستجابة الشاملة المحدثة
class PaginatedVariantFilterResponse(BaseModel):
    total_count: int = Field(..., description="إجمالي المتغيرات المطابقة")
    low_stock_count: int = Field(..., description="إجمالي المتغيرات ناقصة المخزون")
    page: int
    page_size: int
    matched_product_ids: List[int] = Field(..., description="قائمة بجميع معرفات المنتجات الفريدة المطابقة للفلاتر (تتأثر بالفلتر ولا تتأثر بالتنقيل)")
    items: List[VariantFilterItemResponse]