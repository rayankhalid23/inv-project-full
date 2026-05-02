from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy import DateTime, func, TIMESTAMP
from datetime import datetime
from typing import Optional

class Base(DeclarativeBase):
    """نقطة التجميع لكافة موديلات النظام"""
    pass

class BaseModel(Base):
    """كلاس تجريدي يوفر الحقول الأساسية لضمان سلامة الأرشفة والتدقيق"""
    __abstract__ = True
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
    deleted_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP, nullable=True)