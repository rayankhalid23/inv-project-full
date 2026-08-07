/**
 * =====================================================================
 * BELLAGIO PWA - Background Auto-Sync Engine (Production Ready)
 * المحرك التلقائي لمزامنة بيانات IndexedDB مع سيرفر بايثون (FastAPI) بصمت
 * =====================================================================
 */

import axios from 'axios';
import { getPendingActions, removePendingAction } from './idbStorage';

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
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };

  let successCount = 0;
  let failedCount = 0;

  for (const item of actions) {
    try {
      if (onProgressCallback) {
        onProgressCallback(`جاري رفع: ${item.description || item.type}`);
      }

      let response = null;

      // 1. إرسال الطلب حسب نوع العملية
      if (item.type === 'CREATE_ORDER') {
        response = await axios.post('/orders/', item.payload, { headers });
      } else if (item.type === 'DIRECT_SALE') {
        response = await axios.post(`/inventory/direct-sale-by-qr?qr_code=${encodeURIComponent(item.payload.qr_code)}&note=${encodeURIComponent(item.payload.note || '')}`, null, { headers });
      } else if (item.type === 'SCAN_RETURN') {
        response = await axios.post(`/orders/return-item-by-qr?qr_code=${encodeURIComponent(item.payload.qr_code)}&note=${encodeURIComponent(item.payload.note || '')}`, null, { headers });
      } else if (item.type === 'SCAN_DAMAGE') {
        response = await axios.post(`/orders/mark-as-damaged?qr_code=${encodeURIComponent(item.payload.qr_code)}&note=${encodeURIComponent(item.payload.note || '')}`, null, { headers });
      } else if (item.type === 'UPDATE_ORDER') {
        response = await axios.put(`/orders/${item.payload.id}`, item.payload.data, { headers });
      } else if (item.type === 'ADD_STOCK') {
        response = await axios.post('/inventory/add-stock', item.payload, { headers });
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

      // في حال كان الخطأ 4xx (بيانات غير صالحة من العميل)، نحذف العملية لتجنب التكرار والتعليق
      if (error.response && error.response.status >= 400 && error.response.status < 500) {
        console.warn(`[SyncEngine] حذف عملية ذات مدخلات غير صالحة (HTTP ${error.response.status}):`, item.id);
        await removePendingAction(item.id);
      }
    }
  }

  isSyncingActive = false;
  return {
    status: 'completed',
    total: actions.length,
    successCount,
    failedCount
  };
};
