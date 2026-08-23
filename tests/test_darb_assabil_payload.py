# =============================================================================
# tests/test_darb_assabil_payload.py
#
# اختبارات صارمة للتأكد من صحة بنية payload الشحنة لـ Darb Assabil API
# =============================================================================

import json
import unittest
from unittest.mock import MagicMock, patch

import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.services.darb_assabil_service import DarbAssabilService

VALID_SERVICE_ID = "6783c612dcf305c9e775c987"
FAKE_CONTACT_ID  = "aabbccddee1122334455aabb"

BASE_ORDER = {
    "order_id":       "ORD-001",
    "customer_phone": "0910000000",
    "customer_name":  "احمد محمد",
    "service":        VALID_SERVICE_ID,
    "paymentBy":      "receiver",
    "countryCode":    "lby",
    "city":           "طرابلس",
    "area":           "بن عاشور",
    "address":        "شارع الجمهورية",
    "notes":          "اتصل قبل التوصيل",
    "products": [
        {
            "title":        "قميص قطني",
            "quantity":     2,
            "amount":       85.0,
            "currency":     "lyd",
            "isChargeable": True,
        }
    ],
}


def _build_payload_via_mock(order_data, contact_id=FAKE_CONTACT_ID):
    svc = DarbAssabilService()
    captured = {}

    def fake_post(url, headers=None, json=None, timeout=None):
        if captured.get("payload") is None:
            captured["payload"] = json
        fake_resp = MagicMock()
        fake_resp.status_code = 201
        fake_resp.json.return_value = {"data": {"_id": "s123", "reference": "R001"}}
        return fake_resp

    with patch.object(svc, "create_contact_or_get_id", return_value=contact_id), \
         patch("requests.post", side_effect=fake_post), \
         patch.dict("os.environ", {
             "DARB_ASSABIL_API_KEY":    "test-api-key",
             "DARB_ASSABIL_ACCOUNT_ID": FAKE_CONTACT_ID,
             "DARB_ASSABIL_BASE_URL":   "https://mock.sabil.ly",
         }):
        svc.create_local_shipment(order_data)

    assert "payload" in captured, "لم يُستدعَ requests.post — راجع mock"
    return captured["payload"]


# ======== أ) allowSplitting ========
class TestAllowSplitting(unittest.TestCase):

    def _p(self, o=None):
        return _build_payload_via_mock(o or BASE_ORDER)

    def test_a1_key_exists(self):
        self.assertIn("allowSplitting", self._p(),
                      "allowSplitting غائب من المستوى الأعلى")

    def test_a2_value_is_true(self):
        self.assertIs(self._p()["allowSplitting"], True,
                      "allowSplitting يجب ان يكون True")

    def test_a3_not_nested_in_to_or_products(self):
        p = self._p()
        self.assertNotIn("allowSplitting", p.get("to", {}))
        for prod in p.get("products", []):
            self.assertNotIn("allowSplitting", prod)


# ======== ب) allowInspection و allowTesting في كل منتج ========
class TestProductFlags(unittest.TestCase):

    def test_b1_single_product_has_both_flags(self):
        p = _build_payload_via_mock(BASE_ORDER)
        prod = p["products"][0]
        self.assertIs(prod.get("allowInspection"), True)
        self.assertIs(prod.get("allowTesting"),    True)

    def test_b2_multiple_products_all_have_flags(self):
        order = {**BASE_ORDER, "products": [
            {"title": "منتج أ", "quantity": 1, "amount": 50.0,  "currency": "lyd", "isChargeable": True},
            {"title": "منتج ب", "quantity": 3, "amount": 120.0, "currency": "lyd", "isChargeable": True},
            {"title": "منتج ج", "quantity": 2, "amount": 30.0,  "currency": "lyd", "isChargeable": False},
        ]}
        p = _build_payload_via_mock(order)
        self.assertEqual(len(p["products"]), 3)
        for i, prod in enumerate(p["products"]):
            with self.subTest(i=i):
                self.assertIs(prod.get("allowInspection"), True,
                              f"allowInspection خاطئ في المنتج [{i}]")
                self.assertIs(prod.get("allowTesting"),    True,
                              f"allowTesting خاطئ في المنتج [{i}]")


