from sqlalchemy import String, ForeignKey, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
<<<<<<< HEAD
from app.models.base import BaseModel  # التعديل هنا
=======
from app.models.base import BaseModel
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.role import Role

<<<<<<< HEAD
class User(BaseModel):  # التعديل هنا
    __tablename__ = "users"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

=======
class User(BaseModel):
    """بيانات الموظفين والمستخدمين للنظام."""
    __tablename__ = "users"

    name: Mapped[str] = mapped_column(String(255), nullable=False, comment="الاسم الكامل")
    phone: Mapped[str] = mapped_column(String(20), nullable=False, unique=True, comment="رقم الهاتف (يستخدم للدخول)")
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False, comment="كلمة المرور المشفرة")
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id"), nullable=False, comment="معرف الرتبة")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, comment="حالة الحساب (نشط/معطل)")

    # ربط المستخدم بالرتبة الخاصة به
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
    role: Mapped["Role"] = relationship("Role", back_populates="users")