from sqlalchemy import Column, Integer, String, Text, DECIMAL, Enum, ForeignKey, JSON, TIMESTAMP, func
from sqlalchemy.orm import relationship
from app.models.base import BaseModel
from app.core.database import Base

class Order(BaseModel):
    __tablename__ = "orders"
    customer_name = Column(String(255), nullable=False)
    customer_phones = Column(JSON, nullable=False)
    total_price = Column(DECIMAL(12, 2), nullable=False)
    status = Column(Enum('pending', 'in_preparation', 'prepared', 'out_for_delivery', 'delivered', 'cancelled'), default='pending')
    
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")

class OrderItem(BaseModel):
    __tablename__ = "order_items"
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"))
    variant_id = Column(Integer, ForeignKey("product_variants.id"), nullable=False)
    quantity = Column(Integer, nullable=False)
    price_at_order = Column(DECIMAL(12, 2), nullable=False)
    
    order = relationship("Order", back_populates="items")
    variant = relationship("ProductVariant")

class OrderAction(Base):
    __tablename__ = "order_actions"
    id = Column(Integer, primary_key=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"))
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    action_type = Column(String(50), nullable=False)
    details = Column(JSON, nullable=True) # تم التأكد من وجوده لدعم تتبع التغييرات
    created_at = Column(TIMESTAMP, server_default=func.now())