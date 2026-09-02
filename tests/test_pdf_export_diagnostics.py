# =============================================================================
# tests/test_pdf_export_diagnostics.py
# رسالة تشخيص تصدير PDF: يجب أن تحدد **الخطوة** التي انقطعت عندها النتائج
# =============================================================================

import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import unittest
from app.routers.products import (
    _describe_filters, _explain_unrenderable, _pdf_export_failure_detail,
)


class _Size:
    def __init__(self, name): self.name = name


class _Variant:
    def __init__(self, size=None, deleted=False):
        self.size = size
        self.deleted_at = 'x' if deleted else None


class _Color:
    def __init__(self, variants=(), deleted=False):
        self.variants = list(variants)
        self.deleted_at = 'x' if deleted else None


class _Product:
    def __init__(self, code, colors=()):
        self.id, self.code = 1, code
        self.colors = list(colors)


class TestFilterDescription(unittest.TestCase):
    def test_shows_catalog_id_with_its_name(self):
        lines = _describe_filters('كتالوج بنات', 2, None, None, None)
        self.assertIn('2 (كتالوج بنات)', lines[0])

    def test_warns_when_catalog_id_does_not_exist(self):
        """أهم حالة: الواجهة أرسلت معرّفاً لا يقابله كتالوج — لا يجب أن يبدو كأن الكتالوج فارغ."""
        lines = _describe_filters(None, 9999, None, None, None)
        self.assertIn('لا يوجد كتالوج بهذا المعرّف', lines[0])

    def test_states_clearly_when_a_filter_was_not_sent(self):
        lines = _describe_filters(None, None, None, None, None)
        self.assertIn('لم يُحدَّد', lines[0])
        self.assertIn('لم يُحدَّد', lines[1])

    def test_includes_size_value_as_received(self):
        lines = _describe_filters(None, None, '6 سنوات', None, None)
        self.assertTrue(any('6 سنوات' in l for l in lines))


class TestStagePinpointing(unittest.TestCase):
    def _detail(self, stage, **counts):
        base = {'total': 44, 'after_catalog': 44, 'after_size': 44, 'after_text': 44, 'renderable': 44}
        base.update(counts)
        return _pdf_export_failure_detail(
            stage=stage, counts=base,
            filter_lines=_describe_filters(None, None, None, None, None),
        )

    def test_marks_the_catalog_stage_when_it_is_the_one_that_emptied(self):
        d = self._detail('catalog', after_catalog=0, after_size=0, after_text=0, renderable=0)
        catalog_line = next(l for l in d.split('\n') if 'بعد فلتر الكتالوج' in l)
        size_line = next(l for l in d.split('\n') if 'بعد فلتر المقاس' in l)
        self.assertIn('هنا انقطعت', catalog_line)
        self.assertNotIn('هنا انقطعت', size_line)
        self.assertIn('الكتالوج المختار لا يحتوي', d)

    def test_marks_the_size_stage_and_not_the_catalog(self):
        """قبل الإصلاح كانت الرسالة تتّهم المقاس حتى حين يكون الكتالوج هو الفارغ."""
        d = self._detail('size', after_catalog=13, after_size=0, after_text=0, renderable=0)
        size_line = next(l for l in d.split('\n') if 'بعد فلتر المقاس' in l)
        catalog_line = next(l for l in d.split('\n') if 'بعد فلتر الكتالوج' in l)
        self.assertIn('هنا انقطعت', size_line)
        self.assertNotIn('هنا انقطعت', catalog_line)

    def test_marks_the_render_stage_when_filters_matched_but_nothing_printable(self):
        d = self._detail('render', renderable=0)
        render_line = next(l for l in d.split('\n') if 'القابلة للرسم' in l)
        self.assertIn('هنا انقطعت', render_line)
        self.assertIn('يحتاج لوناً ومقاساً', d)

    def test_exactly_one_stage_is_marked(self):
        d = self._detail('size', after_size=0, after_text=0, renderable=0)
        self.assertEqual(d.count('هنا انقطعت النتائج'), 1)

    def test_all_five_counts_are_reported(self):
        d = self._detail('catalog', after_catalog=0, after_size=0, after_text=0, renderable=0)
        for label in ('كل المنتجات غير المحذوفة', 'بعد فلتر الكتالوج', 'بعد فلتر المقاس',
                      'بعد فلاتر الاسم/المرجع', 'القابلة للرسم'):
            self.assertIn(label, d)

    def test_detail_is_a_plain_string_the_ui_can_render(self):
        d = self._detail('catalog', after_catalog=0, after_size=0, after_text=0, renderable=0)
        self.assertIsInstance(d, str)
        self.assertGreater(len(d.split('\n')), 5)


class TestUnrenderableExplanation(unittest.TestCase):
    def test_counts_products_without_any_colour(self):
        lines = _explain_unrenderable([_Product('P-1'), _Product('P-2')], None)
        self.assertTrue(any('بلا أي لون' in l and 'P-1' in l for l in lines))

    def test_counts_products_whose_colours_have_no_sizes(self):
        p = _Product('P-3', [_Color(variants=[])])
        lines = _explain_unrenderable([p], None)
        self.assertTrue(any('ألوان بلا مقاسات' in l for l in lines))

    def test_reports_size_mismatch_separately(self):
        p = _Product('P-4', [_Color(variants=[_Variant(_Size('XL'))])])
        lines = _explain_unrenderable([p], 'XS')
        self.assertTrue(any('لا تشمل المقاس المطلوب' in l and 'P-4' in l for l in lines))

    def test_deleted_variants_count_as_no_sizes(self):
        p = _Product('P-5', [_Color(variants=[_Variant(_Size('XL'), deleted=True)])])
        lines = _explain_unrenderable([p], None)
        self.assertTrue(any('ألوان بلا مقاسات' in l for l in lines))

    def test_long_lists_are_truncated_with_a_counter(self):
        products = [_Product(f'P-{i}') for i in range(9)]
        lines = _explain_unrenderable(products, None)
        self.assertTrue(any('+4' in l for l in lines))

    def test_never_returns_an_empty_explanation(self):
        p = _Product('P-6', [_Color(variants=[_Variant(_Size('XL'))], deleted=True)])
        self.assertTrue(len(_explain_unrenderable([p], None)) >= 1)


if __name__ == '__main__':
    unittest.main(verbosity=2)
