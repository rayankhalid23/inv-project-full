import os
import io
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import arabic_reshaper
from bidi.algorithm import get_display

# --- إعداد المسارات والألوان ---
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FONT_PATH = os.path.join(BASE_DIR, "static", "fonts", "Amiri-Regular.ttf")
MAROON_COLOR = colors.HexColor("#800000") # اللون العنابي للهوية البصرية

# تسجيل الخط العربي
try:
    pdfmetrics.registerFont(TTFont('Amiri', FONT_PATH))
    ARABIC_FONT = "Amiri"
except:
    ARABIC_FONT = "Helvetica"

def format_ar(text):
    if not text: return ""
    # إعادة تشكيل النص العربي ومعالجة اتجاه الكتابة من اليمين لليسار
    reshaped_text = arabic_reshaper.reshape(str(text))
    return get_display(reshaped_text)

def get_absolute_path(relative_path):
    """تحويل المسار النسبي أو الرابط الكامل إلى مسار مطلق على القرص ليتمكن النظام من قراءة الصورة"""
    if not relative_path: return None
    clean_path = str(relative_path).strip().replace('\\', '/')
    # إذا كان رابطاً كاملاً يحتوي على الدومين (http:// أو https://) نأخذ المسار النسبي فقط
    if clean_path.startswith('http://') or clean_path.startswith('https://'):
        without_scheme = clean_path.split('://', 1)[1]
        clean_path = without_scheme.split('/', 1)[1] if '/' in without_scheme else clean_path
    clean_path = clean_path.lstrip('/')
    abs_path = os.path.join(BASE_DIR, clean_path)
    return abs_path if os.path.exists(abs_path) else None

def wrap_sizes_lines(canvas_obj, sizes_list, prefix, max_width, font, font_size, max_lines=2):
    """يلف قائمة المقاسات على عدة أسطر تبقى داخل حدود الكرت بدل ما تطلع برّا حدوده.
    لو المقاسات كتيرة وما تكفيش max_lines سطر، يقتطع الباقي ويعرض "+N" بدل ما يفيض."""
    if not sizes_list:
        return [format_ar(prefix.strip())]

    def width_of(text):
        return canvas_obj.stringWidth(format_ar(text), font, font_size)

    def render(items, is_first, suffix=""):
        text = " - ".join(items) + suffix
        return (prefix + text) if is_first else text

    # لفّ طبيعي: كل سطر يمتلئ بأكبر عدد عناصر يدخل داخل العرض المتاح
    lines_items = []
    remaining = list(sizes_list)
    while remaining:
        is_first = len(lines_items) == 0
        current = []
        while remaining:
            trial = current + [remaining[0]]
            if current and width_of(render(trial, is_first)) > max_width:
                break
            current.append(remaining.pop(0))
        lines_items.append(current)

    if len(lines_items) <= max_lines:
        return [format_ar(render(items, i == 0)) for i, items in enumerate(lines_items)]

    # المقاسات أكتر من الأسطر المسموح بيها — نقتطع ونعرض "+N" بدل الفيضان برّا الكرت
    kept = lines_items[:max_lines]
    leftover_count = sum(len(items) for items in lines_items[max_lines:])

    last_idx = max_lines - 1
    last_items = kept[last_idx]
    is_first_last = last_idx == 0
    extra = leftover_count
    while last_items and width_of(render(last_items, is_first_last, f" +{extra}")) > max_width:
        last_items = last_items[:-1]
        extra += 1

    result = []
    for i in range(max_lines):
        if i == last_idx:
            if last_items:
                result.append(format_ar(render(last_items, is_first_last, f" +{extra}")))
            else:
                result.append(format_ar((prefix + f"+{extra}") if is_first_last else f"+{extra}"))
        else:
            result.append(format_ar(render(kept[i], i == 0)))
    return result

