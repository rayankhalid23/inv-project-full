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
  if (!navigator.onLine) return true;
  if (!err) return false;

  // انتهاء المهلة في axios
  if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' || err.code === 'ERR_NETWORK') return true;

  // لم تصل أي استجابة من الخادم إطلاقاً
  if (err.request && !err.response) return true;

  const msg = String(err.message || '');
  return msg.includes('Network Error') || msg.includes('timeout') || msg.includes('Failed to fetch');
};

/** المهلة الافتراضية لكل طلبات الـ API (بالمللي ثانية) */
export const API_TIMEOUT_MS = 15000;
