import axios from 'axios';

const QUEUE_KEY = 'bellagio_offline_queue';

/**
 * جلب قائمة العمليات المخزنة محلياً عند انقطاع الإنترنت
 */
export const getOfflineQueue = () => {
  try {
    const data = localStorage.getItem(QUEUE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error('Error reading offline queue:', err);
    return [];
  }
};

/**
 * حفظ عملية جديدة في الطابور المحلي للاحتفاظ بها
 */
export const enqueueOfflineAction = (actionType, payload, description = '') => {
  try {
    const queue = getOfflineQueue();
    const newAction = {
      id: `offline_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type: actionType,
      payload,
      description,
      timestamp: new Date().toISOString(),
    };
    queue.push(newAction);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    console.log(`[OfflineQueue] Enqueued action: ${actionType}`, newAction);
    return newAction;
  } catch (err) {
    console.error('Error saving offline action:', err);
    return null;
  }
};

/**
 * حذف عملية معالجة من الطابور
 */
export const removeOfflineAction = (actionId) => {
  try {
    const queue = getOfflineQueue();
    const updated = queue.filter(item => item.id !== actionId);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Error removing offline action:', err);
  }
};

/**
 * تصفير الطابور بالكامل
 */
export const clearOfflineQueue = () => {
  try {
    localStorage.removeItem(QUEUE_KEY);
  } catch (err) {
    console.error('Error clearing queue:', err);
  }
};

/**
 * رفع ومزامنة العمليات المخزنة محلياً عند عودة الإنترنت
 */
export const syncPendingOfflineActions = async (onSyncProgress) => {
  const queue = getOfflineQueue();
  if (!queue || queue.length === 0) {
    return { success: true, count: 0 };
  }

  const token = localStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };

  let successCount = 0;
  let failCount = 0;

  for (const item of queue) {
    try {
      if (onSyncProgress) onSyncProgress(`جاري رفع: ${item.description || item.type}`);

      let response;
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

      if (response && (response.status === 200 || response.status === 201)) {
        removeOfflineAction(item.id);
        successCount++;
      }
    } catch (error) {
      console.error(`Failed to sync item ${item.id}:`, error);
      failCount++;
      // إذا كان الخطأ بسبب انتهاء التوكن أو خطأ سيرفر 400 غير الشبكة، نتجاوزه لتنظيف العملية
      if (error.response && error.response.status >= 400 && error.response.status < 500) {
        removeOfflineAction(item.id);
      }
    }
  }

  return { success: true, count: successCount, failed: failCount };
};
