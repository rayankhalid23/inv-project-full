import re
from pydantic import BaseModel, Field, validator
from typing import List, Optional
from decimal import Decimal
from datetime import datetime

class OrderItemCreate(BaseModel):
    variant_id: int = Field(..., gt=0)
    quantity: int = Field(..., gt=0)

class OrderCreate(BaseModel):
    customer_name: Optional[str] = Field(None, max_length=100)
    customer_phones: List[str] = Field(..., min_items=1)
    address: str = Field(..., min_length=1)
    social_media_source: Optional[str] = None
    notes: Optional[str] = None
    items: List[OrderItemCreate] = Field(..., min_items=1)

    @validator('customer_phones')
    def validate_libyan_phones(cls, v):
        cleaned_phones = [p.strip() for p in v if p and p != "string" and re.match(r'^09[124]\d{7}$', p)]
        if not cleaned_phones:
            raise ValueError("يجب تزويد رقم هاتف ليبي واحد صحيح على الأقل.")
        return cleaned_phones

class OrderUpdate(BaseModel):
    customer_name: Optional[str] = None
    customer_phones: Optional[str] = None
    address: Optional[str] = None
    status: Optional[str] = None # pending, prepared, shipped, etc.
    notes: Optional[str] = None
    # إضافة إمكانية تحديث العناصر إذا لزم الأمر
    items: Optional[List[OrderItemCreate]] = None 

    class Config:
        from_attributes = True        

class OrderResponse(BaseModel):
    id: int
    customer_name: Optional[str]
    customer_phones: List[str]
    address: str
    total_price: Decimal
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


# سكيما الرد (Response) لعرض بيانات الطلب
class OrderItemOut(BaseModel):
    id: int
    variant_id: int
    product_id: int
    quantity: int
    picked_quantity: int
    price_at_order: Decimal

    class Config:
        from_attributes = True

class OrderOut(BaseModel):
    id: int
    customer_name: str
    customer_phones: Optional[str]
    address: Optional[str]
    total_price: Decimal
    status: str
    created_at: datetime
    items: List[OrderItemOut]

    class Config:
        from_attributes = True

# سكيمات إضافية قد يحتاجها الـ Router الخاص بك
class DeliveryAssignRequest(BaseModel):
    delivery_name: str
    delivery_type: str # شركة شحن أو سائق خاص

class QRScanRequest(BaseModel):
    qr_code: str        


class VariantDetail(BaseModel):
    id: int
    size_name: Optional[str] = None
    color_name: Optional[str] = None
    product_name: Optional[str] = None
    qr_code: Optional[str] = None

    class Config:
        from_attributes = True

class OrderItemDetail(BaseModel):
    id: int
    variant_id: int
    quantity: int
    picked_quantity: int
    price_at_order: Decimal
    variant: Optional[VariantDetail] = None # لربط تفاصيل المقاس واللون

    class Config:
        from_attributes = True

# هذه هي السكيما التي تسبب الخطأ حالياً
class OrderFullDetailResponse(BaseModel):
    id: int
    customer_name: str
    customer_phones: Optional[str]
    address: Optional[str]
    notes: Optional[str]
    total_price: Decimal
    status: str
    created_at: datetime
    items: List[OrderItemDetail]
    
    # حقول إضافية للرقابة
    delivery_info: Optional[str] = None
    social_media_source: Optional[str] = None

    class Config:
        from_attributes = True
