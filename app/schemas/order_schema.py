from pydantic import BaseModel, ConfigDict
from typing import List, Optional, Union
from decimal import Decimal
from datetime import datetime

# ==================== Requests (الاستقبال) ==================== #

class OrderItemCreate(BaseModel):
    variant_id: int
    quantity: int

class OrderCreate(BaseModel):
    customer_name: str
    customer_phones: Union[List[str], str] # يدعم استقبال قائمة أو نص
    address: str
    social_media_source: Optional[str] = None
    notes: Optional[str] = None
    items: List[OrderItemCreate]

class OrderUpdate(BaseModel):
    customer_name: Optional[str] = None
    customer_phones: Optional[Union[List[str], str]] = None
    address: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    items: Optional[List[OrderItemCreate]] = None
    delivery_name: str
    delivery_type: str


class DeliveryAssignRequest(BaseModel):
    delivery_name: str
    delivery_type: str

class QRScanRequest(BaseModel):
    qr_code: str
    


# ==================== Responses (الإرجاع) ==================== #

class OrderResponse(BaseModel):
    id: int
    customer_name: str
    total_price: Decimal
    status: str
    
    model_config = ConfigDict(from_attributes=True)

class OrderItemDetailResponse(BaseModel):
    id: int
    product_name: str
    variant_id: int
    quantity: int
    price_at_order: Decimal
    image_url: Optional[str] = None
    color_name: Optional[str] = None
    size: Optional[str] = None

class OrderFullDetailResponse(BaseModel):
    id: int
    customer_name: str
    customer_phones: List[str]
    address: str
    total_price: Decimal
    status: str
    created_at: datetime
    items: List[OrderItemDetailResponse]
    
    model_config = ConfigDict(from_attributes=True)