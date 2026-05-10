
from sqlalchemy.sql import func
from sqlalchemy.exc import IntegrityError
from app.models.inventory import Size, ProductVariant, Product,ProductColor
from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List

# استيراد الأدوات الأساسية
from app.core.database import get_db
from app.core.deps import RoleChecker

# استيراد النماذج (Models) - تأكد من صحة مسارات الاستيراد في مشروعك
from app.models.inventory import Size, ProductVariant, Product
from app.models.user import User
from app.services.audit_service import create_system_audit_log


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
        db.flush()
        


        # سطر المراقبة (إضافة)
        create_system_audit_log(
            db=db, 
            user_id=current_user.id, 
            action_target='size', 
            target_id=new_size.id, 
            action_type='create', 
            details={"name": new_size.name, "sort_order": new_size.sort_order}
        )

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

@router.delete("/{size_id}", summary="حذف مقاس مع فحص الارتباط الاحترافي")
def delete_size(
    size_id: int, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(RoleChecker([1, 2]))
):
    # 1. البحث عن المقاس
    size = db.query(Size).filter(Size.id == size_id, Size.deleted_at == None).first()
    
    if not size:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="عذراً، المقاس المطلوب غير موجود أو ربما تم حذفه مسبقاً."
        )

    # 2. الفحص الذكي (تم تصحيح الربط هنا)
    # ملاحظة: سنستخدم .all() ثم نستخرج الأسماء يدوياً لتجنب خطأ scalars
    linked_results = db.query(Product.name).join(
        ProductColor, Product.id == ProductColor.product_id
    ).join(
        ProductVariant, ProductColor.id == ProductVariant.product_color_id
    ).filter(
        ProductVariant.size_id == size_id,
        ProductVariant.deleted_at == None,
        ProductColor.deleted_at == None,
        Product.deleted_at == None
    ).distinct().all()

    # 3. إذا وجدنا ارتباطاً، ننسق الرسالة باحترافية
    if linked_results:
        # استخراج الأسماء من نتائج الاستعلام (تحويلها من صفوف إلى نصوص)
        product_names_list = [row[0] for row in linked_results]
        formatted_names = " • " + " • ".join(product_names_list)
        
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"لا يمكن حذف المقاس '{size.name}' حالياً لارتباطه بمنتجات نشطة في المخزن. "
                f"يرجى إزالة المقاس من المنتجات التالية أولاً لضمان دقة التقارير: ["
                f"{formatted_names}"
                f" ]"
            )
        )

    # 4. تنفيذ الحذف الناعم في حال عدم وجود ارتباط
    try:
        size.deleted_at = datetime.now()
        
       
        create_system_audit_log(
            db=db, 
            user_id=current_user.id, 
            action_target='size', 
            target_id=size_id, 
            action_type='delete', 
            details={"name": size.name}
        )
        
        db.commit()
        
        return {
            "status": "success", 
            "message": f"تمت أرشفة المقاس '{size.name}' بنجاح وتحديث السجلات."
        }
        
    except Exception as e:
        db.rollback()
        # طباعة الخطأ في وحدة التحكم (Terminal) للمطور فقط
        print(f"Error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail="حدث خطأ تقني أثناء محاولة الحذف. يرجى مراجعة الدعم الفني."
        )