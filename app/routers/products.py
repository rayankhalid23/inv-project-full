<<<<<<< HEAD
import os
import shutil
import uuid
from fastapi import APIRouter, Depends, Form, File, UploadFile, status, HTTPException
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy.orm import joinedload
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.orm import joinedload
from app.models.inventory import Product, ProductColor, ProductVariant, Size
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.crud.inventory_sync import sync_product_metrics
from app.utils import delete_old_image

# استيراد أدوات المشروع
from app.core.deps import RoleChecker
from app.models.inventory import Catalog, Product

router = APIRouter(prefix="/products", tags=["Products"])

# إعدادات المجلد
UPLOAD_DIR = "static/uploads/products"
os.makedirs(UPLOAD_DIR, exist_ok=True)



# ---------------------------------------------------------
#  الدالة المساعدة لحفظ الصور
# ---------------------------------------------------------
def save_image(upload_file: UploadFile) -> str:
    """تحفظ الصورة وتعود بالمسار النسبي"""
    file_extension = os.path.splitext(upload_file.filename)[1]
    unique_filename = f"{uuid.uuid4().hex}{file_extension}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(upload_file.file, buffer)
    return file_path

# ---------------------------------------------------------
# 1. تعديل المنتج (المنطق الذكي والمقارنة)
# ---------------------------------------------------------
@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_product(
    name: str = Form(...),
    catalog_id: int = Form(...),
    selling_price: Optional[float] = Form(None), 
    cost_price: Optional[float] = Form(0.0), # سعر التكلفة افتراضياً 0
    min_stock_threshold: int = Form(5), # القيمة الافتراضية للحد الأدنى هي 5
    description: Optional[str] = Form("null"), # القيمة الافتراضية للوصف نص "null"
    image_file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user = Depends(RoleChecker([1, 2]))
):


    if not name or name.strip() == "" or name == "string":
        raise HTTPException(status_code=400, detail="عذراً، يجب إدخال اسم المنتج، لا يمكن ترك الحقل فارغاً.")


       # --- 3. التحقق من فرادة الاسم ---
    if db.query(Product).filter(Product.name == name).first():
        raise HTTPException(status_code=400, detail="خطأ: هذا الاسم مسجل لمنتج آخر بالفعل.")

    # --- 1. التحقق من صحة الكتالوج (موجود وغير محذوف مؤقتاً) ---
    if catalog_id <= 0:
        raise HTTPException(status_code=400, detail="خطأ: معرف الكتالوج غير صالح.")
    
    # التحقق باستخدام شرط deleted_at == None كما في قاعدة بياناتك
    catalog = db.query(Catalog).filter(Catalog.id == catalog_id, Catalog.deleted_at == None).first()
    if not catalog:
        raise HTTPException(status_code=404, detail="خطأ: الكتالوج المختار غير موجود أو تم نقله لسلة المحذوفات.")

    # --- 2. التحقق الصارم من الأرقام (منع السالب والقيم غير المنطقية) ---
    
    # أ) سعر البيع: إلزامي، رقمي، ولا يقبل السالب
    if selling_price is None:
        raise HTTPException(status_code=400, detail="خطأ: سعر البيع حقل إلزامي.")
    if selling_price < 0:
        raise HTTPException(status_code=400, detail="خطأ: لا يمكن أن يكون سعر البيع رقماً سالباً.")

    # ب) سعر التكلفة: اختياري لكن لا يقبل السالب
    if cost_price < 0:
        raise HTTPException(status_code=400, detail="خطأ: لا يمكن أن يكون سعر التكلفة رقماً سالباً.")

    # ج) الحد الأدنى للمخزون: لا يقبل السالب
    if min_stock_threshold < 0:
        raise HTTPException(status_code=400, detail="خطأ: حد المخزون الأدنى يجب أن يكون 0 أو أكثر.")

 
    # --- 4. توليد الكود التسلسلي الذكي ---
    last_product = db.query(Product).order_by(Product.id.desc()).first()
    next_id = (last_product.id + 1) if last_product else 1
    product_code = str(next_id)

    # --- 5. معالجة ملف الصورة ---
    image_path = save_image(image_file) if (image_file and image_file.filename) else None

    # --- 6. حفظ المنتج الجديد ---
    try:
        new_product = Product(
            name=name,
            catalog_id=catalog_id,
            selling_price=selling_price,
            cost_price=cost_price,
            min_stock_threshold=min_stock_threshold,
            description=description,
            code=product_code,
            main_image=image_path,
            created_by=current_user.id
        )
        db.add(new_product)
        db.commit()
        db.refresh(new_product)
        
        return {
            "status": "success", 
            "message": f"تم إنشاء المنتج بنجاح. الكود التسلسلي: {product_code}",
            "data": {
                "id": new_product.id,
                "name": new_product.name,
                "prices": {"selling": new_product.selling_price, "cost": new_product.cost_price},
                "min_stock": new_product.min_stock_threshold,
                "description": new_product.description,
                "Code":  new_product.code
            }
        }
    except Exception as e:
        db.rollback()
        # تعليق: ضمان عدم ضياع البيانات في حال حدوث خطأ أثناء الحفظ
        raise HTTPException(status_code=500, detail=f"حدث خطأ غير متوقع أثناء الحفظ: {str(e)}")

