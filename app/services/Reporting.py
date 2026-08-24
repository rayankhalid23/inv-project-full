from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, desc, case, and_, or_
from app.models.inventory import Product, InventoryMovement, SystemAuditLog, ProductVariant # أضفنا الكاتالوج أو الفارينت إذا دعت الحاجة
from app.models.order import Order, OrderItem, OrderAction
from app.models.user import User
from app.models.role import Role
from collections import defaultdict
from datetime import datetime
from app.services import audit_taxonomy as tax

class ReportingService:

    @staticmethod
    def get_performance_analytics(db: Session, start_date=None, end_date=None):
        """
        تحليل أداء الموظفين عبر ثلاثة مصادر مجتمعة:
          - system_audit_logs  : عمليات الموظفين والكتالوجات والمنتجات
          - order_actions      : عمليات الطلبات وعمليات المسح
          - inventory_movements: التوالف والرواجع

        التصنيف كله يمرّ عبر app.services.audit_taxonomy حتى لا تعود
        قواميس التحويل تتفرّع وتفقد قيماً بصمت كما كان يحدث سابقاً.
        """
        users = db.query(User).options(joinedload(User.role)).filter(User.deleted_at.is_(None)).all()

        user_stats = {}
        for u in users:
            user_stats[u.id] = {
                "id": u.id,
                "role_id": u.role_id,
                "employee_name": u.name,
                "role": u.role.name if u.role else "Employee",
                "categories": tax.empty_categories(),
            }

        def _bump(user_id, category, action_type, count):
            """يضيف عمليات لموظف مع احترام قيود الرتبة وشكل الفئة."""
            stats = user_stats.get(user_id)
            if not stats or not category:
                return
            # الموظف العادي لا تُحتسب له العمليات الإدارية
            if stats["role_id"] == tax.ROLE_STAFF and category in tax.MANAGEMENT_CATEGORIES:
                return
            bucket = stats["categories"][category]
            if "total" in bucket:
                bucket["total"] += count
            else:
                bucket[tax.classify_action(action_type)] += count

        # --- 1. سجل التدقيق العام ---
        audit_q = db.query(
            SystemAuditLog.user_id,
            SystemAuditLog.action_target,
            SystemAuditLog.action_type,
            func.count(SystemAuditLog.id).label("count"),
        )
        if start_date:
            audit_q = audit_q.filter(SystemAuditLog.created_at >= start_date)
        if end_date:
            audit_q = audit_q.filter(SystemAuditLog.created_at <= end_date)
        audit_q = audit_q.group_by(
            SystemAuditLog.user_id, SystemAuditLog.action_target, SystemAuditLog.action_type
        )

        for row in audit_q.all():
            category = tax.classify_audit_target(row.action_target, row.action_type)
            _bump(row.user_id, category, row.action_type, row.count)

        # --- 2. عمليات الطلبات والمسح ---
        order_q = db.query(
            OrderAction.user_id,
            OrderAction.action_type,
            func.count(OrderAction.id).label("count"),
        )
        if start_date:
            order_q = order_q.filter(OrderAction.created_at >= start_date)
        if end_date:
            order_q = order_q.filter(OrderAction.created_at <= end_date)
        order_q = order_q.group_by(OrderAction.user_id, OrderAction.action_type)

        for row in order_q.all():
            category = tax.classify_order_action(row.action_type)
            _bump(row.user_id, category, row.action_type, row.count)

        # --- 3. التوالف والرواجع من حركات المخزون ---
        # (مصدر واحد يغطي مسار الـ QR والمسار اليدوي معاً بلا عدّ مزدوج)
        move_q = db.query(
            InventoryMovement.user_id,
            InventoryMovement.movement_type,
            func.count(InventoryMovement.id).label("count"),
        ).filter(InventoryMovement.movement_type.in_(list(tax.MOVEMENT_CATEGORY.keys())))
        if start_date:
            move_q = move_q.filter(InventoryMovement.created_at >= start_date)
        if end_date:
            move_q = move_q.filter(InventoryMovement.created_at <= end_date)
        move_q = move_q.group_by(InventoryMovement.user_id, InventoryMovement.movement_type)

        for row in move_q.all():
            category = tax.classify_movement(row.movement_type)
            _bump(row.user_id, category, row.movement_type, row.count)

        # --- 4. الإجماليات ---
        for u_data in user_stats.values():
            u_data["total_operations"] = tax.sum_categories(u_data["categories"])

        # --- 5. التقسيم حسب الرتبة ---
        admins_list, managers_list, staff_list = [], [], []
        for u_data in user_stats.values():
            if u_data["role_id"] == 1:
                admins_list.append(u_data)
            elif u_data["role_id"] == 2:
                managers_list.append(u_data)
            elif u_data["role_id"] == tax.ROLE_STAFF:
                staff_list.append(u_data)

        for l in [admins_list, managers_list, staff_list]:
            l.sort(key=lambda x: x["total_operations"], reverse=True)

        def get_performance_group(sorted_list):
            """
            الأعلى والأدنى أداءً. تُستبعد حالة انعدام العمليات تماماً من
            قائمة "الأعلى" حتى لا يُعرض موظف بصفر عملية كأفضل أداء عندما
            يكون الجميع بلا نشاط في الفترة المختارة.
            """
            active = [u for u in sorted_list if u["total_operations"] > 0]
            if not active:
                return [], []
            max_val = active[0]["total_operations"]
            top_performers = [u for u in active if u["total_operations"] == max_val]
            min_val = sorted_list[-1]["total_operations"]
            bottom_performers = [u for u in sorted_list if u["total_operations"] == min_val]
            # لا معنى لأن يكون الموظف نفسه الأفضل والأسوأ في آن واحد
            if max_val == min_val:
                bottom_performers = []
            return top_performers, bottom_performers

        def format_rank(lst):
            top, bottom = get_performance_group(lst)
            return {"top": top, "bottom": bottom, "list": lst}

        return {
            "admins": format_rank(admins_list),
            "managers": format_rank(managers_list),
            "staff": format_rank(staff_list),
        }

    @staticmethod
    def get_inventory_performance_report(db: Session, start_date, end_date):
        """تقرير أداء حركة المخزن والمنتجات الأكثر وأقل مبيعاً بناء على الحالات المعتمدة"""

        # الحالات التي تُعتبر بيعاً محقّقاً. الحالات العربية والإنجليزية
        # الإضافية موجودة لتحمّل أي بيانات قديمة أو تسميات بديلة.
        sold_statuses = ["prepared", "shipped", "delivered", "تم التجهيز", "جاري الشحن", "تم اسناده للتوصيل", "تم التوصيل"]

        sold_filters = [
            Order.status.in_(sold_statuses),
            Order.deleted_at.is_(None),
            OrderItem.deleted_at.is_(None),
            Product.deleted_at.is_(None),
            Order.created_at >= start_date,
            Order.created_at <= end_date,
        ]

        # الأكثر مبيعاً
        top_selling_raw = db.query(
            Product.name, func.sum(OrderItem.quantity).label("total")
        ).select_from(Product).join(OrderItem, Product.id == OrderItem.product_id)         .join(Order, Order.id == OrderItem.order_id)         .filter(*sold_filters)         .group_by(Product.id, Product.name).order_by(desc("total")).limit(5).all()

        # الأقل مبيعاً / السلع الراكدة.
        # كان هذا الاستعلام يستخدم JOIN داخلياً فيستبعد كل منتج لم يُبع منه
        # ولا قطعة واحدة — أي أن "السلع الراكدة" كانت تعرض سلعاً تتحرك فعلاً
        # وتُخفي الراكدة تماماً، وهو عكس الغرض من التقرير. الآن نستخدم
        # استعلاماً فرعياً بـ LEFT JOIN فتظهر المنتجات ذات المبيعات الصفرية أولاً.
        sold_subq = (
            db.query(
                OrderItem.product_id.label("pid"),
                func.sum(OrderItem.quantity).label("sold"),
            )
            .join(Order, Order.id == OrderItem.order_id)
            .filter(
                Order.status.in_(sold_statuses),
                Order.deleted_at.is_(None),
                OrderItem.deleted_at.is_(None),
                Order.created_at >= start_date,
                Order.created_at <= end_date,
            )
            .group_by(OrderItem.product_id)
            .subquery()
        )

        least_selling_rows = (
            db.query(
                Product.name,
                func.coalesce(sold_subq.c.sold, 0).label("total"),
            )
            .outerjoin(sold_subq, sold_subq.c.pid == Product.id)
            .filter(Product.deleted_at.is_(None))
            .order_by("total", Product.name)
            .limit(5)
            .all()
        )

        # الأكثر مرتجعاً
        top_returns_raw = db.query(
            Product.name, func.sum(InventoryMovement.quantity_change).label("total")
        ).select_from(InventoryMovement)         .join(Product, Product.id == InventoryMovement.product_id)         .filter(
             InventoryMovement.movement_type == 'return',
             Product.deleted_at.is_(None),
             InventoryMovement.created_at >= start_date,
             InventoryMovement.created_at <= end_date
         )         .group_by(Product.id, Product.name).order_by(desc("total")).limit(5).all()

        # الأكثر تالفاً
        top_damaged_raw = db.query(
            Product.name, func.sum(func.abs(InventoryMovement.quantity_change)).label("total")
        ).select_from(InventoryMovement)         .join(Product, Product.id == InventoryMovement.product_id)         .filter(
             InventoryMovement.movement_type == 'damage',
             Product.deleted_at.is_(None),
             InventoryMovement.created_at >= start_date,
             InventoryMovement.created_at <= end_date
         )         .group_by(Product.id, Product.name).order_by(desc("total")).limit(5).all()

        # حساب خسائر التوالف المالية
        # (join داخلي بدل outerjoin: الحركة بلا منتج لا قيمة مالية لها وكانت
        #  تُنتج صفوفاً باسم فارغ في التقارير)
        loss_value = db.query(
            func.sum(func.abs(InventoryMovement.quantity_change) * Product.cost_price)
        ).select_from(InventoryMovement)         .join(Product, Product.id == InventoryMovement.product_id)         .filter(
             InventoryMovement.movement_type == 'damage',
             InventoryMovement.created_at >= start_date,
             InventoryMovement.created_at <= end_date
         )         .scalar() or 0

        def _rows(raw):
            """يستبعد أي صف بلا اسم منتج ويوحّد الأرقام إلى int."""
            out = []
            for r in raw:
                d = dict(r._mapping)
                if not d.get("name"):
                    continue
                d["total"] = int(d.get("total") or 0)
                out.append(d)
            return out

        return {
            "top_selling": _rows(top_selling_raw),
            "least_selling": _rows(least_selling_rows),
            "top_returns": _rows(top_returns_raw),
            "top_damaged": _rows(top_damaged_raw),
            "loss_value": float(loss_value)
        }

    @staticmethod
    def get_employee_audit_report(db: Session, start_date, end_date):
        """
        ✅ إصلاح N+1: كانت الدالة تُنفّذ حتى 5 استعلامات لكل موظف داخل حلقة
        (أي ~250 استعلاماً متتالياً لـ 50 موظفاً في طلب واحد). الآن استعلامان
        تجميعيان فقط مهما بلغ عدد الموظفين.
        """
        employees = db.query(User).filter(User.deleted_at == None).all()
        if not employees:
            return []

        emp_ids = [e.id for e in employees]

        # استعلام واحد: الرواجع والتوالف لكل الموظفين دفعة واحدة
        movement_rows = (
            db.query(
                InventoryMovement.user_id.label('uid'),
                func.sum(case((InventoryMovement.movement_type == 'return', 1), else_=0)).label('returns'),
                func.sum(case((InventoryMovement.movement_type == 'damage', 1), else_=0)).label('damaged'),
            )
            .filter(
                InventoryMovement.user_id.in_(emp_ids),
                InventoryMovement.created_at >= start_date,
                InventoryMovement.created_at <= end_date,
            )
            .group_by(InventoryMovement.user_id)
            .all()
        )
        movements_by_user = {r.uid: r for r in movement_rows}

        # عدد عمليات الطلبات لكل موظف.
        # كان يُقرأ من system_audit_logs بالهدف "order" وهو هدف لا يُكتب أبداً
        # (الكود يكتب "orders" وفي حالة واحدة فقط)، فكان العمود صفراً للجميع.
        # المصدر الصحيح هو order_actions حيث تُسجَّل كل عمليات الطلبات فعلياً.
        order_rows = (
            db.query(OrderAction.user_id.label('uid'), func.count().label('cnt'))
            .filter(
                OrderAction.user_id.in_(emp_ids),
                OrderAction.created_at >= start_date,
                OrderAction.created_at <= end_date,
            )
            .group_by(OrderAction.user_id)
            .all()
        )
        orders_by_user = {r.uid: int(r.cnt or 0) for r in order_rows}

        # أنشطة الإدارة داخل الفترة المطلوبة.
        # كان الفلتر مقيّداً ببداية الفترة دون نهايتها فيحتسب عمليات وقعت
        # بعدها، وكان يبحث عن ثلاثة أهداف فقط فتسقط عمليات المقاسات
        # والألوان والمتغيّرات رغم أنها كلها إدارة منتجات.
        audit_rows = (
            db.query(
                SystemAuditLog.user_id.label('uid'),
                SystemAuditLog.action_target.label('target'),
                SystemAuditLog.action_type.label('action'),
                func.count().label('cnt'),
            )
            .filter(
                SystemAuditLog.user_id.in_(emp_ids),
                SystemAuditLog.created_at >= start_date,
                SystemAuditLog.created_at <= end_date,
            )
            .group_by(
                SystemAuditLog.user_id,
                SystemAuditLog.action_target,
                SystemAuditLog.action_type,
            )
            .all()
        )
        audit_by_user = {}
        for r in audit_rows:
            category = tax.classify_audit_target(r.target, r.action)
            if category in tax.MANAGEMENT_CATEGORIES:
                bucket = audit_by_user.setdefault(r.uid, {})
                bucket[category] = bucket.get(category, 0) + int(r.cnt or 0)

        report_data = []
        for emp in employees:
            is_manager = emp.role_id in [1, 2]
            mv = movements_by_user.get(emp.id)
            counts = audit_by_user.get(emp.id, {})

            stats = {
                "name": emp.name,
                "role": "Manager" if is_manager else "Staff",
                "basic_actions": {
                    "orders": orders_by_user.get(emp.id, 0),
                    "returns": int(mv.returns or 0) if mv else 0,
                    "damaged": int(mv.damaged or 0) if mv else 0,
                },
            }

            if is_manager:
                stats["management_actions"] = {
                    "catalogs_managed": counts.get(tax.CATEGORY_CATALOGS, 0),
                    "products_managed": counts.get(tax.CATEGORY_PRODUCTS, 0),
                    "users_managed": counts.get(tax.CATEGORY_EMPLOYEES, 0),
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
