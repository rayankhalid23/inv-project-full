"""
مفردات سجلّات التدقيق الموحّدة.

المشكلة التي يحلّها هذا الملف: كل تقرير كان يحمل نسخته الخاصة من قاموس
تحويل (action_target → فئة) و(action_type → إضافة/تعديل/حذف)، وكانت هذه
النسخ مكتوبة بالتخمين لا بما يُكتب فعلياً في قاعدة البيانات. النتيجة أن
مئات العمليات كانت تسقط صامتة من التقارير: مثلاً القاموس كان يبحث عن
'damage' بينما الكود يكتب 'inventory_damage'، وعن 'order' بينما يكتب
'orders'، ولم يكن يعرف 'size' ولا 'variant' ولا 'product_color' إطلاقاً.

كل القيم أدناه مأخوذة من مسح فعلي لجدولي system_audit_logs و order_actions،
وأي قيمة جديدة تُضاف للكود يجب أن تُسجَّل هنا وإلا لن تظهر في التقارير.
"""

# فئات التقارير كما تتوقعها الواجهة (frontend/src/pages/Reports/EmployeesReport.jsx)
CATEGORY_EMPLOYEES = "employees"
CATEGORY_CATALOGS = "catalogs"
CATEGORY_PRODUCTS = "products"
CATEGORY_SALES = "sales"
CATEGORY_DAMAGES = "damages"
CATEGORY_RETURNS = "returns"
CATEGORY_SCANS = "scans"

# الفئات التي تُعرض كعدّاد واحد فقط (لا تنقسم إلى إضافة/تعديل/حذف)
TOTAL_ONLY_CATEGORIES = (CATEGORY_DAMAGES, CATEGORY_RETURNS, CATEGORY_SCANS)

# الفئات التي لا تُحتسب على الموظف العادي (role_id == 3) لأنها عمليات إدارية
MANAGEMENT_CATEGORIES = (CATEGORY_EMPLOYEES, CATEGORY_CATALOGS, CATEGORY_PRODUCTS)

ROLE_STAFF = 3

# ---------------------------------------------------------------------------
# system_audit_logs.action_target → فئة التقرير
# ---------------------------------------------------------------------------
AUDIT_TARGET_CATEGORY = {
    # إدارة الموظفين
    "user": CATEGORY_EMPLOYEES,
    "users": CATEGORY_EMPLOYEES,
    "employee": CATEGORY_EMPLOYEES,
    # الكتالوجات
    "catalog": CATEGORY_CATALOGS,
    "catalogs": CATEGORY_CATALOGS,
    # المنتجات وكل بنيتها (اللون والمقاس والمتغيّر جزء من المنتج)
    "product": CATEGORY_PRODUCTS,
    "products": CATEGORY_PRODUCTS,
    "product_color": CATEGORY_PRODUCTS,
    "size": CATEGORY_PRODUCTS,
    "variant": CATEGORY_PRODUCTS,
    "inventory": CATEGORY_PRODUCTS,
    # الطلبات
    "order": CATEGORY_SALES,
    "orders": CATEGORY_SALES,
}

# بعض العمليات تُحدَّد فئتها من نوع الفعل لا من الهدف
# (الهدف 'inventory' عام ويحمل تصفير التوالف والرواجع معاً)
AUDIT_ACTION_CATEGORY = {
    "clear_damages": CATEGORY_DAMAGES,
    "clear_returns": CATEGORY_RETURNS,
}

# ---------------------------------------------------------------------------
# action_type → إضافة / تعديل / حذف
# ---------------------------------------------------------------------------
ACTION_ADDS = {
    "create", "created", "add", "added",
    "bulk_variants_created", "order_created", "initial_stock",
}
ACTION_UPDATES = {
    "update", "updated", "edit", "edited",
    "toggle_status", "status_changed", "restore", "restored",
    "order_edit_full", "delivery_assigned",
    "darb_assabil_assigned", "darb_assabil_shipped",
    "invoice_downloaded", "manual_adjust",
}
ACTION_DELETES = {
    "delete", "deleted", "remove", "removed",
    "archive", "archived", "cancel", "cancelled", "order_cancelled",
    "delete_movement", "purge_completed_orders",
    "clear_damages", "clear_returns",
}