# ======== ج) حالات الحافة — لا crash ========
class TestEdgeCases(unittest.TestCase):

    def test_c1_empty_products_no_crash(self):
        order = {**BASE_ORDER, "products": [], "total_amount": 200.0}
        try:
            p = _build_payload_via_mock(order)
        except Exception as e:
            self.fail(f"crash عند products=[]: {e}")
        self.assertGreater(len(p["products"]), 0)
        self.assertIs(p["products"][0].get("allowInspection"), True)
        self.assertIs(p["products"][0].get("allowTesting"),    True)
        self.assertIs(p["allowSplitting"], True)

    def test_c2_single_product_no_crash(self):
        order = {**BASE_ORDER, "products": [
            {"title": "حذاء", "quantity": 1, "amount": 95.0, "currency": "lyd", "isChargeable": True}
        ]}
        try:
            p = _build_payload_via_mock(order)
        except Exception as e:
            self.fail(f"crash عند منتج واحد: {e}")
        self.assertEqual(len(p["products"]), 1)

    def test_c3_missing_quantity_defaults_to_1(self):
        order = {**BASE_ORDER, "products": [
            {"title": "عطر", "amount": 60.0, "currency": "lyd", "isChargeable": True}
        ]}
        try:
            p = _build_payload_via_mock(order)
        except Exception as e:
            self.fail(f"crash عند غياب quantity: {e}")
        self.assertEqual(p["products"][0]["quantity"], 1)


# ======== د) الحقول الأساسية سليمة ========
class TestCoreFieldsIntact(unittest.TestCase):

    def setUp(self):
        self.p = _build_payload_via_mock(BASE_ORDER)

    def test_d1_service(self):
        self.assertEqual(self.p.get("service"), VALID_SERVICE_ID)

    def test_d2_contacts(self):
        self.assertIsInstance(self.p.get("contacts"), list)
        self.assertEqual(self.p["contacts"][0], FAKE_CONTACT_ID)

    def test_d3_payment_by(self):
        self.assertEqual(self.p.get("paymentBy"), "receiver")

    def test_d4_to_subkeys(self):
        to = self.p.get("to", {})
        for k in ["countryCode", "city", "area", "address"]:
            self.assertIn(k, to)
        self.assertEqual(to["city"], "طرابلس")
        self.assertEqual(to["area"], "بن عاشور")

    def test_d5_product_core_fields(self):
        prod = self.p["products"][0]
        self.assertEqual(prod["title"],    "قميص قطني")
        self.assertEqual(prod["quantity"], 2)
        self.assertAlmostEqual(prod["amount"], 85.0)
        self.assertEqual(prod["currency"], "lyd")
        self.assertIs(prod["isChargeable"], True)

    def test_d6_notes_present(self):
        self.assertIn("notes", self.p)


# ======== هـ) JSON النهائي مطابق للبنية المتوقعة ========
class TestFullPayloadStructureMock(unittest.TestCase):

    def test_e1_exact_json_structure(self):
        p = _build_payload_via_mock(BASE_ORDER)
        j = json.loads(json.dumps(p, ensure_ascii=False))
        for key in ["service", "contacts", "paymentBy", "allowSplitting", "to", "products", "notes"]:
            self.assertIn(key, j, f"الحقل '{key}' غائب من JSON النهائي")
        self.assertIs(j["allowSplitting"], True)
        for i, prod in enumerate(j.get("products", [])):
            with self.subTest(i=i):
                self.assertIs(prod.get("allowInspection"), True)
                self.assertIs(prod.get("allowTesting"),    True)

    def test_e2_json_serializable(self):
        p = _build_payload_via_mock(BASE_ORDER)
        try:
            json.dumps(p)
        except (TypeError, ValueError) as e:
            self.fail(f"payload غير قابل لـ JSON: {e}")


