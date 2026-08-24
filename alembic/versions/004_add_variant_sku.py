"""add variant_sku to product_variants

Revision ID: 004
Revises: 003
Create Date: 2026-08-23 00:00:00.000000

يُضيف عمود variant_sku لتخزين كود المتغير القصير القابل للحفظ (مثل 30.1.M).
التنسيق: {product_id}.{color_position}.{size_name}
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector


revision: str = '004'
down_revision: Union[str, None] = '003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    columns = [c['name'] for c in inspector.get_columns('product_variants')]

    if 'variant_sku' not in columns:
        op.add_column(
            'product_variants',
            sa.Column('variant_sku', sa.String(50), nullable=True)
        )
        op.create_index(
            'ix_variants_variant_sku',
            'product_variants',
            ['variant_sku']
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    indexes = [i['name'] for i in inspector.get_indexes('product_variants')]
    columns = [c['name'] for c in inspector.get_columns('product_variants')]

    if 'ix_variants_variant_sku' in indexes:
        op.drop_index('ix_variants_variant_sku', table_name='product_variants')
    if 'variant_sku' in columns:
        op.drop_column('product_variants', 'variant_sku')