def classify_action(action_type: str) -> str:
    """
    يُرجع 'adds' أو 'updates' أو 'deletes'.

    المطابقة الحرفية أولاً (وهي تغطي كل القيم المعروفة)، ثم مطابقة جزئية
    احتياطية لأي قيمة جديدة لم تُسجَّل بعد. الترتيب هنا مقصود: يُفحص الحذف
    قبل الإضافة لأن قيمة مثل 'delete_movement' تحتوي على 'move' وقد تلتبس.
    """
    key = (action_type or "").strip().lower()
    if key in ACTION_DELETES:
        return "deletes"
    if key in ACTION_UPDATES:
        return "updates"
    if key in ACTION_ADDS:
        return "adds"

    if any(k in key for k in ("delete", "remove", "cancel", "archive", "purge", "clear")):
        return "deletes"
    if any(k in key for k in ("update", "edit", "status", "restore", "assign", "adjust")):
        return "updates"
    return "adds"


def classify_audit_target(action_target: str, action_type: str = "") -> str | None:
    """
    يُرجع فئة التقرير لسطر من system_audit_logs، أو None إذا كان الهدف غير
    معروف (فيُستبعد السطر بدل احتسابه في الفئة الخطأ).
    """
    action_key = (action_type or "").strip().lower()
    if action_key in AUDIT_ACTION_CATEGORY:
        return AUDIT_ACTION_CATEGORY[action_key]

    target_key = (action_target or "").strip().lower()
    return AUDIT_TARGET_CATEGORY.get(target_key)


# ---------------------------------------------------------------------------
# order_actions.action_type → فئة التقرير
# ---------------------------------------------------------------------------
# عمليات المسح تُفرد في فئة خاصة: هي عمل حقيقي للموظف لكنها ليست
# إضافة ولا تعديلاً ولا حذفاً للطلب، وكانت تسقط من التقارير كلياً.
ORDER_ACTION_SCANS = {"qr_scanned", "qr_scan_success", "manual_scan"}


def classify_order_action(action_type: str) -> str:
    """يُرجع 'scans' أو 'sales' لسطر من order_actions."""
    key = (action_type or "").strip().lower()
    return CATEGORY_SCANS if key in ORDER_ACTION_SCANS else CATEGORY_SALES


# ---------------------------------------------------------------------------
# inventory_movements.movement_type → فئة التقرير
# ---------------------------------------------------------------------------
# ملاحظة مهمة لتفادي العدّ المزدوج: مسار الـ QR يكتب حركة مخزون *و* سطر
# تدقيق للحدث الواحد، بينما المسار اليدوي يكتب حركة مخزون فقط. لذلك
# التوالف والرواجع تُحسب من حركات المخزون وحدها — فهي المصدر الوحيد الذي
# يغطي المسارين — وتُستبعد أهداف inventory_damage / inventory_return من
# قاموس التدقيق أعلاه عمداً حتى لا تُحتسب مرتين.
MOVEMENT_CATEGORY = {
    "damage": CATEGORY_DAMAGES,
    "return": CATEGORY_RETURNS,
}


def classify_movement(movement_type: str) -> str | None:
    return MOVEMENT_CATEGORY.get((movement_type or "").strip().lower())


def empty_categories() -> dict:
    """الهيكل الفارغ لفئات موظف واحد، بالشكل الذي تتوقعه الواجهة."""
    return {
        CATEGORY_EMPLOYEES: {"adds": 0, "updates": 0, "deletes": 0},
        CATEGORY_CATALOGS: {"adds": 0, "updates": 0, "deletes": 0},
        CATEGORY_PRODUCTS: {"adds": 0, "updates": 0, "deletes": 0},
        CATEGORY_SALES: {"adds": 0, "updates": 0, "deletes": 0},
        CATEGORY_DAMAGES: {"total": 0},
        CATEGORY_RETURNS: {"total": 0},
        CATEGORY_SCANS: {"total": 0},
    }


def sum_categories(categories: dict) -> int:
    """إجمالي عمليات موظف عبر كل فئاته."""
    total = 0
    for cat_data in categories.values():
        if "total" in cat_data:
            total += cat_data["total"]
        else:
            total += sum(cat_data.values())
    return total
