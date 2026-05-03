import os
import io
import arabic_reshaper
from bidi.algorithm import get_display
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from reportlab.graphics.barcode import qr
from reportlab.graphics.shapes import Drawing
from reportlab.graphics import renderPDF
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from sqlalchemy.orm import Session, joinedload

# استيراد الموديلات
from app.models.inventory import Product, ProductVariant, ProductColor, Size

# إعداد المسارات والخطوط
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FONT_PATH = os.path.join(BASE_DIR, "static", "fonts", "Amiri-Regular.ttf")

try:
    pdfmetrics.registerFont(TTFont('ArabicFont', FONT_PATH))
    ARABIC_FONT = "ArabicFont"
except Exception:
    ARABIC_FONT = "Helvetica"

class QRGeneratorService:
    LABEL_SIZE = (50 * mm, 60 * mm) 

    @staticmethod
    def _format_arabic(text):
        """تنسيق النص ليدعم العربية والاتجاه من اليمين لليسار ككتلة واحدة"""
        if not text or text == "N/A": 
            return "N/A"
        # إعادة التشكيل ثم تطبيق خوارزمية BiDi
        reshaped_text = arabic_reshaper.reshape(str(text))
        return get_display(reshaped_text)

    @classmethod
    def _draw_label(cls, c, variant):
        w, h = cls.LABEL_SIZE
        
        # جلب البيانات
        product_obj = variant.color.product if (variant.color and variant.color.product) else None
        
        # 1. إعداد البيانات الخام (بدون تنسيق هنا)
        raw_p_name = getattr(product_obj, 'name', 'N/A')
        raw_p_code = str(getattr(product_obj, 'code', 'N/A'))
        raw_c_name = variant.color.color_name if variant.color else "N/A"
        raw_s_name = variant.size.name if variant.size else "N/A"

        # 2. رسم QR Code
        qr_content = f"VAR:{variant.id}|SKU:{raw_p_code}"
        qr_code = qr.QrCodeWidget(qr_content, barLevel='H')
        bounds = qr_code.getBounds()
        qr_w, qr_h = bounds[2] - bounds[0], bounds[3] - bounds[1]
        
        d = Drawing(35*mm, 35*mm, transform=[35*mm/qr_w, 0, 0, 35*mm/qr_h, 0, 0])
        d.add(qr_code)
        renderPDF.draw(d, c, (w - 35*mm)/2, h - 38*mm)

        # 3. اسم المنتج (تنسيق كسطر مستقل)
        c.setFont(ARABIC_FONT, 10)
        c.drawCentredString(w/2, h - 42*mm, cls._format_arabic(raw_p_name))
        
        c.setLineWidth(0.2)
        c.line(5*mm, h - 44*mm, w - 5*mm, h - 44*mm)

        # 4. التفاصيل (اللقطة الجذريّة: ندمج السطر ثم نفرمته كاملاً)
        c.setFont(ARABIC_FONT, 8)
        right_margin = w - 5*mm
        
        # سطر اللون: دمج (اللون + القيمة) ثم المعالجة لضمان بقاء النقطتين في مكانهما
        color_line = cls._format_arabic(f"اللون: {raw_c_name}")
        c.drawRightString(right_margin, h - 48*mm, color_line)

        # سطر المقاس
        size_line = cls._format_arabic(f"المقاس: {raw_s_name}")
        c.drawRightString(right_margin, h - 52*mm, size_line)

        # سطر الكود
        code_line = cls._format_arabic(f"الكود: {raw_p_code}")
        c.drawRightString(right_margin, h - 56*mm, code_line)

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