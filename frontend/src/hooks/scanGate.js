/**
 * بوابة قبول الأكواد الممسوحة — منطق خالص بلا كاميرا ولا React، ليكون
 * قابلاً للاختبار وحده. الكاميرا تنادي المعالج لكل إطار ناجح (10-15 مرة
 * في الثانية)، فبدون هذه البوابة يُسجَّل الصنف الواحد عشرات المرات.
 *
 * قاعدتان مختلفتان عمداً:
 *
 *   • minGapMs (قصير)      — أقل فاصل بين أي عمليتي مسح مقبولتين. يبقى قصيراً
 *                             حتى يمسح الموظف عدة أصناف متتالية بسرعة.
 *   • sameCodeCooldownMs   — منع إعادة قراءة *نفس* الكود. هذه هي الحماية
 *     (أطول)                الحقيقية من التسجيل المزدوج بالخطأ: القطعة تبقى
 *                            أمام العدسة ثانية أو ثانيتين بعد قراءتها.
 *
 * كما أن البوابة تُقفل طوال مدة المعالجة (نداء الخادم)، فلا يُقبل كود جديد
 * قبل انتهاء العملية السابقة.
 *
 * المهلتان تقبلان رقماً أو دالة تعيد رقماً، ليتمكّن المستدعي من تغييرهما
 * أثناء التشغيل دون إعادة بناء البوابة (فيضيع تاريخ المسح المخزَّن فيها).
 */
const resolve = (value, fallback) => {
  const n = Number(typeof value === 'function' ? value() : value);
  return Number.isFinite(n) ? n : fallback;
};

export function createScanGate({
  minGapMs,
  sameCodeCooldownMs,
  now = () => Date.now(),
} = {}) {
  let processing = false;
  let lastAcceptedAt = 0;
  let lastCode = '';
  let lastCodeAt = 0;

  return {
    /**
     * هل نقبل هذا الكود الآن؟ ترجع الكود منظَّفاً عند القبول و null عند الرفض.
     * القبول يقفل البوابة فوراً — لا بد من نداء release() لفتحها.
     */
    accept(rawCode) {
      if (processing) return null;
      if (rawCode === null || rawCode === undefined) return null;

      const code = String(rawCode).trim();
      if (!code) return null;

      const t = now();
      if (t - lastAcceptedAt < resolve(minGapMs, 400)) return null;
      if (code === lastCode && t - lastCodeAt < resolve(sameCodeCooldownMs, 2200)) return null;

      processing = true;
      lastAcceptedAt = t;
      lastCode = code;
      lastCodeAt = t;
      return code;
    },

    /**
     * فتح البوابة بعد انتهاء المعالجة.
     * نجدّد ختم وقت الكود هنا لا عند القبول: لو استغرق نداء الخادم أطول من
     * مهلة "نفس الكود" لانتهت أثناء الانتظار، فيُقبل الكود نفسه فور فتح
     * البوابة — وهو بالضبط الخطأ الذي نمنعه.
     */
    release() {
      processing = false;
      lastCodeAt = now();
    },

    /** تصفير كامل عند إغلاق الكاميرا حتى يبدأ الفتح التالي من حالة نظيفة */
    reset() {
      processing = false;
      lastAcceptedAt = 0;
      lastCode = '';
      lastCodeAt = 0;
    },

    get isProcessing() {
      return processing;
    },
  };
}