# ---------------------------------------------------------
# 2. دالة التعديل المحدثة لتشمل التفاصيل والتحققات الجديدة
# ---------------------------------------------------------
@router.patch("/{product_id}", status_code=status.HTTP_200_OK)
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
    # 1. جلب المنتج الأصلي
    db_product = db.query(Product).filter(Product.id == product_id).first()
    if not db_product:
        raise HTTPException(status_code=404, detail="عذراً، لم نتمكن من العثور على المنتج المطلوب.")

    # 2. تجهيز قائمة بالبيانات القادمة (Filtering)
    raw_data = {
        "name": name,
        "catalog_id": catalog_id,
        "selling_price": selling_price,
        "cost_price": cost_price,
        "min_stock_threshold": min_stock_threshold,
        "description": description
    }
    
    # فلترة ذكية: تجاهل الـ None، الـ "string"، وتجاهل الـ 0 في الكتالوج فقط
    update_data = {}
    for key, value in raw_data.items():
        if value is None or value == "string":
            continue
        # منع اعتماد الصفر كطلب تعديل للكتالوج لتجنب مشاكل القيم الافتراضية
        if key == "catalog_id" and value == 0:
            continue
        update_data[key] = value

    # 3. المنطق الذكي للتحققات (Validation Logic)
    
    # أ- فحص الاسم (فقط إذا تغير وموجود في update_data)
    if "name" in update_data and update_data["name"] != db_product.name:
        if db.query(Product).filter(Product.name == update_data["name"]).first():
            raise HTTPException(status_code=400, detail="الاسم الجديد مسجل لمنتج آخر بالفعل.")

    # ب- فقرة الكتالوج (معدلة بدقة كما طلبت)
    if "catalog_id" in update_data and update_data["catalog_id"] != db_product.catalog_id:
        # البحث عن الكتالوج والتأكد أنه موجود وغير محذوف (deleted_at == None)
        catalog = db.query(Catalog).filter(
            Catalog.id == update_data["catalog_id"], 
            Catalog.deleted_at == None
        ).first()
        
        if not catalog:
            raise HTTPException(
                status_code=404, 
                detail="خطأ: الكتالوج الجديد المختار غير موجود أو تم حذفه من النظام."
            )

    # ج- فحص القيم الرقمية (منع السالب)
    for field in ["selling_price", "cost_price", "min_stock"]:
        if field in update_data and update_data[field] < 0:
            raise HTTPException(status_code=400, detail=f"خطأ: لا يمكن قبول قيمة سالبة في حقل {field}.")

    # 4. معالجة استبدال الصورة
    if image_file and image_file.filename:
        new_image_path = save_image(image_file)
        if db_product.main_image and os.path.exists(db_product.main_image):
            try:
                os.remove(db_product.main_image)
            except Exception as e:
                print(f"فشل حذف الملف القديم: {e}")
        db_product.main_image = new_image_path

    # 5. التحديث الديناميكي باستخدام setattr
    for key, value in update_data.items():
        setattr(db_product, key, value)

    # 6. الحفظ النهائي
    try:
        db.commit()
        db.refresh(db_product)
        return {
            "status": "success",
            "message": "تم تحديث بيانات المنتج بنجاح واحترافية.",
            "updated_fields": list(update_data.keys())
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"حدث خطأ برمجياً أثناء الحفظ: {str(e)}")


