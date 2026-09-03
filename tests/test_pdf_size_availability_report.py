# =============================================================================
# tests/test_pdf_size_availability_report.py
# رسالة فشل فلتر المقاس في تصدير PDF يجب أن تفرّق بين خمس حالات مختلفة تماماً:
#   1. لا يوجد مقاس بهذا الاسم في النظام
#   2. المقاس مُعرَّف لكنه غير مضاف داخل أي منتج
#   3. المقاس مضاف لكن كميته صفر في كل مكان (نفد)
#   4. المقاس متوفر بكمية — لكن في كتالوجات أخرى غير الكتالوج المختار
#   5. المقاس موجود داخل الكتالوج المختار لكن كميته فيه صفر
# قبل الإصلاح كانت الحالات الخمس تُنتج جملة واحدة: "المقاس قد يكون موجوداً في
# قائمة المقاسات فقط دون أن يُضاف داخل أي منتج" — صحيحة في حالة واحدة من خمس.
# =============================================================================

import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import unittest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.base import Base
from app.models.inventory import Product, ProductColor, ProductVariant, Size, Catalog
from app.models.user import User
from app.models.role import Role
from app.routers.products import _size_availability_report


class TestSizeAvailabilityReport(unittest.TestCase):

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
        self.user_id = user.id

        self.cat_summer = Catalog(name="صيفي", created_by=user.id)
        self.cat_winter = Catalog(name="شتوي", created_by=user.id)
        self.db.add_all([self.cat_summer, self.cat_winter])
        self.db.flush()

        self.size_xl = Size(name="XL")          # متوفر بكمية في "صيفي" فقط
        self.size_s = Size(name="S")            # موجود في "صيفي" بكمية صفر
        self.size_orphan = Size(name="مقاس يتيم")  # مُعرَّف ولم يُستخدم في أي منتج
        self.db.add_all([self.size_xl, self.size_s, self.size_orphan])
        self.db.flush()

        self._make_product("قميص", "P-XL", self.cat_summer, self.size_xl, qty=7)
        self._make_product("بلوزة", "P-S", self.cat_summer, self.size_s, qty=0)
        self.db.commit()

    def _make_product(self, name, code, catalog, size, qty):
        p = Product(name=name, code=code, catalog_id=catalog.id,
                    description="", cost_price=0, selling_price=10)
        self.db.add(p)
        self.db.flush()
        color = ProductColor(product_id=p.id, color_name="أحمر")
        self.db.add(color)
        self.db.flush()
        self.db.add(ProductVariant(product_color_id=color.id, size_id=size.id,
                                   quantity_available=qty))
        self.db.flush()
        return p

    def tearDown(self):
        self.db.rollback()
        for table in reversed(Base.metadata.sorted_tables):
            self.db.execute(table.delete())
        self.db.commit()
        self.db.close()

    # ---- 1. المقاس غير موجود في النظام ----

    def test_unknown_size_says_it_is_not_in_the_size_list(self):
        reason, _ = _size_availability_report(self.db, "مقاس-غير-موجود")
        self.assertIn("لا يوجد مقاس باسم", reason)
        self.assertIn("مقاس-غير-موجود", reason)

    def test_unknown_size_suggests_similar_existing_names(self):
        """الخطأ الإملائي هو السبب الأشيع — نعرض المقاسات المشابهة بدل تركه يخمّن."""
        _, lines = _size_availability_report(self.db, "مقاس ي")
        self.assertTrue(any("مقاس يتيم" in l for l in lines))

    # ---- 2. مقاس معرّف بلا أي استخدام ----

    def test_defined_but_unused_size_is_named_as_such(self):
        reason, _ = _size_availability_report(self.db, "مقاس يتيم")
        self.assertIn("غير مضاف داخل أي منتج", reason)
        self.assertNotIn("لا يوجد مقاس باسم", reason)

    # ---- 3. المقاس نفد في كل مكان (بدون فلتر كتالوج) ----

    def test_globally_out_of_stock_size_is_reported_as_out_of_stock(self):
        reason, lines = _size_availability_report(self.db, "S")
        self.assertIn("الكمية المتاحة فيها كلها صفر", reason)
        self.assertTrue(any("P-S" in l for l in lines))

    def test_out_of_stock_reason_is_not_confused_with_unused_size(self):
        """قبل الإصلاح كانت الحالتان تُعطيان نفس النص رغم اختلاف الحل تماماً:
        هنا الحل تعبئة مخزون، وهناك إضافة المقاس لمنتج."""
        reason, _ = _size_availability_report(self.db, "S")
        self.assertNotIn("غير مضاف داخل أي منتج", reason)

    # ---- 4. المقاس متوفر لكن في كتالوج آخر ----

    def test_size_missing_from_selected_catalog_names_the_catalog(self):
        reason, lines = _size_availability_report(
            self.db, "XL", catalog_id=self.cat_winter.id, catalog_name="شتوي")
        self.assertIn("غير مضاف إلى أي منتج داخل الكتالوج «شتوي»", reason)
        self.assertTrue(any("صيفي" in l for l in lines),
                        "يجب أن تدل الرسالة على الكتالوج الذي يحتوي المقاس فعلاً")

    def test_available_elsewhere_is_stated_only_when_there_is_stock(self):
        """المقاس S نافد في كل مكان — لا يجوز أن نرسل المستخدم لكتالوج آخر بلا فائدة."""
        _, lines = _size_availability_report(
            self.db, "S", catalog_id=self.cat_winter.id, catalog_name="شتوي")
        self.assertTrue(any("غير متوفر بكمية في أي كتالوج آخر" in l for l in lines))

    # ---- 5. المقاس داخل الكتالوج لكن كميته صفر ----

    def test_zero_quantity_inside_selected_catalog_is_distinguished(self):
        reason, lines = _size_availability_report(
            self.db, "S", catalog_id=self.cat_summer.id, catalog_name="صيفي")
        self.assertIn("موجود داخل الكتالوج «صيفي»", reason)
        self.assertIn("الكمية المتاحة فيها صفر", reason)
        self.assertTrue(any("P-S" in l for l in lines))

    def test_zero_quantity_case_is_not_reported_as_missing_from_catalog(self):
        """الفرق عملي: "غير مضاف" تعني أضف المقاس، و"كميته صفر" تعني عبِّئ المخزون."""
        reason, _ = _size_availability_report(
            self.db, "S", catalog_id=self.cat_summer.id, catalog_name="صيفي")
        self.assertNotIn("غير مضاف إلى أي منتج داخل الكتالوج", reason)

    # ---- حالات النجاح: لا سبب يُعلن ----

    def test_returns_no_reason_when_the_size_is_actually_available(self):
        reason, lines = _size_availability_report(
            self.db, "XL", catalog_id=self.cat_summer.id, catalog_name="صيفي")
        self.assertIsNone(reason)
        self.assertEqual(lines, [])

    def test_returns_no_reason_when_no_size_filter_was_used(self):
        reason, lines = _size_availability_report(self.db, None, catalog_id=self.cat_summer.id)
        self.assertIsNone(reason)
        self.assertEqual(lines, [])

    def test_size_name_matching_ignores_case_and_padding(self):
        reason, _ = _size_availability_report(
            self.db, "  xl  ", catalog_id=self.cat_winter.id, catalog_name="شتوي")
        self.assertIn("غير مضاف إلى أي منتج داخل الكتالوج «شتوي»", reason)

    def test_catalog_label_falls_back_to_id_when_name_is_unknown(self):
        reason, _ = _size_availability_report(self.db, "XL", catalog_id=999, catalog_name=None)
        self.assertIn("#999", reason)


if __name__ == '__main__':
    unittest.main(verbosity=2)
