/**
 * =====================================================================
 * BELLAGIO PWA - IndexedDB Native Storage Engine (Production Ready)
 * قاعدة بيانات متقدمة ومستقلة لتخزين العمليات محلياً في متصفح المستخدم
 * =====================================================================
 */

const DB_NAME = 'BellagioOfflineDB';
const DB_VERSION = 1;
const STORE_NAME = 'pending_actions';

// اتصال واحد مُعاد استخدامه بدل فتح اتصال جديد في كل عملية.
// كان الكود السابق يفتح اتصالاً كل 3 ثوانٍ ولا يغلقه أبداً، مما يسرّب
// الموارد تدريجياً في الجلسات الطويلة (جهاز نقطة بيع يعمل طوال اليوم).
let dbPromise = null;

/**
 * فتح وتجهيز قاعدة بيانات IndexedDB (اتصال واحد مشترك)
 */
export const initIDB = () => {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      console.warn('IndexedDB غير مدعوم في هذا المتصفح');
      return resolve(null);
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      dbPromise = null; // اسمح بإعادة المحاولة لاحقاً بدل تجميد الفشل للأبد
      console.error('فشل فتح IndexedDB:', event.target.error);
      reject(event.target.error);
    };

    request.onsuccess = (event) => {
      const db = event.target.result;

      // إذا طلب تبويب آخر ترقية النسخة نغلق هذا الاتصال حتى لا نحجبه
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      // إذا أُغلق الاتصال لأي سبب (طرد من المتصفح) نسمح بإعادة الفتح
      db.onclose = () => { dbPromise = null; };

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

  return dbPromise;
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

// مفتاح الطابور القديم الذي كان يُستخدم في localStorage عبر utils/offlineSync.js
const LEGACY_QUEUE_KEY = 'bellagio_offline_queue';

/**
 * ترحيل أي عمليات عالقة في الطابور القديم (localStorage) إلى IndexedDB.
 *
 * كان النظام يحتوي على طابورين منفصلين: صفحات البيع والمسح تكتب في localStorage
 * بينما محرك المزامنة يقرأ من IndexedDB فقط — فكانت عمليات البيع الأوفلاين
 * لا تُرفع أبداً. هذه الدالة تنقذ أي بيانات عالقة من النظام القديم مرة واحدة.
 *
 * لا تُفرّغ المفتاح القديم إلا بعد نجاح نقل كل العناصر، حتى لا تُفقد عند أي خطأ.
 */
export const migrateLegacyQueue = async () => {
  let queue = [];
  try {
    const raw = localStorage.getItem(LEGACY_QUEUE_KEY);
    if (!raw) return 0;
    queue = JSON.parse(raw);
    if (!Array.isArray(queue) || queue.length === 0) {
      localStorage.removeItem(LEGACY_QUEUE_KEY);
      return 0;
    }
  } catch (err) {
    console.error('[Migration] تعذّرت قراءة الطابور القديم:', err);
    return 0;
  }

  let migrated = 0;
  for (const item of queue) {
    try {
      const saved = await saveOfflineAction(item.type, item.payload, item.description || '');
      if (saved) migrated++;
    } catch (err) {
      console.error('[Migration] فشل نقل عنصر من الطابور القديم:', item, err);
    }
  }

  // لا نحذف القديم إلا إذا نُقل كل شيء بنجاح
  if (migrated === queue.length) {
    localStorage.removeItem(LEGACY_QUEUE_KEY);
    console.log(`[Migration] تم نقل ${migrated} عملية من localStorage إلى IndexedDB وحذف الطابور القديم.`);
  } else {
    console.warn(`[Migration] نُقلت ${migrated} من أصل ${queue.length}؛ تم الإبقاء على الطابور القديم لمحاولة لاحقة.`);
  }

  return migrated;
};
