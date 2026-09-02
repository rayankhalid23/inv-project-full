# =============================================================================
# tests/test_variant_filter_visibility.py
# يتحقق أن فلترة المتغيرات (شاشات التوالف/الرواجع/المخزون) لا تُخفي منتجات
# حيّة لمجرد أن *المقاس* مؤرشف أو غير محدد.
# =============================================================================

import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import unittest
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.base import Base
from app.models.inventory import Product, ProductColor, ProductVariant, Size, Catalog
from app.models.user import User
from app.models.role import Role


class TestVariantFilterVisibility(unittest.TestCase):
    """قبل الإصلاح كان الاستعلام يستخدم INNER JOIN على جدول المقاسات مع الشرط
    Size.deleted_at == None، فيختفي المتغيّر بالكامل لمجرد أرشفة المقاس، رغم أن
    المنتج والمتغيّر حيّان ولهما مخزون فعلي."""

    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(cls.engine)
        cls.Session = sessionmaker(bind=cls.engine)

    def setUp(self):
        self.db = self.Session()
        role = Role(name="admin"); self.db.add(role); self.db.flush()
        user = User(name="t", phone="0900000002", password_hash="x", role_id=role.id)
        self.db.add(user); self.db.flush()
        catalog = Catalog(name="ك", created_by=user.id); self.db.add(catalog); self.db.flush()

        self.size_live = Size(name="XL")
        self.size_archived = Size(name="سنة ونص", deleted_at=datetime(2026, 5, 9))
        self.db.add_all([self.size_live, self.size_archived]); self.db.flush()

        def make(name, code, size_id, qty):
            p = Product(name=name, code=code, catalog_id=catalog.id,
                        description="", cost_price=0, selling_price=10)
            self.db.add(p); self.db.flush()
            c = ProductColor(product_id=p.id, color_name="أحمر"); self.db.add(c); self.db.flush()
            self.db.add(ProductVariant(product_color_id=c.id, size_id=size_id, quantity_available=qty))
            self.db.flush()
            return p

        make("منتج بمقاس حيّ", "P-LIVE", self.size_live.id, 5)
        make("منتج بمقاس مؤرشف", "P-ARCH", self.size_archived.id, 27)
        make("منتج بلا مقاس", "P-NOSIZE", None, 3)
        self.db.commit()

    def tearDown(self):
        self.db.rollback()
        for table in reversed(Base.metadata.sorted_tables):
            self.db.execute(table.delete())
        self.db.commit()
        self.db.close()

    def _query(self, size_name=None):
        """يكرر بنية الاستعلام في app/routers/variants.py بعد الإصلاح (OUTER JOIN)."""
        q = self.db.query(
            ProductVariant, Product.name.label("product_name"), Size.name.label("size_name")
        ).join(
            ProductColor, ProductVariant.product_color_id == ProductColor.id
        ).join(
            Product, ProductColor.product_id == Product.id
        ).outerjoin(
            Size, ProductVariant.size_id == Size.id
        ).filter(
            ProductVariant.deleted_at == None,
            ProductColor.deleted_at == None,
            Product.deleted_at == None,
        )
        if size_name:
            q = q.filter(Size.name.ilike(size_name))
        return q.all()

    def test_archived_size_does_not_hide_a_live_product(self):
        names = {r.product_name for r in self._query()}
        self.assertIn("منتج بمقاس مؤرشف", names)

    def test_variant_without_a_size_is_still_listed(self):
        names = {r.product_name for r in self._query()}
        self.assertIn("منتج بلا مقاس", names)

    def test_all_live_products_are_listed(self):
        self.assertEqual(len(self._query()), 3)

    def test_archived_size_keeps_its_name_in_the_response(self):
        row = next(r for r in self._query() if r.product_name == "منتج بمقاس مؤرشف")
        self.assertEqual(row.size_name, "سنة ونص")

    def test_size_without_a_row_yields_none_not_a_crash(self):
        row = next(r for r in self._query() if r.product_name == "منتج بلا مقاس")
        self.assertIsNone(row.size_name)

    def test_size_name_filter_still_narrows_correctly(self):
        names = {r.product_name for r in self._query(size_name="XL")}
        self.assertEqual(names, {"منتج بمقاس حيّ"})


if __name__ == "__main__":
    unittest.main(verbosity=2)
