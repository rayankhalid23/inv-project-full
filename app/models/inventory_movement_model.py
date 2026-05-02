from sqlalchemy.orm import Session
from typing import Dict, Any, Optional

# استيراد موديلات التوثيق فقط (لا حاجة لاستيراد المنتجات هنا لتخفيف الحمل)
from app.models.order import OrderAction
from app.models.inventory import InventoryMovement, SystemAuditLog

# ==========================================
# 1. المحركات المركزية (Core Engines)
# ==========================================

def create_inventory_log(
    db: Session, 
    variant_id: int, 
    product_id: int, 
    user_id: int, 
    movement_type: str, 
    quantity_change: int, 
    quantity_before: int, 
    related_order_id: Optional[int] = None, 
    damage_reason: Optional[str] = None, 
    notes: Optional[str] = None
) -> InventoryMovement:
    
    # الحساب التلقائي لضمان نزاهة البيانات
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
    # لا يتم عمل db.commit() هنا لضمان (Atomicity) في الملفات المستدعية
    return new_movement


def create_order_action_log(
    db: Session, 
    order_id: int, 
    user_id: int, 
    action_type: str, 
    details: Optional[Dict[str, Any]] = None, 
    notes: Optional[str] = None
) -> OrderAction:
    
    new_action = OrderAction(
        order_id=order_id,
        user_id=user_id,
        action_type=action_type,
        details=details,
        notes=notes
    )
    
    db.add(new_action)
    return new_action


def create_system_audit_log(
    db: Session, 
    user_id: int, 
    action_target: str, 
    target_id: int, 
    action_type: str, 
    details: Optional[Dict[str, Any]] = None, 
    ip_address: Optional[str] = None
) -> SystemAuditLog:
    
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

# ==========================================
# 2. دوال الرقابة المتخصصة: النظام والموظفين
# ==========================================

def log_user_creation(db: Session, admin_id: int, new_user_id: int, user_data: dict, ip: str = None):
    details = {
        "message": f"تم إنشاء حساب جديد للموظف: {user_data.get('name')}",
        "role_id": user_data.get('role_id'),
        "phone": user_data.get('phone')
    }
    return create_system_audit_log(db, admin_id, 'user', new_user_id, 'created', details, ip)

def log_user_update(db: Session, admin_id: int, target_user_id: int, old_values: dict, new_values: dict, ip: str = None):
    changes = {
        k: {"from": old_values[k], "to": new_values[k]} 
        for k in new_values if k in old_values and old_values[k] != new_values[k]
    }
    if not changes: return None
    return create_system_audit_log(db, admin_id, 'user', target_user_id, 'updated', {"changes": changes}, ip)

def log_user_status_change(db: Session, admin_id: int, target_user_id: int, is_active: bool, ip: str = None):
    status_text = "نشط" if is_active else "موقف"
    details = {"new_status": is_active, "message": f"تم تغيير حالة الحساب إلى: {status_text}"}
    return create_system_audit_log(db, admin_id, 'user', target_user_id, 'status_changed', details, ip)

def log_user_soft_delete(db: Session, admin_id: int, target_user_id: int, ip: str = None):
    details = {"message": "تم نقل الموظف إلى الأرشيف (Soft Delete)", "action": "archived"}
    return create_system_audit_log(db, admin_id, 'user', target_user_id, 'deleted', details, ip)

# ==========================================
# 3. دوال الرقابة المتخصصة: الكتالوج والمنتجات
# ==========================================

def log_catalog_activity(db: Session, admin_id: int, catalog_id: int, action: str, old_data: dict = None, new_data: dict = None, ip: str = None):
    details = {}
    if action == 'updated' and old_data and new_data:
        details['changes'] = {k: {"from": old_data.get(k), "to": new_data.get(k)} for k in new_data if old_data.get(k) != new_data.get(k)}
    else:
        details['message'] = "تم إنشاء كتالوج جديد"
        details['catalog_name'] = new_data.get('name') if new_data else None
    return create_system_audit_log(db, admin_id, 'catalog', catalog_id, action, details, ip)

def log_product_data_update(db: Session, admin_id: int, product_id: int, old_product: dict, new_product: dict, ip: str = None):
    all_changes = {}
    basic_fields = ['name', 'code', 'description', 'main_image']
    field_changes = {f: {"from": old_product.get(f), "to": new_product.get(f)} for f in basic_fields if old_product.get(f) != new_product.get(f)}
    
    if field_changes: all_changes['basic_info'] = field_changes
    if old_product.get('variants') != new_product.get('variants'):
        all_changes['inventory_structure'] = {
            "message": "تم تعديل في الألوان أو المقاسات أو الكميات المتاحة",
            "old_stock_total": old_product.get('total_available'),
            "new_stock_total": new_product.get('total_available')
        }
    if not all_changes: return None
    return create_system_audit_log(db, admin_id, 'product', product_id, 'updated', all_changes, ip)

def log_product_soft_delete(db: Session, admin_id: int, product_id: int, ip: str = None):
    return create_system_audit_log(db, admin_id, 'product', product_id, 'deleted', {"message": "تم نقل المنتج وكافة متغيراته إلى الأرشيف"}, ip)

# ==========================================
# 4. دوال الرقابة المتخصصة: الطلبات
# ==========================================

def log_order_initialization(db: Session, user_id: int, order_id: int, customer_name: str, source: str):
    details = {"message": "تم إنشاء الطلب في النظام", "customer_name": customer_name, "social_media_source": source}
    return create_order_action_log(db, order_id, user_id, 'created', details)

def log_order_modification(db: Session, user_id: int, order_id: int, action: str, variant_id: int, quantity: int, product_name: str):
    if action not in ['item_added', 'item_removed']: raise ValueError("نوع العملية غير صالح.")
    action_text = "إضافة" if action == 'item_added' else "حذف"
    details = {"message": f"تم {action_text} صنف من الطلب", "variant_id": variant_id, "product_name": product_name, "quantity": quantity}
    return create_order_action_log(db, order_id, user_id, action, details)

def log_order_qr_scan(db: Session, user_id: int, order_id: int, variant_id: int, qr_code: str):
    details = {"message": "تم مسح الكود وتأكيد تجهيز القطعة", "variant_id": variant_id, "scanned_qr_code": qr_code}
    return create_order_action_log(db, order_id, user_id, 'qr_scanned', details)

def log_delivery_assignment(db: Session, user_id: int, order_id: int, delivery_info: str):
    details = {"message": "تم تسليم الطلب للتوصيل", "delivery_info": delivery_info}
    return create_order_action_log(db, order_id, user_id, 'assigned_to_delivery', details)

def log_order_cancellation(db: Session, user_id: int, order_id: int, cancel_reason: str):
    details = {"message": "تم إلغاء الطلب", "cancellation_reason": cancel_reason}
    return create_order_action_log(db, order_id, user_id, 'cancelled', details, cancel_reason)



