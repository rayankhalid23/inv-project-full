from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from sqlalchemy.exc import IntegrityError
from typing import List, Optional
from datetime import datetime

from app.core.database import get_db
from app.core.deps import RoleChecker
from app.models.inventory import Size
from app.models.user import User

router = APIRouter(prefix="/sizes", tags=["Sizes"])

@router.post("/", status_code=status.HTTP_201_CREATED)
def add_size(
    name: str, 
    sort_order: Optional[int] = None, 
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker([1, 2]))
):
    # التأكد من صحة المدخلات
    if not name or name.strip() == "" or name.lower() == "string":
        raise HTTPException(status_code=400, detail="خطأ: يجب إدخال اسم المقاس بشكل صحيح ولا يمكن تركه فارغاً.")

    clean_name = name.strip().upper()
    
    # 1. فحص التكرار قبل المحاولة (لتجنب انهيار الجلسة)
    existing = db.query(Size).filter(Size.name == clean_name).first()
    if existing:
        if existing.deleted_at is None:
            raise HTTPException(status_code=400, detail=f"فشل الإضافة: المقاس '{clean_name}' موجود مسبقاً وهو نشط حالياً.")
        else:
            # حالة خاصة: إذا كان موجوداً ومحذوفاً، نوجه المستخدم لاستعادته أو تعديل الوظيفة لاحقاً
            raise HTTPException(status_code=400, detail=f"فشل الإضافة: المقاس '{clean_name}' موجود مسبقاً في الأرشيف (المحذوفات).")

    try:
        # الترتيب التلقائي في نهاية القائمة
        if sort_order is None:
            max_order = db.query(func.max(Size.sort_order)).filter(Size.deleted_at == None).scalar()
            sort_order = (max_order or 0) + 1

        new_size = Size(name=clean_name, sort_order=sort_order)
        db.add(new_size)
        db.commit()
        db.refresh(new_size)
        return new_size

    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="خطأ في تكامل البيانات: يبدو أن هذا الاسم تم إدخاله بواسطة مستخدم آخر في نفس اللحظة.")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"حدث خطأ غير متوقع في الخادم أثناء إضافة المقاس: {str(e)}")

@router.get("/", summary="جلب أسماء المقاسات فقط")
def list_sizes(db: Session = Depends(get_db)):
    try:
        # استعلام لجلب عمود الاسم فقط للمقاسات غير المحذوفة
        results = db.query(Size.name).filter(Size.deleted_at == None).order_by(Size.sort_order.asc()).all()
        
        # تحويل النتائج من قائمة صفوف (Rows) إلى قائمة نصوص بسيطة (Strings)
        # ملاحظة: item تعود هنا كـ Row، لذا نصل للقيمة عبر item[0] أو item.name
        return [item[0] for item in results]
        
    except Exception as e:
        # تسجيل الخطأ داخلياً (اختياري) ثم رفع استثناء للمستخدم
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail="حدث خطأ فني أثناء محاولة جلب قائمة المقاسات، يرجى المحاولة لاحقاً."
        )


        
@router.delete("/{size_id}")
def delete_size(size_id: int, db: Session = Depends(get_db), current_user: User = Depends(RoleChecker([1, 2]))):
    # البحث عن المقاس
    size = db.query(Size).filter(Size.id == size_id, Size.deleted_at == None).first()
    
    if not size:
        raise HTTPException(status_code=404, detail="خطأ: لم يتم العثور على المقاس المطلوبة، أو قد يكون محذوفاً بالفعل.")
    
    try:
        size.deleted_at = datetime.now()
        db.commit()
        return {"status": "success", "detail": f"تم حذف المقاس '{size.name}' بنجاح."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="فشل تنفيذ عملية الحذف في قاعدة البيانات.")