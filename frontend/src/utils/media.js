/**
 * =====================================================================
 * المصدر الوحيد لبناء روابط الصور وأكواد QR في الواجهة
 * =====================================================================
 *
 * الخادم يخزّن مساراً نسبياً موحّداً: /static/uploads/<category>/<file>
 * وهذه الدالة تحوّله إلى رابط صالح للعرض.
 *
 * لماذا واحدة فقط؟ كانت هناك خمس نسخ متفرقة من هذا المنطق في الشاشات،
 * كل واحدة تعالج حالة وتُهمل أخرى (فواصل ويندوز "\"، غياب الشرطة
 * الأمامية، بادئات قديمة)، فكانت الصور تظهر في شاشة وتختفي في أخرى.
 *
 * الأساس الافتراضي هو أصل الصفحة الحالية، فيعمل التطبيق تلقائياً على
 * localhost وعلى شبكة LAN وعلى أي دومين بعد الرفع دون أي تعديل.
 * ولو نُقلت الملفات لاحقاً إلى CDN يكفي ضبط VITE_MEDIA_BASE.
 */

/** أساس روابط الوسائط: CDN إن وُجد، وإلا نفس أصل الصفحة */
const MEDIA_BASE = (import.meta.env?.VITE_MEDIA_BASE || '').replace(/\/+$/, '');

/** صورة بديلة شفافة 1×1 تمنع أيقونة الصورة المكسورة */
export const IMAGE_FALLBACK =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">' +
    '<rect width="64" height="64" fill="%23f1f5f9"/>' +
    '<path d="M20 40l8-10 6 7 5-6 7 9z" fill="%23cbd5e1"/>' +
    '<circle cx="25" cy="24" r="4" fill="%23cbd5e1"/></svg>'
  );

/**
 * يبني رابط عرض صالحاً من أي شكل مخزَّن (أو من ملف محلي قبل الرفع).
 * @param {string|File|null|undefined} path
 * @returns {string|null} رابط صالح، أو null إن لم توجد صورة
 */
export function mediaUrl(path) {
  if (!path) return null;

  // معاينة ملف مختار من الجهاز قبل رفعه
  if (typeof File !== 'undefined' && path instanceof File) {
    return URL.createObjectURL(path);
  }

  let value = String(path).trim();
  if (!value) return null;

  // رابط كامل أو صورة مضمّنة: تُستخدم كما هي
  if (/^(https?:)?\/\//i.test(value) || value.startsWith('data:') || value.startsWith('blob:')) {
    return value;
  }

  // فواصل ويندوز "\" تكسر الروابط في المتصفح
  value = value.replace(/\\/g, '/');

  // ضمان الشرطة الأمامية (بعض الصفوف القديمة تبدأ بـ "static/...")
  if (!value.startsWith('/')) value = `/${value}`;

  return `${MEDIA_BASE || window.location.origin}${value}`;
}

/**
 * معالج onError جاهز للاستخدام على وسم <img>:
 *   <img src={mediaUrl(x)} onError={onImageError} />
 * يمنع حلقة لا نهائية إن فشل البديل أيضاً.
 */
export function onImageError(e) {
  const el = e?.currentTarget;
  if (!el || el.dataset.fallbackApplied === '1') return;
  el.dataset.fallbackApplied = '1';
  el.src = IMAGE_FALLBACK;
}

export default mediaUrl;
