from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import String
from app.models.base import Base
from typing import List, TYPE_CHECKING

# منع التكرار الدائري عند التحقق من الأنواع برمجياً
if TYPE_CHECKING:
    from app.models.user import User

class Role(Base):
    """
    تمثيل الرتب الوظيفية (مثل: Admin, Manager, Staff).
    تستخدم لتحديد صلاحيات الوصول لكل موظف في النظام.
    """
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    
    # العلاقة: رتبة واحدة يتبعها العديد من المستخدمين
    users: Mapped[List["User"]] = relationship("User", back_populates="role")

    def __repr__(self) -> str:
        return f"<Role(name='{self.name}')>"