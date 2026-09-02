/**
 * =====================================================================
 * BELLAGIO PWA - تصنيف أخطاء الشبكة
 * =====================================================================
 * مصدر واحد لتحديد "هل هذا الخطأ سببه الشبكة؟" حتى تتصرف كل الصفحات
 * بنفس الطريقة وتحفظ العملية في الطابور الأوفلاين بدل إظهار خطأ للمستخدم.
 */

/**
 * يحدد ما إذا كان الخطأ ناتجاً عن الشبكة (انقطاع، مهلة، أو خادم غير قابل للوصول).
 *
 * مهم: يشمل ECONNABORTED الذي يُطلقه axios عند انتهاء المهلة الزمنية.
 * بدون هذا، الشبكات الضعيفة أو البوابات الأسيرة (captive portal) تُنتج
 * خطأ مهلة يُعرض للمستخدم كفشل نهائي بدل حفظ العملية للمزامنة لاحقاً.
 */
export const isNetworkError = (err) => {
  if (!err) return false;

  // إذا كانت هناك استجابة من الخادم (حتى لو كانت كود خطأ مثل 400 أو 422 أو 500)
  // فهذا يعني أن الاتصال تم بنجاح والخطأ من البيانات أو منطق الخادم، وليس انقطاع شبكة
  if (err.response) return false;

  // انتهاء المهلة أو أخطاء الاتصال المباشرة في axios
  if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' || err.code === 'ERR_NETWORK') return true;

  // تم إرسال الطلب لكن لم تصل أي استجابة من الخادم
  if (err.request && !err.response) return true;

  const msg = String(err.message || '');
  if (msg.includes('Network Error') || msg.includes('timeout') || msg.includes('Failed to fetch')) {
    return true;
  }

  // في حال انقطاع الإنترنت الصريح المؤكد وعدم وجود استجابة
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true;
  }

  return false;
};

/** المهلة الافتراضية لكل طلبات الـ API (بالمللي ثانية) */
export const API_TIMEOUT_MS = 25000;

/**
 * =====================================================================
 * رسالة خطأ تشخيصية دقيقة
 * =====================================================================
 * تُحوّل أي خطأ من axios إلى نص يقول **بالضبط** أين وقع العطل: رمز الحالة،
 * والمسار، ورسالة الخادم كاملة (بأسطرها).
 *
 * لماذا؟ كانت الشاشات تعرض رسالة ثابتة واحدة لكل الحالات ("لا توجد منتجات
 * مطابقة")، فيستحيل التمييز بين: فلتر لم يطابق شيئاً، وخطأ 500 في الخادم،
 * وخطأ 422 لأن قيمة الفلتر وصلت بنوع خاطئ، وانقطاع شبكة. أربع مشاكل مختلفة
 * تماماً بأربعة حلول مختلفة — وكلها كانت تبدو واحدة.
 */
export const describeApiError = (err, fallback = 'حدث خطأ غير متوقع') => {
  if (!err) return fallback;

  if (isNetworkError(err)) {
    return 'تعذّر الوصول إلى الخادم (انقطاع شبكة أو انتهاء المهلة).\n'
      + 'تأكد من الاتصال ثم أعد المحاولة.';
  }

  const status = err.response?.status;
  const url = err.config?.url;
  const detail = err.response?.data?.detail ?? err.response?.data?.message;

  let body;
  if (typeof detail === 'string' && detail.trim()) {
    body = detail;
  } else if (Array.isArray(detail)) {
    // صيغة أخطاء التحقق في FastAPI (422): قائمة كائنات loc/msg
    body = detail
      .map((d) => {
        const where = Array.isArray(d.loc) ? d.loc.filter((x) => x !== 'query').join('.') : '';
        return `• ${where ? where + ': ' : ''}${d.msg || JSON.stringify(d)}`;
      })
      .join('\n');
    body = 'قيمة أحد الفلاتر غير مقبولة من الخادم:\n' + body;
  } else if (detail) {
    body = JSON.stringify(detail);
  } else {
    body = fallback;
  }

  const head = status ? `[HTTP ${status}${url ? ` — ${url}` : ''}]` : '';
  return head ? `${head}\n${body}` : body;
};
