import os
import io
from datetime import datetime
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import arabic_reshaper
from bidi.algorithm import get_display

# --- المسارات والألوان ---
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FONT_PATH = os.path.join(BASE_DIR, "static", "fonts", "Amiri-Regular.ttf")
MAROON_COLOR = colors.HexColor("#800000") # اللون العنابي للهوية البصرية

# تسجيل الخط العربي
try:
    pdfmetrics.registerFont(TTFont('ArabicAmiri', FONT_PATH))
    ARABIC_FONT = "ArabicAmiri"
except:
    ARABIC_FONT = "Helvetica"

# مجموعة الرموز التي يدعمها الخط فعلياً.
# سبب وجودها: الخط Amiri خطٌّ عربي لا يحتوي على رموز الزخرفة (✎ ✖ ⤷ …)،
# وreportlab لا يرمي خطأً عند غياب الشكل بل يطبع مربعاً فارغاً. فكانت
# أعمدة كاملة في التقرير تخرج كصناديق لا معنى لها دون أي رسالة خطأ.
# نتحقق مرة واحدة عند الإقلاع ونستبدل أي رمز مفقود ببديل مقروء.
_FONT_CMAP = set()
try:
    from fontTools.ttLib import TTFont as _TTFont
    _FONT_CMAP = set(_TTFont(FONT_PATH).getBestCmap().keys())
except Exception:
    pass

# بدائل مقروءة لرموز شائعة قد لا يحملها الخط
_GLYPH_FALLBACKS = {
    0x2937: ">",   # ⤷ مؤشر التفرّع
    0x270E: "e",   # ✎ تعديل
    0x2716: "d",   # ✖ حذف
    0x2713: "v",   # ✓
    0x2192: "->",  # →
    0x2190: "<-",  # ←
}


def font_safe(text: str) -> str:
    """
    يستبدل أي محرف لا يملك الخط شكلاً له، حتى لا يظهر مربع فارغ في الـ PDF.
    المحارف غير المعروفة تُحذف بدل أن تُطبع صناديق.
    """
    if not _FONT_CMAP:
        return text
    out = []
    for ch in text:
        code = ord(ch)
        if code in _FONT_CMAP or code in (10, 9):
            out.append(ch)
        else:
            out.append(_GLYPH_FALLBACKS.get(code, ""))
    return "".join(out)


def format_ar(text):
    if not text:
        return ""
    # إعادة تشكيل النص العربي ومعالجة اتجاه الكتابة من اليمين لليسار
    reshaped_text = arabic_reshaper.reshape(str(text))
    return font_safe(get_display(reshaped_text))

