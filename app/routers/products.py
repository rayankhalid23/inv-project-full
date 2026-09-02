import os
import uuid
import shutil
import math
import arabic_reshaper
from bidi.algorithm import get_display
from app.core.database import SessionLocal
import io
from  app.schemas.PD import VariantSchema,ColorSchema,ProductFullDetailSchema
from datetime import datetime
from typing import Optional, List
from app.core.deps import RoleChecker
from app.core.websocket_manager import manager

from fastapi import APIRouter, Depends, Form, File, UploadFile, status, HTTPException, Query, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload, selectinload
from sqlalchemy import or_, and_, func
from app.services.order_service import get_inventory_dashboard_stats

# استيراد الموديلات والخدمات الخاصة بالمشروع
from app.core.database import get_db
from app.core.deps import RoleChecker
from app.models.user import User
from app.models.inventory import Product, ProductColor, ProductVariant, Size
from app.schemas.product_display import PaginatedProductDashboard, ProductDeepDiveOut, ProductDashboardItem 
from app.schemas.inventory import VariantUpdatePartial
from app.services.qr_service import QRGeneratorService
from app.services.pdf_generator import generate_catalog_pdf, build_catalog_display_list
from app.crud.inventory_sync import sync_product_metrics
from app.utils import delete_old_image, save_upload_sync

from app.services.audit_service import create_system_audit_log,log_product_data_update


router = APIRouter(tags=["Products"])
# مجلد الرفع يُدار مركزياً في app/core/media.py
from app.core.media import media_dir
UPLOAD_DIR = media_dir("product")

# التأكد من وجود مجلد الرفع
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/", status_code=status.HTTP_201_CREATED)
def create_product(
    background_tasks: BackgroundTasks,
    name: str = Form(...),
    catalog_id: int = Form(...),
    selling_price: float = Form(...),
    cost_price: Optional[float] = Form(0.0),
    min_stock_threshold: int = Form(5),
    description: Optional[str] = Form(None),
    image_file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user = Depends(RoleChecker([1, 2]))
):
    db_image_path = None
  
    # تحققات السلامة (Validation)
    if not name or name.strip().lower() == "string":
        raise HTTPException(status_code=400, detail="اسم المنتج غير صالح أو فارغ")
    
    try:
        # حفظ الصورة
        if image_file and image_file.filename:
            try:
                # خط المعالجة الموحّد: تصغير + WEBP + مسار قانوني واحد.
                # كان يُحفظ الملف الخام كما هو (صور هواتف بعدة ميجابايت) ويُبنى
                # المسار يدوياً، فتباينت أشكال المسارات وثقلت الصفحات.
                db_image_path = save_upload_sync(image_file, "product", (1200, 1200), "prod")
            except Exception as e:
                raise HTTPException(status_code=500, detail="حدث خطأ أثناء حفظ صورة المنتج")

        new_product = Product(
            name=name, catalog_id=catalog_id, selling_price=selling_price,
            cost_price=cost_price, min_stock_threshold=min_stock_threshold,
            # العمود NOT NULL في الموديل، والحقل اختياري في النموذج — بدون هذا
            # التطبيع كان إنشاء منتج بلا وصف يرمي IntegrityError ويعيد 500.
            description=(description or "").strip(),
            code=f"PROD-TEMP-{uuid.uuid4().hex[:8]}",
            main_image=db_image_path, created_by=current_user.id
        )
        db.add(new_product)
        db.flush()
        # الكود يُبنى من ID الفعلي بعد الـ flush لضمان التفرد دون race condition
        product_code = f"PROD-{new_product.id:05d}"
        new_product.code = product_code

        # 5. تسجيل العملية في سجل الرقابة (Audit Log)
        create_system_audit_log(
          db=db,
          user_id=current_user.id,
          action_target="product",
          target_id=new_product.id,
          action_type="create",
          details={"name": name, "code": product_code, "price": selling_price}
        )

        db.commit()
        db.refresh(new_product)
        background_tasks.add_task(refresh_dashboard_ws)

        return {"status": "success", "data": new_product}
    
    except HTTPException as he:
        raise he
    except Exception as e:
        db.rollback()
        delete_old_image(db_image_path)
        raise HTTPException(status_code=500, detail=f"خطأ غير متوقع: {str(e)}")



