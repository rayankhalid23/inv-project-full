from sqlalchemy.orm import Session
from sqlalchemy import func, desc, case
from app.models.inventory import Product, InventoryMovement, SystemAuditLog
from app.models.order import Order, OrderItem
from app.models.user import User

class ReportingService:

    @staticmethod
    def get_inventory_performance_report(db: Session, start_date, end_date):
        # 1. أفضل 5 مبيعاً (نعتمد حالة delivered للطلبات المكتملة)
        top_selling_raw = db.query(
            Product.name, func.sum(OrderItem.quantity).label("total")
        ).select_from(Product).join(OrderItem, Product.id == OrderItem.product_id)\
         .join(Order, Order.id == OrderItem.order_id)\
         .filter(Order.status == "delivered", Order.created_at >= start_date, Order.created_at <= end_date)\
         .group_by(Product.id, Product.name).order_by(desc("total")).limit(5).all()

        # 2. أقل 5 مبيعاً
        least_selling_raw = db.query(
            Product.name, func.sum(OrderItem.quantity).label("total")
        ).select_from(Product).join(OrderItem, Product.id == OrderItem.product_id)\
         .join(Order, Order.id == OrderItem.order_id)\
         .filter(Order.status == "delivered", Order.created_at >= start_date, Order.created_at <= end_date)\
         .group_by(Product.id, Product.name).order_by("total").limit(5).all()

        # 3. الرواجع (تم التعديل إلى 'return' حسب الصورة)
        top_returns_raw = db.query(
            Product.name, func.sum(InventoryMovement.quantity_change).label("total")
        ).select_from(Product).join(InventoryMovement, Product.id == InventoryMovement.product_id)\
         .filter(InventoryMovement.movement_type == 'return', 
                 InventoryMovement.created_at >= start_date, 
                 InventoryMovement.created_at <= end_date)\
         .group_by(Product.id, Product.name).order_by(desc("total")).limit(5).all()

        # 4. التوالف (تم التعديل إلى 'damage' حسب الصورة)
        top_damaged_raw = db.query(
            Product.name, func.sum(func.abs(InventoryMovement.quantity_change)).label("total")
        ).select_from(Product).join(InventoryMovement, Product.id == InventoryMovement.product_id)\
         .filter(InventoryMovement.movement_type == 'damage', 
                 InventoryMovement.created_at >= start_date, 
                 InventoryMovement.created_at <= end_date)\
         .group_by(Product.id, Product.name).order_by(desc("total")).limit(5).all()

        # 5. قيمة الخسائر (تستخدم 'damage' وتضرب في سعر التكلفة cost_price من جدول المنتجات)
        loss_value = db.query(
            func.sum(func.abs(InventoryMovement.quantity_change) * Product.cost_price)
        ).select_from(InventoryMovement).join(Product, Product.id == InventoryMovement.product_id)\
         .filter(InventoryMovement.movement_type == 'damage', 
                 InventoryMovement.created_at >= start_date, 
                 InventoryMovement.created_at <= end_date)\
         .scalar() or 0

        # تحويل النتائج إلى تنسيق Dictionary لضمان عمل FastAPI دون أخطاء
        return {
            "top_selling": [dict(r._mapping) for r in top_selling_raw],
            "least_selling": [dict(r._mapping) for r in least_selling_raw],
            "top_returns": [dict(r._mapping) for r in top_returns_raw],
            "top_damaged": [dict(r._mapping) for r in top_damaged_raw],
            "loss_value": float(loss_value)
        }

    @staticmethod
    def get_employee_audit_report(db: Session, start_date, end_date):
        employees = db.query(User).filter(User.deleted_at == None).all()
        report_data = []

        for emp in employees:
            # نحدد الصلاحية (Manager هم role_id 1 أو 2)
            is_manager = emp.role_id in [1, 2]
            
            # حساب الحركات من جدول inventory_movements بالقيم الجديدة
            movements = db.query(
                func.sum(case((InventoryMovement.movement_type == 'return', 1), else_=0)).label('returns'),
                func.sum(case((InventoryMovement.movement_type == 'damage', 1), else_=0)).label('damaged')
            ).filter(InventoryMovement.user_id == emp.id, 
                     InventoryMovement.created_at >= start_date, 
                     InventoryMovement.created_at <= end_date).first()

            # حساب عدد الطلبات التي عالجها الموظف من سجل العمليات
            orders_count = db.query(SystemAuditLog).filter(
                SystemAuditLog.user_id == emp.id,
                SystemAuditLog.action_target == "order", # تأكد من وجود 'order' في السجل
                SystemAuditLog.created_at >= start_date,
                SystemAuditLog.created_at <= end_date
            ).count()

            stats = {
                "name": emp.name,
                "role": "Manager" if is_manager else "Staff",
                "basic_actions": {
                    "orders": orders_count,
                    "returns": int(movements.returns or 0),
                    "damaged": int(movements.damaged or 0)
                }
            }

            if is_manager:
                stats["management_actions"] = {
                    "catalogs_managed": db.query(SystemAuditLog).filter(
                        SystemAuditLog.user_id == emp.id, 
                        SystemAuditLog.action_target == "catalog", 
                        SystemAuditLog.created_at >= start_date).count(),
                    "products_managed": db.query(SystemAuditLog).filter(
                        SystemAuditLog.user_id == emp.id, 
                        SystemAuditLog.action_target == "product", 
                        SystemAuditLog.created_at >= start_date).count(),
                    "users_managed": db.query(SystemAuditLog).filter(
                        SystemAuditLog.user_id == emp.id, 
                        SystemAuditLog.action_target == "user", 
                        SystemAuditLog.created_at >= start_date).count()
                }
            report_data.append(stats)
        
        return sorted(report_data, key=lambda x: x["basic_actions"]["orders"], reverse=True)





