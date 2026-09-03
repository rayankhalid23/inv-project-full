import { describe, it, expect } from 'vitest';
import {
  parseOrderDestination,
  resolveDarbDestination,
  matchDestinationToCatalog,
} from '../utils/darbDestination';
import { buildDestinationOptions, normalizeArabic } from '../components/sales/DestinationPicker';
import { FALLBACK_DARB_CITIES } from '../constants/darbAssabilFallback';

describe('resolveDarbDestination — مواءمة الفروع الرسمية', () => {
  it('يحوّل المناطق التابعة إلى فرعها الرسمي', () => {
    expect(resolveDarbDestination('زليتن', '')).toEqual({ city: 'الخمس', area: 'زليتن' });
    expect(resolveDarbDestination('القره بولي', 'وسط المدينة')).toEqual({ city: 'قصر خيار', area: 'القره بولي' });
  });

  it('يحافظ على المنطقة المحددة صراحة داخل الفرع', () => {
    expect(resolveDarbDestination('شحات', 'سوق الجمعة')).toEqual({ city: 'البيضاء', area: 'سوق الجمعة' });
  });

  it('يترك المدن الرسمية كما هي', () => {
    expect(resolveDarbDestination('بنغازي', 'الليثي')).toEqual({ city: 'بنغازي', area: 'الليثي' });
  });
});

describe('parseOrderDestination — استخراج وجهة الطلب', () => {
  it('يستخرج المدينة والمنطقة والعنوان التفصيلي من العنوان المركّب', () => {
    const order = { address: 'بنغازي - الليثي - بالقرب من جامع الصقع' };
    expect(parseOrderDestination(order)).toEqual({
      city: 'بنغازي',
      area: 'الليثي',
      detailed: 'بالقرب من جامع الصقع',
    });
  });

  it('يعتمد على delivery_info للطلبات القديمة بدون عنوان مركّب', () => {
    const order = { address: 'خلف السوق', delivery_info: 'درب السبيل [نسائي] (مصراتة - الزروق)' };
    const res = parseOrderDestination(order);
    expect(res.city).toBe('مصراتة');
    expect(res.area).toBe('الزروق');
    expect(res.detailed).toBe('خلف السوق');
  });

  it('يتجاهل delivery_info الذي يحمل رقم التتبع فقط', () => {
    const order = { address: 'شارع النصر', delivery_info: 'درب السبيل (تتبع: TRK-123)' };
    expect(parseOrderDestination(order).city).toBe('');
  });

  it('يطبّق مواءمة الفروع على الوجهة المستخرجة', () => {
    const order = { address: 'زليتن - وسط المدينة - قرب المستشفى' };
    const res = parseOrderDestination(order);
    expect(res).toEqual({ city: 'الخمس', area: 'زليتن', detailed: 'قرب المستشفى' });
  });

  it('يعيد نفس الوجهة عند تكرار الاستخراج (ثبات بين التعديل والإرسال)', () => {
    const address = 'طرابلس - عين زارة - شارع الهضبة';
    const first = parseOrderDestination({ address });
    const rebuilt = `${first.city} - ${first.area} - ${first.detailed}`;
    expect(parseOrderDestination({ address: rebuilt })).toEqual(first);
  });
});

describe('matchDestinationToCatalog — الضبط على قائمة درب السبيل', () => {
  const catalog = FALLBACK_DARB_CITIES;

  it('يقبل الوجهة الصحيحة كما هي', () => {
    expect(matchDestinationToCatalog(catalog, 'بنغازي', 'الليثي')).toEqual({ city: 'بنغازي', area: 'الليثي' });
  });

  it('يصحّح المنطقة غير الموجودة داخل المدينة إلى وسط المدينة', () => {
    const res = matchDestinationToCatalog(catalog, 'بنغازي', 'منطقة غير موجودة');
    expect(res.city).toBe('بنغازي');
    expect(catalog['بنغازي']).toContain(res.area);
  });

  it('يرفع المنطقة إلى مدينتها عندما تُمرَّر كمدينة', () => {
    const res = matchDestinationToCatalog(catalog, 'الليثي', '');
    expect(res).toEqual({ city: 'بنغازي', area: 'الليثي' });
  });

  it('يعيد الوجهة الافتراضية عند وجهة مجهولة تماماً', () => {
    const res = matchDestinationToCatalog(catalog, 'مدينة وهمية', 'منطقة وهمية');
    expect(catalog[res.city]).toBeDefined();
    expect(catalog[res.city]).toContain(res.area);
  });

  it('لا يفقد الوجهة عندما تكون القائمة فارغة (وضع الأوفلاين قبل التحميل)', () => {
    expect(matchDestinationToCatalog({}, 'بنغازي', 'الليثي')).toEqual({ city: 'بنغازي', area: 'الليثي' });
  });
});

describe('buildDestinationOptions — القائمة الموحّدة (المدينة - المنطقة)', () => {
  const options = buildDestinationOptions(FALLBACK_DARB_CITIES);

  it('يبني خياراً لكل زوج مدينة/منطقة دون تكرار', () => {
    const expected = Object.values(FALLBACK_DARB_CITIES)
      .reduce((sum, areas) => sum + new Set(areas).size, 0);
    expect(options.length).toBe(expected);
    expect(new Set(options.map(o => o.key)).size).toBe(options.length);
  });

  it('يعرض كل خيار بصيغة «المدينة - المنطقة»', () => {
    const opt = options.find(o => o.city === 'بنغازي' && o.area === 'الليثي');
    expect(opt).toBeDefined();
    expect(opt.label).toBe('بنغازي - الليثي');
  });

  it('يشمل كل مدن القائمة', () => {
    const cities = new Set(options.map(o => o.city));
    expect(cities.size).toBe(Object.keys(FALLBACK_DARB_CITIES).length);
  });
});

describe('البحث داخل القائمة المنسدلة', () => {
  const options = buildDestinationOptions(FALLBACK_DARB_CITIES);
  const search = (q) => {
    const tokens = normalizeArabic(q).split(' ').filter(Boolean);
    return options.filter(o => tokens.every(t => o.search.includes(t)));
  };

  it('يبحث باسم المنطقة وحدها', () => {
    const res = search('الليثي');
    expect(res.length).toBeGreaterThan(0);
    expect(res.every(o => o.area.includes('الليثي'))).toBe(true);
  });

  it('يبحث بالمدينة والمنطقة معاً بأي ترتيب', () => {
    expect(search('بنغازي الليثي').map(o => o.label)).toContain('بنغازي - الليثي');
    expect(search('الليثي بنغازي').map(o => o.label)).toContain('بنغازي - الليثي');
  });

  it('يتجاهل الهمزات والتشكيل في البحث', () => {
    expect(search('الابيار').length).toBeGreaterThan(0);
    expect(search('الأبيار').length).toBeGreaterThan(0);
  });

  it('يعيد كل مناطق المدينة عند البحث باسمها', () => {
    const res = search('بنغازي');
    expect(res.length).toBe(new Set(FALLBACK_DARB_CITIES['بنغازي']).size);
  });

  it('يعيد قائمة فارغة عند عدم وجود نتائج', () => {
    expect(search('xyz-غير-موجود')).toHaveLength(0);
  });
});
