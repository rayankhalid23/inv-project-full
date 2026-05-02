from sqlalchemy import Column, Integer, String, ForeignKey, TIMESTAMP, func, Numeric, Text, Boolean, DateTime, JSON
from sqlalchemy.orm import relationship
from app.models.base import Base

class Catalog(Base):
    __tablename__ = "catalogs"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
    deleted_at = Column(TIMESTAMP, nullable=True)
    
    products = relationship("Product", back_populates="catalog")

class Product(Base):
    __tablename__ = "products"
    id = Column(Integer, primary_key=True, index=True)
    catalog_id = Column(Integer, ForeignKey("catalogs.id"), nullable=False)
    name = Column(String(255), nullable=False)
    code = Column(String(100), unique=True, nullable=False)
    cost_price = Column(Numeric(12, 2), nullable=False)
    selling_price = Column(Numeric(12, 2), nullable=False)
    
    # الإحصائيات التجميعية (يتم تحديثها عبر sync_product_metrics)
    total_available = Column(Integer, default=0)
    total_reserved = Column(Integer, default=0)
    total_sold = Column(Integer, default=0)
    total_damaged = Column(Integer, default=0)
    total_returns = Column(Integer, default=0)
    
    deleted_at = Column(TIMESTAMP, nullable=True)
    catalog = relationship("Catalog", back_populates="products")
    colors = relationship("ProductColor", back_populates="product", cascade="all, delete")


class ProductColor(Base):
    __tablename__ = "product_colors"
    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"))
    color_name = Column(String(100))
    color_image = Column(String(255), nullable=True)
    
    product = relationship("Product", back_populates="colors")
    variants = relationship("ProductVariant", back_populates="color")

class Size(Base):
    __tablename__ = "sizes"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), nullable=False)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())
    deleted_at = Column(DateTime, nullable=True)

    # العلاقة العكسية
    variants = relationship("ProductVariant", back_populates="size")

class ProductVariant(Base):
    __tablename__ = "product_variants"
    id = Column(Integer, primary_key=True, index=True)
    product_color_id = Column(Integer, ForeignKey("product_colors.id"), nullable=False)
    size_id = Column(Integer, ForeignKey("sizes.id"))
    qr_code = Column(String(500), nullable=True)
    
    quantity_available = Column(Integer, default=0)
    quantity_reserved = Column(Integer, default=0)
    damaged_quantity = Column(Integer, default=0)
    returned_quantity = Column(Integer, default=0)
    total_sold = Column(Integer, default=0)
    deleted_at = Column(TIMESTAMP, nullable=True)

    color = relationship("ProductColor", back_populates="variants")
    movements = relationship("InventoryMovement", back_populates="variant")
    size = relationship("Size", back_populates="variants")

class InventoryMovement(Base):
    __tablename__ = "inventory_movements"
    id = Column(Integer, primary_key=True)
    variant_id = Column(Integer, ForeignKey("product_variants.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    quantity_change = Column(Integer, nullable=False)
    movement_type = Column(String(50), nullable=False) # 'sale', 'return', 'adjustment'
    created_at = Column(DateTime, default=func.now())

    quantity_before = Column(Integer, nullable=False)
    quantity_after = Column(Integer, nullable=False)
    related_order_id = Column(Integer, ForeignKey("orders.id"), nullable=True)
    damage_reason = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)
    
    variant = relationship("ProductVariant", back_populates="movements")

class SystemAuditLog(Base):
    __tablename__ = "system_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True) # من قام بالعملية
    action_target = Column(String(50))  # الهدف: 'user', 'product', 'order'
    target_id = Column(Integer)         # رقم العنصر المتأثر (رقم الموظف أو المنتج)
    action_type = Column(String(50))    # نوع الفعل: 'created', 'updated', 'deleted'
    details = Column(JSON, nullable=True) # تفاصيل إضافية بصيغة JSON
    ip_address = Column(String(45), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
