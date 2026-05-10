from fastapi import APIRouter, Depends, Body, Query, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from app.core.database import get_db
from app.core.deps import get_current_active_user
from app.schemas.catalog import CatalogCreate, CatalogUpdate, CatalogResponse
from app.models.user import User
from app.crud import catalog as crud_catalog
from app.models.inventory import Catalog , Product 
from app.core.deps import RoleChecker
from app.crud.catalog import create_catalog,toggle_catalog_status, update_catalog
from app.utils import delete_old_image

router = APIRouter(prefix="/catalogs", tags=["Catalogs"])

@router.get("/", response_model=List[CatalogResponse])
def read_catalogs(
    status: str = Query("active", enum=["active", "inactive", "deleted", "all"]),
    db: Session = Depends(get_db), 
    current_user: User = Depends(RoleChecker([1, 2, 3]))
):
    query = db.query(Catalog, User.name.label("creator_name")).outerjoin(User, Catalog.created_by == User.id)
    
    if status == "active":
        query = query.filter(Catalog.deleted_at == None, Catalog.is_active == True)
    elif status == "inactive":
        query = query.filter(Catalog.deleted_at == None, Catalog.is_active == False)
    elif status == "deleted":
        query = query.filter(Catalog.deleted_at != None)
    elif status == "all":
        query = query.filter(Catalog.deleted_at == None)

    results = query.order_by(Catalog.created_at.desc()).all()
    
    final_result = []
    for catalog_obj, creator_name in results:
        catalog_dict = catalog_obj.__dict__.copy()
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