/**
 * =====================================================================
 * BELLAGIO PWA - Universal Background Auto-Sync Engine (Production Ready)
 * المحرك التلقائي الشامل لمزامنة كافة عمليات التطبيق مع الخادم بصمت ودقة
 * =====================================================================
 */

import axios from 'axios';
import { getPendingActions, removePendingAction } from './idbStorage';
import { API_TIMEOUT_MS } from './netErrors';

let isSyncingActive = false;

/**
 * دالة مزامنة كافة العمليات المخزنة محلياً وإرسالها إلى خادم بايثون (FastAPI)
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
          onProgressCallback(`جاري مزامنة: ${item.description || item.type}`);
        }

        let response = null;
        const qr = encodeURIComponent(item.payload?.qr_code ?? '');
        const note = encodeURIComponent(item.payload?.note || '');

        switch (item.type) {
          // ━━━━━ 1. المبيعات والطلبات ━━━━━
          case 'CREATE_ORDER':
            response = await axios.post('/orders/create', item.payload, reqConfig);
            break;

          case 'QUICK_SALE':
            response = await axios.post('/orders/quick-sale', item.payload, reqConfig);
            break;

          case 'DIRECT_SALE': {
            const phone = item.payload?.customer_phone
              ? `&customer_phone=${encodeURIComponent(item.payload.customer_phone)}`
              : '';
            response = await axios.post(`/inventory/direct-sale-by-qr?qr_code=${qr}&note=${note}${phone}`, null, reqConfig);
            break;
          }

          case 'SCAN_RETURN':
            response = await axios.post(`/orders/return-item-by-qr?qr_code=${qr}&note=${note}`, null, reqConfig);
            break;

          case 'SCAN_DAMAGE':
            response = await axios.post(`/orders/mark-as-damaged?qr_code=${qr}&note=${note}`, null, reqConfig);
            break;

          case 'UPDATE_ORDER':
            response = await axios.put(`/orders/${item.payload.id}/update`, item.payload.data, reqConfig);
            break;

          case 'DELETE_ORDER':
            response = await axios.delete(`/orders/${item.payload.id}/delete`, reqConfig);
            break;

          case 'ASSIGN_DELIVERY':
            response = await axios.post(`/orders/${item.payload.id}/assign-delivery`, item.payload.data, reqConfig);
            break;

          case 'SEND_DARB_SHIPMENT': {
            const orderId = item.payload?.order_id;
            const shipmentData = item.payload?.shipment_data;
            response = await axios.post(`/orders/${orderId}/shipping/darb-assabil/create-shipment`, shipmentData, reqConfig);
            break;
          }

          // ━━━━━ 2. المخزون والمنتجات ━━━━━
          case 'ADD_STOCK':
            response = await axios.post('/inventory/add-stock', item.payload, reqConfig);
            break;

          case 'CREATE_CATALOG':
            response = await axios.post('/catalogs/catalogs/', item.payload, reqConfig);
            break;

          case 'UPDATE_CATALOG':
            response = await axios.put(`/catalogs/catalogs/${item.payload.id}`, { name: item.payload.name }, reqConfig);
            break;

          case 'TOGGLE_CATALOG_STATUS':
            response = await axios.patch(`/catalogs/catalogs/${item.payload.id}/toggle`, {}, reqConfig);
            break;

          case 'DELETE_PRODUCT':
            response = await axios.delete(`/variants/product/${item.payload.id}`, reqConfig);
            break;

          // إنشاء/تعديل منتج أوفلاين: يعيد نفس تسلسل خطوات onActualSubmit
          // (منتج → ألوان → مقاسات) التي بُنيت حمولتها مسبقاً في ProductFormDialog.
          case 'ADD_PRODUCT': {
            const { product, mainImageFile, variants } = item.payload;
            const multipartHeaders = { ...reqConfig.headers, 'Content-Type': 'multipart/form-data' };

            const productFormData = new FormData();
            if (mainImageFile) productFormData.append('image_file', mainImageFile);
            Object.entries(product || {}).forEach(([key, value]) => {
              if (value !== undefined && value !== null) productFormData.append(key, value);
            });

            const productRes = await axios.post('/products/', productFormData, {
              ...reqConfig, headers: multipartHeaders, timeout: 60000,
            });
            const createdProductId = productRes?.data?.id || productRes?.data?.data?.id;

            for (const variant of (variants || [])) {
              const colorFormData = new FormData();
              colorFormData.append('product_id', String(createdProductId));
              colorFormData.append('color_name', variant.colorName || 'لون جديد');
              if (variant.colorImage) colorFormData.append('image_file', variant.colorImage);

              const colorRes = await axios.post('/colors/', colorFormData, {
                ...reqConfig, headers: multipartHeaders, timeout: 60000,
              });
              const createdColorId = colorRes?.data?.id || colorRes?.data?.data?.id;

              if (createdColorId && variant.sizes?.length) {
                const variantsArray = variant.sizes.map(s => ({
                  size_id: s.size_id,
                  qty: s.quantity,
                  min_stock: parseInt(product?.min_stock_threshold || 5, 10),
                }));
                await axios.post('/variants/batch-create', variantsArray, {
                  ...reqConfig, params: { product_color_id: createdColorId }, timeout: 30000,
                });
              }
            }
            response = productRes;
            break;
          }

          case 'UPDATE_PRODUCT': {
            const { productId, productFields, minStockThreshold, mainImageFile, variants } = item.payload;
            const multipartHeaders = { ...reqConfig.headers, 'Content-Type': 'multipart/form-data' };

            const formData = new FormData();
            if (mainImageFile) formData.append('image_file', mainImageFile);
            Object.entries(productFields || {}).forEach(([key, value]) => {
              if (value !== undefined && value !== null) formData.append(key, value);
            });
            formData.append('min_stock_threshold', String(minStockThreshold));

            const productRes = await axios.put(`/products/${productId}`, formData, {
              ...reqConfig, headers: multipartHeaders, timeout: 60000,
            });

            for (const variant of (variants || [])) {
              if (variant.mode === 'existing_color') {
                const colorFormData = new FormData();
                colorFormData.append('color_name', variant.colorName || '');
                if (variant.colorImage) colorFormData.append('image_file', variant.colorImage);
                await axios.put(`/colors/${variant.colorId}`, colorFormData, {
                  ...reqConfig, headers: multipartHeaders, timeout: 60000,
                });

                for (const sizeItem of (variant.existingSizes || [])) {
                  await axios.patch(`/variants/${sizeItem.id}`, {
                    qty: sizeItem.quantity,
                    quantity_available: sizeItem.quantity,
                    min_stock: minStockThreshold,
                    min_stock_threshold: minStockThreshold,
                  }, reqConfig);
                }

                if (variant.newSizes?.length) {
                  const variantsArray = variant.newSizes.map(s => ({
                    size_id: s.size_id,
                    qty: s.quantity,
                    min_stock: minStockThreshold,
                  }));
                  await axios.post('/variants/batch-create', variantsArray, {
                    ...reqConfig, params: { product_color_id: variant.colorId }, timeout: 30000,
                  });
                }
              } else {
                const colorFormData = new FormData();
                colorFormData.append('product_id', String(productId));
                colorFormData.append('color_name', variant.colorName || 'لون جديد');
                if (variant.colorImage) colorFormData.append('image_file', variant.colorImage);

                const colorRes = await axios.post('/colors/', colorFormData, {
                  ...reqConfig, headers: multipartHeaders, timeout: 60000,
                });
                const createdColorId = colorRes?.data?.id || colorRes?.data?.data?.id;

                if (createdColorId && variant.sizes?.length) {
                  const variantsArray = variant.sizes.map(s => ({
                    size_id: s.size_id,
                    qty: s.quantity,
                    min_stock: minStockThreshold,
                  }));
                  await axios.post('/variants/batch-create', variantsArray, {
                    ...reqConfig, params: { product_color_id: createdColorId }, timeout: 30000,
                  });
                }
              }
            }
            response = productRes;
            break;
          }

          case 'UPDATE_VARIANT_PARTIAL':
            response = await axios.patch(`/variants/${item.payload.id}`, item.payload.data, reqConfig);
            break;

          // ━━━━━ 3. الموظفين والمستخدمين ━━━━━
          case 'CREATE_EMPLOYEE':
            response = await axios.post('/users/', item.payload, reqConfig);
            break;

          case 'UPDATE_EMPLOYEE':
          case 'UPDATE_PROFILE':
            response = await axios.patch(`/users/${item.payload.id}`, item.payload.data, reqConfig);
            break;

          case 'DELETE_EMPLOYEE':
            response = await axios.delete(`/users/${item.payload.id}`, reqConfig);
            break;

          case 'RESTORE_EMPLOYEE':
            response = await axios.post(`/users/${item.payload.id}/restore`, {}, reqConfig);
            break;

          default:
            console.warn(`[SyncEngine] نوع عملية غير معروف (${item.type}) — سيُحذف لتفادي تعليق الطابور:`, item.id);
            await removePendingAction(item.id);
            failedCount++;
            continue;
        }

        // عند نجاح الرفع (200, 201, 204)، يتم حذف العملية من IndexedDB
        if (response && (response.status >= 200 && response.status < 300)) {
          await removePendingAction(item.id);
          successCount++;
          console.log(`[SyncEngine] تمت مزامنة العملية (${item.type}) #${item.id} بنجاح ✅`);
        }
      } catch (error) {
        console.error(`[SyncEngine] فشلت مزامنة العملية #${item.id}:`, error);
        failedCount++;

        const status = error.response?.status;

        // 401/403: الجلسة منتهية — نحتفظ بالعمليات ونوقف المحرك
        if (status === 401 || status === 403) {
          console.warn('[SyncEngine] الجلسة منتهية — إيقاف المزامنة لحين تسجيل الدخول مجدداً.');
          return {
            status: 'auth_required',
            total: actions.length,
            successCount,
            failedCount,
            authRequired: true,
          };
        }

        // 404: العنصر غير موجود بالسيرفر (مثلاً حُذف مسبقاً من مستخدم آخر)
        // 409: تعارض/مكرر (تم تسجيلها بالفعل مسبقاً)
        // 400/422: بيانات غير صالحة نهائياً
        // في هذه الحالات نحذف العملية من الطابور حتى لا تعلق للأبد
        const UNRECOVERABLE_STATUSES = [400, 404, 409, 422];
        if (UNRECOVERABLE_STATUSES.includes(status)) {
          console.warn(`[SyncEngine] تسوية العملية نهائياً وتفريغها من الطابور (HTTP ${status}):`, item.id, item.description);
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
    isSyncingActive = false;
  }
};
