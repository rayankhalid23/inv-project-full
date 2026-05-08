from sqlalchemy import Column, Integer, String, Text, DECIMAL, Enum, ForeignKey, JSON, TIMESTAMP, func
from sqlalchemy.orm import relationship
from app.models.base import BaseModel
from app.core.database import Base


class OrderItem(BaseModel):
    __tablename__ = "order_items"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)

    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    variant_id = Column(Integer, ForeignKey("product_variants.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False) # أضف هذا السطر
    quantity = Column(Integer, nullable=False)
    picked_quantity = Column(Integer, default=0)
    price_at_order = Column(DECIMAL(12, 2), nullable=False)
  

    order = relationship("Order", back_populates="items")
    variant = relationship("ProductVariant")
    product = relationship("Product")

    

class OrderAction(BaseModel):
    __tablename__ = "order_actions"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    action_type = Column(String(200), nullable=False)
    details = Column(JSON, nullable=True) # تم التأكد من وجوده لدعم تتبع التغييرات
    created_at = Column(TIMESTAMP, server_default=func.now())

    order = relationship("Order", back_populates="actions")


class Order(BaseModel):
    __tablename__ = "orders"
    
    id = Column(Integer, primary_key=True)
    customer_name = Column(String(255), nullable=False)
    customer_phones = Column(JSON, nullable=False) # تأكد من استيراد JSON من sqlalchemy
    address = Column(String(255), nullable=False)
    social_media_source = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)
    total_price = Column(DECIMAL(12, 2), nullable=False)
    status = Column(String(50), default='pending')
    
    # حقول الموظفين (الموجودة في الصورة)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    inventory_employee_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    # معلومات الشحن
    delivery_info = Column(String(255), nullable=True)
    
    # حقول التوقيت (الموجودة في أسفل الصورة)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, onupdate=func.now())
    deleted_at = Column(TIMESTAMP, nullable=True)

    # العلاقات
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
    actions = relationship("OrderAction", back_populates="order", cascade="all, delete-orphan")

    creator = relationship("User", foreign_keys=[created_by])
    inventory_employee = relationship("User", foreign_keys=[inventory_employee_id])

   # delivery_man = relationship("User", foreign_keys=[delivery_man_id])