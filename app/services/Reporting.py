from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, desc, case, and_, or_
from app.models.inventory import Product, InventoryMovement, SystemAuditLog
from app.models.order import Order, OrderItem, OrderAction
from collections import defaultdict
from app.models.user import User
from app.models.role import Role

class ReportingService:

    @staticmethod
    def get_performance_analytics(db: Session, start_date=None, end_date=None):
        # 1. جلب الموظفين وتصنيفهم
        users = db.query(User).options(joinedload(User.role)).filter(User.deleted_at.is_(None)).all()
        
        user_stats = {}
        for u in users:
            user_stats[u.id] = {
                "id": u.id,
                "role_id": u.role_id,
                "employee_name": u.name,
                "role": u.role.name if u.role else "Employee",
                "categories": {
                    "employees": {"adds": 0, "updates": 0, "deletes": 0},
                    "catalogs": {"adds": 0, "updates": 0, "deletes": 0},
                    "products": {"adds": 0, "updates": 0, "deletes": 0},
                    "sales": {"adds": 0, "updates": 0, "deletes": 0},
                    "damages": {"total": 0},
                    "returns": {"total": 0}
                }
            }

        def get_action_category(action_type: str) -> str:
            action_type = (action_type or "").lower()
            if any(k in action_type for k in ["create", "add", "initial", "item_added"]): return "adds"
            if any(k in action_type for k in ["update", "edit", "status", "toggle", "restore"]): return "updates"
            if any(k in action_type for k in ["delete", "remove", "cancel", "archive", "item_removed"]): return "deletes"
            return "adds"

        # 2. جلب البيانات من الجداول الثلاثة (تجميع)
        # جلب AuditLogs
        audit_q = db.query(SystemAuditLog.user_id, SystemAuditLog.action_target, SystemAuditLog.action_type, func.count(SystemAuditLog.id).label("count"))
        if start_date: audit_q = audit_q.filter(SystemAuditLog.created_at >= start_date)
        if end_date: audit_q = audit_q.filter(SystemAuditLog.created_at <= end_date)
        
        for row in audit_q.group_by(SystemAuditLog.user_id, SystemAuditLog.action_target, SystemAuditLog.action_type).all():
            if row.user_id in user_stats:
                target = (row.action_target or "").lower()
                cat_map = {"user": "employees", "catalog": "catalogs", "product": "products", "order": "sales", "return": "returns", "damage": "damages"}
                cat = cat_map.get(target)
                if cat:
                    # تطبيق قيد الموظفين (id=3): لا يتم احتساب عمليات الموظفين/الكتالوج/المنتجات
                    if user_stats[row.user_id]["role_id"] == 3 and cat in ["employees", "catalogs", "products"]:
                        continue
                    user_stats[row.user_id]["categories"][cat][get_action_category(row.action_type)] += row.count

        # 3. معالجة التوالف والرواجع (حصر على Adds فقط)
        for u_id, u_data in user_stats.items():
            for cat in ["damages", "returns"]:
                 total_cat_ops = sum(u_data["categories"][cat].values())
                 u_data["categories"][cat] = {"total": total_cat_ops}
            
            # حساب الإجمالي لكل موظف
            u_data["total_operations"] = sum(c["total"] if "total" in c else sum(c.values()) for c in u_data["categories"].values())

        # 4. تقسيم القوائم (Admin=1, Manager=2, Staff=3)
        admins_list, managers_list, staff_list = [], [], []
        for u_data in user_stats.values():
            if u_data["role_id"] == 1: admins_list.append(u_data)
            elif u_data["role_id"] == 2: managers_list.append(u_data)
            elif u_data["role_id"] == 3: staff_list.append(u_data)

        # ترتيب القوائم من الأفضل للأسوأ
        for l in [admins_list, managers_list, staff_list]:
            l.sort(key=lambda x: x["total_operations"], reverse=True)

        def get_performance_group(sorted_list):
            if not sorted_list: return [], []
            max_val = sorted_list[0]["total_operations"]
            top_performers = [u for u in sorted_list if u["total_operations"] == max_val]
            min_val = sorted_list[-1]["total_operations"]
            bottom_performers = [u for u in sorted_list if u["total_operations"] == min_val]
            return top_performers, bottom_performers

        def format_rank(lst):
            top, bottom = get_performance_group(lst)
            return {"top": top, "bottom": bottom, "list": lst}       

        return {
               "admins": format_rank(admins_list),
               "managers": format_rank(managers_list),
               "staff": format_rank(staff_list)
            }
     
    

       
            

    @staticmethod
    def get_inventory_performance_report(db: Session, start_date, end_date):
        top_selling_raw = db.query(
            Product.name, func.sum(OrderItem.quantity).label("total")
        ).select_from(Product).join(OrderItem, Product.id == OrderItem.product_id)\
         .join(Order, Order.id == OrderItem.order_id)\
         .filter(Order.status == "delivered", Order.created_at >= start_date, Order.created_at <= end_date)\
         .group_by(Product.id, Product.name).order_by(desc("total")).limit(5).all()

        least_selling_raw = db.query(
            Product.name, func.sum(OrderItem.quantity).label("total")
        ).select_from(Product).join(OrderItem, Product.id == OrderItem.product_id)\
         .join(Order, Order.id == OrderItem.order_id)\
         .filter(Order.status == "delivered", Order.created_at >= start_date, Order.created_at <= end_date)\
         .group_by(Product.id, Product.name).order_by("total").limit(5).all()

        top_returns_raw = db.query(
            Product.name, func.sum(InventoryMovement.quantity_change).label("total")
        ).select_from(Product).join(InventoryMovement, Product.id == InventoryMovement.product_id)\
         .filter(InventoryMovement.movement_type == 'return', 
                  InventoryMovement.created_at >= start_date, 
                  InventoryMovement.created_at <= end_date)\
         .group_by(Product.id, Product.name).order_by(desc("total")).limit(5).all()

        top_damaged_raw = db.query(
            Product.name, func.sum(func.abs(InventoryMovement.quantity_change)).label("total")
        ).select_from(Product).join(InventoryMovement, Product.id == InventoryMovement.product_id)\
         .filter(InventoryMovement.movement_type == 'damage', 
                  InventoryMovement.created_at >= start_date, 
                  InventoryMovement.created_at <= end_date)\
         .group_by(Product.id, Product.name).order_by(desc("total")).limit(5).all()

        loss_value = db.query(
            func.sum(func.abs(InventoryMovement.quantity_change) * Product.cost_price)
        ).select_from(InventoryMovement).join(Product, Product.id == InventoryMovement.product_id)\
         .filter(InventoryMovement.movement_type == 'damage', 
                  InventoryMovement.created_at >= start_date, 
                  InventoryMovement.created_at <= end_date)\
         .scalar() or 0

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
            is_manager = emp.role_id in [1, 2]
            
            movements = db.query(
                func.sum(case((InventoryMovement.movement_type == 'return', 1), else_=0)).label('returns'),
                func.sum(case((InventoryMovement.movement_type == 'damage', 1), else_=0)).label('damaged')
            ).filter(InventoryMovement.user_id == emp.id, 
                     InventoryMovement.created_at >= start_date, 
                     InventoryMovement.created_at <= end_date).first()

            orders_count = db.query(SystemAuditLog).filter(
                SystemAuditLog.user_id == emp.id,
                SystemAuditLog.action_target == "order",
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

    @staticmethod
    def get_employee_statistics(db: Session):
        stats = db.query(
            func.count(User.id).label("total"),
            func.sum(case((and_(User.deleted_at.is_(None), User.is_active == True), 1), else_=0)).label("active"),
            func.sum(case((User.deleted_at.is_not(None), 1), else_=0)).label("deleted"),
            func.sum(case((and_(User.role_id == 1, User.deleted_at.is_(None)), 1), else_=0)).label("admins"),
            func.sum(case((and_(User.role_id == 2, User.deleted_at.is_(None)), 1), else_=0)).label("managers"),
            func.sum(case((and_(User.role_id == 3, User.deleted_at.is_(None)), 1), else_=0)).label("employees")
        ).first()

        roles = db.query(Role).all()
        role_breakdown = {role.name: 0 for role in roles}

        role_counts = db.query(
            Role.name,
            func.count(User.id).label("count")
        ).join(User, User.role_id == Role.id)\
         .filter(User.deleted_at.is_(None))\
         .group_by(Role.name).all()

        for r in role_counts:
            role_breakdown[r.name] = r.count

        return {
            "total_employees": int(stats.total or 0),
            "active_employees": int(stats.active or 0),
            "deleted_employees": int(stats.deleted or 0),
            "admins_count": int(stats.admins or 0),
            "managers_count": int(stats.managers or 0),
            "employees_count": int(stats.employees or 0),
        }

    @staticmethod
    def get_user_full_activity_stats(db: Session, user_id: int):
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return None

        is_employee_only = user.role_id == 3 

        products_created_count = 0
        catalogs_created_count = 0
        
        if not is_employee_only:
            products_created_count = db.query(func.count(Product.id)).filter(Product.created_by == user_id).scalar() or 0
            catalogs_created_count = db.query(func.count(Catalog.id)).filter(Catalog.created_by == user_id).scalar() or 0

        audit_query = db.query(SystemAuditLog.action_type, func.count(SystemAuditLog.id))\
                        .filter(SystemAuditLog.user_id == user_id)

        if is_employee_only:
            excluded_tables = ['users', 'products', 'catalogs', 'inventory_movements', 'roles']
            audit_query = audit_query.filter(SystemAuditLog.table_name.notin_(excluded_tables))

        audit_logs = audit_query.group_by(SystemAuditLog.action_type).all()
        audit_dict = {row[0]: row[1] for row in audit_logs}

        inv_dict = {}
        if not is_employee_only:
            inv_movements = db.query(InventoryMovement.movement_type, func.count(InventoryMovement.id))\
                              .filter(InventoryMovement.user_id == user_id)\
                              .group_by(InventoryMovement.movement_type).all()
            inv_dict = {row[0]: row[1] for row in inv_movements}

        order_actions = db.query(OrderAction.action_type, func.count(OrderAction.id))\
                          .filter(OrderAction.user_id == user_id)\
                          .group_by(OrderAction.action_type).all()
        order_dict = {row[0]: row[1] for row in order_actions}

        total_adds = (
            audit_dict.get('create', 0) + audit_dict.get('created', 0) + 
            audit_dict.get('bulk_variants_created', 0) +
            order_dict.get('created', 0) + order_dict.get('order_created', 0)
        )

        total_updates = (
            audit_dict.get('update', 0) + audit_dict.get('updated', 0) + 
            audit_dict.get('toggle_status', 0) + audit_dict.get('restore', 0) +
            order_dict.get('updated', 0) + order_dict.get('order_edit_full', 0)
        )

        total_deletes = audit_dict.get('delete', 0) + audit_dict.get('deleted', 0)
        total_damages = inv_dict.get('damage', 0) + audit_dict.get('mark_damaged_qr', 0)
        total_returns = inv_dict.get('return', 0) + audit_dict.get('return', 0)
        total_qr_scans = order_dict.get('qr_scanned', 0) + order_dict.get('qr_scan_success', 0)

        grand_total_operations = total_adds + total_updates + total_deletes + total_returns + total_damages + total_qr_scans

        return {
            "user_id": user_id,
            "user_role": user.role_id,
            "grand_total": grand_total_operations,
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