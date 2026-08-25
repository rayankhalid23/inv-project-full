from pydantic import BaseModel, ConfigDict
from typing import List, Optional, Union
from decimal import Decimal
from datetime import datetime

# ==================== Requests (الاستقبال) ==================== #

class OrderItemCreate(BaseModel):
    variant_id: int
    quantity: int
    allow_inspection: bool = False
    allow_try_on: bool = False

class OrderCreate(BaseModel):
    customer_name: str
    customer_phones: Union[List[str], str] # يدعم استقبال قائمة أو نص
    address: str
    social_media_source: Optional[str] = None
    notes: Optional[str] = None
    items: List[OrderItemCreate]
    
    # خيارات الشحن
    shipping_provider: Optional[str] = "custom" # 'custom' | 'darb_assabil'
    darb_service_id: Optional[str] = None
    darb_city: Optional[str] = None
    darb_area: Optional[str] = None
    darb_payment_by: Optional[str] = "receiver" # 'receiver' | 'sender' | 'sales'
    delivery_gender: Optional[str] = "رجالي" # 'رجالي' | 'نسائي'

class OrderUpdate(BaseModel):
    customer_name: Optional[str] = None
    customer_phones: Optional[Union[List[str], str]] = None
    address: Optional[str] = None
    social_media_source: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    items: Optional[List[OrderItemCreate]] = None
    delivery_name: Optional[str] = None 
    delivery_type: Optional[str] = None
    shipping_provider: Optional[str] = None
    tracking_number: Optional[str] = None
    shipment_id: Optional[str] = None
    darb_service_id: Optional[str] = None
    darb_city: Optional[str] = None
    darb_area: Optional[str] = None
    darb_payment_by: Optional[str] = None

class DeliveryAssignRequest(BaseModel):
    delivery_name: str
    delivery_type: str

class DarbShipmentCreateRequest(BaseModel):
    service: Optional[str] = None
    city: str
    area: str
    address: str
    paymentBy: Optional[str] = "receiver"
    delivery_gender: Optional[str] = "رجالي"
    notes: Optional[str] = None

class QRScanRequest(BaseModel):
    qr_code: Optional[str] = None
    variant_id: Optional[int] = None

class QuickSaleRequest(BaseModel):
    customer_name: str
    # رقم هاتف الزبون — اختياري تماماً، يُحفظ مع الطلب ويظهر في الفاتورة
    customer_phone: Optional[str] = None
    items: List[OrderItemCreate]



# ==================== Responses (الإرجاع) ==================== #

class OrderResponse(BaseModel):
    id: int
    customer_name: str
    total_price: Decimal
    status: str
    shipping_provider: Optional[str] = "custom"
    tracking_number: Optional[str] = None
    shipment_id: Optional[str] = None
    darb_shipment_warning: Optional[str] = None
    
    model_config = ConfigDict(from_attributes=True)

class OrderItemDetailResponse(BaseModel):
    id: int
    product_name: str
    variant_id: Optional[int]
    quantity: int
    picked_quantity: int # أضفنا هذا لنعرف كم تم مسحه من هذا المنتج
    price_at_order: Decimal
    image_url: Optional[str] = None # سيحتوي على صورة اللون أو المنتج الأساسي
    color_name: Optional[str] = None
    size: Optional[str] = None
    
    model_config = ConfigDict(from_attributes=True)

class OrderFullDetailResponse(BaseModel):
    id: int
    customer_name: str
    customer_phones: List[str]
    address: str
    social_media_source: Optional[str] = None # أضفناه لاكتمال بيانات العميل
    total_price: Decimal
    status: str
    created_at: datetime
    time_ago: str # النص العربي (منذ...)
    
    # بيانات الموظفين
    created_by_name: str 
    inventory_employee_name: Optional[str] = None
    delivery_man_name: Optional[str] = None # سيظهر فقط حسب الحالة في الـ Logic
    
    # بيانات الشحن ودرب السبيل
    shipping_provider: Optional[str] = "custom"
    tracking_number: Optional[str] = None
    shipment_id: Optional[str] = None
    
    # إحصائيات التجهيز
    total_ordered_qty: int
    total_picked_qty: int
    progress_percentage: float
    
    items: List[OrderItemDetailResponse]
    actions: List[dict] = []
    
    model_config = ConfigDict(from_attributes=True)