# ======== و) اختبارات سلبية — أسماء خاطئة يجب أن تغيب ========
class TestNegativeFieldNames(unittest.TestCase):

    def setUp(self):
        self.p = _build_payload_via_mock(BASE_ORDER)

    # -- المستوى الأعلى --
    def test_f1_no_splittable(self):
        self.assertNotIn("splittable",   self.p, "splittable اسم خاطئ")

    def test_f2_no_allow_split(self):
        self.assertNotIn("allowSplit",   self.p, "allowSplit اسم خاطئ")

    def test_f3_no_is_splittable(self):
        self.assertNotIn("isSplittable", self.p, "isSplittable اسم خاطئ")

    # -- داخل المنتجات --
    def test_f4_no_inspection(self):
        for i, prod in enumerate(self.p.get("products", [])):
            with self.subTest(i=i):
                self.assertNotIn("inspection", prod)

    def test_f5_no_allow_open(self):
        for i, prod in enumerate(self.p.get("products", [])):
            with self.subTest(i=i):
                self.assertNotIn("allowOpen", prod)

    def test_f6_no_testing(self):
        for i, prod in enumerate(self.p.get("products", [])):
            with self.subTest(i=i):
                self.assertNotIn("testing", prod)

    def test_f7_no_allow_try(self):
        for i, prod in enumerate(self.p.get("products", [])):
            with self.subTest(i=i):
                self.assertNotIn("allowTry", prod)

    def test_f8_no_is_testable(self):
        for i, prod in enumerate(self.p.get("products", [])):
            with self.subTest(i=i):
                self.assertNotIn("isTestable", prod)


# ======== ز) الوضع الصحيح للحقول — لا تختلط المستويات (النقطة 2) ========
class TestPlacementCorrectness(unittest.TestCase):
    """
    تأكيد أن allowInspection و allowTesting غير موجودين في المستوى الأعلى،
    وأن allowSplitting غير موجود داخل عناصر products.
    """

    def setUp(self):
        self.p = _build_payload_via_mock(BASE_ORDER)

    def test_g1_allow_inspection_not_at_top_level(self):
        """allowInspection يجب ألا يكون في المستوى الأعلى من body"""
        self.assertNotIn(
            "allowInspection", self.p,
            "allowInspection وُجد في المستوى الأعلى — يجب أن يكون داخل products فقط"
        )

    def test_g2_allow_testing_not_at_top_level(self):
        """allowTesting يجب ألا يكون في المستوى الأعلى من body"""
        self.assertNotIn(
            "allowTesting", self.p,
            "allowTesting وُجد في المستوى الأعلى — يجب أن يكون داخل products فقط"
        )

    def test_g3_allow_splitting_not_inside_any_product(self):
        """allowSplitting يجب ألا يكون داخل أي عنصر من products"""
        for i, prod in enumerate(self.p.get("products", [])):
            with self.subTest(product_index=i):
                self.assertNotIn(
                    "allowSplitting", prod,
                    f"allowSplitting وُجد داخل المنتج [{i}] — يجب أن يكون في المستوى الأعلى فقط"
                )

    def test_g4_multiple_products_flags_only_in_products(self):
        """مع منتجات متعددة: الحقول في أماكنها الصحيحة حصراً"""
        order = {**BASE_ORDER, "products": [
            {"title": "منتج 1", "quantity": 1, "amount": 40.0, "currency": "lyd", "isChargeable": True},
            {"title": "منتج 2", "quantity": 2, "amount": 80.0, "currency": "lyd", "isChargeable": True},
        ]}
        p = _build_payload_via_mock(order)
        # allowSplitting فقط في الأعلى
        self.assertIn("allowSplitting", p)
        self.assertNotIn("allowInspection", p)
        self.assertNotIn("allowTesting", p)
        # allowInspection + allowTesting فقط داخل كل منتج
        for i, prod in enumerate(p.get("products", [])):
            with self.subTest(i=i):
                self.assertNotIn("allowSplitting", prod,
                                 f"allowSplitting خطأ داخل المنتج [{i}]")
                self.assertIn("allowInspection", prod)
                self.assertIn("allowTesting", prod)


