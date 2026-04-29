from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy import DateTime, func
from datetime import datetime
from typing import Optional
<<<<<<< HEAD
from sqlalchemy import Column, Integer, String, ForeignKey, TIMESTAMP, func, Numeric, Text, Boolean
from app.core.database import Base

class BaseModel(Base):
    __abstract__ = True
    id = Column(Integer, primary_key=True, autoincrement=True)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
    deleted_at = Column(TIMESTAMP, nullable=True)
=======

class Base(DeclarativeBase):
    """
    القاعدة الأساسية (Declarative Base).
    تعمل كنقطة تجميع لكافة الموديلات لتمكين Alembic من رصد التغييرات.
    """
    pass

class BaseModel(Base):
    """
    كلاس تجريدي (Abstract) يوفر الحقول الأساسية لكل جداول النظام.
    يضمن توحيد التوقيت الزمني ومعرفات السجلات.
    """
    __abstract__ = True
    
    # المعرف الرئيسي التلقائي
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    # توقيت الإنشاء (يتم ضبطه تلقائياً من الخادم)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), comment="وقت إنشاء السجل")
    
    # توقيت التحديث (يتغير تلقائياً عند أي تعديل)
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), 
        onupdate=func.now(),
        comment="وقت آخر تحديث"
    )
    
    # الحذف الناعم (إذا كان يحتوي قيمة، فالسجل يعتبر محذوفاً من واجهة المستخدم)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(nullable=True, comment="وقت الحذف الناعم")
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
