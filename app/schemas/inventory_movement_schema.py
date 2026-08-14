from pydantic import BaseModel, Field, ConfigDict, model_validator
from typing import Optional, List, Any
from datetime import datetime

# =====================================================================
# 1. السكيمات الفرعية لتمثيل العلاقات (Nested Schemas) الاحترافية
# =====================================================================

class UserMinimal(BaseModel):
    id: int
    name: str  
    
    model_config = ConfigDict(from_attributes=True)


class ProductMinimal(BaseModel):
    id: int
    name: str
    code: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ColorMinimal(BaseModel):
    id: int
    name: str  
    
    model_config = ConfigDict(from_attributes=True)

    # 🌟 اعتراض الكائن بالكامل واستخراج الاسم ديناميكياً لتفادي خطأ missing
    @model_validator(mode='before')
    @classmethod
    def preprocess_color(cls, data: Any) -> Any:
        if isinstance(data, dict):
            return data
        
        color_id = getattr(data, 'id', None)
        color_name = None
        
        # فحص ديناميكي شامل لجميع الاحتمالات الممكنة لاسم الحقل في قاعدة البيانات
        for attr in ['name', 'color_name', 'color', 'value']:
            if hasattr(data, attr):
                val = getattr(data, attr)
                if isinstance(val, str):
                    color_name = val
                    break
                elif val and hasattr(val, 'name'):
                    color_name = getattr(val, 'name')
                    break
                    
        if not color_name:
            color_name = str(data)
            
        return {"id": color_id, "name": color_name}


class VariantMinimal(BaseModel):
    id: int
    quantity_available: Optional[int] = None
    size: Optional[str] = None  
    qr_code: Optional[str] = None
    color: Optional[ColorMinimal] = None  

    model_config = ConfigDict(from_attributes=True)

    # 🌟 اعتراض كائن الـ Variant بالكامل لضمان معالجة المقاس واللون معاً بأمان
    @model_validator(mode='before')
    @classmethod
    def preprocess_variant(cls, data: Any) -> Any:
        if isinstance(data, dict):
            return data
            
        variant_id = getattr(data, 'id', None)
        qty = getattr(data, 'quantity_available', getattr(data, 'stock', getattr(data, 'quantity', 0)))
        qr = getattr(data, 'qr_code', None)
        
        # معالجة المقاس ديناميكياً
        size_attr = getattr(data, 'size', None)
        size_value = None
        if size_attr is not None:
            if isinstance(size_attr, str):
                size_value = size_attr
            else:
                size_value = getattr(size_attr, 'name', getattr(size_attr, 'size_name', getattr(size_attr, 'value', str(size_attr))))
                
        # معالجة حقل اللون وتمريره كموديل أو كائن ليتم معالجته في ColorMinimal
        color_obj = getattr(data, 'color', getattr(data, 'product_color', None))
        
        return {
            "id": variant_id,
            "quantity_available": qty,
            "size": size_value,
            "qr_code": qr,
            "color": color_obj
        }


# =====================================================================
# 2. سكيمة قراءة سجل الحركات الشاملة (Inventory Logs / Ledger)
# =====================================================================
class InventoryMovementRead(BaseModel):
    id: int
    variant_id: int
    product_id: int
    user_id: int
    quantity_change: int
    movement_type: str  
    quantity_before: Optional[int] = None
    quantity_after: Optional[int] = None
    related_order_id: Optional[int] = None
    damage_reason: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime

    user: Optional[UserMinimal] = None
    variant: Optional[VariantMinimal] = None
    product: Optional[ProductMinimal] = None  

    # 🌟 الحقول المسطحة الجديدة لدعم شاشة التوالف والرواجع فوراً وبأعلى أداء
    movement_type_display: Optional[str] = None
    product_name: Optional[str] = None
    variant_size: Optional[str] = None
    variant_color: Optional[str] = None
    responsible_user: Optional[str] = None
    affected_quantity: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)

# =====================================================================
# 3. سكيمات طلبات العمليات اليدوية (Manual Stock Requests)
# =====================================================================

class StockAddRequest(BaseModel):
    variant_id: int
    quantity: int = Field(gt=0, description="الكمية المراد إضافتها للمخزن")
    notes: Optional[str] = Field(None, max_length=255)


class DamageRecordRequest(BaseModel):
    variant_id: int
    quantity: int = Field(gt=0, description="الكمية التالفة")
    reason: str = Field(..., min_length=3, description="سبب التلف")
    notes: Optional[str] = None


class ManualReturnRequest(BaseModel):
    variant_id: int
    quantity: int = Field(gt=0, description="الكمية المرتجعة")
    notes: Optional[str] = "مرتجع يدوي"


class DirectSaleRequest(BaseModel):
    variant_id: int
    quantity: int = Field(gt=0, description="الكمية المراد بيعها مباشرة")
    notes: Optional[str] = "بيع مباشر عبر الماسح"


# =====================================================================
# 4. سكيمات الرد الإستجابة والتقارير (Responses & Analytics)
# =====================================================================

class MovementResponse(BaseModel):
    status: str = "success"
    message: str
    new_quantity: int
    movement_id: Optional[int] = None
    # يُملأ في البيع المباشر فقط — تستخدمه الواجهة لعرض زر تحميل الفاتورة
    order_id: Optional[int] = None


class MovementSummary(BaseModel):
    month: int
    year: int  
    total_added: int
    total_damaged: int
    estimated_damage_loss: float
    return_rate: float


class StockIntegrityCheck(BaseModel):
    variant_id: int
    current_in_db: int
    calculated_from_history: int
    integrity_status: str
    difference: int


class PaginatedInventoryMovementResponse(BaseModel):
    total: int
    items: List[InventoryMovementRead]