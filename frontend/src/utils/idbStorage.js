/**
 * =====================================================================
 * BELLAGIO PWA - IndexedDB Native Storage Engine (Production Ready)
 * قاعدة بيانات متقدمة ومستقلة لتخزين العمليات محلياً في متصفح المستخدم
 * =====================================================================
 */

const DB_NAME = 'BellagioOfflineDB';
const DB_VERSION = 1;
const STORE_NAME = 'pending_actions';

/**
 * فتح وتجهيز قاعدة بيانات IndexedDB
 */
export const initIDB = () => {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      console.warn('IndexedDB غير مدعوم في هذا المتصفح');
      return resolve(null);
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('فشل فتح IndexedDB:', event.target.error);
      reject(event.target.error);
    };

    request.onsuccess = (event) => {
      const db = event.target.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        objectStore.createIndex('timestamp', 'timestamp', { unique: false });
        objectStore.createIndex('type', 'type', { unique: false });
      }
    };
  });
};

/**
 * حفظ عملية أوفلاين جديدة في IndexedDB
 * @param {string} actionType - نوع العملية (CREATE_ORDER, DIRECT_SALE, SCAN_RETURN, SCAN_DAMAGE, etc.)
 * @param {object} payload - بيانات العملية الممررة للسيرفر
 * @param {string} description - وصف مختصر للعملية للعرض في الإشعارات
 */
export const saveOfflineAction = async (actionType, payload, description = '') => {
  try {
    const db = await initIDB();
    if (!db) return null;

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      const record = {
        type: actionType,
        payload,
        description,
        timestamp: new Date().toISOString(),
      };

      const request = store.add(record);

      request.onsuccess = (event) => {
        const generatedId = event.target.result;
        console.log(`[IndexedDB] تم حفظ العملية رقم ${generatedId}: ${description}`);
        resolve({ id: generatedId, ...record });
      };

      request.onerror = (event) => {
        console.error('خطأ أثناء حفظ العملية في IndexedDB:', event.target.error);
        reject(event.target.error);
      };
    });
  } catch (err) {
    console.error('Error saving action to IndexedDB:', err);
    return null;
  }
};

/**
 * جلب جميع العمليات المتروكة المعلقة من IndexedDB
 */
export const getPendingActions = async () => {
  try {
    const db = await initIDB();
    if (!db) return [];

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = (event) => {
        resolve(event.target.result || []);
      };

      request.onerror = (event) => {
        console.error('خطأ أثناء قراءة البيانات من IndexedDB:', event.target.error);
        reject(event.target.error);
      };
    });
  } catch (err) {
    console.error('Error getting pending actions:', err);
    return [];
  }
};

/**
 * حذف عملية محددة من IndexedDB بعد نجاح رفعها للسيرفر
 * @param {number|string} id - رقم العملية في IndexedDB
 */
export const removePendingAction = async (id) => {
  try {
    const db = await initIDB();
    if (!db) return false;

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => {
        console.log(`[IndexedDB] تم حذف العملية المعالجة رقم ${id}`);
        resolve(true);
      };

      request.onerror = (event) => {
        console.error(`خطأ أثناء حذف العملية رقم ${id}:`, event.target.error);
        reject(event.target.error);
      };
    });
  } catch (err) {
    console.error('Error deleting action from IndexedDB:', err);
    return false;
  }
};

/**
 * مسح جميع العمليات المعلقة
 */
export const clearPendingActions = async () => {
  try {
    const db = await initIDB();
    if (!db) return false;

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve(true);
      request.onerror = (event) => reject(event.target.error);
    });
  } catch (err) {
    console.error('Error clearing IndexedDB:', err);
    return false;
  }
};

/**
 * جلب عدد العمليات المعلقة
 */
export const getPendingCount = async () => {
  const actions = await getPendingActions();
  return actions.length;
};
