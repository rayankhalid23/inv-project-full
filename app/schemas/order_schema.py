import re
from pydantic import BaseModel, Field, validator
from typing import List, Optional
from decimal import Decimal
from datetime import datetime

# --- النماذج الأساسية ---

class OrderItemBase(BaseModel):
    variant_id: int
    quantity: int = Field(..., gt=0, description="الكمية يجب أن تكون أكبر من صفر")

class OrderItemCreate(BaseModel):
    variant_id: int = Field(..., gt=0, description="رقم تعريف الصنف")
    quantity: int = Field(..., gt=0, description="الكمية المطلوبة")

# --- نموذج إنشاء الطلب (قواعد صارمة للبيانات الجديدة) ---

class OrderCreate(BaseModel):
    customer_name: Optional[str] = Field(None, max_length=100)
    customer_phones: List[str] = Field(..., min_items=1)
    address: str = Field(..., min_length=1)
    social_media_source: Optional[str] = None
    notes: Optional[str] = None
    items: List[OrderItemCreate] = Field(..., min_items=1)

    @validator('customer_phones')
    def validate_libyan_phones(cls, v):
        if not v:
            raise ValueError("يجب إضافة رقم هاتف واحد على الأقل.")
        
        cleaned_phones = []
        for phone in v:
            # تجاهل القيم الفارغة أو الافتراضية من Swagger
            if not phone or phone == "string":
                continue
            p = str(phone).strip()
            if not re.match(r'^09[124]\d{7}$', p):
                raise ValueError(f"رقم الهاتف '{p}' غير صحيح. يجب أن يتكون من 10 أرقام ويبدأ بـ 09.")
            cleaned_phones.append(p)
            
        if not cleaned_phones and v != ["string"]:
            raise ValueError("يجب تزويد رقم هاتف ليبي صحيح واحد على الأقل.")
        return cleaned_phones

    @validator('address')
    def address_not_empty(cls, v):
        if v is not None and not str(v).strip():
            raise ValueError("عنوان التوصيل مطلوب.")
        return v.strip() if v else v

    @validator('customer_name')
    def validate_name_no_numbers(cls, v):
        if v and str(v).strip():
            v_stripped = str(v).strip()
            if any(char.isdigit() for char in v_stripped):
                raise ValueError(f"الاسم '{v_stripped}' لا يمكن أن يحتوي على أرقام.")
            return v_stripped
        return v

# --- نموذج تحديث الطلب (تعديل جزئي مرن) ---

class OrderUpdate(BaseModel):
    customer_name: Optional[str] = None
    customer_phones: Optional[List[str]] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    social_media_source: Optional[str] = None
    items: Optional[List[OrderItemBase]] = None

    # نطبق نفس التحقق ولكن بجعله يسمح بالقيم الفارغة (لأن التعديل جزئي)
    @validator('customer_phones', pre=True, always=False)
    def validate_phones_update(cls, v):
        if v is None: return v
        if not isinstance(v, list): return v
        
        cleaned = []
        for phone in v:
            if not phone or phone == "string": continue
            p = str(phone).strip()
            if re.match(r'^09[124]\d{7}$', p):
                cleaned.append(p)
            else:
                # إذا حاول المستخدم إدخال هاتف خاطئ يدوياً نرفضه
                raise ValueError(f"رقم الهاتف '{p}' غير صالح.")
        return cleaned if cleaned else None

# --- سكيما الاستجابة (الرد) ---# ابحث عن كلاس OrderResponse وقم باستبداله بهذا الكود الدقيق:

class OrderResponse(BaseModel):
    id: int
    customer_name: Optional[str] = None
    customer_phones: List[str] = []  # قيمة افتراضية قائمة فارغة
    address: str
    total_price: Decimal
    status: str
    created_by: int
    social_media_source: Optional[str] = None
    notes: Optional[str] = None
    # تأكد من إضافة الحقول الأخرى التي تظهر في قاعدة بياناتك (مثل items)
    
    @validator('customer_phones', pre=True, always=True)
    def ensure_phones_is_list(cls, v):
        # إذا كانت القيمة في قاعدة البيانات Null أو None، حولها لقائمة فارغة فوراً
        if v is None:
            return []
        return v

    class Config:
        from_attributes = True


class OrderItemDetailResponse(BaseModel):
    variant_id: int
    quantity: int
    price_at_order: Decimal
    product_name: str
    color_name: str
    image_url: Optional[str] # هذا هو الحقل الأهم للصور
    size: Optional[str]

    class Config:
        from_attributes = True

class OrderFullDetailResponse(BaseModel):
    id: int
    customer_name: Optional[str]
    customer_phones: List[str]
    address: str
    total_price: Decimal
    status: str
    created_at: datetime
    items: List[OrderItemDetailResponse] # قائمة الأصناف داخل الطلب

class Config:
        from_attributes = True

class QRScanRequest(BaseModel):
    qr_code: str
    employee_id: int  # الموظف الذي قام بالمسح

class DeliveryAssignRequest(BaseModel):
    delivery_type: str  # 'company' or 'private'
    delivery_name: str  # اسم الشركة أو الشخص
    notes: Optional[str] = None        