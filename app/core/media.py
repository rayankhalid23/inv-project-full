"""
=====================================================================
المصدر الوحيد لمسارات الوسائط (الصور وأكواد QR)
=====================================================================

القاعدة: يُخزَّن في قاعدة البيانات مسار **نسبي موحّد** بالشكل:

    /static/uploads/<category>/<filename>

• نسبي دائماً (بلا اسم نطاق) — فتعمل نفس البيانات على localhost وعلى
  شبكة LAN وعلى أي دومين بعد الرفع دون أي تعديل.
• شرطة مائلة أمامية دائماً، وفواصل "/" فقط — ويندوز ينتج "\\" وهو
  يكسر الروابط في المتصفح.
• لا يُخزَّن رابط كامل (http://...) أبداً — لأنه يتعطل فور تغيير
  الدومين أو المنفذ.

كل كتابة لمسار صورة يجب أن تمر عبر build_media_path،
وكل قراءة قديمة تُصحَّح عبر normalize_media_path.
"""

import os
from typing import Optional

# مجلد التخزين على القرص (نسبي لجذر المشروع)
MEDIA_ROOT = "static/uploads"

# البادئة العامة التي يُخدَّم بها المجلد عبر HTTP.
# مضبوطة على نفس مسار التخزين ليبقى هناك مسار واحد فقط في النظام كله.
# قابلة للتغيير عبر متغير بيئة إن انتقلت الملفات لاحقاً إلى CDN.
MEDIA_URL_PREFIX = os.getenv("MEDIA_URL_PREFIX", "/static/uploads").rstrip("/")

# التصنيفات المسموح بها ← اسم المجلد
MEDIA_CATEGORIES = {
    "product": "products",
    "color": "colors",
    "qr": "qrcodes",
}


def media_dir(category: str) -> str:
    """مجلد التخزين على القرص لتصنيف معيّن."""
    if category not in MEDIA_CATEGORIES:
        raise ValueError(f"تصنيف وسائط غير معروف: {category}")
    return os.path.join(MEDIA_ROOT, MEDIA_CATEGORIES[category])


def ensure_media_dirs() -> None:
    """إنشاء كل مجلدات التخزين إن لم تكن موجودة."""
    for sub in MEDIA_CATEGORIES.values():
        os.makedirs(os.path.join(MEDIA_ROOT, sub), exist_ok=True)


def build_media_path(category: str, filename: str) -> str:
    """
    يبني المسار القانوني الذي يُحفظ في قاعدة البيانات.
    مثال: build_media_path("product", "abc.webp") -> "/static/uploads/products/abc.webp"
    """
    if category not in MEDIA_CATEGORIES:
        raise ValueError(f"تصنيف وسائط غير معروف: {category}")
    name = os.path.basename(str(filename).replace("\\", "/"))
    return f"{MEDIA_URL_PREFIX}/{MEDIA_CATEGORIES[category]}/{name}"


def normalize_media_path(value: Optional[str]) -> Optional[str]:
    """
    يحوّل أي شكل قديم إلى الشكل القانوني.

    يعالج: الفواصل الخلفية "\\"، غياب الشرطة الأمامية، البادئات القديمة
    مثل "/static/products/"، والروابط الكاملة (يستخرج منها المسار فقط).
    يُرجع None إذا كانت القيمة فارغة.
    """
    if not value:
        return None

    path = str(value).strip().replace("\\", "/")
    if not path:
        return None

    # رابط كامل: نأخذ الجزء بعد اسم النطاق فقط حتى يبقى المسار نسبياً
    if path.startswith("http://") or path.startswith("https://"):
        without_scheme = path.split("://", 1)[1]
        path = "/" + without_scheme.split("/", 1)[1] if "/" in without_scheme else ""
        if not path or path == "/":
            return None

    filename = os.path.basename(path)
    if not filename:
        return None

    # نستنتج التصنيف من المجلد الظاهر في المسار، وإلا من بادئة اسم الملف
    lowered = path.lower()
    category = None
    for cat, folder in MEDIA_CATEGORIES.items():
        if f"/{folder}/" in lowered or lowered.startswith(f"{folder}/"):
            category = cat
            break

    if category is None:
        if filename.startswith("col_"):
            category = "color"
        elif filename.startswith("qr_"):
            category = "qr"
        else:
            category = "product"

    return build_media_path(category, filename)


def media_exists(path: Optional[str]) -> bool:
    """هل الملف الذي يشير إليه المسار القانوني موجود فعلاً على القرص؟"""
    normalized = normalize_media_path(path)
    if not normalized:
        return False
    relative = normalized[len(MEDIA_URL_PREFIX):].lstrip("/")
    return os.path.isfile(os.path.join(MEDIA_ROOT, relative))
