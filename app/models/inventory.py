<<<<<<< HEAD
# app/models/inventory.py
from sqlalchemy import Column, Integer, String, ForeignKey, TIMESTAMP, func, Numeric, Text, Boolean,DateTime, func
from sqlalchemy.orm import relationship
from app.core.database import Base

class Catalog(Base):
    __tablename__ = "catalogs"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
=======
from sqlalchemy import Column, Integer, String, ForeignKey, TIMESTAMP, func, Numeric, Text
from sqlalchemy.orm import relationship
from app.models.base import Base

class Catalog(Base):
    """تمثيل أقسام المنتجات (مثل: ملابس، أحذية)."""
    __tablename__ = "catalogs"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, info={"description": "اسم القسم"})
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
    deleted_at = Column(TIMESTAMP, nullable=True)
<<<<<<< HEAD
    is_active = Column(Boolean, default=True)

    products = relationship("Product", back_populates="catalog")

class Size(Base):
    __tablename__ = "sizes"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), nullable=False, unique=True)
    sort_order = Column(Integer, default=0)
=======

    # العلاقات: كتالوج واحد لديه عدة منتجات
    products = relationship("Product", back_populates="catalog")

class Size(Base):
    """تعريف المقاسات المتاحة في النظام (S, M, L, XL)."""
    __tablename__ = "sizes"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), nullable=False, unique=True)
    sort_order = Column(Integer, default=0, info={"description": "ترتيب العرض"})
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
    deleted_at = Column(TIMESTAMP, nullable=True)

class Product(Base):
<<<<<<< HEAD
    __tablename__ = "products"
=======
    """البيانات الأساسية للمنتج (الاسم، السعر، الكود)."""
    __tablename__ = "products"
    
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
    id = Column(Integer, primary_key=True, index=True)
    catalog_id = Column(Integer, ForeignKey("catalogs.id"), nullable=False)
    name = Column(String(255), nullable=False)
    main_image = Column(String(500), nullable=True)
    description = Column(Text, nullable=True)
<<<<<<< HEAD
    code = Column(String(100), unique=True, nullable=False)
    cost_price = Column(Numeric(12, 2), nullable=False)
    selling_price = Column(Numeric(12, 2), nullable=False)
    min_stock_threshold = Column(Integer, default=5)
    
=======
    code = Column(String(100), unique=True, nullable=False, info={"description": "كود المنتج الفريد"})
    
    # مبالغ مالية بدقة عالية (12 رقم منها 2 بعد الفاصلة)
    cost_price = Column(Numeric(12, 2), nullable=False)
    selling_price = Column(Numeric(12, 2), nullable=False)
    min_stock_threshold = Column(Integer, default=5, info={"description": "حد التنبيه لنقص المخزون"})
    
    # إحصائيات المخزون التجميعية
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
    total_available = Column(Integer, default=0)
    total_reserved = Column(Integer, default=0)
    total_sold = Column(Integer, default=0)
    total_damaged = Column(Integer, default=0)
    total_returns = Column(Integer, default=0)
    
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
    deleted_at = Column(TIMESTAMP, nullable=True)

<<<<<<< HEAD
    catalog = relationship("Catalog", back_populates="products")
    colors = relationship("ProductColor", back_populates="product", cascade="all, delete")


class ProductColor(Base):
    __tablename__ = "product_colors"
    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    color_name = Column(String(100), nullable=False)
    color_image = Column(String(500), nullable=True) # تم التعديل ليطابق SQL
=======
    # العلاقات
    catalog = relationship("Catalog", back_populates="products")
    colors = relationship("ProductColor", back_populates="product", cascade="all, delete")

class ProductColor(Base):
    """الألوان المتاحة لكل منتج."""
    __tablename__ = "product_colors"
    
    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    color_name = Column(String(100), nullable=False)
    color_image = Column(String(500), nullable=True)
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
    deleted_at = Column(TIMESTAMP, nullable=True)

    product = relationship("Product", back_populates="colors")
    variants = relationship("ProductVariant", back_populates="color", cascade="all, delete-orphan")
<<<<<<< HEAD
    

class ProductVariant(Base):
    __tablename__ = "product_variants"
    id = Column(Integer, primary_key=True, index=True)
    product_color_id = Column(Integer, ForeignKey("product_colors.id"), nullable=False)
    size_id = Column(Integer, ForeignKey("sizes.id"), nullable=False)
    qr_code = Column(String(100), unique=True, index=True, nullable=True)
=======

class ProductVariant(Base):
    """أصغر وحدة في المخزون (منتج محدد بلون ومقاس)."""
    __tablename__ = "product_variants"
    
    id = Column(Integer, primary_key=True, index=True)
    product_color_id = Column(Integer, ForeignKey("product_colors.id"), nullable=False)
    size_id = Column(Integer, ForeignKey("sizes.id"), nullable=False)
    qr_code = Column(String(500), nullable=True, info={"description": "رابط أو كود QR"})
    
    # كميات المخزون التفصيلية
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
    quantity_available = Column(Integer, default=0)
    quantity_reserved = Column(Integer, default=0)
    damaged_quantity = Column(Integer, default=0)
    returned_quantity = Column(Integer, default=0)
<<<<<<< HEAD
    min_stock_threshold = Column(Integer, nullable=True) # مطابق لـ SQL
    qr_code = Column(String(500), nullable=True)
    deleted_at = Column(TIMESTAMP, nullable=True)
    total_sold = Column(Integer, default=0)

    color = relationship("ProductColor", back_populates="variants")
    size = relationship("Size")
    movements = relationship("InventoryMovement", back_populates="variant")


class InventoryMovement(Base):
    __tablename__ = "inventory_movements"

    id = Column(Integer, primary_key=True, index=True)
    variant_id = Column(Integer, ForeignKey("product_variants.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False) # من قام بالعملية
    
    quantity_change = Column(Integer, nullable=False) # مثال: 1 للمرتجع، -1 للسحب
    movement_type = Column(String(50), nullable=False) # 'return', 'sale', 'adjustment', 'damaged'
    
    notes = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=func.now())

    # علاقات اختيارية للوصول للبيانات بسهولة
    variant = relationship("ProductVariant", back_populates="movements")
=======
    min_stock_threshold = Column(Integer, nullable=True)
    deleted_at = Column(TIMESTAMP, nullable=True)

    color = relationship("ProductColor", back_populates="variants")
    size = relationship("Size")
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
