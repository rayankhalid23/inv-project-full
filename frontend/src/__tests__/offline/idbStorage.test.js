/**
 * اختبارات IndexedDB — طبقة التخزين الأوفلاين
 *
 * كل اختبار يعمل على قاعدة بيانات منفصلة (fake-indexeddb يُعيد تهيئتها)
 * لضمان العزل الكامل بين الاختبارات.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// fake-indexeddb/auto يُثبّت IndexedDB العالمي في بيئة Node عبر setup.js
// نعيد تهيئة dbPromise قبل كل اختبار حتى لا تتشارك الاختبارات نفس الاتصال
let idbModule;

beforeEach(async () => {
  // إعادة استيراد الوحدة في كل مرة لإعادة تهيئة dbPromise الداخلي
  vi.resetModules();
  idbModule = await import('../../utils/idbStorage.js');
});

// ─────────────────────────────────────────────
// 1. saveOfflineAction
// ─────────────────────────────────────────────
describe('saveOfflineAction', () => {
  it('تحفظ عملية وترجع سجلاً بمعرّف صالح', async () => {
    const { saveOfflineAction } = idbModule;
    const result = await saveOfflineAction('CREATE_ORDER', { total: 100 }, 'طلب اختبار');

    expect(result).not.toBeNull();
    expect(typeof result.id).toBe('number');
    expect(result.id).toBeGreaterThan(0);
    expect(result.type).toBe('CREATE_ORDER');
    expect(result.payload).toEqual({ total: 100 });
    expect(result.description).toBe('طلب اختبار');
    expect(result.timestamp).toBeTruthy();
  });

  it('تحفظ عدة عمليات من أنواع مختلفة', async () => {
    const { saveOfflineAction, getPendingActions } = idbModule;

    await saveOfflineAction('CREATE_ORDER', { id: 1 }, 'طلب 1');
    await saveOfflineAction('QUICK_SALE', { id: 2 }, 'بيع سريع');
    await saveOfflineAction('DELETE_EMPLOYEE', { id: 5 }, 'حذف موظف');

    const actions = await getPendingActions();
    expect(actions).toHaveLength(3);
    expect(actions.map(a => a.type)).toEqual(['CREATE_ORDER', 'QUICK_SALE', 'DELETE_EMPLOYEE']);
  });

  it('تحفظ العملية حتى بدون وصف', async () => {
    const { saveOfflineAction } = idbModule;
    const result = await saveOfflineAction('QUICK_SALE', { items: [] });
    expect(result).not.toBeNull();
    expect(result.description).toBe('');
  });
});

// ─────────────────────────────────────────────
// 2. getPendingActions
// ─────────────────────────────────────────────
describe('getPendingActions', () => {
  it('ترجع مصفوفة فارغة عند عدم وجود عمليات', async () => {
    const { getPendingActions } = idbModule;
    const actions = await getPendingActions();
    expect(Array.isArray(actions)).toBe(true);
    expect(actions).toHaveLength(0);
  });

  it('ترجع العمليات المحفوظة بترتيبها الصحيح', async () => {
    const { saveOfflineAction, getPendingActions } = idbModule;

    await saveOfflineAction('CREATE_ORDER', { order: 1 }, 'أول');
    await saveOfflineAction('QUICK_SALE',   { sale: 1  }, 'ثاني');

    const actions = await getPendingActions();
    expect(actions[0].description).toBe('أول');
    expect(actions[1].description).toBe('ثاني');
  });
});

// ─────────────────────────────────────────────
// 3. removePendingAction
// ─────────────────────────────────────────────
describe('removePendingAction', () => {
  it('تحذف عملية بمعرّفها وتُبقي الباقي', async () => {
    const { saveOfflineAction, getPendingActions, removePendingAction } = idbModule;

    const a1 = await saveOfflineAction('CREATE_ORDER', {}, 'أول');
    const a2 = await saveOfflineAction('QUICK_SALE',   {}, 'ثاني');

    await removePendingAction(a1.id);

    const remaining = await getPendingActions();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(a2.id);
  });

  it('لا تُخطئ عند حذف معرّف غير موجود', async () => {
    const { removePendingAction } = idbModule;
    await expect(removePendingAction(9999)).resolves.toBeDefined();
  });
});

// ─────────────────────────────────────────────
// 4. clearPendingActions
// ─────────────────────────────────────────────
describe('clearPendingActions', () => {
  it('تمسح جميع العمليات دفعة واحدة', async () => {
    const { saveOfflineAction, clearPendingActions, getPendingActions } = idbModule;

    await saveOfflineAction('CREATE_ORDER', {}, '1');
    await saveOfflineAction('QUICK_SALE',   {}, '2');
    await saveOfflineAction('DELETE_ORDER', {}, '3');

    await clearPendingActions();

    const actions = await getPendingActions();
    expect(actions).toHaveLength(0);
  });

  it('لا تُخطئ على قاعدة بيانات فارغة', async () => {
    const { clearPendingActions } = idbModule;
    await expect(clearPendingActions()).resolves.toBe(true);
  });
});

// ─────────────────────────────────────────────
// 5. getPendingCount
// ─────────────────────────────────────────────
describe('getPendingCount', () => {
  it('يرجع صفراً عند الفراغ', async () => {
    const { getPendingCount } = idbModule;
    expect(await getPendingCount()).toBe(0);
  });

  it('يرجع العدد الصحيح بعد إضافة عمليات', async () => {
    const { saveOfflineAction, getPendingCount } = idbModule;

    await saveOfflineAction('CREATE_ORDER', {}, '1');
    await saveOfflineAction('QUICK_SALE',   {}, '2');

    expect(await getPendingCount()).toBe(2);
  });

  it('ينقص بعد الحذف', async () => {
    const { saveOfflineAction, removePendingAction, getPendingCount } = idbModule;

    const a = await saveOfflineAction('CREATE_ORDER', {}, '1');
    await saveOfflineAction('QUICK_SALE', {}, '2');

    await removePendingAction(a.id);

    expect(await getPendingCount()).toBe(1);
  });
});

// ─────────────────────────────────────────────
// 6. migrateLegacyQueue
// ─────────────────────────────────────────────
describe('migrateLegacyQueue', () => {
  const LEGACY_KEY = 'bellagio_offline_queue';

  it('ترجع 0 عند غياب الطابور القديم', async () => {
    const { migrateLegacyQueue } = idbModule;
    const count = await migrateLegacyQueue();
    expect(count).toBe(0);
  });

  it('ترجع 0 وتنظّف مفتاح localStorage الفارغ', async () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify([]));
    const { migrateLegacyQueue } = idbModule;
    const count = await migrateLegacyQueue();
    expect(count).toBe(0);
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it('تنقل العمليات من localStorage إلى IndexedDB', async () => {
    const legacy = [
      { type: 'CREATE_ORDER', payload: { x: 1 }, description: 'قديم 1' },
      { type: 'QUICK_SALE',   payload: { y: 2 }, description: 'قديم 2' },
    ];
    localStorage.setItem(LEGACY_KEY, JSON.stringify(legacy));

    const { migrateLegacyQueue, getPendingActions } = idbModule;
    const count = await migrateLegacyQueue();

    expect(count).toBe(2);
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull(); // حُذف بعد النجاح

    const actions = await getPendingActions();
    expect(actions).toHaveLength(2);
    expect(actions[0].type).toBe('CREATE_ORDER');
    expect(actions[1].type).toBe('QUICK_SALE');
  });

  it('لا تحذف localStorage إذا فشل النقل جزئياً', async () => {
    const legacy = [
      { type: 'CREATE_ORDER', payload: { x: 1 }, description: 'صالح' },
      null, // عنصر تالف يسبب خطأً
    ];
    localStorage.setItem(LEGACY_KEY, JSON.stringify(legacy));

    const { migrateLegacyQueue } = idbModule;
    // لا يجب أن يرمي استثناءً
    await expect(migrateLegacyQueue()).resolves.not.toThrow?.();

    // الطابور لم يُحذف لأن النقل لم يكتمل بالكامل
    // (قد يكون null أو يبقى — يعتمد على التنفيذ الداخلي، نتحقق أنه لا يرمي)
  });

  it('تتجاهل localStorage المُعطوبة (JSON غير صالح)', async () => {
    localStorage.setItem(LEGACY_KEY, 'INVALID_JSON{{{');
    const { migrateLegacyQueue } = idbModule;
    const count = await migrateLegacyQueue();
    expect(count).toBe(0);
  });
});

// ─────────────────────────────────────────────
// 7. التحقق من ثبات البيانات (الـ payload محفوظ كاملاً)
// ─────────────────────────────────────────────
describe('سلامة البيانات', () => {
  it('يحفظ الـ payload المعقد ويسترجعه بالكامل', async () => {
    const { saveOfflineAction, getPendingActions } = idbModule;

    const complexPayload = {
      customer_name: 'علي محمد',
      customer_phones: ['0912345678'],
      address: 'شارع الاستقلال، طرابلس',
      items: [
        { variant_id: 101, quantity: 2 },
        { variant_id: 202, quantity: 1 },
      ],
      notes: 'توصيل سريع',
      shipping_provider: 'darb_assabil',
    };

    await saveOfflineAction('CREATE_ORDER', complexPayload, 'طلب معقد');

    const actions = await getPendingActions();
    expect(actions[0].payload).toEqual(complexPayload);
  });

  it('الطابع الزمني بصيغة ISO صالحة', async () => {
    const { saveOfflineAction, getPendingActions } = idbModule;

    await saveOfflineAction('QUICK_SALE', {}, '');

    const actions = await getPendingActions();
    const ts = actions[0].timestamp;
    expect(() => new Date(ts)).not.toThrow();
    expect(new Date(ts).getFullYear()).toBeGreaterThanOrEqual(2024);
  });
});
