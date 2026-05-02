import os
import uuid
import io
import random
import string
import logging
import qrcode
from PIL import Image
from fastapi import UploadFile, HTTPException
from typing import Optional
from sqlalchemy.orm import Session
from app.models.inventory import Product

# إعداد السجلات (Logging) للمتابعة
logger = logging.getLogger("BellagioUtils")

# إعداد مسارات التخزين
BASE_UPLOAD_DIR = "static/uploads"
DIRS = {
    "color": os.path.join(BASE_UPLOAD_DIR, "colors"),
    "product": os.path.join(BASE_UPLOAD_DIR, "products"),
    "qr": os.path.join(BASE_UPLOAD_DIR, "qrcodes"),
}

def ensure_upload_dirs():
    """التأكد من وجود جميع مجلدات التخزين عند بدء التشغيل"""
    for path in DIRS.values():
        os.makedirs(path, exist_ok=True)

# --- قسم معالجة الصور ---

async def _process_and_save_image(file: UploadFile, category: str, size: tuple, prefix: str) -> str:
    """محرك معالجة الصور الموحد: ضغط، تغيير حجم، وتحويل لـ WEBP"""
    try:
        ensure_upload_dirs()
        contents = await file.read()
        img = Image.open(io.BytesIO(contents))
        
        # تحويل الصور ذات الخلفية الشفافة (PNG) إلى RGB لتجنب مشاكل WEBP
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        
        # تغيير الحجم مع الحفاظ على التناسب (Thumbnail)
        img.thumbnail(size, Image.Resampling.LANCZOS)
        
        filename = f"{prefix}_{uuid.uuid4().hex}.webp"
        file_path = os.path.join(DIRS[category], filename)
        
        # حفظ الصورة بصيغة WEBP موفرة للمساحة
        img.save(file_path, "WEBP", quality=80, optimize=True)
        
        # إرجاع المسار بصيغة URL متوافقة مع الويب
        return f"/{file_path.replace(os.sep, '/')}"
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

async def generate_variant_qr(variant_id: int, product_code: str) -> str:
    """توليد كود QR يحتوي على بيانات الصنف الفريدة"""
    ensure_upload_dirs()
    # بيانات الـ QR: معرف النسخة وكود المنتج
    qr_data = f"VAR:{variant_id}|SKU:{product_code}"
    
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(qr_data)
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="black", back_color="white")
    file_name = f"qr_{variant_id}_{uuid.uuid4().hex[:6]}.png"
    file_path = os.path.join(DIRS["qr"], file_name)
    
    img.save(file_path)
    return f"/{file_path.replace(os.sep, '/')}"