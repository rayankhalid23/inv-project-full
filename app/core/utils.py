import uuid
import io
from PIL import Image
from fastapi import UploadFile, HTTPException

def generate_product_code():
    """توليد كود فريد للمنتجات (مثال: PRD-A1B2C3D4)"""
    return f"PRD-{uuid.uuid4().hex[:8].upper()}"

async def compress_and_save_image(file: UploadFile):
    """
    معالجة الصور: تحويل النمط، تصغير الأبعاد، والضغط لتقليل المساحة.
    """
    try:
        contents = await file.read()
        
        # التأكد من صحة ملف الصورة
        try:
            image = Image.open(io.BytesIO(contents))
        except Exception:
            raise HTTPException(
                status_code=400, 
                detail="الملف المرفوع ليس صورة صالحة أو الملف تالف"
            )
        
        # تحويل الصور الشفافة (PNG/RGBA) إلى نمط RGB لتقليل الحجم والتوافق مع JPEG
        if image.mode in ("RGBA", "P"):
            image = image.convert("RGB")
        
        # تصغير الأبعاد مع الحفاظ على التناسب (Thumbnail)
        image.thumbnail((800, 800))
        
        # حفظ الصورة في الذاكرة (Buffer) بجودة مضغوطة
        output = io.BytesIO()
        image.save(output, format="JPEG", quality=70, optimize=True)
        
        return output.getvalue()
        
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(
            status_code=500, 
            detail=f"حدث خطأ فني أثناء معالجة الصورة: {str(e)}"
        )