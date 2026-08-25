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

