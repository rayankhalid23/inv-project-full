"""add allow_inspection and allow_try_on to order_items

Revision ID: 002
Revises: 001
Create Date: 2026-08-18 00:00:00.000000
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "order_items",
        sa.Column("allow_inspection", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "order_items",
        sa.Column("allow_try_on", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("order_items", "allow_try_on")
    op.drop_column("order_items", "allow_inspection")
