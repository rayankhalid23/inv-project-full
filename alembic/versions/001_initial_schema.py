"""initial schema

Revision ID: 001
Revises:
Create Date: 2026-01-01 00:00:00.000000

ملاحظة: هذا الملف يُنشئ الـ schema الكاملة للمرة الأولى على سيرفر جديد.
إذا كانت قاعدة البيانات موجودة مسبقاً (أُنشئت بـ create_all) فقط نفّذ:
    alembic stamp head
وإذا كان السيرفر جديداً نفّذ:
    alembic upgrade head
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------ #
    # 1. roles
    # ------------------------------------------------------------------ #
    op.create_table(
        "roles",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(50), nullable=False, unique=True),
    )

    # ------------------------------------------------------------------ #
    # 2. users   (extends BaseModel → id, created_at, updated_at, deleted_at)
    # ------------------------------------------------------------------ #
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("phone", sa.String(20), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role_id", sa.Integer(), sa.ForeignKey("roles.id"), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.TIMESTAMP(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.TIMESTAMP(), nullable=False,
                  server_default=sa.text("now()"),
                  onupdate=sa.text("now()")),
        sa.Column("deleted_at", sa.TIMESTAMP(), nullable=True),
    )
    op.create_index("ix_users_phone", "users", ["phone"])

    # ------------------------------------------------------------------ #
    # 3. catalogs
    # ------------------------------------------------------------------ #
    op.create_table(
        "catalogs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.TIMESTAMP(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.TIMESTAMP(), nullable=False,
                  server_default=sa.text("now()"),
                  onupdate=sa.text("now()")),
        sa.Column("deleted_at", sa.TIMESTAMP(), nullable=True),
    )
    op.create_index("ix_catalogs_id", "catalogs", ["id"])

    # ------------------------------------------------------------------ #
    # 4. sizes
    # ------------------------------------------------------------------ #
    op.create_table(
        "sizes",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.TIMESTAMP(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.TIMESTAMP(), nullable=False,
                  server_default=sa.text("now()"),
                  onupdate=sa.text("now()")),
        sa.Column("deleted_at", sa.TIMESTAMP(), nullable=True),
    )
    op.create_index("ix_sizes_id", "sizes", ["id"])

    # ------------------------------------------------------------------ #
    # 5. products
    # ------------------------------------------------------------------ #
    op.create_table(
        "products",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("catalog_id", sa.Integer(), sa.ForeignKey("catalogs.id"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("code", sa.String(100), nullable=False, unique=True),
        sa.Column("main_image", sa.String(500), nullable=True),
        sa.Column("description", sa.String(1000), nullable=False),
        sa.Column("cost_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("selling_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("min_stock_threshold", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("total_available", sa.Integer(), nullable=True, server_default=sa.text("0")),
        sa.Column("total_reserved", sa.Integer(), nullable=True, server_default=sa.text("0")),
        sa.Column("total_sold", sa.Integer(), nullable=True, server_default=sa.text("0")),
        sa.Column("total_damaged", sa.Integer(), nullable=True, server_default=sa.text("0")),
        sa.Column("total_returns", sa.Integer(), nullable=True, server_default=sa.text("0")),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.TIMESTAMP(), nullable=False,
                  server_default=sa.text("now()"),
                  onupdate=sa.text("now()")),
        sa.Column("deleted_at", sa.TIMESTAMP(), nullable=True),
    )
    op.create_index("ix_products_id", "products", ["id"])

    # ------------------------------------------------------------------ #
    # 6. product_colors
    # ------------------------------------------------------------------ #
    op.create_table(
        "product_colors",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("product_id", sa.Integer(),
                  sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("color_name", sa.String(100), nullable=False),
        sa.Column("color_image", sa.String(255), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.TIMESTAMP(), nullable=False,
                  server_default=sa.text("now()"),
                  onupdate=sa.text("now()")),
        sa.Column("deleted_at", sa.TIMESTAMP(), nullable=True),
    )
    op.create_index("ix_product_colors_id", "product_colors", ["id"])

    # ------------------------------------------------------------------ #
    # 7. product_variants
    # ------------------------------------------------------------------ #
    op.create_table(
        "product_variants",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("product_color_id", sa.Integer(),
                  sa.ForeignKey("product_colors.id", ondelete="CASCADE"), nullable=False),
        sa.Column("size_id", sa.Integer(), sa.ForeignKey("sizes.id"), nullable=True),
        sa.Column("quantity_available", sa.Integer(), nullable=True, server_default=sa.text("0")),
        sa.Column("quantity_reserved", sa.Integer(), nullable=True, server_default=sa.text("0")),
        sa.Column("damaged_quantity", sa.Integer(), nullable=True, server_default=sa.text("0")),
        sa.Column("returned_quantity", sa.Integer(), nullable=True, server_default=sa.text("0")),
        sa.Column("min_stock_threshold", sa.Integer(), nullable=True, server_default=sa.text("0")),
        sa.Column("qr_code", sa.String(500), nullable=True),
        sa.Column("total_sold", sa.Integer(), nullable=True, server_default=sa.text("0")),
        sa.Column("created_at", sa.TIMESTAMP(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.TIMESTAMP(), nullable=False,
                  server_default=sa.text("now()"),
                  onupdate=sa.text("now()")),
        sa.Column("deleted_at", sa.TIMESTAMP(), nullable=True),
    )
    op.create_index("ix_product_variants_id", "product_variants", ["id"])
    op.create_index("ix_variants_qr_code",    "product_variants", ["qr_code"])
    op.create_index("ix_variants_deleted_at", "product_variants", ["deleted_at"])
    op.create_index("ix_variants_color_id",   "product_variants", ["product_color_id"])

    # ------------------------------------------------------------------ #
    # 8. orders
    # ------------------------------------------------------------------ #
    op.create_table(
        "orders",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("customer_name", sa.String(255), nullable=False),
        sa.Column("customer_phones", sa.JSON(), nullable=False),
        sa.Column("address", sa.String(255), nullable=False),
        sa.Column("social_media_source", sa.String(100), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("total_price", sa.DECIMAL(12, 2), nullable=False),
        sa.Column("status", sa.String(50), nullable=True, server_default=sa.text("'pending'")),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("inventory_employee_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("delivery_info", sa.String(255), nullable=True),
        sa.Column("shipping_provider", sa.String(50), nullable=True,
                  server_default=sa.text("'custom'")),
        sa.Column("tracking_number", sa.String(100), nullable=True),
        sa.Column("shipment_id", sa.String(100), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.TIMESTAMP(), nullable=True, onupdate=sa.text("now()")),
        sa.Column("deleted_at", sa.TIMESTAMP(), nullable=True),
    )
    op.create_index("ix_orders_status",     "orders", ["status"])
    op.create_index("ix_orders_created_at", "orders", ["created_at"])
    op.create_index("ix_orders_deleted_at", "orders", ["deleted_at"])
    op.create_index("ix_orders_created_by", "orders", ["created_by"])

    # ------------------------------------------------------------------ #
    # 9. system_audit_logs
    # ------------------------------------------------------------------ #
    op.create_table(
        "system_audit_logs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("action_target", sa.String(100), nullable=True),
        sa.Column("target_id", sa.Integer(), nullable=True),
        sa.Column("action_type", sa.String(100), nullable=True),
        sa.Column("details", sa.JSON(), nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
    )
    op.create_index("ix_system_audit_logs_id", "system_audit_logs", ["id"])

    # ------------------------------------------------------------------ #
    # 10. inventory_movements
    # ------------------------------------------------------------------ #
    op.create_table(
        "inventory_movements",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("variant_id", sa.Integer(), sa.ForeignKey("product_variants.id"), nullable=False),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id"), nullable=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("movement_type", sa.String(50), nullable=False),
        sa.Column("quantity_change", sa.Integer(), nullable=False),
        sa.Column("quantity_before", sa.Integer(), nullable=False),
        sa.Column("quantity_after", sa.Integer(), nullable=False),
        sa.Column("related_order_id", sa.Integer(), sa.ForeignKey("orders.id"), nullable=True),
        sa.Column("damage_reason", sa.String(255), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_inventory_movements_id", "inventory_movements", ["id"])

    # ------------------------------------------------------------------ #
    # 11. order_items   (extends BaseModel)
    # ------------------------------------------------------------------ #
    op.create_table(
        "order_items",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("order_id", sa.Integer(),
                  sa.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("variant_id", sa.Integer(), sa.ForeignKey("product_variants.id"), nullable=False),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id"), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("picked_quantity", sa.Integer(), nullable=True, server_default=sa.text("0")),
        sa.Column("price_at_order", sa.DECIMAL(12, 2), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.TIMESTAMP(), nullable=False,
                  server_default=sa.text("now()"),
                  onupdate=sa.text("now()")),
        sa.Column("deleted_at", sa.TIMESTAMP(), nullable=True),
    )

    # ------------------------------------------------------------------ #
    # 12. order_actions  (extends BaseModel)
    # ------------------------------------------------------------------ #
    op.create_table(
        "order_actions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("order_id", sa.Integer(),
                  sa.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("action_type", sa.String(200), nullable=False),
        sa.Column("details", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.TIMESTAMP(), nullable=False,
                  server_default=sa.text("now()"),
                  onupdate=sa.text("now()")),
        sa.Column("deleted_at", sa.TIMESTAMP(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("order_actions")
    op.drop_table("order_items")
    op.drop_table("inventory_movements")
    op.drop_table("system_audit_logs")
    op.drop_table("orders")
    op.drop_table("product_variants")
    op.drop_table("product_colors")
    op.drop_table("products")
    op.drop_table("sizes")
    op.drop_table("catalogs")
    op.drop_table("users")
    op.drop_table("roles")
