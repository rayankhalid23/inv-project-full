from app.models.inventory import InventoryMovement, Product, ProductVariant

try:
    from app.models.inventory import SystemAuditLog
except ImportError:
    SystemAuditLog = None
# --- المحركات المركزية (Core Engines) ---

def create_inventory_log(db: Session, variant_id: int, product_id: int, user_id: int,
                         movement_type: str, quantity_change: int, quantity_before: int,
                         quantity_after: int = None,
                         related_order_id: int = None, damage_reason: str = None, notes: str = None,details=None):
    """
    المحرك الخام لتسجيل أي حركة في المخزون.
    quantity_after اختياري: إن لم يُمرَّر يُحسب تلقائياً من (before + change).
    """
    if quantity_after is None:
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
    notes=notes,
    details=details
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

def log_product_data_update(db, admin_id, product_id, old_product, new_product):
    changes = {}

    fields_to_track = [
        "name", "catalog_id", "selling_price", 
        "cost_price", "min_stock_threshold", 
        "description", "main_image"
    ]

    for field in fields_to_track:
        old_val = old_product.get(field)
        new_val = new_product.get(field)

        # تحويل التغيير إلى نص مباشر بدلاً من Dictionary
        if field in ["selling_price", "cost_price"]:
            if round(float(old_val or 0), 2) != round(float(new_val or 0), 2):
                changes[field] = f"من {old_val} إلى {new_val}"
    elif field != "main_image":
    if old_val != new_val:
        changes[field] = f"من {old_val} إلى {new_val}"
else:
    if old_val != new_val and new_val is not None:
        changes[field] = "تم رفع صورة جديدة"
    if changes:
        create_system_audit_log(
            db=db,
            user_id=admin_id,
            action_target="product",
            target_id=product_id,
            action_type="updated",
            details=changes
        )
# 3. رقابة الطلبات
def log_order_qr_scan(db: Session, user_id: int, order_id: int, variant_id: int, qr_code: str):
    details = {"variant_id": variant_id, "scanned_qr_code": qr_code}
    return create_order_action_log(db, order_id, user_id, 'qr_scanned', details)


# أضف هذه الدالة في نهاية ملف audit_service.py
def log_order_initialization(db, user_id, order_id, customer_name, source):
    # بدلاً من استخدام متغير غير معرف initial_status
    # استخدم القيمة 'pending' مباشرة أو مررها من الدالة
    new_action = OrderAction(
        order_id=order_id,
        user_id=user_id,
        action_type="order_created",
        details={
            "customer": customer_name,
            "source": source,
            "status": "pending"  # تم استبدال initial_status بالقيمة الثابتة
        }
    )
    db.add(new_action)
    # لا تقم بعمل db.commit() هنا لأن الدالة الأساسية ستقوم بذلك



def log_color_action(db: Session, user_id: int, color_id: int, action_type: str, details: dict, ip: str = None):
    """
    سجل خاص بعمليات الألوان (إضافة، تعديل، حذف)
    """
    return create_system_audit_log(
        db=db,
        user_id=user_id,
        action_target="product_color",
        target_id=color_id,
        action_type=action_type,
        details=details,
        ip_address=ip
    )    