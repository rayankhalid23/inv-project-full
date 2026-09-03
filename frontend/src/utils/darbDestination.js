/**
 * أدوات موحّدة لاستخراج ومواءمة وجهة التوصيل (المدينة - المنطقة) مع شبكة درب السبيل.
 * تُستخدم في إنشاء الطلب، تعديل الطلب، وإرسال الشحنة لدرب السبيل — حتى تبقى
 * الوجهة المعروضة في كل الشاشات مطابقة تماماً لما هو محفوظ في الطلب.
 */

/** مطابق لخريطة BRANCH_REDIRECTS في app/services/darb_assabil_service.py */
export const DARB_BRANCH_REDIRECTS = {
  'القره بولي': ['قصر خيار', 'القره بولي'],
  'تازربو':     ['جالو اوجلة', 'تازربو'],
  'زليتن':      ['الخمس', 'زليتن'],
  'صرمان':      ['صبراتة', 'صرمان'],
  'مسلاتة':     ['الخمس', 'مسلاتة'],
  'الجميل':     ['زوارة', 'الجميل'],
  'رقدالين':    ['زوارة', 'رقدالين'],
  'زلطن':       ['زوارة', 'زلطن'],
  'الأبيار':    ['المرج', 'الأبيار'],
  'شحات':       ['البيضاء', 'شحات'],
  'سوسة':       ['البيضاء', 'سوسة'],
  'بن جواد':    ['رأس لانوف', 'بن جواد'],
  'العقيلة':    ['البريقة', 'العقيلة'],
  'بشر':        ['البريقة', 'بشر'],
};

/** مواءمة المدينة/المنطقة مع الفرع الرسمي المعتمد لدى درب السبيل */
export const resolveDarbDestination = (city, area) => {
  const cityClean = (city || '').trim();
  const areaClean = (area || '').trim();

  const redirect = DARB_BRANCH_REDIRECTS[cityClean];
  if (redirect) {
    const [parentCity, defaultArea] = redirect;
    const finalArea = (!areaClean || areaClean === 'وسط المدينة' || areaClean === cityClean)
      ? defaultArea
      : areaClean;
    return { city: parentCity, area: finalArea };
  }

  return { city: cityClean, area: areaClean };
};

/**
 * استخراج وجهة الطلب المحفوظة.
 * الأولوية للعنوان `address` لأنه يُحدَّث دائماً عند التعديل بصيغة:
 * «المدينة - المنطقة - العنوان التفصيلي»، ثم `delivery_info` كمصدر احتياطي
 * بصيغة «درب السبيل [رجالي] (المدينة - المنطقة)».
 *
 * @returns {{ city: string, area: string, detailed: string }}
 */
export const parseOrderDestination = (order) => {
  let city = '';
  let area = '';
  let detailed = '';

  const address = (order?.address || '').trim();

  // 1. العنوان المركّب: «المدينة - المنطقة - التفاصيل»
  if (address.includes(' - ')) {
    const parts = address.split(' - ').map(s => s.trim());
    if (parts.length >= 2) {
      city = parts[0];
      area = parts[1];
      detailed = parts.slice(2).join(' - ').trim() || parts[1];
    }
  } else {
    detailed = address;
  }

  // 2. مصدر احتياطي: delivery_info للطلبات القديمة التي لم يُخزَّن عنوانها مركّباً
  if (!city && order?.delivery_info && order.delivery_info.includes('(')) {
    const match = order.delivery_info.match(/\(([^)]+)\)/);
    if (match && match[1] && !match[1].includes('تتبع')) {
      const segs = match[1].split('-').map(s => s.trim()).filter(Boolean);
      if (segs.length >= 2) {
        city = segs[0];
        area = segs[1];
      } else if (segs.length === 1) {
        city = segs[0];
      }
    }
  }

  if (!detailed) detailed = address;

  const resolved = resolveDarbDestination(city, area);
  return { city: resolved.city, area: resolved.area, detailed };
};

/**
 * ضبط الوجهة على قائمة المدن والمناطق المتاحة فعلياً من درب السبيل.
 * يعيد أقرب وجهة صالحة، وإلا الوجهة الافتراضية.
 */
export const matchDestinationToCatalog = (citiesAreas, city, area, fallback = { city: 'طرابلس', area: 'وسط المدينة' }) => {
  const map = citiesAreas || {};
  const cityKeys = Object.keys(map);

  if (city && map[city]) {
    const areas = map[city] || [];
    if (area && areas.includes(area)) return { city, area };
    return { city, area: areas.includes('وسط المدينة') ? 'وسط المدينة' : (areas[0] || area || 'وسط المدينة') };
  }

  // المدينة غير موجودة كفرع — نبحث عنها كمنطقة تابعة لمدينة أخرى
  if (city) {
    for (const c of cityKeys) {
      if ((map[c] || []).includes(city)) return { city: c, area: city };
    }
  }

  if (cityKeys.length === 0) return { city: city || fallback.city, area: area || fallback.area };

  const fallbackCity = map[fallback.city] ? fallback.city : cityKeys[0];
  const fallbackAreas = map[fallbackCity] || [];
  return {
    city: fallbackCity,
    area: fallbackAreas.includes(fallback.area) ? fallback.area : (fallbackAreas[0] || fallback.area),
  };
};
