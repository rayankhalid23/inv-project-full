from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
<<<<<<< HEAD
from typing import List, Optional
from app.core.database import get_db
from app.schemas.catalog import CatalogCreate, CatalogUpdate, CatalogResponse
from app.models.user import User
from app.models.inventory import Catalog
from app.core.deps import RoleChecker
from app.crud.catalog import create_catalog, update_catalog, delete_catalog, get_catalogs
=======
from typing import List
from app.core.database import get_db
from app.schemas.catalog import CatalogCreate, CatalogUpdate, CatalogResponse
from app.models.user import User as UserModel
from app.models.inventory import Catalog
from app.core.deps import RoleChecker
from app.crud.catalog import create_catalog, update_catalog, delete_catalog
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac

router = APIRouter(prefix="/catalogs", tags=["Catalogs"])

@router.get("/", response_model=List[CatalogResponse])
<<<<<<< HEAD
def read_catalogs(
    status: str = Query("all", enum=["active", "inactive", "deleted", "all"]),
    db: Session = Depends(get_db), 
    current_user: User = Depends(RoleChecker([1, 2, 3]))
):
    # استخدام Join لجلب اسم المستخدم مباشرة من قاعدة البيانات بدلاً من Loop (أداء أسرع)
    query = db.query(Catalog, User.name.label("creator_name")).outerjoin(User, Catalog.created_by == User.id)
    
    # منطق الفرز الدقيق:
    if status == "active":
        # الكتالوجات المفعلة وغير المحذوفة
        query = query.filter(Catalog.deleted_at == None, Catalog.is_active == True)
        
    elif status == "inactive":
        # الكتالوجات المعطلة وغير المحذوفة
        query = query.filter(Catalog.deleted_at == None, Catalog.is_active == False)
        
    elif status == "deleted":
        # الكتالوجات المحذوفة فقط (بغض النظر عن حالة تفعيلها)
        query = query.filter(Catalog.deleted_at != None)
        
    elif status == "all":
        # كل شيء باستثناء المحذوفات (المعيار الافتراضي لمعظم لوحات التحكم)
        # إذا كنت تريد "حرفياً" كل شيء حتى المحذوف، امسح الفلتر التالي
        query = query.filter(Catalog.deleted_at == None)

    # تنفيذ الاستعلام وترتيب النتائج من الأحدث للأقدم
    catalogs_data = query.order_by(Catalog.created_at.desc()).all()
    
    # بناء النتيجة النهائية بصيغة نظيفة
    result = []
    for catalog_obj, creator_name in catalogs_data:
        catalog_dict = catalog_obj.__dict__.copy()
        catalog_dict["creator_name"] = creator_name if creator_name else "Unknown"
        result.append(catalog_dict)
        
    return result

@router.post("/", response_model=CatalogResponse)
def add_catalog(
    catalog: CatalogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker([1, 2]))
):
    # تجهيز الاسم وتنظيف المسافات
    catalog_name = catalog.name.strip()

    # 1. منع القيم الافتراضية (string) أو الأسماء الفارغة
    if not catalog_name or catalog_name.lower() == "string":
        raise HTTPException(
            status_code=422, 
            detail="الاسم الافتراضي غير مقبول، يرجى إدخال اسم حقيقي للكتالوج"
        )

    # 2. التحقق من وجود الكتالوج مسبقاً (منع التكرار)
    existing_catalog = db.query(Catalog).filter(
        Catalog.name == catalog_name,
        Catalog.deleted_at == None
    ).first()
    
    if existing_catalog:
        raise HTTPException(
            status_code=409, 
            detail=f"الكتالوج باسم '{catalog_name}' موجود بالفعل"
        )

    # 3. استدعاء دالة الإنشاء مع الاسم النظيف
    catalog.name = catalog_name # تحديث الكائن بالاسم النظيف قبل الحفظ
    new = create_catalog(db, catalog, current_user.id)
    
    return {**new.__dict__, "creator_name": current_user.name}



    return {**new.__dict__, "creator_name": current_user.name}



@router.patch("/{catalog_id}", response_model=CatalogResponse)
def modify_catalog(
    catalog_id: int, 
    catalog_data: CatalogUpdate, # قمنا بتغيير الاسم ليكون أوضح
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker([1, 2]))
):
    # 1. البحث عن الكتالوج المطلوب للتأكد من وجوده
    db_catalog = db.query(Catalog).filter(Catalog.id == catalog_id).first()
    if not db_catalog:
        raise HTTPException(status_code=404, detail="الكتالوج غير موجود")

    # 2. تحويل البيانات القادمة إلى قاموس واستبعاد القيم التي لم تُرسل (None)
    update_data = catalog_data.model_dump(exclude_unset=True)

    # 3. التحقق من الاسم إذا تم إرساله (منع الاسم الفارغ أو "string")
    if "name" in update_data:
        new_name = update_data["name"].strip()
        if not new_name or new_name.lower() == "string":
            raise HTTPException(status_code=400, detail="الاسم الجديد غير صالح")
        
        # التأكد من أن الاسم الجديد لا يسبب تكراراً مع كتالوج آخر
        duplicate = db.query(Catalog).filter(
            Catalog.name == new_name, 
            Catalog.id != catalog_id,
            Catalog.deleted_at == None
        ).first()
        if duplicate:
            raise HTTPException(status_code=409, detail="هذا الاسم مستخدم بالفعل في كتالوج آخر")
        
        db_catalog.name = new_name

    # 4. تحديث حالة النشاط (is_active) إذا تم إرسالها
    if "is_active" in update_data:
        # هنا يتم تحويل القيمة برمجياً: True تصبح 1 و False تصبح 0 تلقائياً بواسطة SQLAlchemy
        db_catalog.is_active = update_data["is_active"]

    # 5. حفظ التغييرات
    db.commit()
    db.refresh(db_catalog)

    # جلب اسم المنشئ للرد (Response)
    user = db.query(User).filter(User.id == db_catalog.created_by).first()
    
    return {
        **db_catalog.__dict__, 
        "creator_name": user.name if user else "Unknown"
    }



