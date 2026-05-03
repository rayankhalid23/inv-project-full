import os
import uuid
import shutil
import math
import arabic_reshaper
from bidi.algorithm import get_display
import io
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, Form, File, UploadFile, status, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload, selectinload
from sqlalchemy import or_, and_, func

# استيراد الموديلات والخدمات الخاصة بالمشروع
from app.core.database import get_db
from app.core.deps import RoleChecker
from app.models.user import User
from app.models.inventory import Product, ProductColor, ProductVariant
from app.schemas.product_display import PaginatedProductDashboard, ProductDeepDiveOut, ProductDashboardItem 
from app.schemas.inventory import VariantUpdatePartial
from app.services.qr_service import QRGeneratorService
from app.services.pdf_generator import generate_catalog_pdf
from app.crud.inventory_sync import sync_product_metrics
from app.utils import delete_old_image

router = APIRouter(prefix="/products", tags=["Products"])
UPLOAD_DIR = "static/uploads/products"

# التأكد من وجود مجلد الرفع
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_product(
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
    # تحققات السلامة (Validation)
    if not name or name.strip().lower() == "string":
        raise HTTPException(status_code=400, detail="اسم المنتج غير صالح أو فارغ")
    
    try:
        if db.query(Product).filter(Product.name == name, Product.deleted_at == None).first():
            raise HTTPException(status_code=400, detail="هذا الاسم موجود مسبقاً")

        # حفظ الصورة
        image_path = None
        if image_file and image_file.filename:
            try:
                ext = os.path.splitext(image_file.filename)[1]
                filename = f"{uuid.uuid4().hex}{ext}"
                image_path = os.path.join(UPLOAD_DIR, filename)
                with open(image_path, "wb") as buffer:
                    shutil.copyfileobj(image_file.file, buffer)
            except Exception as e:
                raise HTTPException(status_code=500, detail="حدث خطأ أثناء حفظ صورة المنتج")

        # إنشاء المنتج مع كود تلقائي
        last_p = db.query(Product).order_by(Product.id.desc()).first()
        product_code = str((last_p.id + 1) if last_p else 1)

        new_product = Product(
            name=name, catalog_id=catalog_id, selling_price=selling_price,
            cost_price=cost_price, min_stock_threshold=min_stock_threshold,
            description=description, code=product_code, main_image=image_path,
            created_by=current_user.id
        )
        db.add(new_product)
        db.commit()
        db.refresh(new_product)
        return {"status": "success", "data": new_product}
    
    except HTTPException as he:
        raise he
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"خطأ غير متوقع: {str(e)}")


