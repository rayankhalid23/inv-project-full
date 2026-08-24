import os
import uuid
import io
import random
import string
import logging
import qrcode
from PIL import Image
from fastapi import UploadFile, HTTPException
from fastapi.concurrency import run_in_threadpool
from typing import Optional
from sqlalchemy.orm import Session
from app.models.inventory import Product

# إعداد السجلات (Logging) للمتابعة
logger = logging.getLogger("BellagioUtils")

# إعداد مسارات التخزين — المصدر الوحيد هو app/core/media.py
from app.core.media import (
    MEDIA_ROOT as BASE_UPLOAD_DIR,
    MEDIA_CATEGORIES,
    build_media_path,
    ensure_media_dirs,
    media_dir,
)

# يبقى DIRS للتوافق مع أي استدعاء قديم، لكنه يُشتق من المصدر الموحّد
DIRS = {cat: media_dir(cat) for cat in MEDIA_CATEGORIES}


def ensure_upload_dirs():
    """التأكد من وجود جميع مجلدات التخزين عند بدء التشغيل"""
    ensure_media_dirs()

# --- قسم معالجة الصور ---

def _encode_image_sync(contents: bytes, category: str, size: tuple, prefix: str) -> str:
    """الجزء الثقيل (فك الترميز، التصغير، ترميز WEBP) — يُنفَّذ خارج حلقة الأحداث."""
    ensure_upload_dirs()
    img = Image.open(io.BytesIO(contents))

    # تحويل الصور ذات الخلفية الشفافة (PNG) إلى RGB لتجنب مشاكل WEBP
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")

    # تغيير الحجم مع الحفاظ على التناسب (Thumbnail)
    img.thumbnail(size, Image.Resampling.LANCZOS)

    filename = f"{prefix}_{uuid.uuid4().hex}.webp"
    file_path = os.path.join(media_dir(category), filename)

    # حفظ الصورة بصيغة WEBP موفرة للمساحة
    img.save(file_path, "WEBP", quality=80, optimize=True)

    # المسار القانوني الموحّد (نسبي، بفواصل "/" فقط)
    return build_media_path(category, filename)


async def _process_and_save_image(file: UploadFile, category: str, size: tuple, prefix: str) -> str:
    """محرك معالجة الصور الموحد: ضغط، تغيير حجم، وتحويل لـ WEBP.

    القراءة من الشبكة async حقيقية، أما معالجة الصورة فعمل CPU ثقيل كان
    يُنفَّذ على حلقة الأحداث فيُجمّد الخادم لكل المستخدمين أثناء رفع أي صورة.
    الآن يُنقل إلى thread pool عبر run_in_threadpool.
    """
    try:
        contents = await file.read()
        return await run_in_threadpool(_encode_image_sync, contents, category, size, prefix)
    except Exception as e:
        logger.error(f"Image Processing Error ({category}): {e}")
        raise HTTPException(status_code=500, detail="فشل في معالجة وتحويل الصورة")

def save_upload_sync(file: Optional[UploadFile], category: str, size: tuple, prefix: str) -> Optional[str]:
    """
    نسخة متزامنة من حفظ الصور، للمسارات المعرَّفة بـ def (تعمل في thread pool).

    تمر بنفس خط المعالجة تماماً (تصغير + تحويل WEBP) وتُرجع المسار القانوني،
    فلا يبقى مكان يحفظ الملف الخام أو يكتب مسار قرص في قاعدة البيانات.
    """
    if not file or not file.filename:
        return None
    try:
        contents = file.file.read()
        return _encode_image_sync(contents, category, size, prefix)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Image Processing Error ({category}): {e}")
        raise HTTPException(status_code=500, detail="فشل في معالجة وتحويل الصورة")


async def process_and_save_color_image(file: Optional[UploadFile]):
    if not file or not file.filename: return None
    return await _process_and_save_image(file, "color", (800, 800), "col")

async def process_and_save_product_image(file: Optional[UploadFile]):
    if not file or not file.filename: return None
    return await _process_and_save_image(file, "product", (1200, 1200), "prod")

def delete_old_image(image_path: Optional[str]):
    """حذف الصورة من القرص عند تحديث المنتج أو حذفه"""
    if not image_path: return
    try:
        normalized_path = image_path.lstrip('/')
        if os.path.exists(normalized_path):
            os.remove(normalized_path)
    except Exception as e:
        logger.warning(f"Could not delete file {image_path}: {e}")

# --- قسم الأكواد والـ QR ---

def generate_product_code(db: Session) -> str:
    """توليد SKU فريد مثل PRD-123456"""
    while True:
        new_code = 'PRD-' + ''.join(random.choices(string.digits, k=6))
        exists = db.query(Product).filter(Product.code == new_code).first()
        if not exists:
            return new_code

def compute_variant_sku(product_id: int, color_position: int, size_position: int) -> str:
    """بناء كود SKU فريد بصيغة {product_id:05d}-{color_pos}-{size_pos}

    مثال: المنتج 76، اللون الأول، المقاس الثاني  →  00076-1-2
    الأصفار في بداية رقم المنتج تُتجاهل في البحث (76 = 00076).
    """
    return f"{product_id:05d}-{color_position}-{size_position}"


def generate_variant_qr(variant_id: int, product_code: str, variant_sku: str = None) -> str:
    """توليد كود QR يحتوي على بيانات الصنف الفريدة.

    متزامنة عن قصد: لا تحتوي على أي await — مجرد توليد صورة وحفظها على القرص.
    كونها async def سابقاً كان يجعلها تعمل على حلقة الأحداث وتُجمّد الخادم،
    خصوصاً أنها تُستدعى داخل حلقة لكل مقاس عند إنشاء المتغيرات دفعة واحدة.

    إذا أُعطي variant_sku يُشفَّر في صورة الـ QR مباشرة (أسهل للكتابة والحفظ).
    """
    ensure_upload_dirs()
    qr_data = variant_sku if variant_sku else f"VAR:{variant_id}|SKU:{product_code}"

    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(qr_data)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    file_name = f"qr_{variant_id}_{uuid.uuid4().hex[:6]}.png"
    file_path = os.path.join(media_dir("qr"), file_name)

    img.save(file_path)
    return build_media_path("qr", file_name)