@router.delete("/{catalog_id}")
def remove_catalog(
    catalog_id: int,
     action: Optional[str] = Query(None),
      transfer_to_id: Optional[int] = Query(None),
       db: Session = Depends(get_db), 
       current_user: User = Depends(RoleChecker([1, 2]))):
    return delete_catalog(db, catalog_id, action, transfer_to_id)



@router.delete("/{catalog_id}")
async def delete_catalog_and_everything(
    catalog_id: int, 
    db: Session = Depends(get_db),
    current_user = Depends(RoleChecker([1])) # متاح فقط للمدير (Admin)
):
    # 1. البحث عن الكتالوج والتأكد أنه غير محذوف مسبقاً
    catalog = db.query(Catalog).filter(
        Catalog.id == catalog_id, 
        Catalog.deleted_at == None
    ).first()

    if not catalog:
        raise HTTPException(status_code=404, detail="الكتالوج غير موجود أو محذوف بالفعل.")

    try:
        # 2. جلب جميع المنتجات التابعة لهذا الكتالوج
        products = db.query(Product).filter(
            Product.catalog_id == catalog_id, 
            Product.deleted_at == None
        ).all()

        for product in products:
            # أ- حذف ألوان المنتج
            colors = db.query(ProductColor).filter(
                ProductColor.product_id == product.id,
                ProductColor.deleted_at == None
            ).all()

            for color in colors:
                # ب- حذف متغيرات (مقاسات) اللون
                variants = db.query(ProductVariant).filter(
                    ProductVariant.product_color_id == color.id,
                    ProductVariant.deleted_at == None
                ).all()
                
                for v in variants:
                    # مسح ملف الـ QR
                    if v.qr_code:
                        delete_old_image(v.qr_code)
                    v.deleted_at = datetime.utcnow()
                
                # مسح صورة اللون
                if color.color_image:
                    delete_old_image(color.color_image)
                color.deleted_at = datetime.utcnow()

            # ج- مسح الصورة الرئيسية للمنتج وحذفه
            if product.main_image:
                delete_old_image(product.main_image)
            product.deleted_at = datetime.utcnow()

        # 3. أخيراً.. حذف الكتالوج نفسه
        catalog.deleted_at = datetime.utcnow()
        
        db.commit()
        return {
            "status": "success", 
            "message": f"تم حذف الكتالوج '{catalog.name}' وجميع المنتجات والألوان والمقاسات التابعة له بنجاح."
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"فشل حذف الكتالوج وملحقاته: {str(e)}")



@router.patch("/{catalog_id}/restore")
async def restore_catalog_and_contents(
    catalog_id: int, 
    db: Session = Depends(get_db),
    current_user = Depends(RoleChecker([1])) # للمدير فقط
):
    # 1. البحث عن الكتالوج المحذوف
    catalog = db.query(Catalog).filter(
        Catalog.id == catalog_id, 
        Catalog.deleted_at != None # نبحث فقط في المحذوفات
    ).first()

    if not catalog:
        raise HTTPException(status_code=404, detail="الكتالوج غير موجود في سلة المحذوفات.")

    try:
        # 2. استرجاع المنتجات التابعة (التي حُذفت مع الكتالوج)
        # ملاحظة: نستخدم نفس توقيت حذف الكتالوج إذا أردت دقة أعلى، 
        # لكن هنا سنسترجع كل ما هو محذوف تحت هذا الكتالوج.
        products = db.query(Product).filter(
            Product.catalog_id == catalog_id,
            Product.deleted_at != None
        ).all()

        for product in products:
            # أ- استرجاع الألوان
            colors = db.query(ProductColor).filter(
                ProductColor.product_id == product.id,
                ProductColor.deleted_at != None
            ).all()

            for color in colors:
                # ب- استرجاع المتغيرات (المقاسات)
                # ملاحظة: الـ QR لن يعود إذا حُذف فيزيائياً، ستحتاج دالة لإعادة توليده 
                # أو تركه كما هو إذا لم تحذفه فيزيائياً في خطوة الحذف.
                db.query(ProductVariant).filter(
                    ProductVariant.product_color_id == color.id,
                    ProductVariant.deleted_at != None
                ).update({"deleted_at": None})
                
                color.deleted_at = None

            product.deleted_at = None

        # 3. استرجاع الكتالوج نفسه
        catalog.deleted_at = None
        
        db.commit()
        return {
            "status": "success", 
            "message": f"تم استرجاع الكتالوج '{catalog.name}' وكافة محتوياته بنجاح."
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"فشل عملية الاسترجاع: {str(e)}")
=======
def read_catalogs(status: str = Query("active", enum=["active", "deleted", "all"]), db: Session = Depends(get_db), current_user: UserModel = Depends(RoleChecker([1, 2, 3]))):
    query = db.query(Catalog, UserModel.name.label("creator_name")).join(UserModel, Catalog.created_by == UserModel.id)
    if status == "active": query = query.filter(Catalog.deleted_at == None)
    elif status == "deleted": query = query.filter(Catalog.deleted_at != None)
    results = query.all()
    return [{**c[0].__dict__, "creator_name": c[1]} for c in results]

@router.post("/", response_model=CatalogResponse)
def add_catalog(catalog: CatalogCreate, db: Session = Depends(get_db), current_user: UserModel = Depends(RoleChecker([1, 2]))):
    new = create_catalog(db, catalog, current_user.id)
    return {**new.__dict__, "creator_name": current_user.name}
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