@router.put("/{product_id}", status_code=status.HTTP_200_OK)
def update_product(
    product_id: int,
    name: Optional[str] = Form(None),
    catalog_id: Optional[int] = Form(None),
    selling_price: Optional[float] = Form(None),
    cost_price: Optional[float] = Form(None),
    min_stock_threshold: Optional[int] = Form(None),
    description: Optional[str] = Form(None),
    image_file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user = Depends(RoleChecker([1, 2])) 
):
    # استخدام db.get لضمان الحصول على أحدث نسخة من قاعدة البيانات
    product = db.query(Product).filter(Product.id == product_id, Product.deleted_at == None).first()
    if not product:
        raise HTTPException(status_code=404, detail="المنتج غير موجود.")
    
    # 1. التقاط الحالة القديمة "قبل التعديل" مباشرة
    # نستخدم dict(vars(product)) أو بناء يدوي لضمان عدم تأثرها بالـ Session لاحقاً
    old_snapshot = {
        "name": product.name,
        "catalog_id": product.catalog_id,
        "cost_price": float(product.cost_price or 0.0),
        "selling_price": float(product.selling_price or 0.0),
        "min_stock_threshold": product.min_stock_threshold,
        "description": product.description,
        "main_image": product.main_image
    }

    has_actual_changes = False
    saved_path = None

    try:
        # تحديث الاسم
        if name and name.strip().lower() != "string" and name.strip() != product.name:
            product.name = name.strip()
            has_actual_changes = True

        # تحديث الكتالوج
        if catalog_id is not None and catalog_id > 0 and catalog_id != product.catalog_id:
            product.catalog_id = catalog_id
            has_actual_changes = True

        # تحديث الأسعار
        if selling_price is not None and selling_price > 0 and float(selling_price) != float(product.selling_price or 0.0):
            product.selling_price = selling_price
            has_actual_changes = True

        if cost_price is not None and cost_price > 0 and float(cost_price) != float(product.cost_price or 0.0):
            product.cost_price = cost_price
            has_actual_changes = True

        if min_stock_threshold is not None and min_stock_threshold >= 0 and min_stock_threshold != product.min_stock_threshold:
            product.min_stock_threshold = min_stock_threshold
            has_actual_changes = True    

        # تحديث الوصف
        if description is not None:
            clean_desc = description.strip()
            if clean_desc.lower() != "string" and clean_desc != (product.description or ""):
                product.description = clean_desc
                has_actual_changes = True

        # تحديث الصورة (المكان الذي كان يسبب التكرار)
        if image_file and image_file.filename:
            old_img_path = product.main_image
            # نفس خط المعالجة، ويُخزَّن المسار القانوني لا مسار القرص
            saved_path = save_upload_sync(image_file, "product", (1200, 1200), "prod")
            product.main_image = saved_path
            has_actual_changes = True
            
            # نحذف القديمة فقط بعد التأكد من نجاح حفظ الجديدة في الذاكرة
            if old_img_path and os.path.exists(old_img_path):
                try: os.remove(old_img_path)
                except: pass

        if not has_actual_changes:
            return {"status": "success", "message": "لا يوجد تغييرات فعلية.", "data": product}

        # 2. مزامنة التغييرات مع قاعدة البيانات مؤقتاً لنحصل على الحالة الجديدة
        db.flush()

        new_snapshot = {
            "name": product.name,
            "catalog_id": product.catalog_id,
            "cost_price": float(product.cost_price or 0.0),
            "selling_price": float(product.selling_price or 0.0),
            "min_stock_threshold": product.min_stock_threshold,
            "description": product.description,
            "main_image": product.main_image
        }

        # 3. إرسال البيانات للمراقبة
        log_product_data_update(db, current_user.id, product.id, old_snapshot, new_snapshot)
        
        product.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(product)
        return {"status": "success", "message": "تم التحديث بنجاح", "data": product}
    except Exception as e:
        db.rollback()
        if saved_path and os.path.exists(saved_path): os.remove(saved_path)
        raise e

        
