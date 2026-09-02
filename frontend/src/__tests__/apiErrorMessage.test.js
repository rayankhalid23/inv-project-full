import { describe, it, expect } from 'vitest';
import { describeApiError } from '../utils/netErrors';

/**
 * كانت كل حالات الفشل تُعرض برسالة ثابتة واحدة ("لا توجد منتجات مطابقة")، فيستحيل
 * تمييز: فلتر لم يطابق، وخطأ 500 في الخادم، و422 لأن قيمة الفلتر وصلت بنوع خاطئ،
 * وانقطاع شبكة — أربع مشاكل بأربعة حلول مختلفة تبدو واحدة.
 */
describe('describeApiError — رسالة خطأ تشخيصية دقيقة', () => {
  it('يمرّر رسالة الخادم متعددة الأسطر كما هي مع رمز الحالة والمسار', () => {
    const serverDetail = [
      'تعذّر إنشاء ملف PDF — لا يوجد ما يُرسَم.',
      'مسار التصفية خطوة بخطوة:',
      '  2. بعد فلتر الكتالوج: 0 ← ✗ هنا انقطعت النتائج',
    ].join('\n');

    const msg = describeApiError({
      response: { status: 404, data: { detail: serverDetail } },
      config: { url: '/products/export-pdf' },
    });

    expect(msg).toContain('HTTP 404');
    expect(msg).toContain('/products/export-pdf');
    expect(msg).toContain('هنا انقطعت النتائج');
    expect(msg.split('\n').length).toBeGreaterThan(3); // الأسطر محفوظة
  });

  it('يفكّ أخطاء التحقق 422 إلى أسطر مفهومة بدل [object Object]', () => {
    const msg = describeApiError({
      response: {
        status: 422,
        data: {
          detail: [{ loc: ['query', 'catalog_id'], msg: 'value is not a valid integer' }],
        },
      },
      config: { url: '/products/export-pdf' },
    });

    expect(msg).toContain('HTTP 422');
    expect(msg).toContain('catalog_id');
    expect(msg).toContain('valid integer');
    expect(msg).not.toContain('[object Object]');
  });

  it('يُظهر سبب خطأ 500 بدل ابتلاعه', () => {
    const msg = describeApiError({
      response: { status: 500, data: { detail: 'فشل توليد ملف الـ PDF\nنوع الخطأ: OSError' } },
      config: { url: '/products/export-pdf' },
    });
    expect(msg).toContain('HTTP 500');
    expect(msg).toContain('OSError');
  });

  it('يميّز انقطاع الشبكة عن خطأ الخادم', () => {
    const msg = describeApiError({ code: 'ERR_NETWORK', message: 'Network Error' });
    expect(msg).toMatch(/انقطاع شبكة|المهلة/);
    expect(msg).not.toContain('HTTP');
  });

  it('يميّز انتهاء المهلة', () => {
    const msg = describeApiError({ code: 'ECONNABORTED', message: 'timeout of 25000ms exceeded' });
    expect(msg).toMatch(/المهلة/);
  });

  it('يرجع للرسالة الاحتياطية حين لا يرسل الخادم أي تفصيل', () => {
    const msg = describeApiError(
      { response: { status: 404, data: {} }, config: { url: '/x' } },
      'احتياطية',
    );
    expect(msg).toContain('HTTP 404');
    expect(msg).toContain('احتياطية');
  });

  it('لا ينهار مع خطأ فارغ', () => {
    expect(describeApiError(null, 'احتياطية')).toBe('احتياطية');
  });
});
