from sqlalchemy.orm import Session
from app.models.user import User
from app.models.order import OrderAction
from app.models.inventory import InventoryMovement, Product, ProductVariant,SystemAuditLog


try:
    from app.models.inventory import SystemAuditLog
except ImportError:
    SystemAuditLog = None # لتجنب الانهيار إذا لم يتم تعريف الموديل بعد

# --- المحركات المركزية (Core Engines) ---

def create_inventory_log(db: Session, variant_id: int, product_id: int, user_id: int, 
                         movement_type: str, quantity_change: int, quantity_before: int, 
                         related_order_id: int = None, damage_reason: str = None, notes: str = None):
    """
    المحرك الخام لتسجيل أي حركة في المخزون.
    """
    quantity_after = quantity_before + quantity_change
    new_movement = InventoryMovement(
        variant_id=variant_id,
        product_id=product_id,
        user_id=user_id,
        movement_type=movement_type,
        quantity_change=quantity_change,
        quantity_before=quantity_before,
        quantity_after=quantity_after,
        related_order_id=related_order_id,
        damage_reason=damage_reason,
        notes=notes
    )
    db.add(new_movement)
    return new_movement

def create_order_action_log(db: Session, order_id: int, user_id: int, action_type: str, 
                            details: dict = None, notes: str = None):
    """
    المحرك الخام لتسجيل أفعال الطلبات (تغيير حالة، مسح QR، إلخ).
    """
    new_action = OrderAction(
        order_id=order_id,
        user_id=user_id,
        action_type=action_type,
        details=details,
        notes=notes
    )
    db.add(new_action)
    return new_action

def create_system_audit_log(db: Session, user_id: int, action_target: str, target_id: int, 
                            action_type: str, details: dict = None, ip_address: str = None):
    """
    المحرك الخام لتسجيل الرقابة الإدارية (تعديل موظف، تغيير سعر، إلخ).
    """
    if not SystemAuditLog:
        return None # لا يسجل شيئاً إذا كان الموديل مفقوداً
        
    audit_entry = SystemAuditLog(
        user_id=user_id,
        action_target=action_target, 
        target_id=target_id,
        action_type=action_type, 
        details=details, 
        ip_address=ip_address
    )
    db.add(audit_entry)
    return audit_entry

# --- دوال الرقابة المتخصصة (Specialized Loggers) ---

def log_product_data_update(db: Session, admin_id: int, product_id: int, old_product: dict, new_product: dict, ip: str = None):
    all_changes = {}
    basic_fields = ['name', 'code', 'cost_price', 'selling_price']
    field_changes = {f: {"from": old_product.get(f), "to": new_product.get(f)} 
                     for f in basic_fields if old_product.get(f) != new_product.get(f)}
    
    if field_changes: all_changes['basic_info'] = field_changes
    return create_system_audit_log(db, admin_id, 'product', product_id, 'updated', all_changes, ip)

# 3. رقابة الطلبات
def log_order_qr_scan(db: Session, user_id: int, order_id: int, variant_id: int, qr_code: str):
    details = {"variant_id": variant_id, "scanned_qr_code": qr_code}
    return create_order_action_log(db, order_id, user_id, 'qr_scanned', details)


# أضف هذه الدالة في نهاية ملف audit_service.py
def log_order_initialization(db: Session, order_id: int, user_id: int, initial_status: str = "pending"):
    """
    تسجيل لحظة إنشاء الطلب وتوثيق الموظف المسؤول عن العملية.
    """
    details = {
        "status": initial_status,
        "message": "تم إنشاء الطلب وبدء دورة حياته في النظام"
    }
    return create_order_action_log(
        db=db, 
        order_id=order_id, 
        user_id=user_id, 
        action_type='initialized', 
        details=details
    )

