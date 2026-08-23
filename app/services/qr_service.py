import io
import os
import arabic_reshaper
from bidi.algorithm import get_display

from reportlab.graphics import renderPDF
from reportlab.graphics.barcode import qr
from reportlab.graphics.shapes import Drawing
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

from sqlalchemy.orm import Session, joinedload

from app.models.inventory import Product, ProductColor, ProductVariant, Size

# إعداد المسار المباشر لملف الخط الموجود لديك
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FONT_PATH = os.path.join(BASE_DIR, "static", "fonts", "Amiri-Regular.ttf")

# تسجيل الخط المتوفر فقط بدون أي تراجع لـ Helvetica
if os.path.exists(FONT_PATH):
    pdfmetrics.registerFont(TTFont('ArabicFont', FONT_PATH))
    ARABIC_FONT = "ArabicFont"
else:
    raise FileNotFoundError(f"ملف الخط غير موجود في المسار المطلوب: {FONT_PATH}")


class QRGeneratorService:
    LABEL_SIZE = (60 * mm, 90 * mm) 

    @staticmethod
    def _format_arabic(text):
        """تنسيق النص ليدعم العربية والاتجاه من اليمين لليسار ككتلة واحدة"""
        if not text or text == "N/A": 
            return "N/A"
        reshaped_text = arabic_reshaper.reshape(str(text))
        return get_display(reshaped_text)

    @classmethod
    def _draw_label(cls, c, variant):
        w, h = cls.LABEL_SIZE
        
        # جلب البيانات
        product_obj = variant.color.product if (variant.color and variant.color.product) else None
        
        raw_p_name = getattr(product_obj, 'name', 'N/A')
        raw_p_code = str(getattr(product_obj, 'code', 'N/A'))
        raw_c_name = variant.color.color_name if variant.color else "N/A"
        raw_s_name = variant.size.name if variant.size else "N/A"

        # 1. رسم QR Code بحجمه الكامل وموقعه المحدد
        qr_content = f"VAR:{variant.id}|SKU:{raw_p_code}"
        qr_code = qr.QrCodeWidget(qr_content, barLevel='H')
        bounds = qr_code.getBounds()
        qr_w, qr_h = bounds[2] - bounds[0], bounds[3] - bounds[1]
        
        qr_size = 50 * mm
        qr_x = (w - qr_size) / 2
        qr_y = h - 63 * mm 
        
        d = Drawing(qr_size, qr_size, transform=[qr_size/qr_w, 0, 0, qr_size/qr_h, 0, 0])
        d.add(qr_code)
        renderPDF.draw(d, c, qr_x, qr_y)

        # 2. اسم المنتج (خط بحجم 13pt لتسهيل القراءة)
        c.setFont(ARABIC_FONT, 13)
        c.drawCentredString(w / 2, h - 62 * mm, cls._format_arabic(raw_p_name))
        
        # 3. خط فاصل سميك وواضح (سمك 0.6)
        c.setLineWidth(0.6)
        c.line(4 * mm, h - 65 * mm, w - 4 * mm, h - 65 * mm)

        # 4. التفاصيل (خط بحجم 10.5pt متناسق مع تباعد 5mm)
        c.setFont(ARABIC_FONT, 13)
        right_margin = w - 4 * mm
        
        # سطر اللون
        color_line = cls._format_arabic(f"اللون: {raw_c_name}")
        c.drawRightString(right_margin, h - 70 * mm, color_line)

        # سطر المقاس
        size_line = cls._format_arabic(f"المقاس: {raw_s_name}")
        c.drawRightString(right_margin, h - 76 * mm, size_line)

        # سطر الكود
        code_line = cls._format_arabic(f"الكود: {raw_p_code}")
        c.drawRightString(right_margin, h - 82 * mm, code_line)

    @classmethod
    def generate_pdf_response(cls, variants):
        if not variants: return None
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
        variant = db.query(ProductVariant).options(
            joinedload(ProductVariant.color).joinedload(ProductColor.product),
            joinedload(ProductVariant.size)
        ).filter(ProductVariant.id == variant_id).first()
        return cls.generate_pdf_response([variant]) if variant else None

    @classmethod
    def get_product_all_qrs_pdf(cls, db: Session, product_id: int):
        variants = db.query(ProductVariant).join(ProductColor).options(
            joinedload(ProductVariant.color).joinedload(ProductColor.product),
            joinedload(ProductVariant.size)
        ).filter(ProductColor.product_id == product_id, ProductVariant.deleted_at == None).all()
        return cls.generate_pdf_response(variants)

    @classmethod
    def get_all_active_qrs_pdf(cls, db: Session):
        variants = db.query(ProductVariant).options(
            joinedload(ProductVariant.color).joinedload(ProductColor.product),
            joinedload(ProductVariant.size)
        ).filter(ProductVariant.deleted_at == None).all()
        return cls.generate_pdf_response(variants)