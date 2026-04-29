<<<<<<< HEAD
# app/utils.py
import os
import uuid
import io
import random
import string
from PIL import Image
from fastapi import UploadFile
from typing import Optional
from sqlalchemy.orm import Session
from app.models.inventory import Product
import base64
import qrcode
# app/utils.py

# مسارات التخزين
COLOR_DIR = "static/uploads/colors"
PRODUCT_DIR = "static/uploads/products"


QR_DIR = "static/uploads/qrcodes"
os.makedirs(QR_DIR, exist_ok=True)

async def generate_variant_qr(variant_id: int, product_code: str):
    """توليد كود QR فريد للمتغير"""
    # البيانات المخزنة: كود المنتج مع معرف المتغير الفريد
    # هذا يضمن أنك لو مسحت الكود بجهاز خارجي ستحصل على معرف دقيق
    qr_data = f"VAR:{variant_id}|SKU:{product_code}"
    
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(qr_data)
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="black", back_color="white")
    file_name = f"qr_{variant_id}_{uuid.uuid4().hex[:6]}.png"
    file_path = os.path.join(QR_DIR, file_name)
    
    img.save(file_path)
    return file_path



def ensure_upload_dirs():
    """التأكد من وجود المجلدات لتجنب FileNotFoundError"""
    for path in [COLOR_DIR, PRODUCT_DIR]:
        if not os.path.exists(path):
            os.makedirs(path, exist_ok=True)

async def process_and_save_color_image(file: Optional[UploadFile]) -> Optional[str]:
    """معالجة صورة اللون"""
    if not file or not file.filename:
        return None
    try:
        ensure_upload_dirs()
=======
import os, uuid, io, random, string, logging, base64, qrcode
from PIL import Image
from fastapi import UploadFile, HTTPException
from typing import Optional
from sqlalchemy.orm import Session
from app.models.inventory import Product

logger = logging.getLogger("BellagioUtils")

UPLOAD_DIRS = {
    "color": "static/uploads/colors",
    "product": "static/uploads/products",
}

def _ensure_directories():
    for path in UPLOAD_DIRS.values():
        os.makedirs(path, exist_ok=True)

async def _process_image(file: UploadFile, save_dir: str, prefix: str, size: tuple) -> str:
    try:
        _ensure_directories()
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
        contents = await file.read()
        img = Image.open(io.BytesIO(contents))
        if img.mode in ("RGBA", "P"): img = img.convert("RGB")
        
<<<<<<< HEAD
        img.thumbnail((800, 800), Image.Resampling.LANCZOS)
        filename = f"col_{uuid.uuid4().hex}.webp"
        file_path = os.path.join(COLOR_DIR, filename)
        
        img.save(file_path, "WEBP", quality=75, optimize=True)
        return f"/{file_path}"
    except Exception as e:
        print(f"Color Image Error: {e}")
        return "ERROR"

async def process_and_save_product_image(file: Optional[UploadFile]) -> Optional[str]:
    """معالجة صورة المنتج بضغط عالي الجودة"""
    if not file or not file.filename:
        return None
    try:
        ensure_upload_dirs()
        contents = await file.read()
        img = Image.open(io.BytesIO(contents))
        if img.mode in ("RGBA", "P"): img = img.convert("RGB")
        
        img.thumbnail((1200, 1200), Image.Resampling.LANCZOS)
        filename = f"prod_{uuid.uuid4().hex}.webp"
        file_path = os.path.join(PRODUCT_DIR, filename)
        
        img.save(file_path, "WEBP", quality=80, optimize=True)
        return f"/{file_path}"
    except Exception as e:
        print(f"Product Image Error: {e}")
        return "ERROR"

def generate_product_code(db: Session):
    """توليد كود فريد وفحص وجوده في قاعدة البيانات"""
    while True:
        new_code = 'PRD-' + ''.join(random.choices(string.digits, k=6))
        exists = db.query(Product).filter(Product.code == new_code).first()
        if not exists:
            return new_code



def delete_old_image(image_path: str):
    """حذف الصورة القديمة من القرص عند التحديث أو الحذف"""
    if not image_path:
        return
    try:
        # إزالة العلامة المائلة في البداية إذا وجدت (مثلاً /static/...)
        normalized_path = image_path.lstrip('/')
        if os.path.exists(normalized_path):
            os.remove(normalized_path)
    except Exception as e:
        print(f"Error deleting file: {e}")



=======
        img.thumbnail(size, Image.Resampling.LANCZOS)
        filename = f"{prefix}_{uuid.uuid4().hex}.webp"
        file_path = os.path.join(save_dir, filename)
        
        img.save(file_path, "WEBP", quality=80, optimize=True)
        return f"/{file_path.replace(os.sep, '/')}"
    except Exception as e:
        logger.error(f"Image Error: {e}")
        raise HTTPException(status_code=500, detail="خطأ في معالجة الصورة")

async def process_and_save_color_image(file: Optional[UploadFile]):
    if not file or not file.filename: return None
    return await _process_image(file, UPLOAD_DIRS["color"], "col", (800, 800))

def generate_product_code(db: Session) -> str:
    """توليد كود PRD-123456 فريد"""
    while True:
        code = 'PRD-' + ''.join(random.choices(string.digits, k=6))
        if not db.query(Product).filter(Product.code == code).first():
            return code
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
