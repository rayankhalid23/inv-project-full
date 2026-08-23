# =============================================================================
# tests/test_order_cancellation_prevention.py
# اختبارات التأكد من منع إلغاء الطلبات المسندة للتوصيل (shipped)
# =============================================================================

import unittest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException

import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.services.order_service import delete_order_logic
from app.models.order import Order

class TestOrderCancellationPrevention(unittest.TestCase):

    def setUp(self):
        self.mock_db = MagicMock()

    def _mock_order(self, status: str):
        mock_order = MagicMock(spec=Order)
        mock_order.id = 123
        mock_order.status = status
        mock_order.deleted_at = None
        mock_order.items = []
        return mock_order

    def test_cannot_delete_shipped_order(self):
        """التحقق من رفض إلغاء الطلب إذا كانت حالته shipped"""
        mock_order = self._mock_order("shipped")
        self.mock_db.query.return_value.filter.return_value.with_for_update.return_value.first.return_value = mock_order

        with self.assertRaises(HTTPException) as ctx:
            delete_order_logic(db=self.mock_db, order_id=123, user_id=1)

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("تم الإسناد للتوصيل", ctx.exception.detail)

    def test_cannot_delete_arabic_shipped_status_order(self):
        """التحقق من رفض إلغاء الطلب إذا كانت حالته 'تم اسناده للتوصيل'"""
        mock_order = self._mock_order("تم اسناده للتوصيل")
        self.mock_db.query.return_value.filter.return_value.with_for_update.return_value.first.return_value = mock_order

        with self.assertRaises(HTTPException) as ctx:
            delete_order_logic(db=self.mock_db, order_id=123, user_id=1)

        self.assertEqual(ctx.exception.status_code, 400)

    def test_cannot_delete_delivering_status_order(self):
        """التحقق من رفض إلغاء الطلب إذا كانت حالته 'جاري الشحن'"""
        mock_order = self._mock_order("جاري الشحن")
        self.mock_db.query.return_value.filter.return_value.with_for_update.return_value.first.return_value = mock_order

        with self.assertRaises(HTTPException) as ctx:
            delete_order_logic(db=self.mock_db, order_id=123, user_id=1)

        self.assertEqual(ctx.exception.status_code, 400)

    def test_cannot_delete_delivered_order(self):
        """التحقق من رفض إلغاء الطلب إذا كانت حالته 'delivered' أو 'تم التوصيل'"""
        for s in ("delivered", "تم التوصيل"):
            with self.subTest(status=s):
                mock_order = self._mock_order(s)
                self.mock_db.query.return_value.filter.return_value.with_for_update.return_value.first.return_value = mock_order

                with self.assertRaises(HTTPException) as ctx:
                    delete_order_logic(db=self.mock_db, order_id=123, user_id=1)

                self.assertEqual(ctx.exception.status_code, 400)

if __name__ == "__main__":
    unittest.main(verbosity=2)