@router.get("/dashboard", response_model=List[ProductDashboardItem])
def get_products_dashboard(
    offset: int = Query(0, ge=0, description="عدد العناصر التي تم تخطيها"),
    limit: int = Query(20, ge=1, le=100, description="عدد العناصر المراد جلبها في كل سحبة"),
    search: Optional[str] = Query(None, description="بحث بالاسم أو الكود"),
    catalog_id: Optional[int] = Query(None, description="فلترة بالتصنيف"),
    size_id: Optional[int] = Query(None, description="فلترة بمعرف المقاس"),
    size_name: Optional[str] = Query(None, description="فلترة باسم المقاس"),
    out_of_stock: bool = Query(False),
    low_stock: bool = Query(False),
    db: Session = Depends(get_db),
    current_user = Depends(RoleChecker([1, 2, 3]))
):
    try:
        # بناء الاستعلام الأساسي مع استبعاد المحذوفات
        query = db.query(Product).filter(Product.deleted_at == None)

        # 1. الفلترة بالبحث
        if search and isinstance(search, str) and search.strip():
            search_term = f"%{search.strip()}%"
            query = query.filter(or_(
                Product.name.ilike(search_term),
                Product.code.ilike(search_term)
            ))

        # 2. الفلترة بالكتالوج
        if catalog_id and isinstance(catalog_id, int):
            query = query.filter(Product.catalog_id == catalog_id)

        # 3. الربط للفلترة بالمقاس أو المخزون المنخفض
        clean_size_name = size_name.strip() if (size_name and isinstance(size_name, str)) else None
        valid_size_id = size_id if (size_id and isinstance(size_id, int)) else None
        if valid_size_id or clean_size_name or low_stock is True:
            query = query.join(
                ProductColor, 
                and_(Product.id == ProductColor.product_id, ProductColor.deleted_at == None)
            ).join(
                ProductVariant, 
                and_(ProductColor.id == ProductVariant.product_color_id, ProductVariant.deleted_at == None)
            )
            
            if valid_size_id:
                query = query.filter(ProductVariant.size_id == valid_size_id)

            if clean_size_name:
                query = query.join(
                    Size,
                    and_(ProductVariant.size_id == Size.id, Size.deleted_at == None)
                ).filter(Size.name.ilike(clean_size_name))

            if low_stock is True:
                query = query.filter(
                    ProductVariant.quantity_available <= ProductVariant.min_stock_threshold
                )
            
            query = query.distinct()

        if out_of_stock is True:
            query = query.filter(Product.total_available <= 0)

        safe_offset = offset if isinstance(offset, int) else 0
        safe_limit = limit if isinstance(limit, int) else 20

        # جلب البيانات باستخدام offset و limit للتحميل اللانهائي
        products = query.options(selectinload(Product.colors)) \
                        .order_by(Product.created_at.desc()) \
                        .offset(safe_offset) \
                        .limit(safe_limit) \
                        .all()

        items = []
        for p in products:
            # استخراج صور الألوان النشطة (image_2c2b38.png)
            active_color_images = [
                c.color_image for c in p.colors 
                if c.deleted_at is None and c.color_image is not None
            ]
            
            # منطق الصورة الاحترافي:
            # 1. الصورة الأساسية للمنتج أولاً
            # 2. إذا لم توجد، يأخذ أول صورة من المتغيرات (الألوان)
            # 3. إذا لم يوجد شيء، يبقى None (أو نص فارغ حسب الـ Schema)
            display_main_image = p.main_image
            if not display_main_image and active_color_images:
                display_main_image = active_color_images[0]

            items.append(ProductDashboardItem(
                id=p.id,
                name=p.name,
                code=p.code,
                main_image=display_main_image, # ستكون None إذا لم تتوفر أي صورة
                selling_price=p.selling_price or 0.0,
                total_available=p.total_available or 0,
                total_reserved=p.total_reserved or 0,
                total_sold=p.total_sold or 0,
                color_images=active_color_images
            ))

        return items

    except Exception as e:
        print(f"Developer Log - Error: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail="فشل جلب البيانات، تأكد من اتصالات قاعدة البيانات"
        )



def _no_pdf_match_message(size_name):
    """رسالة تشرح سبب عدم وجود نتائج بدل "لا توجد منتجات" المبهمة.

    أشهر سبب فعلي: المقاس موجود في القائمة لكن كل مقاساته في المنتجات محذوفة
    (المقاس يُنشأ في قاعدة البيانات لحظة كتابته في نموذج المنتج، فيبقى في
    القائمة حتى لو لم يُربط بأي منتج).
    """
    if size_name:
        return (
            f"لا يوجد أي منتج مرتبط بالمقاس '{size_name}' حالياً. "
            "تأكد أن المقاس مُضاف فعلاً داخل أحد المنتجات وليس في قائمة المقاسات فقط."
        )
    return "لا توجد منتجات مطابقة للفلاتر المختارة لتصديرها"