def build_catalog_display_list(products, size_name=None):
    """يبني قائمة الكروت المراد رسمها في الـ PDF.

    `size_name`: حين يُمرَّر، يُرسم المقاس المطلوب فقط ولا تظهر إلا الألوان التي
    تملكه فعلاً. بدونه كان تصدير "فلترة حسب المقاس" يخرج بكل مقاسات المنتج،
    فيبدو الفلتر كأنه لم يُطبَّق إطلاقاً.

    ملاحظة: نستبعد المقاسات التي نفدت كميتها (quantity_available <= 0)
    لأن الكتالوج يجب أن يعكس فقط ما هو متوفر للبيع فعلاً.
    """
    wanted_size = size_name.strip().casefold() if isinstance(size_name, str) and size_name.strip() else None

    display_list = []
    for product in products:
        for color in getattr(product, 'colors', []):
            if getattr(color, 'deleted_at', None):
                continue

            # نستبعد المتغيرات المحذوفة أو التي نفدت كميتها
            variants = [v for v in getattr(color, 'variants', [])
                        if not getattr(v, 'deleted_at', None)
                        and (getattr(v, 'quantity_available', 0) or 0) > 0]

            if wanted_size:
                variants = [v for v in variants
                            if v.size and (v.size.name or '').strip().casefold() == wanted_size]

            if not variants:
                continue

            sizes_list = [v.size.name for v in variants if v.size]

            # تحديد مسار الصورة
            img_path = getattr(color, 'color_image', None) or getattr(product, 'main_image', None)

            display_list.append({
                "name": getattr(product, 'name', 'N/A'),
                "color_name": getattr(color, 'color_name', ''),
                "sizes_list": sizes_list,
                "price": getattr(product, 'selling_price', '0.00'),
                "ref": getattr(product, 'reference', f"ID: {product.id}"),
                "img": img_path
            })

    return display_list


def _resize_image_for_pdf(img_path, image_cache=None, max_w_px=350, max_h_px=350, quality=65):
    """تصغير الصورة في الذاكرة قبل رسمها في PDF مع التخزين المؤقت (cache) لتسريع التوليد 10 أضعاف."""
    if not img_path or not os.path.exists(img_path):
        return None
    if image_cache is not None and img_path in image_cache:
        return image_cache[img_path]

    try:
        from PIL import Image as PILImage
        import tempfile
        with PILImage.open(img_path) as img:
            # BILINEAR أسرع بكثير لتوليد PDF فوري
            resample_filter = getattr(PILImage, 'Resampling', PILImage).BILINEAR
            img.thumbnail((max_w_px, max_h_px), resample_filter)
            if img.mode in ('RGBA', 'P'):
                img = img.convert('RGB')
            tmp = tempfile.NamedTemporaryFile(suffix='.jpg', delete=False)
            img.save(tmp.name, 'JPEG', quality=quality, optimize=False)
            tmp.close()
            if image_cache is not None:
                image_cache[img_path] = tmp.name
            return tmp.name
    except Exception:
        return None  # نتراجع للمسار الأصلي إذا فشل التصغير