# ---------------------------------------------------------
# 4. جلب تفاصيل المنتج (لعرض القيم القديمة في الخانات)
# ---------------------------------------------------------

class VariantOut(BaseModel):
    id: int
    size_name: str
    quantity_available: int
    quantity_reserved: int
    returned_quantity: int  # أضفنا المرتجع
    damaged_quantity: int   # أضفنا التالف
    qr_code: Optional[str]

    class Config:
        from_attributes = True

class ColorOut(BaseModel):
    id: int
    color_name: str
    color_image: Optional[str]
    variants: List[VariantOut]

    class Config:
        from_attributes = True

class ProductFullDetails(BaseModel):
    id: int
    name: str
    code: str
    description: Optional[str]
    main_image: Optional[str]
    # البيانات المالية والمخزون
    cost_price: float
    selling_price: float
    min_stock_threshold: int
    total_available: int
    total_reserved: int
    total_sold: int
    total_returns: int
    total_damaged: int
    # قائمة الألوان والمقاسات
    colors: List[ColorOut]

    class Config:
        from_attributes = True

@router.get("/{product_id}/full-details", response_model=ProductFullDetails)
async def get_product_full_details(
    product_id: int, 
    db: Session = Depends(get_db)
):
    # جلب المنتج مع كافة علاقاته بضربة واحدة
    product = db.query(Product).options(
        joinedload(Product.colors)
        .joinedload(ProductColor.variants)
        .joinedload(ProductVariant.size)
    ).filter(
        Product.id == product_id,
        Product.deleted_at == None
    ).first()

    if not product:
        raise HTTPException(status_code=404, detail="المنتج غير موجود")

    # بناء الاستجابة المتكاملة
    return {
        "id": product.id,
        "name": product.name,
        "code": product.code,
        "description": product.description,
        "main_image": product.main_image,
        "cost_price": float(product.cost_price),
        "selling_price": float(product.selling_price),
        "min_stock_threshold": product.min_stock_threshold,
        "total_available": product.total_available,
        "total_reserved": product.total_reserved,
        "total_sold": product.total_sold,
        "total_returns": product.total_returns,
        "total_damaged": product.total_damaged,
        "colors": [
            {
                "id": color.id,
                "color_name": color.color_name,
                "color_image": color.color_image,
                "variants": [
                    {
                        "id": variant.id,
                        "size_name": variant.size.name if variant.size else "N/A",
                        "quantity_available": variant.quantity_available,
                        "quantity_reserved": variant.quantity_reserved,
                        "returned_quantity": variant.returned_quantity,
                        "damaged_quantity": variant.damaged_quantity,
                        "qr_code": variant.qr_code
                    }
                    for variant in color.variants if variant.deleted_at is None
                ]
            }
            for color in product.colors if color.deleted_at is None
        ]
    }



# 1. حذف متغير (فك ارتباط مقاس)
@router.delete("/variant/{variant_id}")
async def delete_variant_link(variant_id: int, db: Session = Depends(get_db)):
    # جلب المتغير بغض النظر عن حالته أولاً للتحقق
    variant = db.query(ProductVariant).filter(ProductVariant.id == variant_id).first()
    
    # التحقق من وجود السجل أصلاً في قاعدة البيانات
    if not variant: 
        raise HTTPException(status_code=404, detail="عذراً، هذا الارتباط غير موجود في النظام.")
    
    # التحقق مما إذا كان السجل محذوفاً مسبقاً (الرسالة التي طلبتها)
    if variant.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="هذا الارتباط محذوف بالفعل مسبقاً ولا يمكن حذفه مرة أخرى."
        )
    
    try:
        p_id = variant.color.product_id # لحساب المخزن لاحقاً
        
        # مسح الصورة فيزيائياً
        if variant.qr_code: 
            delete_old_image(variant.qr_code)
        
        # تنفيذ الحذف الناعم
        variant.deleted_at = datetime.utcnow()
        db.commit()
        
        # تحديث ميزانيات المخزون
        sync_product_metrics(db, p_id)
        
        return {"detail": "تم فك ارتباط المقاس باللون بنجاح"}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"حدث خطأ أثناء عملية الحذف: {str(e)}")