@router.get("/export-pdf")
def export_products_pdf(
    size_name: str = Query(None),
    catalog_id: int = Query(None),
    product_name: str = Query(None),
    product_ref: str = Query(None),
    db: Session = Depends(get_db),
    current_user = Depends(RoleChecker([1, 2, 3]))
):
    query = db.query(Product).filter(Product.deleted_at == None).options(
        joinedload(Product.colors).joinedload(ProductColor.variants)
    )

    clean_size_name = size_name.strip() if (size_name and isinstance(size_name, str)) else None
    if clean_size_name:
        query = query.filter(Product.colors.any(ProductColor.variants.any(
            and_(
                ProductVariant.size.has(Size.name.ilike(clean_size_name)),
                ProductVariant.deleted_at == None
            )
        )))

    if catalog_id:
        query = query.filter(Product.catalog_id == catalog_id)

    if product_name:
        query = query.filter(Product.name.icontains(product_name))

    if product_ref:
        query = query.filter(Product.reference == product_ref)

    products_data = query.all()
    if not products_data:
        raise HTTPException(status_code=404, detail=_no_pdf_match_message(clean_size_name))

    # المنتج قد يطابق الفلتر بينما لا يوجد فيه لون واحد صالح للرسم (كل ألوانه
    # محذوفة مثلاً). بدون هذا الفحص كان الرد ملف PDF فيه ترويسة فقط بلا كروت.
    if not build_catalog_display_list(products_data, clean_size_name):
        raise HTTPException(status_code=404, detail=_no_pdf_match_message(clean_size_name))

    try:
        buffer = io.BytesIO()
        generate_catalog_pdf(products_data, buffer, size_name=clean_size_name)
        buffer.seek(0)
        create_system_audit_log(
          db=db,
          user_id=current_user.id, # ستحتاج لإضافة current_user كـ Depends في هذه الدالة
          action_target="report",
          target_id=0,
          action_type="export_pdf",
          details={"type": "catalog"}
          )

        return StreamingResponse(
            buffer, 
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=BELLAGIO_Catalog.pdf"}

        )
    except Exception as e:
        raise HTTPException(status_code=500, detail="فشل في توليد ملف الـ PDF")



@router.get("/variant/{variant_id}")
def export_single_qr(
    variant_id: int,
     db: Session = Depends(get_db),
     current_user = Depends(RoleChecker([1, 2, 3]))
     ):
    """تصدير ملصق QR لمقاس معين (Single Variant)"""
    try:
        # استدعاء الخدمة المعدلة التي تعالج اللغة العربية داخلياً
        pdf_buffer = QRGeneratorService.get_variant_qr_pdf(db, variant_id)
        
        if not pdf_buffer:
            raise HTTPException(
                status_code=404, 
                detail=f"المقاس ذو الرقم {variant_id} غير موجود أو تم حذفه."
            )
            
        return StreamingResponse(
            pdf_buffer, 
            media_type="application/pdf", 
            headers={"Content-Disposition": f"attachment; filename=qr_variant_{variant_id}.pdf"}
        )
    except Exception as e:
        # تسجيل الخطأ داخلياً (Logger) يفضل هنا
        print(f"Error generating single QR: {str(e)}")
        raise HTTPException(status_code=500, detail="فشل في توليد ملف الـ QR.")

