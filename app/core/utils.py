import uuid
import io
from PIL import Image
<<<<<<< HEAD
from fastapi import UploadFile

def generate_product_code():
    """توليد كود فريد تلقائياً للمنتج"""
    return f"PRD-{uuid.uuid4().hex[:8].upper()}"

async def compress_and_save_image(file: UploadFile):
    """ضغط الصور لتسريع التحميل"""
    contents = await file.read()
    image = Image.open(io.BytesIO(contents))
    
    if image.mode in ("RGBA", "P"):
        image = image.convert("RGB")
    
    # تصغير الأبعاد مع الحفاظ على التناسب
    image.thumbnail((800, 800))
    
    output = io.BytesIO()
    image.save(output, format="JPEG", quality=70, optimize=True)
    return output.getvalue()
=======
from fastapi import UploadFile, HTTPException

def generate_product_code():
    """
    توليد كود فريد للمنتجات بتنسيق احترافي.
    مثال: PRD-A1B2C3D4
    """
    return f"PRD-{uuid.uuid4().hex[:8].upper()}"

async def compress_and_save_image(file: UploadFile):
    """
    معالجة وضغط الصور المرفوعة لتقليل استهلاك مساحة التخزين.
    
    العمليات:
    1. قراءة الملف وتحويله لصورة.
    2. تحويل الأنماط الشفافة (PNG) إلى RGB (JPEG).
    3. تصغير الأبعاد مع الحفاظ على التناسب.
    4. الضغط بجودة 70%.
    """
    try:
        contents = await file.read()
        
        # محاولة فتح الصورة والتأكد أنها ليست ملفاً تالفاً
        try:
            image = Image.open(io.BytesIO(contents))
        except Exception:
            raise HTTPException(
                status_code=400, 
                detail="الملف المرفوع ليس صورة صالحة أو الملف تالف"
            )
        
        # معالجة الصور الشفافة لتجنب خطأ عند الحفظ بتنسيق JPEG
        if image.mode in ("RGBA", "P"):
            image = image.convert("RGB")
        
        # تصغير الأبعاد (Thumbnail) بحد أقصى 800 بكسل
        image.thumbnail((800, 800))
        
        # حفظ الصورة في الذاكرة (Buffer) بدلاً من القرص لتسريع المعالجة
        output = io.BytesIO()
        image.save(output, format="JPEG", quality=70, optimize=True)
        
        return output.getvalue()
        
    except Exception as e:
        # رسالة خطأ مفصلة في حال حدوث مشكلة تقنية أثناء المعالجة
        raise HTTPException(
            status_code=500, 
            detail=f"حدث خطأ أثناء معالجة الصورة وضغطها: {str(e)}"
        )
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
