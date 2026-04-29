from sqlalchemy import Column, Integer, String, Text, DECIMAL, Enum, ForeignKey, JSON, TIMESTAMP, func
from sqlalchemy.orm import relationship
from app.models.base import BaseModel
# الاستيراد الصحيح
from app.core.database import Base 

class Order(BaseModel):
    __tablename__ = "orders"
    id = Column(Integer, primary_key=True, index=True)
    customer_name = Column(String(255), nullable=False)
    customer_phones = Column(JSON, nullable=False)
    social_media_source = Column(String(100), nullable=True)
    address = Column(Text, nullable=False)
    notes = Column(Text, nullable=True)
    delivery_info = Column(String(255), nullable=True)
    total_price = Column(DECIMAL(12, 2), nullable=False)
    status = Column(Enum('pending', 'in_preparation', 'prepared', 'out_for_delivery', 'delivered', 'cancelled'), default='pending')
    created_by = Column(Integer, nullable=False) # مؤقتاً لحين ربط المستخدمين

    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
    

class OrderItem(BaseModel):
    __tablename__ = "order_items"
    id = Column(Integer, primary_key=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"))
    variant_id = Column(Integer, ForeignKey("product_variants.id"), nullable=False)
    product_id = Column(Integer, nullable=False)
    quantity = Column(Integer, nullable=False)
    price_at_order = Column(DECIMAL(12, 2), nullable=False)
    picked_quantity = Column(Integer, default=0)

    
    order = relationship("Order", back_populates="items")
    variant = relationship("ProductVariant")

class OrderAction(Base):
    __tablename__ = "order_actions"
    id = Column(Integer, primary_key=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"))
    user_id = Column(Integer, nullable=False)
    action_type = Column(String(50), nullable=False) # مثل 'created', 'status_changed'
    
    # --- أضف هذه الحقول لتطابق الـ SQL والـ Service ---
    details = Column(JSON, nullable=True) # هذا الحقل كان يسبب الخطأ
    notes = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.now())