from fastapi import APIRouter, Depends, Body, Query, HTTPException
from sqlalchemy import and_, case, func
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from app.core.database import SessionLocal
from app.core.database import get_db
from app.core.deps import get_current_active_user
from app.schemas.catalog import CatalogCreate, CatalogUpdate, CatalogResponse
from app.models.user import User
from app.crud import catalog as crud_catalog
from app.models.inventory import Catalog, Product, ProductColor, ProductVariant
from app.core.deps import RoleChecker
from app.crud.catalog import create_catalog,toggle_catalog_status, update_catalog
from app.utils import delete_old_image

router = APIRouter(tags=["Catalogs"])



@router.get("/names-only", response_model=List[dict])
def get_catalog_names_for_filter(
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker([1, 2, 3]))
):
    """كل الكتالوجات النشطة، مع عدد المنتجات وعدد المقاسات المتوفرة فعلاً في كلٍّ منها.

    العدّادان ليسا زينة: تصدير الـ PDF يرسم فقط ما له مقاس بكمية > 0، فبدونهما
    كان المستخدم يختار كتالوجاً يبدو عادياً في القائمة ثم يفاجأ برسالة "لا يوجد
    ما يُرسَم". الآن الكتالوج الفارغ أو النافد ظاهر قبل الاختيار.
    """
    try:
        # نحن نحتاج فقط المعرف والاسم للكتالوجات النشطة وغير المحذوفة
        rows = (
            db.query(
                Catalog.id,
                Catalog.name,
                func.count(func.distinct(Product.id)).label("products_count"),
                func.count(func.distinct(
                    case((ProductVariant.quantity_available > 0, ProductVariant.id))
                )).label("in_stock_count"),
            )
            .outerjoin(Product, and_(Product.catalog_id == Catalog.id,
                                     Product.deleted_at.is_(None)))
            .outerjoin(ProductColor, and_(ProductColor.product_id == Product.id,
                                          ProductColor.deleted_at.is_(None)))
            .outerjoin(ProductVariant, and_(ProductVariant.product_color_id == ProductColor.id,
                                            ProductVariant.deleted_at.is_(None)))
            .filter(Catalog.deleted_at.is_(None), Catalog.is_active.is_(True))
            .group_by(Catalog.id, Catalog.name)
            .order_by(Catalog.name.asc())
            .all()
        )

        # تحويل النتائج إلى قائمة قواميس بسيطة
        return [
            {
                "id": r.id,
                "name": r.name,
                "products_count": int(r.products_count or 0),
                "in_stock_count": int(r.in_stock_count or 0),
            }
            for r in rows
        ]

    except Exception as e:
        print(f"Error fetching catalog names: {str(e)}")
        return []

@router.get("/", response_model=List[CatalogResponse])
def read_catalogs(
    status: Optional[str] = Query("all"),
    db: Session = Depends(get_db), 
    current_user: User = Depends(RoleChecker([1, 2, 3]))
):
    query = db.query(Catalog, User.name.label("creator_name")).outerjoin(User, Catalog.created_by == User.id)
    
    if status in ["active", "نشط"]:
        query = query.filter(Catalog.deleted_at == None, Catalog.is_active == True)
    elif status in ["inactive", "غير نشط"]:
        query = query.filter(Catalog.deleted_at == None, Catalog.is_active == False)
    else:
        query = query.filter(Catalog.deleted_at == None)

    results = query.order_by(Catalog.created_at.desc()).all()
    
    final_result = []
    for catalog_obj, creator_name in results:
        catalog_dict = {c.name: getattr(catalog_obj, c.name) for c in catalog_obj.__table__.columns}
        catalog_dict["creator_name"] = creator_name or "Unknown"
        final_result.append(catalog_dict)
        
    return final_result



@router.post("/", response_model=CatalogResponse)
def add_catalog(
    catalog: CatalogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker([1, 2]))
):
    clean_name = catalog.name.strip()
    if not clean_name or clean_name.lower() == "string":
        raise HTTPException(status_code=422, detail="يرجى إدخال اسم حقيقي للكتالوج")

    existing = db.query(Catalog).filter(Catalog.name == clean_name, Catalog.deleted_at == None).first()
    if existing:
        raise HTTPException(status_code=409, detail="الكتالوج موجود بالفعل")

    catalog.name = clean_name
    new = create_catalog(db, catalog, current_user.id)
    return {**new.__dict__, "creator_name": current_user.name}


@router.put("/{catalog_id}", summary="تعديل اسم الكتالوج")
def update(
    catalog_id: int,
    name: str = Body(..., embed=True),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
    
):
    return crud_catalog.update_catalog(
        db=db, 
        catalog_id=catalog_id, 
        name=name, 
        user_id=current_user.id
    )

@router.patch("/{catalog_id}/toggle", summary="تغيير حالة الكتالوج (نشط/معطل)")
def toggle_status(
    catalog_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    return crud_catalog.toggle_catalog_status(
        db=db, 
        catalog_id=catalog_id, 
        user_id=current_user.id
    )

@router.get("/summary", summary="قائمة الكتالوجات المختصرة")
def read_catalogs_summary(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_active_user)
):
    
    return crud_catalog.get_catalogs_summary(db)