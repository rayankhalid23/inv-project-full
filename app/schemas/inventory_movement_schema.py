from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime


# ==========================================
# 1. سكيمات فرعية لتمثيل العلاقات (Nested Schemas)
# ==========================================
# هذه السكيمات ضرورية لدالة get_advanced_inventory_ledger لأنها تستخدم joinedload

class UserMinimal(BaseModel):
    id: int
    full_name: str
    model_config = ConfigDict(from_attributes=True)

class ProductMinimal(BaseModel):
    id: int
    name: str
    code: str
    model_config = ConfigDict(from_attributes=True)

class VariantMinimal(BaseModel):
    id: int
    color: Optional[str] = None
    size: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)
# --- 1. سكيمة قراءة سجل الحركات (Inventory Logs) ---
# تعكس حقول موديل InventoryMovement وحقول دالة create_inventory_log
class InventoryMovementRead(BaseModel):
    id: int
    variant_id: int
    product_id: int
    user_id: int
    quantity_change: int
    movement_type: str # 'sale', 'return', 'adjustment', 'damage'
    
    # حقول إضافية بناءً على دالة create_inventory_log في الـ audit_service
    # ملاحظة: إذا لم تكن هذه الأعمدة موجودة في الموديل، يرجى إضافتها للموديل لتكتمل الرقابة
    quantity_before: Optional[int] = None
    quantity_after: Optional[int] = None
    related_order_id: Optional[int] = None
    damage_reason: Optional[str] = None
    notes: Optional[str] = None
    
    created_at: datetime

    product: Optional[ProductMinimal] = None
    user: Optional[UserMinimal] = None
    variant: Optional[VariantMinimal] = None

    model_config = ConfigDict(from_attributes=True)

# --- 2. سكيمات العمليات اليدوية (Manual Stock Operations) ---

# تستخدم عند إضافة بضاعة جديدة للمخزن يدوياً
class StockAddRequest(BaseModel):
    variant_id: int
    quantity: int = Field(gt=0, description="الكمية المراد إضافتها للمخزن")
    notes: Optional[str] = Field(None, max_length=255)

# تستخدم عند تسجيل تالف يدوياً (Damage Entry)
class DamageRecordRequest(BaseModel):
    variant_id: int
    quantity: int = Field(gt=0, description="الكمية التالفة")
    reason: str = Field(..., min_length=3, description="سبب التلف")
    notes: Optional[str] = None

# تستخدم عند إرجاع بضاعة للمخزن (Manual Return)
class ManualReturnRequest(BaseModel):
    variant_id: int
    quantity: int = Field(gt=0)
    notes: Optional[str] = "مرتجع يدوي"

# --- 3. سكيمة الرد عند النجاح ---
class MovementResponse(BaseModel):
    status: str = "success"
    message: str
    new_quantity: int
    movement_id: Optional[int] = None


class MovementSummary(BaseModel):
    month: int
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
