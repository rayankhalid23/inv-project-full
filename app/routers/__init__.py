from fastapi import APIRouter, Depends
from app.core.deps import get_current_user

# استيراد الرواتر بشكل نظيف ومرة واحدة فقط
from .auth import router as auth_router
from .users import router as users_router
from .catalogs import router as catalogs_router
from .sizes import router as sizes_router
from .colors import router as colors_router
from .products import router as products_router
from .variants import router as variants_router
from .inventory_movement_router import router as inventory_router
from .order_router import router as orders_router
from .Reporting import router as analytics_router

# المجمع الرئيسي
api_router = APIRouter()

# 1. مسار تسجيل الدخول (بدون حماية Depends لكي يتمكن المستخدم من الدخول)
api_router.include_router(auth_router, prefix="/auth", tags=["Auth"])

# 2. المسارات المحمية (تطلب توكن get_current_user)
protected_dependencies = [Depends(get_current_user)]

api_router.include_router(users_router, prefix="/users", tags=["Users"], dependencies=protected_dependencies)
api_router.include_router(catalogs_router, prefix="/catalogs", tags=["Catalogs"], dependencies=protected_dependencies)
api_router.include_router(sizes_router, prefix="/sizes", tags=["Sizes"], dependencies=protected_dependencies)
api_router.include_router(colors_router, prefix="/colors", tags=["Colors"], dependencies=protected_dependencies)
api_router.include_router(products_router, prefix="/products", tags=["Products"], dependencies=protected_dependencies)
api_router.include_router(variants_router, prefix="/variants", tags=["Variants"], dependencies=protected_dependencies)
api_router.include_router(inventory_router, prefix="/inventory", tags=["Inventory"], dependencies=protected_dependencies)
api_router.include_router(orders_router, prefix="/orders", tags=["Orders"], dependencies=protected_dependencies)
api_router.include_router(analytics_router, prefix="/analytics", tags=["Analytics & Reports"], dependencies=protected_dependencies)