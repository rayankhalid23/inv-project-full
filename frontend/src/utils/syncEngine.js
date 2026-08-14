/**
 * =====================================================================
 * BELLAGIO PWA - Background Auto-Sync Engine (Production Ready)
 * المحرك التلقائي لمزامنة بيانات IndexedDB مع سيرفر بايثون (FastAPI) بصمت
 * =====================================================================
 */

import axios from 'axios';
import { getPendingActions, removePendingAction } from './idbStorage';
import { API_TIMEOUT_MS } from './netErrors';

let isSyncingActive = false;

/**
 * دالة مزامنة العمليات المخزنة محلياً وإرسالها إلى خادم بايثون
 * @param {function} onProgressCallback - دالة اختيارية لمتابعة تقدم الرفع
 */
export const runAutoSync = async (onProgressCallback) => {
  if (isSyncingActive) {
    console.log('[SyncEngine] المزامنة قيد التشغيل بالفعل...');
    return { status: 'already_running', count: 0 };
  }

  if (!navigator.onLine) {
    console.log('[SyncEngine] تعذر المزامنة: لا يوجد اتصال بالإنترنت حالياً.');
    return { status: 'offline', count: 0 };
  }

  const actions = await getPendingActions();
  if (!actions || actions.length === 0) {
    return { status: 'empty', count: 0, successCount: 0 };
  }

  isSyncingActive = true;
  console.log(`[SyncEngine] بدء مزامنة ${actions.length} عملية مخزنة في IndexedDB...`);

  const token = localStorage.getItem('token');
  // مهلة زمنية إلزامية: بدونها يمكن لعملية واحدة معلّقة أن توقف طابور
  // المزامنة بالكامل إلى ما لا نهاية على شبكة ضعيفة أو بوابة أسيرة.
  const reqConfig = {
    timeout: API_TIMEOUT_MS,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
  };

  let successCount = 0;
  let failedCount = 0;

  try {
  for (const item of actions) {
    try {
      if (onProgressCallback) {
        onProgressCallback(`جاري رفع: ${item.description || item.type}`);
      }

      let response = null;
      const qr = encodeURIComponent(item.payload?.qr_code ?? '');
      const note = encodeURIComponent(item.payload?.note || '');

      // 1. إرسال الطلب حسب نوع العملية
      if (item.type === 'CREATE_ORDER') {
        // المسار الصحيح هو /orders/create — كان /orders/ يرد 405 دائماً
        // فتُحذف كل طلبات الأوفلاين باعتبارها "مدخلات غير صالحة".
        response = await axios.post('/orders/create', item.payload, reqConfig);
      } else if (item.type === 'DIRECT_SALE') {
        // رقم الزبون اختياري — يُرسل فقط إن كان قد أُدخل وقت البيع الأوفلاين
        const phone = item.payload?.customer_phone
          ? `&customer_phone=${encodeURIComponent(item.payload.customer_phone)}`
          : '';
        response = await axios.post(`/inventory/direct-sale-by-qr?qr_code=${qr}&note=${note}${phone}`, null, reqConfig);
      } else if (item.type === 'SCAN_RETURN') {
        response = await axios.post(`/orders/return-item-by-qr?qr_code=${qr}&note=${note}`, null, reqConfig);
      } else if (item.type === 'SCAN_DAMAGE') {
        response = await axios.post(`/orders/mark-as-damaged?qr_code=${qr}&note=${note}`, null, reqConfig);
      } else if (item.type === 'UPDATE_ORDER') {
        // المسار الصحيح هو /orders/{id}/update
        response = await axios.put(`/orders/${item.payload.id}/update`, item.payload.data, reqConfig);
      } else if (item.type === 'ADD_STOCK') {
        response = await axios.post('/inventory/add-stock', item.payload, reqConfig);
      } else {
        // نوع غير معروف: لا يمكن رفعه أبداً، وتركه يعني تعليق العدّاد للأبد
        console.warn(`[SyncEngine] نوع عملية غير معروف (${item.type}) — سيُحذف من الطابور:`, item.id);
        await removePendingAction(item.id);
        failedCount++;
        continue;
      }

      // 2. عند نجاح الرفع، يتم حذف العملية من IndexedDB
      if (response && (response.status === 200 || response.status === 201)) {
        await removePendingAction(item.id);
        successCount++;
        console.log(`[SyncEngine] تمت مزامنة العملية ${item.id} بنجاح ✅`);
      }
    } catch (error) {
      console.error(`[SyncEngine] فشلت مزامنة العملية ${item.id}:`, error);
      failedCount++;

      const status = error.response?.status;

      // 401/403: التوكن منتهي أو الصلاحية مفقودة — العملية نفسها سليمة تماماً.
      // حذفها هنا يعني فقدان بيعة حقيقية لمجرد أن الجلسة انتهت أثناء الانقطاع.
      // نُبقيها في الطابور ونوقف المزامنة فوراً لأن بقية العمليات ستفشل بنفس السبب.
      if (status === 401 || status === 403) {
        console.warn('[SyncEngine] الجلسة منتهية — إيقاف المزامنة مع الاحتفاظ بكل العمليات المعلقة.');
        return {
          status: 'auth_required',
          total: actions.length,
          successCount,
          failedCount,
          authRequired: true,
        };
      }

      // قائمة بيضاء صارمة: لا نحذف عملية إلا إذا كانت بياناتها مرفوضة فعلاً
      // ولن تُقبل مهما أُعيدت المحاولة.
      //   400/422 = بيانات غير صالحة   |   409 = مسجّلة مسبقاً (تكرار)
      // أي شيء آخر (404، 405، 5xx، أخطاء الشبكة) قد يكون خطأً برمجياً أو
      // عطلاً مؤقتاً يُصلَح بتحديث لاحق — وحذف العملية حينها يعني فقدان
      // بيعة حقيقية. لذلك تبقى في الطابور دائماً.
      const UNRECOVERABLE = [400, 409, 422];
      if (UNRECOVERABLE.includes(status)) {
        console.warn(`[SyncEngine] حذف عملية مرفوضة نهائياً (HTTP ${status}):`, item.id, item.description);
        await removePendingAction(item.id);
      } else {
        console.warn(`[SyncEngine] إبقاء العملية للمحاولة لاحقاً (HTTP ${status ?? 'network'}):`, item.id, item.description);
      }
    }
  }

  return {
    status: 'completed',
    total: actions.length,
    successCount,
    failedCount
  };
  } finally {
    // ضروري: لو خرجت الدالة بأي طريقة (return أو استثناء غير متوقع) وبقيت
    // هذه الراية true، لتعطّلت المزامنة نهائياً لبقية عمر الصفحة.
    isSyncingActive = false;
  }
};