@router.get("/product/{product_id}")
def export_product_qrs(
    product_id: int,
     db: Session = Depends(get_db),
     current_user = Depends(RoleChecker([1, 2, 3]))
     ):
    """تصدير ملصقات QR لجميع مقاسات منتج معين (Full Product)"""
    try:
        pdf_buffer = QRGeneratorService.get_product_all_qrs_pdf(db, product_id)
        
        if not pdf_buffer:
            raise HTTPException(
                status_code=404, 
                detail="لا توجد بيانات مقاسات لهذا المنتج أو المنتج غير موجود."
            )

        create_system_audit_log(
         db=db,
         user_id=current_user.id, # ستحتاج لإضافة current_user كـ Depends في هذه الدالة
         action_target="report",
         target_id=0,
         action_type="export_pdf",
         details={"type": "catalog"}
        )     
            
        return StreamingResponse(
            pdf_buffer, 
            media_type="application/pdf", 
            headers={"Content-Disposition": f"attachment; filename=product_{product_id}_qrs.pdf"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail="خطأ في استخراج رموز المنتج.")

@router.get("/all")
def export_all_active_qrs(
    db: Session = Depends(get_db),
    current_user = Depends(RoleChecker([1, 2, 3]))
    ):
    """تصدير ملصقات QR لجميع المنتجات النشطة في المخزون"""
    try:
        pdf_buffer = QRGeneratorService.get_all_active_qrs_pdf(db)
        
        if not pdf_buffer:
            raise HTTPException(
                status_code=404, 
                detail="المخزون فارغ حالياً، لا توجد رموز لتصديرها."
            )

        create_system_audit_log(
            db=db,
            user_id=current_user.id, # ستحتاج لإضافة current_user كـ Depends في هذه الدالة
            action_target="report",
            target_id=0,
            action_type="export_pdf",
            details={"type": "catalog"}
        )    
            
        return StreamingResponse(
            pdf_buffer, 
            media_type="application/pdf", 
            headers={"Content-Disposition": "attachment; filename=all_active_qrs.pdf"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail="فشل في تصدير الرموز الكلية.")


async def refresh_dashboard_ws():
    # نتخطى العمل كلياً إن لم يوجد متصل، ونحسب خارج حلقة الأحداث إن وُجد
    # (الحساب 5 استعلامات ~70 مللي كان يُجمّد الخادم بعد كل تعديل منتج)
    if not manager.has_connections:
        return

    from app.core.database import SessionLocal
    from fastapi.concurrency import run_in_threadpool

    def _compute():
        db = SessionLocal()
        try:
            return get_inventory_dashboard_stats(db)
        finally:
            db.close()

    try:
        stats = await run_in_threadpool(_compute)
        await manager.broadcast(stats)
    except Exception as e:
        print(f"WS refresh error: {e}")


@router.get("/{product_id}/details")
def get_product_full_details(
    product_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(RoleChecker([1, 2, 3])) # الصلاحيات المناسبة
):
    """
    جلب كافة معلومات المنتج التفصيلية:
    - البيانات الأساسية والمالية.
    - معلومات الكتالوج.
    - الألوان المرتبطة وصورها.
    - المقاسات لكل لون مع الكميات والـ QR Code.
    """
    
    # استخدام Eager Loading لتحميل كافة المستويات في استعلام واحد كفؤ
    product = db.query(Product).filter(
        Product.id == product_id, 
        Product.deleted_at == None
    ).options(
        joinedload(Product.catalog), # جلب اسم الكتالوج
        selectinload(Product.colors) # جلب الألوان
            .selectinload(ProductColor.variants) # جلب المقاسات داخل الألوان
            .joinedload(ProductVariant.size) # جلب اسم المقاس
    ).first()

    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="المنتج غير موجود أو تم حذفه مسبقاً."
        )

    # تجهيز مصفوفة الألوان مع تصفية المحذوف منها
    processed_colors = []
    for color in product.colors:
        if color.deleted_at is not None:
            continue
            
        processed_variants = []
        for variant in color.variants:
            if variant.deleted_at is not None:
                continue
            
            processed_variants.append({
                "id": variant.id,
                "size_id": variant.size_id,
                "size_name": variant.size.name if variant.size else "N/A",
                "quantity_available": variant.quantity_available,
                "qr_code": variant.qr_code,
                "variant_sku": variant.variant_sku
            })
            
        processed_colors.append({
            "id": color.id,
            "color_name": color.color_name,
            "color_image": color.color_image,
            "variants": processed_variants
        })

    # إرجاع البيانات النهائية متوافقة مع الـ Schema
    return {
        "id": product.id,
        "name": product.name,
        "code": product.code,
        "description": product.description,
        "catalog_id": product.catalog_id,
        "catalog_name": product.catalog.name if product.catalog else None,
        "main_image": product.main_image,
        "selling_price": product.selling_price or 0.0,
        "cost_price": product.cost_price or 0.0,
        "min_stock_threshold": product.min_stock_threshold or 0,
        "total_available": product.total_available or 0,
        "total_reserved": product.total_reserved or 0,
        "total_sold": product.total_sold or 0,
        "colors": processed_colors
    }        

    