# 2. حذف لون (يتحمل مسؤولية حذف مقاساته)
@router.delete("/color/{color_id}")
async def delete_color_and_its_variants(color_id: int, db: Session = Depends(get_db)):
    color = db.query(ProductColor).filter(ProductColor.id == color_id).first()
    if not color: 
        raise HTTPException(status_code=404, detail="اللون غير موجود")
    
    if color.deleted_at is not None:
        raise HTTPException(status_code=400, detail="هذا اللون محذوف بالفعل مسبقاً.")

    p_id = color.product_id

    try:
        # البحث عن المتغيرات (المقاسات) التابعة
        variants = db.query(ProductVariant).filter(
            ProductVariant.product_color_id == color_id,
            ProductVariant.deleted_at == None
        ).all()

        # تحديثها فرادى لتجنب خطأ التكرار (IntegrityError)
        for v in variants:
            if v.qr_code: 
                delete_old_image(v.qr_code)
            v.deleted_at = datetime.utcnow()
            # إجابة لسؤالك السابق: هذا يضمن بقاء المقاس في جدول الـ Size وحذف الارتباط فقط

        if color.color_image: 
            delete_old_image(color.color_image)
        
        color.deleted_at = datetime.utcnow()
        
        db.commit()
        sync_product_metrics(db, p_id)
        return {"detail": "تم حذف اللون وجميع المقاسات المرتبطة به بنجاح"}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"فشل الحذف بسبب تضارب في البيانات: {str(e)}")
# 3. حذف المنتج (المسؤولية الكاملة)
@router.delete("/product/{product_id}")
async def delete_full_product(product_id: int, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product: 
        raise HTTPException(status_code=404, detail="المنتج غير موجود")
    
    if product.deleted_at is not None:
        raise HTTPException(status_code=400, detail="هذا المنتج محذوف بالفعل مسبقاً.")

    try:
        # حذف الألوان (الأبناء)
        colors = db.query(ProductColor).filter(
            ProductColor.product_id == product_id,
            ProductColor.deleted_at == None
        ).all()

        for c in colors:
            # حذف متغيرات كل لون (الأحفاد) بشكل فردي
            variants = db.query(ProductVariant).filter(
                ProductVariant.product_color_id == c.id,
                ProductVariant.deleted_at == None
            ).all()
            
            for v in variants:
                if v.qr_code: 
                    delete_old_image(v.qr_code)
                v.deleted_at = datetime.utcnow()
            
            if c.color_image: 
                delete_old_image(c.color_image)
            c.deleted_at = datetime.utcnow()

        if product.main_image: 
            delete_old_image(product.main_image)
        
        product.deleted_at = datetime.utcnow()
        
        db.commit()
        return {"detail": "تم حذف المنتج وكافة ملحقاته بنجاح"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"حدث خطأ أثناء تصفية المنتج: {str(e)}")
=======
import os, tempfile
from fastapi import APIRouter, Depends, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
from fpdf import FPDF
from app.core.database import get_db
from app.models.inventory import ProductVariant, ProductColor, Product

router = APIRouter(prefix="/products", tags=["Products"])

@router.get("/export-all-pdf")
async def export_all_products_pdf(catalog_id: Optional[int] = Query(None), db: Session = Depends(get_db)):
    query = db.query(ProductVariant).options(joinedload(ProductVariant.color).joinedload(ProductColor.product), joinedload(ProductVariant.size))
    if catalog_id: query = query.join(ProductColor).join(Product).filter(Product.catalog_id == catalog_id)
    variants = query.filter(ProductVariant.deleted_at == None).all()
    
    pdf = FPDF()
    pdf.add_page()
    # (هنا يوضع منطق رسم البطاقات كما في الكود السابق)
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        pdf.output(tmp.name)
        return FileResponse(tmp.name, filename="Catalog.pdf")
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