@router.put("/{product_id}", status_code=status.HTTP_200_OK)
async def update_product(
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
    # 1. البحث عن المنتج
    product = db.query(Product).filter(Product.id == product_id, Product.deleted_at == None).first()
    if not product:
        raise HTTPException(status_code=404, detail="المنتج غير موجود أو قد تم حذفه.")

    # 2. تحديث الاسم
    if name is not None:
        clean_name = name.strip()
        if clean_name and clean_name.lower() != "string" and clean_name != product.name:
            existing = db.query(Product).filter(Product.name == clean_name, Product.id != product_id, Product.deleted_at == None).first()
            if existing:
                raise HTTPException(status_code=400, detail="هذا الاسم مستخدم لمنتج آخر بالفعل.")
            product.name = clean_name

    # 3. تحديث الحقول الرقمية
    if catalog_id is not None and catalog_id > 0:
        product.catalog_id = catalog_id
    
    if selling_price is not None and selling_price > 0:
        product.selling_price = selling_price
        
    if cost_price is not None and cost_price > 0:
        product.cost_price = cost_price
        
    if min_stock_threshold is not None and min_stock_threshold >= 0:
        product.min_stock_threshold = min_stock_threshold

    # 4. تحديث الوصف
    if description is not None:
        clean_desc = description.strip()
        if clean_desc and clean_desc.lower() != "string":
            product.description = clean_desc

    # 5. معالجة الصورة
    saved_path = None
    if image_file and image_file.filename:
        try:
            old_image_path = product.main_image
            ext = os.path.splitext(image_file.filename)[1]
            filename = f"{uuid.uuid4().hex}{ext}"
            saved_path = os.path.join(UPLOAD_DIR, filename)
            
            with open(saved_path, "wb") as buffer:
                shutil.copyfileobj(image_file.file, buffer)
            
            product.main_image = saved_path
            
            if old_image_path and os.path.exists(old_image_path):
                try: os.remove(old_image_path)
                except: pass
        except Exception as e:
            raise HTTPException(status_code=500, detail="فشل في معالجة وحفظ الصورة الجديدة.")

    # 6. الحفظ النهائي
    try:
        product.updated_at = datetime.utcnow() 
        db.commit()
        db.refresh(product)
        return {"status": "success", "message": "تم التحديث بنجاح", "data": product}
    except Exception as e:
        db.rollback()
        if saved_path and os.path.exists(saved_path):
            os.remove(saved_path)
        raise HTTPException(status_code=500, detail="حدث خطأ في قاعدة البيانات أثناء محاولة تحديث المنتج.")


@router.get("/dashboard", response_model=PaginatedProductDashboard)
async def get_products_dashboard(
    page: int = Query(1, ge=1, description="رقم الصفحة"),
    size: int = Query(20, ge=1, le=100, description="عدد العناصر في الصفحة"),
    search: Optional[str] = Query(None, description="بحث بالاسم أو الكود"),
    catalog_id: Optional[int] = Query(None, description="فلترة بالتصنيف"),
    out_of_stock: bool = Query(False, description="عرض المنتجات المنتهية فقط"),
    low_stock: bool = Query(False, description="عرض المنتجات التي بها مقاس وصل للحد الأدنى"),
    db: Session = Depends(get_db),
    current_user = Depends(RoleChecker([1, 2, 3]))
):
    try:
        query = db.query(Product).filter(Product.deleted_at == None)

        if search:
            search_term = f"%{search}%"
            query = query.filter(or_(Product.name.ilike(search_term), Product.code.ilike(search_term)))
        
        if catalog_id:
            query = query.filter(Product.catalog_id == catalog_id)

        if out_of_stock:
            query = query.filter(Product.total_available == 0)

        if low_stock:
            query = query.filter(
                Product.colors.any(
                    and_(
                        ProductColor.deleted_at == None,
                        ProductColor.variants.any(
                            and_(
                                ProductVariant.deleted_at == None,
                                ProductVariant.quantity_available <= ProductVariant.min_stock_threshold
                            )
                        )
                    )
                )
            )

        total_items = query.count()
        if total_items == 0:
            return PaginatedProductDashboard(total_items=0, total_pages=0, current_page=page, items=[])

        total_pages = math.ceil(total_items / size)
        products = query.options(selectinload(Product.colors)).order_by(Product.created_at.desc()).offset((page - 1) * size).limit(size).all()

        items = []
        for p in products:
            active_color_images = [c.color_image for c in p.colors if c.deleted_at is None and c.color_image is not None]
            items.append(ProductDashboardItem(
                id=p.id, name=p.name, code=p.code, main_image=p.main_image,
                selling_price=p.selling_price, total_available=p.total_available,
                total_reserved=p.total_reserved, total_sold=p.total_sold,
                color_images=active_color_images
            ))

        return PaginatedProductDashboard(total_items=total_items, total_pages=total_pages, current_page=page, items=items)
    except Exception as e:
        raise HTTPException(status_code=500, detail="حدث خطأ أثناء جلب بيانات لوحة التحكم")


@router.get("/{product_id}/details", response_model=ProductDeepDiveOut)
async def get_product_details(
    product_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(RoleChecker([1, 2, 3]))
):
    product = db.query(Product).filter(Product.id == product_id, Product.deleted_at == None).options(
        selectinload(Product.colors).selectinload(ProductColor.variants).joinedload(ProductVariant.size)
    ).first()

    if not product:
        raise HTTPException(status_code=404, detail="المنتج غير موجود أو تم حذفه.")

    tree_colors = []
    for color in product.colors:
        if color.deleted_at is not None: continue
            
        tree_variants = []
        for variant in color.variants:
            if variant.deleted_at is not None: continue
            tree_variants.append({
                "id": variant.id,
                "size_name": variant.size.name if variant.size else "N/A",
                "quantity_available": variant.quantity_available,
                "qr_code": variant.qr_code
            })
            
        tree_colors.append({
            "id": color.id,
            "color_name": color.color_name,
            "color_image": color.color_image,
            "variants": tree_variants
        })

    return {
        "id": product.id, "name": product.name, "description": product.description,
        "selling_price": product.selling_price, "main_image": product.main_image,
        "colors": tree_colors
    }


@router.get("/export-pdf")
def export_products_pdf(
    size_name: str = Query(None),
    category_id: int = Query(None),
    product_name: str = Query(None),
    product_ref: str = Query(None),
    db: Session = Depends(get_db)
):
    query = db.query(Product).filter(Product.deleted_at == None).options(
        joinedload(Product.colors).joinedload(ProductColor.variants)
    )

    if size_name:
        query = query.filter(Product.colors.any(ProductColor.variants.any(
            and_(ProductVariant.size.has(name=size_name), ProductVariant.quantity_available > 0, ProductVariant.deleted_at == None)
        )))

    if category_id:
        query = query.filter(Product.category_id == category_id)

    if product_name:
        query = query.filter(Product.name.icontains(product_name))

    if product_ref:
        query = query.filter(Product.reference == product_ref)

    products_data = query.all()
    if not products_data:
        raise HTTPException(status_code=404, detail="لا توجد منتجات مطابقة للبحث لتصديرها")

    try:
        buffer = io.BytesIO()
        generate_catalog_pdf(products_data, buffer)
        buffer.seek(0)
        return StreamingResponse(
            buffer, 
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=BELLAGIO_Catalog.pdf"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail="فشل في توليد ملف الـ PDF")



@router.get("/variant/{variant_id}")
def export_single_qr(variant_id: int, db: Session = Depends(get_db)):
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
def export_product_qrs(product_id: int, db: Session = Depends(get_db)):
    """تصدير ملصقات QR لجميع مقاسات منتج معين (Full Product)"""
    try:
        pdf_buffer = QRGeneratorService.get_product_all_qrs_pdf(db, product_id)
        
        if not pdf_buffer:
            raise HTTPException(
                status_code=404, 
                detail="لا توجد بيانات مقاسات لهذا المنتج أو المنتج غير موجود."
            )
            
        return StreamingResponse(
            pdf_buffer, 
            media_type="application/pdf", 
            headers={"Content-Disposition": f"attachment; filename=product_{product_id}_qrs.pdf"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail="خطأ في استخراج رموز المنتج.")

@router.get("/all")
def export_all_active_qrs(db: Session = Depends(get_db)):
    """تصدير ملصقات QR لجميع المنتجات النشطة في المخزون"""
    try:
        pdf_buffer = QRGeneratorService.get_all_active_qrs_pdf(db)
        
        if not pdf_buffer:
            raise HTTPException(
                status_code=404, 
                detail="المخزون فارغ حالياً، لا توجد رموز لتصديرها."
            )
            
        return StreamingResponse(
            pdf_buffer, 
            media_type="application/pdf", 
            headers={"Content-Disposition": "attachment; filename=all_active_qrs.pdf"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail="فشل في تصدير الرموز الكلية.")
