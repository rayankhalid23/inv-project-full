# app/models/__init__.py
from app.models.base import Base
from app.models.role import Role
<<<<<<< HEAD
from app.core.database import Base
from app.models.user import User
from .order import Order, OrderItem, OrderAction
from app.models.inventory import Catalog, Product, Size, ProductColor, ProductVariant

__all__ = ["Base", "Role", "User", "Catalog", "Product", "Size", "ProductColor","Order", "OrderItem", "OrderAction"]
=======
from app.models.user import User
from app.models.inventory import Catalog, Product, Size, ProductColor

__all__ = ["Base", "Role", "User", "Catalog", "Product", "Size", "ProductColor"]
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
