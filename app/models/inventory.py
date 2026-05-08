import os
import io
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from reportlab.graphics.barcode import qr
from reportlab.graphics.shapes import Drawing
from reportlab.graphics import renderPDF 
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from sqlalchemy.orm import Session, joinedload
import arabic_reshaper
from bidi.algorithm import get_display
from app.models.base import Base


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
    
    # حقول البيانات الأساسية
    name = Column(String(255), nullable=False)
    code = Column(String(100), unique=True, nullable=False)
    main_image = Column(String(500), nullable=True) # الحقل الناقص (رابط الصورة)
    description = Column(String(1000), nullable=False)
    
    # الحقول المالية
    cost_price = Column(Numeric(12, 2), nullable=False)
    selling_price = Column(Numeric(12, 2), nullable=False)
    
    # إدارة المخزون
    # تم تغييره إلى Integer ليتوافق مع الصورة ومنطق العد
    min_stock_threshold = Column(Integer, default=0, nullable=False) 

    # الإحصائيات التجميعية (تحدث تلقائياً عبر الدالة التي شرحناها سابقاً)
    total_available = Column(Integer, default=0)
    total_reserved = Column(Integer, default=0)
    total_sold = Column(Integer, default=0)
    total_damaged = Column(Integer, default=0)
    total_returns = Column(Integer, default=0)
    
    # حقول التتبع والتدقيق (Audit Fields) - هامة جداً للبيع كـ ERP
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True) # من أضاف المنتج
    created_at = Column(TIMESTAMP, server_default=func.now()) # تاريخ الإضافة
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now()) # تاريخ التعديل
    deleted_at = Column(TIMESTAMP, nullable=True) # للحذف الناعم

    # العلاقات (Relationships)
    catalog = relationship("Catalog", back_populates="products")
    colors = relationship("ProductColor", back_populates="product", cascade="all, delete-orphan")
    
  

class ProductColor(Base):
    __tablename__ = "product_colors"

    id = Column(Integer, primary_key=True, index=True)
    
    # ربط اللون بالمنتج (يجب أن يكون nullable=False لضمان التكامل)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    
    # اسم اللون وصورة اختيارية لهذا اللون تحديداً
    color_name = Column(String(100), nullable=False)
    color_image = Column(String(255), nullable=True)
    
    # --- الحقول الناقصة بناءً على الصورة ---
    # تاريخ الإنشاء (يُملأ تلقائياً عند الإضافة)
    created_at = Column(TIMESTAMP, server_default=func.now())
    
    # تاريخ التعديل (يُحدث تلقائياً عند أي تعديل على السجل)
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
    
    # الحذف الناعم (ضروري جداً لعمل دالة sync_product_metrics بشكل صحيح)
    deleted_at = Column(TIMESTAMP, nullable=True)
    
    # --- العلاقات (Relationships) ---
    # العلاقة مع المنتج الأب
    product = relationship("Product", back_populates="colors")
    
    # العلاقة مع المتغيرات (المقاسات) التابعة لهذا اللون
    # أضفنا cascade لضمان حذف المقاسات عند حذف اللون
    variants = relationship("ProductVariant", back_populates="color", cascade="all, delete-orphan")

    

class Size(Base):
    __tablename__ = "sizes"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), nullable=False)
    sort_order = Column(Integer, default=0)
    
    # استخدام TIMESTAMP للتوحيد مع بقية الجداول
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
    deleted_at = Column(TIMESTAMP, nullable=True)

    variants = relationship("ProductVariant", back_populates="size")

class ProductVariant(Base):
    __tablename__ = "product_variants"
    
    id = Column(Integer, primary_key=True, index=True)
    product_color_id = Column(Integer, ForeignKey("product_colors.id", ondelete="CASCADE"), nullable=False)
    size_id = Column(Integer, ForeignKey("sizes.id"), nullable=True) # nullable=True إذا كان هناك منتجات بلا مقاس
    
    # إحصائيات المخزن لكل متغير (كما تظهر في الصورة)
    quantity_available = Column(Integer, default=0)
    quantity_reserved = Column(Integer, default=0)
    damaged_quantity = Column(Integer, default=0)
    returned_quantity = Column(Integer, default=0)
    
    # الحقل الناقص في الكود والموجود في الصورة
    min_stock_threshold = Column(Integer, default=0) 
    
    qr_code = Column(String(500), nullable=True)
    
    # حقول الوقت والتتبع (موجودة في الصورة)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
    deleted_at = Column(TIMESTAMP, nullable=True)
    
    total_sold = Column(Integer, default=0)

    # العلاقات
    color = relationship("ProductColor", back_populates="variants")
    size = relationship("Size", back_populates="variants")
    movements = relationship("InventoryMovement", back_populates="variant", cascade="all, delete-orphan")

    # الحل الذكي (Property)
    @property
    def product_id(self):
        """جلب رقم المنتج من علاقة الألوان تلقائياً"""
        if self.color:
            return self.color.product_id
        return None
     