def get_user_full_activity_stats(db: Session, user_id: int):
    # 0. تحديد رتبة المستخدم أولاً
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return None

    # هل المستخدم موظف؟ (نفترض أن رتبة الموظف هي 3)
    # إذا كان 1 (مسؤول) أو 2 (مدير) يعتبر Manager/Admin
    is_employee_only = user.role_id == 3 

    # 1. جلب الإضافات المباشرة (المنتجات والكتالوجات)
    # للموظف العادي نرجع 0 دائماً حسب طلبك
    products_created_count = 0
    catalogs_created_count = 0
    
    if not is_employee_only:
        products_created_count = db.query(func.count(Product.id)).filter(Product.created_by == user_id).scalar() or 0
        catalogs_created_count = db.query(func.count(Catalog.id)).filter(Catalog.created_by == user_id).scalar() or 0

    # 2. تجميع سجل النظام (system_audit_logs) مع فلترة الجداول
    audit_query = db.query(SystemAuditLog.action_type, func.count(SystemAuditLog.id))\
                    .filter(SystemAuditLog.user_id == user_id)

    if is_employee_only:
        # إذا كان موظف: استثناء العمليات التي تمت على جداول المستخدمين والمنتجات والمخزون
        # تأكد من مطابقة أسماء الجداول (table_name) كما هي في قاعدة بياناتك
        excluded_tables = ['users', 'products', 'catalogs', 'inventory_movements', 'roles']
        audit_query = audit_query.filter(SystemAuditLog.table_name.notin_(excluded_tables))

    audit_logs = audit_query.group_by(SystemAuditLog.action_type).all()
    audit_dict = {row[0]: row[1] for row in audit_logs}

    # 3. تجميع حركة المخزون (inventory_movements)
    # للموظف نلغيها تماماً لأنها مرتبطة بالمنتجات
    inv_dict = {}
    if not is_employee_only:
        inv_movements = db.query(InventoryMovement.movement_type, func.count(InventoryMovement.id))\
                          .filter(InventoryMovement.user_id == user_id)\
                          .group_by(InventoryMovement.movement_type).all()
        inv_dict = {row[0]: row[1] for row in inv_movements}

    # 4. تجميع عمليات الطلبات (order_actions) - متاحة للجميع
    order_actions = db.query(OrderAction.action_type, func.count(OrderAction.id))\
                      .filter(OrderAction.user_id == user_id)\
                      .group_by(OrderAction.action_type).all()
    order_dict = {row[0]: row[1] for row in order_actions}

    # ==========================================
    # الحسابات التجميعية بناءً على البيانات المفلترة
    # ==========================================

    # الإضافات
    total_adds = (
        audit_dict.get('create', 0) + audit_dict.get('created', 0) + 
        audit_dict.get('bulk_variants_created', 0) +
        order_dict.get('created', 0) + order_dict.get('order_created', 0)
    )

    # التعديلات
    total_updates = (
        audit_dict.get('update', 0) + audit_dict.get('updated', 0) + 
        audit_dict.get('toggle_status', 0) + audit_dict.get('restore', 0) +
        order_dict.get('updated', 0) + order_dict.get('order_edit_full', 0)
    )

    # الحذف
    total_deletes = audit_dict.get('delete', 0) + audit_dict.get('deleted', 0)

    # التوالف
    total_damages = inv_dict.get('damage', 0) + audit_dict.get('mark_damaged_qr', 0)

    # الرواجع
    total_returns = inv_dict.get('return', 0) + audit_dict.get('return', 0)

    # عمليات المسح
    total_qr_scans = order_dict.get('qr_scanned', 0) + order_dict.get('qr_scan_success', 0)

    # حساب الإجمالي الكلي للعمليات
    grand_total_operations = total_adds + total_updates + total_deletes + total_returns + total_damages + total_qr_scans

    return {
        "user_id": user_id,
        "user_role": user.role_id,
        "grand_total": grand_total_operations, # عدد إجمالي العمليات
        "direct_creations": {
            "products_created": products_created_count,
            "catalogs_created": catalogs_created_count
        },
        "consolidated_stats": {
            "adds": total_adds,
            "updates": total_updates,
            "deletes": total_deletes,
            "returns": total_returns,
            "damages": total_damages,
            "scans": total_qr_scans
        },
        "raw_details": {
            "audit_logs": audit_dict,
            "inventory": inv_dict,
            "orders": order_dict
        }
    }