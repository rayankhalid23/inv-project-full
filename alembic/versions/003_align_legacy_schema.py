"""align legacy hand-built schema with the models

Revision ID: 003
Revises: 002
Create Date: 2026-08-23 00:00:00.000000

قاعدة الإنتاج الأصلية أُنشئت يدوياً بـ SQL قبل اعتماد Alembic، ثم خُتمت
بـ `alembic stamp` دون أن تُنفَّذ 001 عليها فعلياً. فبقيت مختلفة عن الموديلات
في 58 موضعاً: ثلاثة جداول ميتة، أعمدة زائدة، أنواع أوسع، وفهارس بأسماء قديمة.

هذه الهجرة تُلغي ذلك الفارق. وهي **شرطية بالكامل**: كل عملية تتحقق أولاً من
الحالة الفعلية عبر الـ inspector، فتصبح لا-عملية (no-op) على أي قاعدة جديدة
أنشأتها 001+002 أو create_all. لذا تشتغل بأمان على الحالتين.

ترتيب العمليات مقصود: تُضاف الفهارس الجديدة قبل حذف القديمة، لأن MySQL يرفض
حذف فهرس إن كان آخر فهرس يخدم مفتاحاً أجنبياً على نفس العمود.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# --------------------------------------------------------------------- #
# أدوات الفحص — تجعل كل عملية شرطية وقابلة لإعادة التشغيل
# --------------------------------------------------------------------- #
def _inspector():
    return sa.inspect(op.get_bind())


def _tables():
    return set(_inspector().get_table_names())


def _columns(table):
    if table not in _tables():
        return {}
    return {c["name"]: c for c in _inspector().get_columns(table)}


def _indexes(table):
    if table not in _tables():
        return {}
    return {i["name"]: i for i in _inspector().get_indexes(table)}


def _fks(table):
    if table not in _tables():
        return {}
    return {f["name"]: f for f in _inspector().get_foreign_keys(table)}


def drop_table_if_exists(table):
    if table in _tables():
        op.drop_table(table)


def drop_column_if_exists(table, column):
    if column in _columns(table):
        op.drop_column(table, column)


def create_index_if_missing(name, table, columns, unique=False):
    if table in _tables() and name not in _indexes(table):
        op.create_index(name, table, columns, unique=unique)


def drop_index_if_exists(name, table):
    if name in _indexes(table):
        op.drop_index(name, table_name=table)


def drop_fk_backed_index(table, index, fk_name, local_col, referred_table, referred_col):
    """
    حذف فهرس هو الفهرس الوحيد الذي يخدم مفتاحاً أجنبياً — يرفضه MySQL بالخطأ 1553.

    الحل: إسقاط المفتاح الأجنبي، ثم الفهرس، ثم إعادة بناء المفتاح. عندها يولّد
    MySQL فهرساً تلقائياً باسم العمود، وهو ما تنتجه create_all بالضبط على قاعدة
    جديدة، فيتجاهله alembic في المقارنة بدل أن يراه فارقاً.
    """
    if index not in _indexes(table):
        return
    has_fk = fk_name in _fks(table)
    if has_fk:
        op.drop_constraint(fk_name, table, type_="foreignkey")
    op.drop_index(index, table_name=table)
    if has_fk:
        op.create_foreign_key(None, table, referred_table, [local_col], [referred_col])


def align_column(table, column, target_type, nullable, server_default=False):
    """
    يعدّل العمود فقط إن كان نوعه أو قابليته للإفراغ مختلفة عن الهدف.
    server_default=False تعني "لا تلمس القيمة الافتراضية".
    """
    cols = _columns(table)
    if column not in cols:
        return
    current = cols[column]
    same_type = str(current["type"]).split(" COLLATE")[0].upper() == str(target_type).upper()
    same_null = bool(current["nullable"]) == bool(nullable)
    if same_type and same_null:
        return

    kwargs = dict(existing_type=current["type"], type_=target_type, nullable=nullable)
    if server_default is not False:
        kwargs["existing_server_default"] = server_default
    op.alter_column(table, column, **kwargs)


def upgrade() -> None:
    bind = op.get_bind()

    # ----------------------------------------------------------------- #
    # 0. تعبئة القيم الفارغة قبل فرض NOT NULL
    #    (22 منتجاً في قاعدة الإنتاج لديها description = NULL)
    # ----------------------------------------------------------------- #
    if "description" in _columns("products"):
        bind.execute(sa.text(
            "UPDATE products SET description = '' WHERE description IS NULL"
        ))
    if "min_stock_threshold" in _columns("products"):
        bind.execute(sa.text(
            "UPDATE products SET min_stock_threshold = 0 WHERE min_stock_threshold IS NULL"
        ))
    for col in ("is_active", "created_at", "updated_at"):
        if col in _columns("users"):
            default = "1" if col == "is_active" else "CURRENT_TIMESTAMP"
            bind.execute(sa.text(
                f"UPDATE users SET {col} = {default} WHERE {col} IS NULL"
            ))
    for tbl, cols in (("order_actions", ("updated_at",)),
                      ("order_items", ("created_at", "updated_at"))):
        for col in cols:
            if col in _columns(tbl):
                bind.execute(sa.text(
                    f"UPDATE {tbl} SET {col} = CURRENT_TIMESTAMP WHERE {col} IS NULL"
                ))

    # ----------------------------------------------------------------- #
    # 1. إضافة الفهارس التي تتوقعها الموديلات (قبل حذف القديمة)
    # ----------------------------------------------------------------- #
    create_index_if_missing("ix_catalogs_id", "catalogs", ["id"])
    create_index_if_missing("ix_products_id", "products", ["id"])
    create_index_if_missing("ix_product_colors_id", "product_colors", ["id"])
    create_index_if_missing("ix_sizes_id", "sizes", ["id"])
    create_index_if_missing("ix_order_items_id", "order_items", ["id"])
    create_index_if_missing("ix_inventory_movements_id", "inventory_movements", ["id"])
    create_index_if_missing("ix_system_audit_logs_id", "system_audit_logs", ["id"])

    create_index_if_missing("ix_product_variants_id", "product_variants", ["id"])
    create_index_if_missing("ix_variants_qr_code", "product_variants", ["qr_code"])
    create_index_if_missing("ix_variants_deleted_at", "product_variants", ["deleted_at"])
    create_index_if_missing("ix_variants_color_id", "product_variants", ["product_color_id"])

    create_index_if_missing("ix_orders_status", "orders", ["status"])
    create_index_if_missing("ix_orders_created_at", "orders", ["created_at"])
    create_index_if_missing("ix_orders_deleted_at", "orders", ["deleted_at"])
    create_index_if_missing("ix_orders_created_by", "orders", ["created_by"])

    create_index_if_missing("ix_users_phone", "users", ["phone"], unique=True)

    # ----------------------------------------------------------------- #
    # 2. حذف الفهارس القديمة التي لا تعرفها الموديلات
    # ----------------------------------------------------------------- #
    drop_index_if_exists("uk_phone", "users")
    drop_index_if_exists("uk_name", "users")
    drop_index_if_exists("uk_variant", "product_variants")
    drop_index_if_exists("name", "sizes")
    drop_index_if_exists("delivery_person_id", "orders")
    drop_index_if_exists("idx_movement_created_at", "inventory_movements")
    drop_index_if_exists("idx_movement_type", "inventory_movements")
    # الموديل لا يعرّف فهرساً على variant_id، لكنه آخر فهرس يخدم المفتاح الأجنبي
    drop_fk_backed_index("inventory_movements", "idx_variant_id",
                         "inventory_movements_ibfk_1",
                         "variant_id", "product_variants", "id")
    drop_index_if_exists("idx_created", "system_audit_logs")
    drop_index_if_exists("idx_target", "system_audit_logs")

    # ----------------------------------------------------------------- #
    # 3. محاذاة الأنواع وقابلية الإفراغ
    # ----------------------------------------------------------------- #
    align_column("users", "is_active", sa.Boolean(), False)
    align_column("users", "created_at", sa.TIMESTAMP(), False,
                 server_default=sa.text("CURRENT_TIMESTAMP"))
    align_column("users", "updated_at", sa.TIMESTAMP(), False,
                 server_default=sa.text("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"))

    align_column("products", "description", sa.String(1000), False)
    align_column("products", "min_stock_threshold", sa.Integer(), False,
                 server_default=sa.text("'5'"))
    align_column("products", "created_by", sa.Integer(), True)

    align_column("product_colors", "color_image", sa.String(255), True)
    align_column("product_variants", "size_id", sa.Integer(), True)

    align_column("orders", "address", sa.String(255), False)
    align_column("orders", "status", sa.String(50), True)
    align_column("orders", "created_by", sa.Integer(), True)

    align_column("order_actions", "action_type", sa.String(200), False)
    align_column("order_actions", "updated_at", sa.TIMESTAMP(), False,
                 server_default=sa.text("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"))

    align_column("order_items", "created_at", sa.TIMESTAMP(), False,
                 server_default=sa.text("CURRENT_TIMESTAMP"))
    align_column("order_items", "updated_at", sa.TIMESTAMP(), False,
                 server_default=sa.text("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"))

    align_column("inventory_movements", "product_id", sa.Integer(), True)
    align_column("inventory_movements", "damage_reason", sa.String(255), True)
    align_column("inventory_movements", "created_at", sa.DateTime(), True,
                 server_default=sa.text("CURRENT_TIMESTAMP"))

    align_column("system_audit_logs", "user_id", sa.Integer(), True)
    align_column("system_audit_logs", "target_id", sa.Integer(), True)
    align_column("system_audit_logs", "action_target", sa.String(100), True)
    align_column("system_audit_logs", "action_type", sa.String(100), True)
    align_column("system_audit_logs", "created_at", sa.DateTime(timezone=True), True,
                 server_default=sa.text("CURRENT_TIMESTAMP"))

    # ----------------------------------------------------------------- #
    # 4. حذف الأعمدة التي لم تعد في الموديلات
    # ----------------------------------------------------------------- #
    drop_column_if_exists("inventory_movements", "updated_at")
    drop_column_if_exists("inventory_movements", "deleted_at")
    drop_column_if_exists("order_actions", "notes")

    # ----------------------------------------------------------------- #
    # 5. المفتاح الأجنبي القديم على products كان ondelete=CASCADE،
    #    والموديل لا يطلب ذلك — حذف كتالوج يجب ألا يمحو منتجاته.
    # ----------------------------------------------------------------- #
    if "products_ibfk_1" in _fks("products"):
        op.drop_constraint("products_ibfk_1", "products", type_="foreignkey")
        op.create_foreign_key(None, "products", "catalogs", ["catalog_id"], ["id"])

    # ----------------------------------------------------------------- #
    # 6. حذف الجداول الميتة (بقايا نظام صلاحيات قديم لم يُستعمل قط)
    #    ترتيب الحذف يحترم المفاتيح الأجنبية.
    # ----------------------------------------------------------------- #
    drop_table_if_exists("role_permissions")
    drop_table_if_exists("notifications")
    drop_table_if_exists("permissions")


def downgrade() -> None:
    # هجرة تنظيف باتجاه واحد: الجداول المحذوفة كانت فارغة ولا يعرفها أي كود،
    # وإعادة بنائها لا تستعيد شيئاً. التراجع الآمن هو الرجوع من نسخة احتياطية.
    raise NotImplementedError(
        "003 لا يمكن التراجع عنها — استعد نسخة احتياطية من قاعدة البيانات بدلاً من ذلك."
    )
