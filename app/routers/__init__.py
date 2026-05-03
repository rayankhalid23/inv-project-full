from fastapi import APIRouter, Depends
from app.core.deps import get_current_user
from .auth import router as auth_router
from .users import router as users_router
from .catalogs import router as catalogs_router
from app.routers.users import router as user_router # تأكد من 'as user_router'
from app.routers.auth import router as auth_router
from .sizes import router as sizes_router
from .colors import router as colors_router
from .products import router as products_router
from .variants import router as variants_router
from .inventory_movement_router import router as inventory_router
from .order_router import router as orders_router


# المجمع الرئيسي
api_router = APIRouter()

# ربط كل شيء هنا بدلاً من ملف main
api_router.include_router(auth_router, tags=["Auth"])


api_router.include_router(users_router, prefix="/users", tags=["Users"],dependencies=[Depends(get_current_user)])
api_router.include_router(catalogs_router, prefix="/catalogs", tags=["Catalogs"],dependencies=[Depends(get_current_user)])
api_router.include_router(sizes_router, prefix="/sizes", tags=["Sizes"],dependencies=[Depends(get_current_user)])
api_router.include_router(colors_router, prefix="/colors", tags=["Colors"],dependencies=[Depends(get_current_user)])
api_router.include_router(products_router, prefix="/products", tags=["Products"],dependencies=[Depends(get_current_user)])
api_router.include_router(variants_router, prefix="/variants", tags=["Variants"], dependencies=[Depends(get_current_user)])
api_router.include_router(inventory_router, prefix="/inventory", tags=["Inventory"],dependencies=[Depends(get_current_user)])
api_router.include_router(orders_router, prefix="/orders", tags=["Orders"],dependencies=[Depends(get_current_user)])
api_router.include_router(inventory_router,prefix="/inventory-movements",tags=["Inventory Management"],dependencies=[Depends(get_current_user)])