# أضف هذا الكلاس في ملف app/models/inventory.py ليعمل النظام
class InventoryMovement(Base):
    __tablename__ = "inventory_movements"
    
    id = Column(Integer, primary_key=True, index=True)
    variant_id = Column(Integer, ForeignKey("product_variants.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=True) # العمود المسبب للمشكلة
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    movement_type = Column(String(50), nullable=False) # 'sale', 'return', 'adjustment', 'damage'
    quantity_change = Column(Integer, nullable=False)
    quantity_before = Column(Integer, nullable=False)
    quantity_after = Column(Integer, nullable=False)
    
    related_order_id = Column(Integer, ForeignKey("orders.id"), nullable=True)
    damage_reason = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    # العلاقات لسهولة جلب البيانات لاحقاً
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


# إعداد المسارات والخطوط
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FONT_PATH = os.path.join(BASE_DIR, "static", "fonts", "Amiri-Regular.ttf")

try:
    pdfmetrics.registerFont(TTFont('ArabicFont', FONT_PATH))
    ARABIC_FONT = "ArabicFont"
except:
    ARABIC_FONT = "Helvetica"



class QRGeneratorService:
    # مقاس الملصق 50x50 ملم
    LABEL_SIZE = (50 * mm, 50 * mm) 

    @staticmethod
    def _format_ar(text):
        if not text: return "N/A"
        return get_display(arabic_reshaper.reshape(str(text)))

    @classmethod
    def _draw_label(cls, c, variant):
        w, h = cls.LABEL_SIZE
        
        # جلب البيانات من العلاقات المعرفة في inventory.py
        # variant.color -> ProductColor
        # variant.size -> Size
        # variant.color.product -> Product
        
        product_obj = variant.color.product if variant.color else None
        product_name = getattr(product_obj, 'name', 'N/A')
        product_code = getattr(product_obj, 'code', 'N/A')
        color_name = getattr(variant.color, 'color_name', 'N/A')
        size_name = getattr(variant.size, 'name', 'N/A')

        # 1. إنشاء الـ QR Code
        qr_data = f"VAR:{variant.id}|SKU:{product_code}"
        qr_code = qr.QrCodeWidget(qr_data, barLevel='H')
        bounds = qr_code.getBounds()
        qr_w = bounds[2] - bounds[0]
        qr_h = bounds[3] - bounds[1]
        
        d = Drawing(30*mm, 30*mm, transform=[30*mm/qr_w, 0, 0, 30*mm/qr_h, 0, 0])
        d.add(qr_code)
        renderPDF.draw(d, c, (w - 30*mm)/2, h - 32*mm)

        # 2. اسم المنتج
        c.setFont("Helvetica-Bold", 8)
        c.drawCentredString(w/2, h - 35*mm, product_name[:25])
        
        c.setLineWidth(0.1)
        c.line(5*mm, h - 37*mm, w - 5*mm, h - 37*mm)

        # 3. التفاصيل بالعربية (اللون والمقاس والكود)
        c.setFont(ARABIC_FONT, 7)
        c.drawRightString(w - 5*mm, h - 41*mm, cls._format_ar(f"اللون: {color_name}"))
        c.drawRightString(w - 5*mm, h - 44*mm, cls._format_ar(f"المقاس: {size_name}"))
        c.drawRightString(w - 5*mm, h - 47*mm, cls._format_ar(f"كود: {product_code}"))

    @classmethod
    def generate_pdf(cls, variants):
        buffer = io.BytesIO()
        c = canvas.Canvas(buffer, pagesize=cls.LABEL_SIZE)
        for v in variants:
            if v:
                cls._draw_label(c, v)
                c.showPage()
        c.save()
        buffer.seek(0)
        return buffer

    @classmethod
    def get_variant_qr_pdf(cls, db: Session, variant_id: int):
        # تحميل البيانات مع العلاقات لتقليل استعلامات قاعدة البيانات
        v = db.query(ProductVariant).options(
            joinedload(ProductVariant.color).joinedload(ProductColor.product),
            joinedload(ProductVariant.size)
        ).filter(ProductVariant.id == variant_id).first()
        return cls.generate_pdf([v]) if v else None

    @classmethod
    def get_product_all_qrs_pdf(cls, db: Session, product_id: int):
        # جلب جميع التفرعات لمنتج معين
        variants = db.query(ProductVariant).join(ProductColor).filter(
            ProductColor.product_id == product_id,
            ProductVariant.deleted_at == None
        ).all()
        return cls.generate_pdf(variants)

    @classmethod
    def get_all_active_qrs_pdf(cls, db: Session):
        variants = db.query(ProductVariant).filter(ProductVariant.deleted_at == None).all()
        return cls.generate_pdf(variants)