def generate_catalog_pdf(products_or_display_list, output_path, size_name=None, display_list=None):
    """توليد PDF الكتالوج.

    يقبل إما:
    - `products_or_display_list`: قائمة منتجات ORM (المسار القديم)
    - `display_list`: قائمة كروت جاهزة من build_catalog_display_list (أسرع — لا يُعيد بناءها)
    """
    c = canvas.Canvas(output_path, pagesize=A4)
    width, height = A4
    
    # إعدادات التنسيق (كارت المنتج)
    margin = 1.2 * cm
    card_width = (width - 3 * margin) / 2 # عمودين في الصفحة
    card_height = 10.5 * cm 
    gap = 0.5 * cm
    y_position = height - 5.2 * cm

    def draw_header(canvas_obj):
        # 1. خلفية العنوان (مستطيل عنابي)
        canvas_obj.setFillColor(MAROON_COLOR)
        canvas_obj.rect(0, height - 3.8*cm, width, 3.8*cm, fill=1, stroke=0)
        
        # 2. نصوص العنوان باللون الأبيض
        canvas_obj.setFillColor(colors.white)
        canvas_obj.setFont("Helvetica-Bold", 28)
        canvas_obj.drawCentredString(width/2, height - 1.8*cm, "BELLAGIO")
        
        canvas_obj.setFont("Helvetica", 12)
        canvas_obj.drawCentredString(width/2, height - 2.8*cm, "PREMIUM COLLECTION")

    draw_header(c)

    # إذا مُرِّرت display_list جاهزة نستخدمها مباشرة (لا نُعيد بناءها)
    # وإلا نبنيها من قائمة المنتجات ORM
    if display_list is not None:
        items = display_list
    else:
        items = build_catalog_display_list(products_or_display_list, size_name)

    # قاموس كاش للصور المصغرة لتجنب تكرار معالجة نفس الصورة + قائمة لتنظيفها
    image_cache = {}

    for i, item in enumerate(items):
        if y_position < card_height + margin:
            c.showPage()
            draw_header(c)
            y_position = height - 5.2 * cm

        col = i % 2
        current_x = margin if col == 0 else margin + card_width + margin

        # --- مظهر كرت المنتج ---
        c.setStrokeColor(colors.lightgrey)
        c.setFillColor(colors.white)
        c.roundRect(current_x, y_position - card_height, card_width, card_height, 12, stroke=1, fill=1)

        # --- رسم الصورة (مُصغَّرة في الذاكرة مع cache لتسريع PDF) ---
        img_area_height = 6 * cm
        abs_img_path = get_absolute_path(item['img'])
        
        if abs_img_path:
            try:
                # نصغّر الصورة أولاً مع cache لتسريع رسمها في PDF بشكل فوري
                resized_path = _resize_image_for_pdf(abs_img_path, image_cache=image_cache)
                draw_path = resized_path if resized_path else abs_img_path
                c.drawImage(draw_path, current_x + 0.2*cm, y_position - img_area_height - 0.2*cm, 
                            width=card_width-0.4*cm, height=img_area_height, preserveAspectRatio=True)
            except Exception:
                c.setFillColor(colors.grey)
                c.drawCentredString(current_x + card_width/2, y_position - 3*cm, "Image Error")
        else:
            c.setFillColor(colors.lightgrey)
            c.drawCentredString(current_x + card_width/2, y_position - 3*cm, format_ar("بدون صورة"))

        # --- عرض البيانات ---
        c.setFillColor(colors.black)
        
        # 1. اسم المنتج (عربي)
        c.setFont(ARABIC_FONT, 12)
        c.drawRightString(current_x + card_width - 0.5*cm, y_position - 6.8*cm, format_ar(item['name']))

        # 2. اللون (رمادي)
        c.setFont(ARABIC_FONT, 9)
        c.setFillColor(colors.grey)
        c.drawRightString(current_x + card_width - 0.5*cm, y_position - 7.5*cm, format_ar(f"اللون: {item['color_name']}"))
        
        # 3. المقاسات مع لفّ النص على عدة أسطر
        c.setFillColor(MAROON_COLOR)
        c.setFont(ARABIC_FONT, 10)
        sizes_max_width = card_width - 1 * cm
        sizes_lines = wrap_sizes_lines(c, item['sizes_list'], "المقاسات: ", sizes_max_width, ARABIC_FONT, 10)
        sizes_line_height = 0.45 * cm
        for line_idx, line_text in enumerate(sizes_lines):
            c.drawRightString(current_x + card_width - 0.5*cm, y_position - 8.2*cm - (line_idx * sizes_line_height), line_text)

        # 4. السعر
        c.setFillColor(colors.black)
        c.setFont("Helvetica-Bold", 14)
        c.drawRightString(current_x + card_width - 0.5*cm, y_position - 9.2*cm, f"LYD {item['price']}")

        # 5. كود المنتج
        c.setFont("Helvetica", 7)
        c.setFillColor(colors.grey)
        c.drawString(current_x + 0.5*cm, y_position - 10*cm, f"REF: {item['ref']}")

        if col == 1:
            y_position -= (card_height + gap)

    c.save()

    # تنظيف الملفات المؤقتة بعد الحفظ
    import os as _os
    for tmp_path in image_cache.values():
        try:
            _os.unlink(tmp_path)
        except Exception:
            pass