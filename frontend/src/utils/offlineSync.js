/**
 * =====================================================================
 * BELLAGIO PWA - طبقة توافق للطابور الأوفلاين (مهجورة)
 * =====================================================================
 *
 * كان هذا الملف يحتفظ بطابور مستقل في localStorage، بينما محرك المزامنة
 * (utils/syncEngine.js) يقرأ من IndexedDB فقط. النتيجة أن كل عملية بيع أو
 * مسح تتم بدون إنترنت كانت تُحفظ هنا ولا تُرفع للسيرفر أبداً ولا تظهر في
 * عدّاد "بانتظار المزامنة" — أي فقدان فعلي لبيانات المبيعات.
 *
 * صار مصدر الحقيقة الوحيد الآن هو IndexedDB عبر utils/idbStorage.js.
 * يبقى هذا الملف كطبقة توافق رقيقة فقط حتى لا ينكسر أي استيراد قديم.
 * الرجاء استخدام saveOfflineAction من utils/idbStorage.js في الكود الجديد.
 */

import {
  saveOfflineAction,
  getPendingActions,
  removePendingAction,
  clearPendingActions,
} from './idbStorage';

/** @deprecated استخدم saveOfflineAction من utils/idbStorage.js */
export const enqueueOfflineAction = (actionType, payload, description = '') =>
  saveOfflineAction(actionType, payload, description);

/** @deprecated استخدم getPendingActions من utils/idbStorage.js */
export const getOfflineQueue = () => getPendingActions();

/** @deprecated استخدم removePendingAction من utils/idbStorage.js */
export const removeOfflineAction = (actionId) => removePendingAction(actionId);

/** @deprecated استخدم clearPendingActions من utils/idbStorage.js */
export const clearOfflineQueue = () => clearPendingActions();

/**
 * @deprecated المزامنة صارت مسؤولية runAutoSync في utils/syncEngine.js.
 * كانت النسخة القديمة من هذه الدالة غير مستدعاة من أي مكان في المشروع.
 */
export const syncPendingOfflineActions = async (onSyncProgress) => {
  const { runAutoSync } = await import('./syncEngine');
  const result = await runAutoSync(onSyncProgress);
  return {
    success: true,
    count: result.successCount || 0,
    failed: result.failedCount || 0,
  };
};