class ReportsPDFGenerator:

    @classmethod
    def generate_report_pdf(cls, db, period: str) -> io.BytesIO:
        """
        متزامنة عن قصد: كل ما بداخلها استعلامات قاعدة بيانات ورسم reportlab
        وتشكيل نص عربي — أي عمل CPU/IO متزامن بالكامل بلا أي await حقيقي.
        كونها async def سابقاً كان يعني أنها تُنفَّذ على حلقة الأحداث مباشرة
        فتُجمّد الخادم لكل المستخدمين طوال مدة توليد الـ PDF.
        الآن يستدعيها المسار كدالة عادية فتعمل في thread pool.
        """
        from app.services.Reporting import ReportingService
        from app.services.time_helper import get_report_time_range
        from app.services.order_service import (
            get_inventory_dashboard_stats,
            get_top_and_bottom_inventory_report_logic,
            get_products_with_variants_logic
        )

        start_date, end_date = get_report_time_range(period)
        period_labels = {
            "7d": "7 أيام",
            "1m": "شهر واحد",
            "3m": "3 أشهر",
            "6m": "6 أشهر",
            "all": "الكل"
        }
        period_label = period_labels.get(period, period)

        # 1. جلب البيانات
        inv_stats = get_inventory_dashboard_stats(db, period=period)
        top_bottom_res = get_top_and_bottom_inventory_report_logic(db)
        top_bottom_data = top_bottom_res.get("data", {}) if top_bottom_res.get("success") else {}
        products_res = get_products_with_variants_logic(db)
        products_list = products_res.get("products", []) if products_res.get("success") else []
        emp_stats = ReportingService.get_employee_statistics(db)
        performance_data = ReportingService.get_performance_analytics(db, start_date, end_date)

        # 2. إعداد مستند الـ PDF
        buffer = io.BytesIO()
        c = canvas.Canvas(buffer, pagesize=A4)
        width, height = A4

        margin = 1.5 * cm
        y = height - 5.5 * cm # البداية تحت الهيدر في الصفحة الأولى
        page_num = 1

        # دوال المساعدة للرسم والتحقق من المساحة
        def check_space(h):
            nonlocal y, page_num
            if y - h < margin + 1.2 * cm: # مساحة أمان للفوتر
                c.showPage()
                page_num += 1
                draw_page_decorations(page_num)
                y = height - 2.5 * cm

        def draw_first_page_header():
            c.saveState()
            # خلفية البانر العلوية
            c.setFillColor(MAROON_COLOR)
            c.rect(0, height - 4.5 * cm, width, 4.5 * cm, fill=1, stroke=0)
            
            # الشعار والنصوص
            c.setFillColor(colors.white)
            c.setFont("Helvetica-Bold", 26)
            c.drawCentredString(width / 2, height - 1.8 * cm, "BELLAGIO")
            
            c.setFont(ARABIC_FONT, 13)
            c.drawCentredString(width / 2, height - 2.8 * cm, format_ar("التقرير الإحصائي والتحليلي الشامل للمبيعات والمخازن والموظفين"))
            
            c.setFont(ARABIC_FONT, 9)
            c.drawCentredString(width / 2, height - 3.8 * cm, format_ar(f"تاريخ التصدير: {datetime.now().strftime('%Y-%m-%d %H:%M')} | الفترة الزمنية للتحليل: {period_label}"))
            c.restoreState()

        def draw_page_decorations(p_num):
            c.saveState()
            # خط الهيدر
            c.setStrokeColor(MAROON_COLOR)
            c.setLineWidth(0.8)
            c.line(margin, height - 1.8 * cm, width - margin, height - 1.8 * cm)
            
            c.setFont(ARABIC_FONT, 9)
            c.setFillColor(MAROON_COLOR)
            c.drawRightString(width - margin, height - 1.5 * cm, format_ar("نظام بيلاجو - تقرير الرقابة والتحليلات الشامل"))
            
            c.setFont(ARABIC_FONT, 8)
            c.setFillColor(colors.HexColor("#64748b"))
            c.drawString(margin, height - 1.5 * cm, format_ar(f"الفترة: {period_label} | تاريخ التقرير: {datetime.now().strftime('%Y-%m-%d %H:%M')}"))
            
            # خط الفوتر
            c.setStrokeColor(colors.HexColor("#e2e8f0"))
            c.line(margin, 1.5 * cm, width - margin, 1.5 * cm)
            c.drawRightString(width - margin, 1.1 * cm, format_ar("بيلاجو - وثيقة سرية للاستخدام الداخلي فقط"))
            c.drawString(margin, 1.1 * cm, format_ar(f"صفحة {p_num}"))
            c.restoreState()

        # رسم الهيدر والفوتر للصفحة الأولى
        draw_first_page_header()
        c.saveState()
        c.setStrokeColor(colors.HexColor("#e2e8f0"))
        c.line(margin, 1.5 * cm, width - margin, 1.5 * cm)
        c.setFont(ARABIC_FONT, 8)
        c.setFillColor(colors.HexColor("#64748b"))
        c.drawRightString(width - margin, 1.1 * cm, format_ar("بيلاجو - وثيقة سرية للاستخدام الداخلي فقط"))
        c.drawString(margin, 1.1 * cm, format_ar("صفحة 1"))
        c.restoreState()

        def draw_section_heading(title_text):
            nonlocal y
            check_space(1.5 * cm)
            c.saveState()
            # مؤشر اللون الجانبي (الأيمن لأن اللغة عربية)
            c.setFillColor(MAROON_COLOR)
            c.rect(width - margin - 0.3 * cm, y - 0.6 * cm, 0.3 * cm, 0.5 * cm, fill=1, stroke=0)
            
            # النص
            c.setFont(ARABIC_FONT, 11)
            c.setFillColor(colors.HexColor("#1e293b"))
            c.drawRightString(width - margin - 0.5 * cm, y - 0.5 * cm, format_ar(title_text))
            
            # خط سفلي
            c.setStrokeColor(colors.HexColor("#e2e8f0"))
            c.setLineWidth(0.5)
            c.line(margin, y - 0.8 * cm, width - margin, y - 0.8 * cm)
            c.restoreState()
            y -= 1.1 * cm

        def draw_kpis(kpi_list):
            nonlocal y
            card_gap = 0.4 * cm
            avail_width = width - 2 * margin
            card_width = (avail_width - (len(kpi_list) - 1) * card_gap) / len(kpi_list)
            card_height = 1.6 * cm
            
            check_space(card_height + 0.2 * cm)
            
            for idx, kpi in enumerate(kpi_list):
                x = margin + idx * (card_width + card_gap)
                
                # رسم الكارت
                c.setStrokeColor(colors.HexColor("#e2e8f0"))
                c.setFillColor(colors.HexColor("#f8fafc"))
                c.roundRect(x, y - card_height, card_width, card_height, 6, stroke=1, fill=1)
                
                # العنوان (أعلى اليمين)
                c.setFont(ARABIC_FONT, 8.5)
                c.setFillColor(colors.HexColor("#64748b"))
                c.drawRightString(x + card_width - 0.25 * cm, y - 0.4 * cm, format_ar(kpi["title"]))
                
                # القيمة (أسفل اليسار)
                c.setFont("Helvetica-Bold", 13)
                c.setFillColor(colors.HexColor(kpi.get("color", "#1e293b")))
                c.drawString(x + 0.25 * cm, y - 1.25 * cm, str(kpi["value"]))
                
                # الوحدة (أسفل اليمين)
                if kpi.get("unit"):
                    c.setFont(ARABIC_FONT, 8)
                    c.setFillColor(colors.HexColor("#94a3b8"))
                    c.drawRightString(x + card_width - 0.25 * cm, y - 1.25 * cm, format_ar(kpi["unit"]))
            
            y -= card_height + 0.4 * cm

        def draw_table_grid(headers, rows, col_widths, alignments, row_h=0.55 * cm):
            nonlocal y
            header_h = 0.6 * cm
            check_space(header_h)
            
            table_w = sum(col_widths)
            
            # رأس الجدول
            c.setFillColor(MAROON_COLOR)
            c.rect(margin, y - header_h, table_w, header_h, fill=1, stroke=0)
            
            c.setFont(ARABIC_FONT, 8.5)
            c.setFillColor(colors.white)
            curr_x = margin
            for idx, header in enumerate(headers):
                w = col_widths[idx]
                align = alignments[idx]
                text_y = y - 0.42 * cm
                
                txt = format_ar(header)
                if align == "R":
                    c.drawRightString(curr_x + w - 0.15 * cm, text_y, txt)
                elif align == "C":
                    c.drawCentredString(curr_x + w / 2, text_y, txt)
                else:
                    c.drawString(curr_x + 0.15 * cm, text_y, txt)
                curr_x += w
            y -= header_h
            
            # صفوف الجدول
            c.setFont(ARABIC_FONT, 8)
            for r_idx, row in enumerate(rows):
                check_space(row_h)
                
                # خلفية الصف البديل
                if r_idx % 2 == 0:
                    c.setFillColor(colors.HexColor("#fafafa"))
                else:
                    c.setFillColor(colors.white)
                c.rect(margin, y - row_h, table_w, row_h, fill=1, stroke=0)
                
                # حدود الصف
                c.setStrokeColor(colors.HexColor("#f1f5f9"))
                c.setLineWidth(0.5)
                c.line(margin, y - row_h, margin + table_w, y - row_h)
                
                # النص
                c.setFillColor(colors.HexColor("#334155"))
                curr_x = margin
                for idx, val in enumerate(row):
                    w = col_widths[idx]
                    align = alignments[idx]
                    text_y = y - 0.38 * cm
                    
                    val_str = str(val) if val is not None else ""
                    # تشكيل النصوص العربية فقط، مع تمرير الجميع على مصفاة
                    # الخط حتى لا يتسرّب رمز بلا شكل إلى الصفحة
                    if any(ord(char) > 127 for char in val_str):
                        txt = format_ar(val_str)
                    else:
                        txt = font_safe(val_str)
                    
                    if align == "R":
                        c.drawRightString(curr_x + w - 0.15 * cm, text_y, txt)
                    elif align == "C":
                        c.drawCentredString(curr_x + w / 2, text_y, txt)
                    else:
                        c.drawString(curr_x + 0.15 * cm, text_y, txt)
                    curr_x += w
                y -= row_h
            y -= 0.3 * cm

        # ==========================================
        # أولاً: الرقابة الكلية على المخزون والمبيعات
        # ==========================================
        inv = inv_stats.get("inventory", {})
        ord_stats = inv_stats.get("orders", {})
        alerts = inv_stats.get("alerts", {}).get("counters", {})

        draw_section_heading("أولاً: الرقابة الكلية على المخزون والمبيعات")
        
        draw_kpis([
            {"title": "إجمالي المنتجات", "value": inv.get("total_products", 0), "unit": "نوع", "color": "#1d4ed8"},
            {"title": "المخزون المتاح", "value": inv.get("total_inventory", 0), "unit": "قطع", "color": "#334155"},
            {"title": "المحجوز للطلبات", "value": inv.get("total_reserved", 0), "unit": "قطع", "color": "#c2410c"}
        ])

        draw_kpis([
            {"title": "تم بيعه", "value": inv.get("total_sold", 0), "unit": "قطع", "color": "#0f766e"},
            {"title": "التوالف والهالك", "value": inv.get("damaged", 0), "unit": "قطع", "color": "#be123c"},
            {"title": "الرواجع والمرتجع", "value": inv.get("returns", 0), "unit": "قطع", "color": "#6d28d9"}
        ])

        # معدل الهدر وتفاصيل حركة الطلبات
        check_space(1.5 * cm)
        c.setStrokeColor(colors.HexColor("#f1f5f9"))
        c.setFillColor(colors.HexColor("#fff1f2"))
        c.roundRect(margin, y - 1.2 * cm, width - 2 * margin, 1.2 * cm, 4, stroke=1, fill=1)
        c.setFont(ARABIC_FONT, 9.5)
        c.setFillColor(colors.HexColor("#be123c"))
        c.drawRightString(width - margin - 0.4 * cm, y - 0.75 * cm, format_ar("معدل الهدر والتوالف العام بالنسبة للمخزن:"))
        c.setFont("Helvetica-Bold", 12)
        c.drawString(margin + 0.4 * cm, y - 0.8 * cm, f"{inv.get('waste_rate', 0)}%")
        y -= 1.6 * cm

        # حركات الطلبات والنواقص
        draw_section_heading("ثانياً: حركة الطلبات وملخص النواقص والتنبيهات")
        draw_kpis([
            {"title": "عدد الطلبات الكلي", "value": ord_stats.get("total", 0), "unit": "طلب", "color": "#475569"},
            {"title": "الطلبات المعلقة", "value": ord_stats.get("pending", 0), "unit": "طلب", "color": "#c2410c"},
            {"title": "قيد التجهيز", "value": ord_stats.get("processing", 0), "unit": "طلب", "color": "#1d4ed8"}
        ])
        
        draw_kpis([
            {"title": "منتجات نفدت", "value": alerts.get("out_of_stock_products_count", 0), "unit": "منتج", "color": "#be123c"},
            {"title": "منتجات قاربت على النفاد", "value": alerts.get("low_stock_products_count", 0), "unit": "منتج", "color": "#d97706"},
            {"title": "متغيرات نفدت", "value": alerts.get("out_of_stock_variants_count", 0), "unit": "خيار", "color": "#be123c"}
        ])

        # ==========================================
        # ثالثاً: تقييمات المتغيرات الخمسة
        # ==========================================
        draw_section_heading("ثالثاً: تصنيفات وتقييمات حركة متغيرات المنتجات")

        # أفضل 5 مبيعاً
        check_space(0.8 * cm)
        c.setFont(ARABIC_FONT, 9)
        c.setFillColor(MAROON_COLOR)
        c.drawRightString(width - margin, y - 0.4 * cm, format_ar("أفضل 5 متغيرات مبيعاً ورواجاً:"))
        y -= 0.6 * cm
        
        headers = ["الترتيب", "اسم المنتج", "اللون والمقاس", "الكمية المباعة", "المخزون المتاح"]
        widths = [1.5 * cm, 7.5 * cm, 4.0 * cm, 2.5 * cm, 2.5 * cm]
        alignments = ["C", "R", "R", "C", "C"]
        rows = []
        for idx, item in enumerate(top_bottom_data.get("top_5_selling", [])):
            rows.append([
                idx + 1,
                item.get("product_name"),
                f"{item.get('color_name', '')} - {item.get('size_name', '')}",
                item.get("total_sold", 0),
                item.get("quantity_available", 0)
            ])
        draw_table_grid(headers, rows, widths, alignments)

        # أقل 5 مبيعاً (السلع الراكدة)
        check_space(0.8 * cm)
        c.setFont(ARABIC_FONT, 9)
        c.setFillColor(MAROON_COLOR)
        c.drawRightString(width - margin, y - 0.4 * cm, format_ar("أقل 5 متغيرات مبيعاً (السلع الراكدة):"))
        y -= 0.6 * cm
        rows = []
        for idx, item in enumerate(top_bottom_data.get("bottom_5_selling", [])):
            rows.append([
                idx + 1,
                item.get("product_name"),
                f"{item.get('color_name', '')} - {item.get('size_name', '')}",
                item.get("total_sold", 0),
                item.get("quantity_available", 0)
            ])
        draw_table_grid(headers, rows, widths, alignments)

        # الأكثر توالفاً وخسارة
        check_space(0.8 * cm)
        c.setFont(ARABIC_FONT, 9)
        c.setFillColor(MAROON_COLOR)
        c.drawRightString(width - margin, y - 0.4 * cm, format_ar("أكثر 5 متغيرات تالفاً وهدراً:"))
        y -= 0.6 * cm
        headers_dmg = ["الترتيب", "اسم المنتج", "اللون والمقاس", "الكمية التالفة", "المخزون المتاح"]
        rows = []
        for idx, item in enumerate(top_bottom_data.get("top_5_damaged", [])):
            rows.append([
                idx + 1,
                item.get("product_name"),
                f"{item.get('color_name', '')} - {item.get('size_name', '')}",
                item.get("damaged_quantity", 0),
                item.get("quantity_available", 0)
            ])
        draw_table_grid(headers_dmg, rows, widths, alignments)

        # الأكثر مرتجعاً
        check_space(0.8 * cm)
        c.setFont(ARABIC_FONT, 9)
        c.setFillColor(MAROON_COLOR)
        c.drawRightString(width - margin, y - 0.4 * cm, format_ar("أكثر 5 متغيرات مرتجعة:"))
        y -= 0.6 * cm
        headers_ret = ["الترتيب", "اسم المنتج", "اللون والمقاس", "الكمية المرتجعة", "المخزون المتاح"]
        rows = []
        for idx, item in enumerate(top_bottom_data.get("top_5_returned", [])):
            rows.append([
                idx + 1,
                item.get("product_name"),
                f"{item.get('color_name', '')} - {item.get('size_name', '')}",
                item.get("returned_quantity", 0),
                item.get("quantity_available", 0)
            ])
        draw_table_grid(headers_ret, rows, widths, alignments)

        # ==========================================
        # رابعاً: الجرد التفصيلي للمخزون
        # ==========================================
        draw_section_heading("رابعاً: الجرد التفصيلي لجميع المنتجات والمتغيرات")
        
        headers_inv = ["الكود", "اسم المنتج / المواصفات", "سعر البيع", "المتوفر", "المحجوز", "المباع", "التالف", "الراجع"]
        widths_inv = [2.2 * cm, 6.8 * cm, 1.8 * cm, 1.2 * cm, 1.2 * cm, 1.2 * cm, 1.2 * cm, 1.2 * cm]
        alignments_inv = ["C", "R", "C", "C", "C", "C", "C", "C"]
        
        rows_inv = []
        for prod in products_list:
            # إضافة المنتج الرئيسي
            summary = prod.get("inventory_summary", {})
            prices = prod.get("prices", {})
            rows_inv.append([
                prod.get("product_code", "N/A"),
                prod.get("product_name", ""),
                f"{prices.get('selling_price', 0.0)}",
                summary.get("total_available", 0),
                summary.get("total_reserved", 0),
                summary.get("total_sold", 0),
                summary.get("total_damaged", 0),
                summary.get("total_returns", 0)
            ])
            # إضافة المتغيرات الفرعية بمسافات بادئة للدلالة على التبعية
            for variant in prod.get("variants", []):
                rows_inv.append([
                    "  ⤷",
                    f"اللون: {variant.get('color_name', '')} | المقاس: {variant.get('size_name', '')}",
                    "-",
                    variant.get("quantity_available", 0),
                    variant.get("quantity_reserved", 0),
                    variant.get("total_sold", 0),
                    variant.get("damaged_quantity", 0),
                    variant.get("returned_quantity", 0)
                ])

        draw_table_grid(headers_inv, rows_inv, widths_inv, alignments_inv, row_h=0.5 * cm)

        # ==========================================
        # خامساً: الرقابة الكلية على الموظفين والأداء
        # ==========================================
        draw_section_heading("خامساً: الرقابة الإحصائية على سجل الموظفين")
        
        draw_kpis([
            {"title": "إجمالي الموظفين", "value": emp_stats.get("total_employees", 0), "unit": "موظف", "color": "#334155"},
            {"title": "الموظفين النشطين", "value": emp_stats.get("active_employees", 0), "unit": "نشط", "color": "#0f766e"},
            {"title": "المحذوفين تاريخياً", "value": emp_stats.get("deleted_employees", 0), "unit": "موظف", "color": "#be123c"}
        ])
        
        draw_kpis([
            {"title": "المسؤولين (Admins)", "value": emp_stats.get("admins_count", 0), "unit": "مستخدم", "color": "#0f766e"},
            {"title": "المدراء (Managers)", "value": emp_stats.get("managers_count", 0), "unit": "مستخدم", "color": "#1d4ed8"},
            {"title": "الموظفين (Staff)", "value": emp_stats.get("employees_count", 0), "unit": "مستخدم", "color": "#c2410c"}
        ])

        # تقييمات النشاط للرتب
        draw_section_heading("سادساً: تقييمات كفاءة الموظفين والعمليات")
        
        headers_perf = ["الرتبة الوظيفية", "الموظف الأكثر نشاطاً", "العمليات", "الموظف الأقل نشاطاً", "العمليات"]
        widths_perf = [3.5 * cm, 5.0 * cm, 2.0 * cm, 5.5 * cm, 2.0 * cm]
        alignments_perf = ["R", "R", "C", "R", "C"]
        
        rows_perf = []
        for role_key, role_label in [("admins", "المسؤولون"), ("managers", "المدراء"), ("staff", "الموظفون")]:
            role_data = performance_data.get(role_key, {})
            top_emp = role_data.get("top", [])
            bottom_emp = role_data.get("bottom", [])
            
            top_name = top_emp[0].get("employee_name", "---") if top_emp else "---"
            top_ops = top_emp[0].get("total_operations", 0) if top_emp else 0
            bottom_name = bottom_emp[0].get("employee_name", "---") if bottom_emp else "---"
            bottom_ops = bottom_emp[0].get("total_operations", 0) if bottom_emp else 0
            
            rows_perf.append([
                role_label,
                top_name,
                top_ops,
                bottom_name,
                bottom_ops
            ])
            
        draw_table_grid(headers_perf, rows_perf, widths_perf, alignments_perf)

        # جدول تدقيق تفاصيل عمليات الموظفين
        check_space(0.8 * cm)
        c.setFont(ARABIC_FONT, 9)
        c.setFillColor(MAROON_COLOR)
        c.drawRightString(width - margin, y - 0.4 * cm, format_ar("سجل عمليات الموظفين التفصيلي:"))
        y -= 0.6 * cm
        
        # مفتاح قراءة الأعمدة المختصرة، وإلا بدت "a3 / e1 / d0" بلا معنى
        c.setFont(ARABIC_FONT, 7)
        c.setFillColor(colors.HexColor("#64748b"))
        c.drawRightString(width - margin, y - 0.15 * cm,
                          format_ar("(a = إضافة، e = تعديل، d = حذف)"))
        y -= 0.35 * cm

        headers_audit = ["الاسم", "الرتبة", "العمليات", "الكتالوج", "المنتجات", "الطلبيات", "المسح", "التوالف", "المرتجع"]
        widths_audit = [3.2 * cm, 2.0 * cm, 1.6 * cm, 1.9 * cm, 1.9 * cm, 1.9 * cm, 1.5 * cm, 1.5 * cm, 1.5 * cm]
        alignments_audit = ["R", "C", "C", "C", "C", "C", "C", "C", "C"]
        
        rows_audit = []
        for role_key in ["admins", "managers", "staff"]:
            role_list = performance_data.get(role_key, {}).get("list", [])
            for emp in role_list:
                cats = emp.get("categories", {})
                
                # تنسيق تفاصيل العمليات.
                # كانت الرموز ✎ و ✖ تُستخدم هنا للتعديل والحذف، وخط Amiri
                # المستخدم في هذا التقرير لا يحتوي على شكل لأيٍّ منهما، فكانت
                # تُطبع مربعات فارغة ويصبح العمود غير مقروء إطلاقاً.
                # البديل حروف لاتينية بسيطة موجودة في كل الخطوط:
                #   a = إضافة (add)   e = تعديل (edit)   d = حذف (delete)
                def _ops(cat_name):
                    cat = cats.get(cat_name, {})
                    return (f"a{cat.get('adds', 0)} / "
                            f"e{cat.get('updates', 0)} / "
                            f"d{cat.get('deletes', 0)}")

                catalog_ops = _ops('catalogs')
                product_ops = _ops('products')
                order_ops = _ops('sales')
                damaged_ops = str(cats.get('damages', {}).get('total', 0))
                returned_ops = str(cats.get('returns', {}).get('total', 0))
                scanned_ops = str(cats.get('scans', {}).get('total', 0))
                
                # الموظفون لا يتم احتساب عمليات الموظف/المنتج/الكتالوج لهم
                if emp.get("role_id") == 3:
                    catalog_ops = "-"
                    product_ops = "-"
                
                rows_audit.append([
                    emp.get("employee_name"),
                    emp.get("role"),
                    emp.get("total_operations", 0),
                    catalog_ops,
                    product_ops,
                    order_ops,
                    scanned_ops,
                    damaged_ops,
                    returned_ops
                ])
                
        draw_table_grid(headers_audit, rows_audit, widths_audit, alignments_audit, row_h=0.55 * cm)

        c.save()
        buffer.seek(0)
        return buffer
