import { describe, it, expect } from 'vitest';
import { filterProducts } from '../components/products/ProductPicker';

/**
 * العطل المُبلَّغ عنه: في بحث التوالف والرواجع والبيع المباشر "منتج 00003
 * ما يطلعش ومنتج 00080 يطلع".
 *
 * السبب المُقاس: البحث كان يجرّد الأصفار البادئة، فتتحوّل "00003" إلى "3"
 * ويطابق كل كود أو اسم فيه الرقم 3، ثم تُعاد النتائج **بترتيب المصدر**
 * (الأحدث أولاً) لا بقوة المطابقة. على كتالوج من 136 منتجاً يعطي ذلك 29 نتيجة
 * يقع المنتج المقصود في آخرها (الموضع 28) داخل صندوق ارتفاعه ثلاثة صفوف —
 * فيبدو غير موجود. بينما "00080" يعطي نتيجة واحدة فتظهر فوراً.
 *
 * الاختبار أدناه يثبّت السلوك الصحيح: المطابقة الدقيقة للكود في الموضع الأول
 * دائماً، مع بقاء كل النتائج التي كانت تظهر سابقاً (الترتيب فقط هو ما تغيّر).
 */

// نحاكي القائمة الحقيقية: مرتّبة بالأحدث أولاً، بأكواد PROD-000NN
const makeCatalog = () =>
  Array.from({ length: 136 }, (_, i) => {
    const n = 136 - i; // 136 (الأحدث) ← 1 (الأقدم)
    return {
      id: n,
      name: `بدلة اولاد ${n}`,
      code: `PROD-${String(n).padStart(5, '0')}`,
      colors: [{ id: 1, color_name: 'أحمر', variants: [{ id: n, sku: `${String(n).padStart(5, '0')}-1-1` }] }],
    };
  });

describe('ترتيب نتائج بحث المنتجات بقوة المطابقة', () => {
  const products = makeCatalog();
  const DISPLAY_LIMIT = 60; // نفس حدّ العرض في ProductPicker

  it('المنتج القديم 00003 يظهر أولاً عند البحث بكوده — العطل المُبلَّغ عنه', () => {
    const results = filterProducts(products, '00003');
    // قبل الإصلاح كان موضعه 28 من 29 نتيجة؛ الآن الأول
    expect(results.indexOf(results.find((p) => p.code === 'PROD-00003'))).toBe(0);
    expect(results[0].code).toBe('PROD-00003');
    expect(results.slice(0, DISPLAY_LIMIT).map((p) => p.code)).toContain('PROD-00003');
  });

  it('كل نتيجة فضفاضة تأتي بعد المطابقة الدقيقة لا قبلها', () => {
    const results = filterProducts(products, '00003');
    const exactIndex = results.findIndex((p) => p.code === 'PROD-00003');
    const looseIndex = results.findIndex((p) => p.code === 'PROD-00130');
    expect(exactIndex).toBeLessThan(looseIndex);
  });

  it('المنتج الحديث 00080 يظهر أولاً أيضاً — لم ينكسر ما كان يعمل', () => {
    const results = filterProducts(products, '00080');
    expect(results[0].code).toBe('PROD-00080');
  });

  it('الرقم بلا أصفار بادئة يجد نفس المنتج (مفيد لقارئ الباركود)', () => {
    expect(filterProducts(products, '3')[0].code).toBe('PROD-00003');
    expect(filterProducts(products, '8')[0].code).toBe('PROD-00008');
  });

  it('الكود الكامل يعطي أعلى درجة مطابقة', () => {
    expect(filterProducts(products, 'PROD-00042')[0].code).toBe('PROD-00042');
  });

  it('البحث بالاسم يعمل ويرتّب البادئة قبل التضمين', () => {
    const results = filterProducts(products, 'بدلة اولاد 7');
    expect(results[0].name).toBe('بدلة اولاد 7');
  });

  it('نص فارغ يعيد القائمة كما هي دون ترتيب أو اقتطاع', () => {
    expect(filterProducts(products, '')).toHaveLength(136);
    expect(filterProducts(products, '   ')[0].code).toBe('PROD-00136');
  });

  it('بحث بلا نتائج يعيد قائمة فارغة', () => {
    expect(filterProducts(products, 'منتج غير موجود إطلاقاً')).toHaveLength(0);
  });

  it('لا يُسقط أي نتيجة كانت تظهر سابقاً — الترتيب فقط هو ما تغيّر', () => {
    // كل منتج فيه الرقم 3 كان يطابق سابقاً بالمنطق الفضفاض، ولا يزال يطابق
    const results = filterProducts(products, '00003');
    expect(results.length).toBeGreaterThan(1);
    expect(results.map((p) => p.code)).toContain('PROD-00030');
  });

  it('يبحث داخل SKU المتغيّرات أيضاً', () => {
    const results = filterProducts(products, '00013-1-1');
    expect(results[0].code).toBe('PROD-00013');
  });

  it('يتجاهل حالة الأحرف والمسافات الزائدة', () => {
    expect(filterProducts(products, '  prod-00055  ')[0].code).toBe('PROD-00055');
  });

  it('يتحمّل منتجات بحقول ناقصة دون أن يرمي', () => {
    const messy = [{ id: 1 }, { id: 2, code: null, name: undefined, colors: null }];
    expect(() => filterProducts(messy, 'أي شيء')).not.toThrow();
    expect(filterProducts(messy, 'أي شيء')).toHaveLength(0);
  });
});
