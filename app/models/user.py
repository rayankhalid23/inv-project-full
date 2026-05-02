from sqlalchemy import String, ForeignKey, Boolean,Column, Integer, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import BaseModel
from typing import TYPE_CHECKING
from sqlalchemy.sql import func

if TYPE_CHECKING:
    from app.models.role import Role

class User(BaseModel):
    """
    بيانات الموظفين والمستخدمين.
    يرث من BaseModel للحصول على (id, created_at, updated_at, deleted_at).
    """
    __tablename__ = "users"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    
    # رقم الهاتف هو وسيلة تسجيل الدخول الرئيسية، لذا يجب أن يكون فريداً
    phone: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    
    # تخزين الهاش الخاص بكلمة المرور لضمان الأمن
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    
    # الربط مع جدول الرتب
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id"), nullable=False)
    
    # حالة الحساب: لتتمكن من إيقاف موظف عن العمل دون حذف بياناته
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # علاقة الوصول للرتبة
    role: Mapped["Role"] = relationship("Role", back_populates="users")

    def __repr__(self) -> str:
        return f"<User(name='{self.name}', phone='{self.phone}')>"



