from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import String
from app.models.base import Base
<<<<<<< HEAD
from typing import List

class Role(Base):
    __tablename__ = "roles"

    # نكتفي فقط بالحقول الأساسية التي لا تخلو منها أي قاعدة بيانات
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    
    # العلاقة البرمجية (ضرورية لحل خطأ Mapper السابق)
=======
from typing import List, TYPE_CHECKING

# منع التكرار الدائري (Circular Import) عند التحقق من الأنواع
if TYPE_CHECKING:
    from app.models.user import User

class Role(Base):
    """تعريف الأدوار الوظيفية (مثل: Admin, Manager, Staff)."""
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, comment="اسم الرتبة")
    
    # العلاقة العكسية: رتبة واحدة يتبعها العديد من المستخدمين
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
    users: Mapped[List["User"]] = relationship("User", back_populates="role")