# ======== ح) الثبات الإلزامي — القيم hardcoded لا تتغير بأي إدخال خارجي (النقطة 4) ========
class TestHardcodedImmutability(unittest.TestCase):
    """
    يتأكد أن القيم الثلاثة دائماً True حتى لو جاء order_data بقيم false.
    الدالة تفرض True وتتجاهل أي إدخال خارجي.
    """

    def test_h1_allow_splitting_stays_true_even_if_order_says_false(self):
        """حتى لو order_data يحتوي allowSplitting=False، الـ payload يرسل True"""
        order = {**BASE_ORDER, "allowSplitting": False}
        p = _build_payload_via_mock(order)
        self.assertIs(
            p.get("allowSplitting"), True,
            "allowSplitting أصبح False — يجب أن يكون hardcoded True دائماً"
        )

    def test_h2_allow_inspection_stays_true_even_if_product_says_false(self):
        """حتى لو منتج في order_data يحتوي allowInspection=False، الـ payload يرسل True"""
        order = {**BASE_ORDER, "products": [
            {
                "title": "منتج", "quantity": 1, "amount": 50.0,
                "currency": "lyd", "isChargeable": True,
                "allowInspection": False,   # إدخال خارجي خاطئ
            }
        ]}
        p = _build_payload_via_mock(order)
        prod = p["products"][0]
        self.assertIs(
            prod.get("allowInspection"), True,
            "allowInspection أصبح False — يجب أن يكون hardcoded True دائماً"
        )

    def test_h3_allow_testing_stays_true_even_if_product_says_false(self):
        """حتى لو منتج في order_data يحتوي allowTesting=False، الـ payload يرسل True"""
        order = {**BASE_ORDER, "products": [
            {
                "title": "منتج", "quantity": 1, "amount": 50.0,
                "currency": "lyd", "isChargeable": True,
                "allowTesting": False,   # إدخال خارجي خاطئ
            }
        ]}
        p = _build_payload_via_mock(order)
        prod = p["products"][0]
        self.assertIs(
            prod.get("allowTesting"), True,
            "allowTesting أصبح False — يجب أن يكون hardcoded True دائماً"
        )

    def test_h4_all_three_stay_true_with_all_false_inputs(self):
        """الحالة الأسوأ: كل القيم الثلاثة جاءت False من الخارج — تبقى True"""
        order = {
            **BASE_ORDER,
            "allowSplitting": False,
            "products": [
                {
                    "title": "منتج أ", "quantity": 1, "amount": 30.0,
                    "currency": "lyd", "isChargeable": True,
                    "allowInspection": False,
                    "allowTesting": False,
                },
                {
                    "title": "منتج ب", "quantity": 2, "amount": 70.0,
                    "currency": "lyd", "isChargeable": False,
                    "allowInspection": False,
                    "allowTesting": False,
                },
            ]
        }
        p = _build_payload_via_mock(order)
        self.assertIs(p.get("allowSplitting"), True,
                      "allowSplitting يجب أن يكون True رغم الإدخال الخارجي")
        for i, prod in enumerate(p.get("products", [])):
            with self.subTest(product_index=i):
                self.assertIs(prod.get("allowInspection"), True,
                              f"allowInspection في المنتج [{i}] يجب أن يبقى True")
                self.assertIs(prod.get("allowTesting"), True,
                              f"allowTesting في المنتج [{i}] يجب أن يبقى True")

    def test_h5_allow_splitting_not_read_from_order_data(self):
        """
        يتأكد أن allowSplitting في payload لا يأتي من order_data،
        بل هو مكتوب ثابتاً في كود بناء الـ payload.
        """
        # حتى لو allowSplitting غائب تماماً من order_data، يجب أن يكون موجوداً في payload
        order = {k: v for k, v in BASE_ORDER.items() if k != "allowSplitting"}
        p = _build_payload_via_mock(order)
        self.assertIn("allowSplitting", p,
                      "allowSplitting يجب أن يكون موجوداً حتى لو غائب من order_data")
        self.assertIs(p["allowSplitting"], True)


if __name__ == "__main__":
    unittest.main(verbosity=2)
