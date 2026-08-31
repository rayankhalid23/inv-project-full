# =============================================================================
# tests/test_pdf_size_filter.py
# اختبار فلترة تصدير PDF حسب المقاس (يدعم مقاسات بالحروف والأرقام معاً مثل "5 سنوات")
# =============================================================================

import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import unittest
from sqlalchemy import create_engine, and_
from sqlalchemy.orm import sessionmaker, joinedload

from app.models.base import Base
from app.models.inventory import Product, ProductColor, ProductVariant, Size, Catalog
from app.models.user import User
from app.models.role import Role


class TestPdfSizeFilter(unittest.TestCase):
    """يحاكي منطق فلترة /export-pdf في app/routers/products.py مباشرة على قاعدة بيانات SQLite في الذاكرة."""

    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(cls.engine)
        cls.Session = sessionmaker(bind=cls.engine)

    def setUp(self):
        self.db = self.Session()

        role = Role(name="admin")
        self.db.add(role)
        self.db.flush()

        user = User(name="tester", phone="0900000000", password_hash="x", role_id=role.id)
        self.db.add(user)
        self.db.flush()

        catalog = Catalog(name="كتالوج تجريبي", created_by=user.id)
        self.db.add(catalog)
        self.db.flush()

        # مقاسات تحتوي على حروف وأرقام معاً
        self.size_5_years = Size(name="5 سنوات")
        self.size_m = Size(name="M")
        self.size_36 = Size(name="36")
        self.db.add_all([self.size_5_years, self.size_m, self.size_36])
        self.db.flush()

        def make_product(name, code, size):
            p = Product(
                name=name, code=code, catalog_id=catalog.id,
                description="", cost_price=0, selling_price=10,
            )
            self.db.add(p)
            self.db.flush()
            color = ProductColor(product_id=p.id, color_name="أحمر")
            self.db.add(color)
            self.db.flush()
            variant = ProductVariant(product_color_id=color.id, size_id=size.id, quantity_available=5)
            self.db.add(variant)
            self.db.flush()
            return p

        self.product_kids = make_product("قميص أطفال", "P-KIDS", self.size_5_years)
        self.product_m = make_product("قميص كبار", "P-M", self.size_m)
        self.product_shoe = make_product("حذاء", "P-SHOE", self.size_36)
        self.db.commit()

    def tearDown(self):
        self.db.rollback()
        for table in reversed(Base.metadata.sorted_tables):
            self.db.execute(table.delete())
        self.db.commit()
        self.db.close()

    def _query_by_size(self, size_name):
        """يكرر بالضبط منطق الفلترة في export_products_pdf بعد الإصلاح."""
        query = self.db.query(Product).options(
            joinedload(Product.colors).joinedload(ProductColor.variants)
        )
        clean_size_name = size_name.strip() if (size_name and isinstance(size_name, str)) else None
        if clean_size_name:
            query = query.filter(Product.colors.any(ProductColor.variants.any(
                and_(
                    ProductVariant.size.has(Size.name.ilike(clean_size_name)),
                    ProductVariant.quantity_available > 0,
                    ProductVariant.deleted_at == None
                )
            )))
        return query.all()

    def test_filters_by_alphanumeric_size_name(self):
        """مقاس يحتوي على حروف وأرقام معاً مثل '5 سنوات' يجب أن يعمل بشكل صحيح."""
        results = self._query_by_size("5 سنوات")
        names = {p.name for p in results}
        self.assertEqual(names, {"قميص أطفال"})

    def test_filters_by_pure_letters_size(self):
        results = self._query_by_size("M")
        names = {p.name for p in results}
        self.assertEqual(names, {"قميص كبار"})

    def test_filters_by_pure_number_size(self):
        results = self._query_by_size("36")
        names = {p.name for p in results}
        self.assertEqual(names, {"حذاء"})

    def test_filter_is_case_insensitive_and_trims_whitespace(self):
        results = self._query_by_size("  m  ")
        names = {p.name for p in results}
        self.assertEqual(names, {"قميص كبار"})

    def test_no_filter_returns_all_products(self):
        results = self._query_by_size(None)
        names = {p.name for p in results}
        self.assertEqual(names, {"قميص أطفال", "قميص كبار", "حذاء"})

    def test_duplicate_product_names_are_allowed(self):
        """لا يجب رفض إنشاء منتج بنفس اسم منتج آخر — القيد أُزيل من create_product/update_product."""
        p2 = Product(
            name="قميص أطفال",  # نفس اسم self.product_kids تماماً
            code="P-KIDS-2",
            catalog_id=self.product_kids.catalog_id,
            description="", cost_price=0, selling_price=15,
        )
        self.db.add(p2)
        self.db.commit()  # يجب ألا يرمي أي استثناء بسبب تكرار الاسم

        same_name_products = self.db.query(Product).filter(Product.name == "قميص أطفال").all()
        self.assertEqual(len(same_name_products), 2)


if __name__ == "__main__":
    unittest.main(verbosity=2)
