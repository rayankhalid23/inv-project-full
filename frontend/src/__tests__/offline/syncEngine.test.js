/**
 * اختبارات syncEngine — محرك المزامنة الأوفلاين
 *
 * يغطي: جميع أنواع العمليات، معالجة الأخطاء، إيقاف المزامنة عند انتهاء الجلسة،
 * المزامنة التسلسلية، والحالات الحدّية.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('axios', () => ({
  default: {
    post:   vi.fn(),
    put:    vi.fn(),
    patch:  vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../utils/idbStorage.js', () => ({
  getPendingActions:  vi.fn(),
  removePendingAction: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../utils/netErrors.js', () => ({
  API_TIMEOUT_MS: 15000,
}));

// ─── Imports (بعد الـ mocks) ─────────────────────────────────────────────────

import axios from 'axios';
import { getPendingActions, removePendingAction } from '../../utils/idbStorage.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ok = (data = {}) => Promise.resolve({ status: 200, data });
const created = (data = {}) => Promise.resolve({ status: 201, data });

function axiosError(status, message = 'Error') {
  const err = new Error(message);
  err.response = { status, data: { detail: message } };
  return Promise.reject(err);
}

function networkError() {
  const err = new Error('Network Error');
  err.request = {};
  err.response = undefined;
  return Promise.reject(err);
}

function makeAction(type, payload = {}, description = '') {
  return { id: Math.floor(Math.random() * 10000), type, payload, description };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // محاكاة الاتصال بالإنترنت
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true });
  localStorage.setItem('token', 'test-token-123');

  // إعادة تعيين حالة isSyncingActive بين الاختبارات
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── الحصول على runAutoSync بعد reset الـ modules ────────────────────────────

async function getSyncEngine() {
  const mod = await import('../../utils/syncEngine.js');
  return mod.runAutoSync;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. الحالات الأساسية
// ─────────────────────────────────────────────────────────────────────────────

describe('الحالات الأساسية', () => {
  it('يرجع status=offline عند عدم وجود اتصال', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    getPendingActions.mockResolvedValue([]);

    const runAutoSync = await getSyncEngine();
    const result = await runAutoSync();

    expect(result.status).toBe('offline');
  });

  it('يرجع status=empty عند عدم وجود عمليات معلقة', async () => {
    getPendingActions.mockResolvedValue([]);

    const runAutoSync = await getSyncEngine();
    const result = await runAutoSync();

    expect(result.status).toBe('empty');
    expect(result.successCount).toBe(0);
  });

  it('يرجع status=completed بعد مزامنة ناجحة', async () => {
    getPendingActions.mockResolvedValue([
      makeAction('CREATE_ORDER', { customer_name: 'علي' }),
    ]);
    axios.post.mockResolvedValue(ok({ id: 1 }));

    const runAutoSync = await getSyncEngine();
    const result = await runAutoSync();

    expect(result.status).toBe('completed');
    expect(result.successCount).toBe(1);
    expect(result.failedCount).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. أنواع عمليات المبيعات والطلبات
// ─────────────────────────────────────────────────────────────────────────────

describe('عمليات المبيعات والطلبات', () => {
  it('CREATE_ORDER — يرسل POST /orders/create', async () => {
    const payload = { customer_name: 'أحمد', items: [{ variant_id: 1, quantity: 2 }] };
    getPendingActions.mockResolvedValue([makeAction('CREATE_ORDER', payload)]);
    axios.post.mockResolvedValue(created({ id: 10 }));

    const runAutoSync = await getSyncEngine();
    await runAutoSync();

    expect(axios.post).toHaveBeenCalledWith('/orders/create', payload, expect.any(Object));
  });

  it('QUICK_SALE — يرسل POST /orders/quick-sale', async () => {
    const payload = { customer_name: 'خالد', items: [{ variant_id: 5, quantity: 1 }] };
    getPendingActions.mockResolvedValue([makeAction('QUICK_SALE', payload)]);
    axios.post.mockResolvedValue(created({ id: 11 }));

    const runAutoSync = await getSyncEngine();
    await runAutoSync();

    expect(axios.post).toHaveBeenCalledWith('/orders/quick-sale', payload, expect.any(Object));
  });

  it('DIRECT_SALE — يشفّر qr_code و note بشكل صحيح في URL', async () => {
    const payload = { qr_code: 'ABC-123', note: 'ملاحظة مهمة', customer_phone: '0912345678' };
    getPendingActions.mockResolvedValue([makeAction('DIRECT_SALE', payload)]);
    axios.post.mockResolvedValue(ok());

    const runAutoSync = await getSyncEngine();
    await runAutoSync();

    const call = axios.post.mock.calls[0];
    expect(call[0]).toContain('/inventory/direct-sale-by-qr');
    expect(call[0]).toContain('qr_code=');
    expect(call[0]).toContain('customer_phone=');
    expect(call[1]).toBeNull(); // body فارغ
  });

  it('SCAN_RETURN — يرسل POST /orders/return-item-by-qr', async () => {
    const payload = { qr_code: 'QR-001', note: '' };
    getPendingActions.mockResolvedValue([makeAction('SCAN_RETURN', payload)]);
    axios.post.mockResolvedValue(ok());

    const runAutoSync = await getSyncEngine();
    await runAutoSync();

    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/orders/return-item-by-qr'),
      null,
      expect.any(Object)
    );
  });

  it('SCAN_DAMAGE — يرسل POST /orders/mark-as-damaged', async () => {
    const payload = { qr_code: 'QR-002', note: 'تالف' };
    getPendingActions.mockResolvedValue([makeAction('SCAN_DAMAGE', payload)]);
    axios.post.mockResolvedValue(ok());

    const runAutoSync = await getSyncEngine();
    await runAutoSync();

    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/orders/mark-as-damaged'),
      null,
      expect.any(Object)
    );
  });

  it('UPDATE_ORDER — يرسل PUT /orders/{id}/update', async () => {
    const payload = { id: 7, data: { status: 'prepared' } };
    getPendingActions.mockResolvedValue([makeAction('UPDATE_ORDER', payload)]);
    axios.put.mockResolvedValue(ok());

    const runAutoSync = await getSyncEngine();
    await runAutoSync();

    expect(axios.put).toHaveBeenCalledWith('/orders/7/update', { status: 'prepared' }, expect.any(Object));
  });

  it('DELETE_ORDER — يرسل DELETE /orders/{id}/delete', async () => {
    const payload = { id: 3 };
    getPendingActions.mockResolvedValue([makeAction('DELETE_ORDER', payload)]);
    axios.delete.mockResolvedValue(ok());

    const runAutoSync = await getSyncEngine();
    await runAutoSync();

    expect(axios.delete).toHaveBeenCalledWith('/orders/3/delete', expect.any(Object));
  });

  it('ASSIGN_DELIVERY — يرسل POST /orders/{id}/assign-delivery', async () => {
    const payload = { id: 4, data: { delivery_name: 'محمد', delivery_type: 'custom' } };
    getPendingActions.mockResolvedValue([makeAction('ASSIGN_DELIVERY', payload)]);
    axios.post.mockResolvedValue(ok());

    const runAutoSync = await getSyncEngine();
    await runAutoSync();

    expect(axios.post).toHaveBeenCalledWith(
      '/orders/4/assign-delivery',
      { delivery_name: 'محمد', delivery_type: 'custom' },
      expect.any(Object)
    );
  });

  it('SEND_DARB_SHIPMENT — يرسل POST /orders/{id}/shipping/darb-assabil/create-shipment', async () => {
    const payload = { order_id: 9, shipment_data: { city: 'طرابلس', area: 'سوق الجمعة' } };
    getPendingActions.mockResolvedValue([makeAction('SEND_DARB_SHIPMENT', payload)]);
    axios.post.mockResolvedValue(created({ shipment_id: 'SH-001' }));

    const runAutoSync = await getSyncEngine();
    await runAutoSync();

    expect(axios.post).toHaveBeenCalledWith(
      '/orders/9/shipping/darb-assabil/create-shipment',
      { city: 'طرابلس', area: 'سوق الجمعة' },
      expect.any(Object)
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. عمليات المخزون والمنتجات
// ─────────────────────────────────────────────────────────────────────────────

describe('عمليات المخزون والمنتجات', () => {
  it('ADD_STOCK — يرسل POST /inventory/add-stock', async () => {
    const payload = { variant_id: 20, quantity: 50 };
    getPendingActions.mockResolvedValue([makeAction('ADD_STOCK', payload)]);
    axios.post.mockResolvedValue(ok());

    const runAutoSync = await getSyncEngine();
    await runAutoSync();

    expect(axios.post).toHaveBeenCalledWith('/inventory/add-stock', payload, expect.any(Object));
  });

  it('CREATE_CATALOG — يرسل POST /catalogs/catalogs/', async () => {
    const payload = { name: 'كتالوج صيفي' };
    getPendingActions.mockResolvedValue([makeAction('CREATE_CATALOG', payload)]);
    axios.post.mockResolvedValue(created({ id: 5 }));

    const runAutoSync = await getSyncEngine();
    await runAutoSync();

    expect(axios.post).toHaveBeenCalledWith('/catalogs/catalogs/', payload, expect.any(Object));
  });

  it('UPDATE_CATALOG — يرسل PUT /catalogs/catalogs/{id}', async () => {
    const payload = { id: 3, name: 'كتالوج محدث' };
    getPendingActions.mockResolvedValue([makeAction('UPDATE_CATALOG', payload)]);
    axios.put.mockResolvedValue(ok());

    const runAutoSync = await getSyncEngine();
    await runAutoSync();

    expect(axios.put).toHaveBeenCalledWith('/catalogs/catalogs/3', { name: 'كتالوج محدث' }, expect.any(Object));
  });

  it('TOGGLE_CATALOG_STATUS — يرسل PATCH /catalogs/catalogs/{id}/toggle', async () => {
    const payload = { id: 2 };
    getPendingActions.mockResolvedValue([makeAction('TOGGLE_CATALOG_STATUS', payload)]);
    axios.patch.mockResolvedValue(ok());

    const runAutoSync = await getSyncEngine();
    await runAutoSync();

    expect(axios.patch).toHaveBeenCalledWith('/catalogs/catalogs/2/toggle', {}, expect.any(Object));
  });

  it('DELETE_PRODUCT — يرسل DELETE /variants/product/{id}', async () => {
    const payload = { id: 15 };
    getPendingActions.mockResolvedValue([makeAction('DELETE_PRODUCT', payload)]);
    axios.delete.mockResolvedValue(ok());

    const runAutoSync = await getSyncEngine();
    await runAutoSync();

    expect(axios.delete).toHaveBeenCalledWith('/variants/product/15', expect.any(Object));
  });

  it('UPDATE_VARIANT_PARTIAL — يرسل PATCH /variants/{id}', async () => {
    const payload = { id: 33, data: { quantity_available: 10, min_stock_threshold: 3 } };
    getPendingActions.mockResolvedValue([makeAction('UPDATE_VARIANT_PARTIAL', payload)]);
    axios.patch.mockResolvedValue(ok());

    const runAutoSync = await getSyncEngine();
    await runAutoSync();

    expect(axios.patch).toHaveBeenCalledWith('/variants/33', payload.data, expect.any(Object));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. عمليات الموظفين والمستخدمين
// ─────────────────────────────────────────────────────────────────────────────

describe('عمليات الموظفين والمستخدمين', () => {
  it('CREATE_EMPLOYEE — يرسل POST /users/', async () => {
    const payload = { name: 'أحمد علي', phone: '0912222222', role_id: 3 };
    getPendingActions.mockResolvedValue([makeAction('CREATE_EMPLOYEE', payload)]);
    axios.post.mockResolvedValue(created({ id: 50 }));

    const runAutoSync = await getSyncEngine();
    await runAutoSync();

    expect(axios.post).toHaveBeenCalledWith('/users/', payload, expect.any(Object));
  });

  it('UPDATE_EMPLOYEE — يرسل PATCH /users/{id}', async () => {
    const payload = { id: 8, data: { name: 'اسم جديد' } };
    getPendingActions.mockResolvedValue([makeAction('UPDATE_EMPLOYEE', payload)]);
    axios.patch.mockResolvedValue(ok());

    const runAutoSync = await getSyncEngine();
    await runAutoSync();

    expect(axios.patch).toHaveBeenCalledWith('/users/8', { name: 'اسم جديد' }, expect.any(Object));
  });

  it('UPDATE_PROFILE — نفس مسار PATCH /users/{id}', async () => {
    const payload = { id: 1, data: { name: 'ريان' } };
    getPendingActions.mockResolvedValue([makeAction('UPDATE_PROFILE', payload)]);
    axios.patch.mockResolvedValue(ok());

    const runAutoSync = await getSyncEngine();
    await runAutoSync();

    expect(axios.patch).toHaveBeenCalledWith('/users/1', { name: 'ريان' }, expect.any(Object));
  });

  it('DELETE_EMPLOYEE — يرسل DELETE /users/{id}', async () => {
    const payload = { id: 6 };
    getPendingActions.mockResolvedValue([makeAction('DELETE_EMPLOYEE', payload)]);
    axios.delete.mockResolvedValue(ok());

    const runAutoSync = await getSyncEngine();
    await runAutoSync();

    expect(axios.delete).toHaveBeenCalledWith('/users/6', expect.any(Object));
  });

  it('RESTORE_EMPLOYEE — يرسل POST /users/{id}/restore', async () => {
    const payload = { id: 12 };
    getPendingActions.mockResolvedValue([makeAction('RESTORE_EMPLOYEE', payload)]);
    axios.post.mockResolvedValue(ok());

    const runAutoSync = await getSyncEngine();
    await runAutoSync();

    expect(axios.post).toHaveBeenCalledWith('/users/12/restore', {}, expect.any(Object));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. معالجة الأخطاء وإيقاف المزامنة
// ─────────────────────────────────────────────────────────────────────────────

describe('معالجة الأخطاء', () => {
  it('401 — يوقف المزامنة ويرجع authRequired=true', async () => {
    getPendingActions.mockResolvedValue([
      makeAction('CREATE_ORDER', {}),
      makeAction('QUICK_SALE',  {}),
    ]);
    axios.post.mockReturnValueOnce(axiosError(401, 'Unauthorized'));

    const runAutoSync = await getSyncEngine();
    const result = await runAutoSync();

    expect(result.authRequired).toBe(true);
    expect(result.status).toBe('auth_required');
    // المزامنة أوقفت بعد أول فشل، الطلب الثاني لم يُرسل
    expect(axios.post).toHaveBeenCalledTimes(1);
    // العمليتان لم تُحذفا من IndexedDB
    expect(removePendingAction).not.toHaveBeenCalled();
  });

  it('403 — يوقف المزامنة ويرجع authRequired=true', async () => {
    getPendingActions.mockResolvedValue([makeAction('CREATE_ORDER', {})]);
    axios.post.mockReturnValueOnce(axiosError(403, 'Forbidden'));

    const runAutoSync = await getSyncEngine();
    const result = await runAutoSync();

    expect(result.authRequired).toBe(true);
  });

  it('400 — يحذف العملية (بيانات غير صالحة نهائياً) ويكمل', async () => {
    getPendingActions.mockResolvedValue([makeAction('CREATE_ORDER', { bad: 'data' })]);
    axios.post.mockReturnValueOnce(axiosError(400, 'Bad Request'));

    const runAutoSync = await getSyncEngine();
    const result = await runAutoSync();

    expect(removePendingAction).toHaveBeenCalledTimes(1);
    expect(result.failedCount).toBe(1);
    expect(result.status).toBe('completed');
  });

  it('404 — يحذف العملية (العنصر غير موجود)', async () => {
    getPendingActions.mockResolvedValue([makeAction('DELETE_ORDER', { id: 999 })]);
    axios.delete.mockReturnValueOnce(axiosError(404, 'Not Found'));

    const runAutoSync = await getSyncEngine();
    await runAutoSync();

    expect(removePendingAction).toHaveBeenCalledTimes(1);
  });

  it('409 — يحذف العملية (تكرار/تعارض مؤكد)', async () => {
    getPendingActions.mockResolvedValue([makeAction('CREATE_ORDER', {})]);
    axios.post.mockReturnValueOnce(axiosError(409, 'Conflict'));

    const runAutoSync = await getSyncEngine();
    const result = await runAutoSync();

    expect(removePendingAction).toHaveBeenCalledTimes(1);
    expect(result.failedCount).toBe(1);
  });

  it('422 — يحذف العملية (validation error)', async () => {
    getPendingActions.mockResolvedValue([makeAction('CREATE_ORDER', {})]);
    axios.post.mockReturnValueOnce(axiosError(422, 'Unprocessable'));

    const runAutoSync = await getSyncEngine();
    await runAutoSync();

    expect(removePendingAction).toHaveBeenCalledTimes(1);
  });

  it('خطأ شبكة — يُبقي العملية للمحاولة لاحقاً', async () => {
    getPendingActions.mockResolvedValue([makeAction('CREATE_ORDER', {})]);
    axios.post.mockReturnValueOnce(networkError());

    const runAutoSync = await getSyncEngine();
    const result = await runAutoSync();

    expect(removePendingAction).not.toHaveBeenCalled(); // لم تُحذف
    expect(result.failedCount).toBe(1);
    expect(result.status).toBe('completed');
  });

  it('خطأ 500 — يُبقي العملية للمحاولة لاحقاً', async () => {
    getPendingActions.mockResolvedValue([makeAction('QUICK_SALE', {})]);
    axios.post.mockReturnValueOnce(axiosError(500, 'Internal Server Error'));

    const runAutoSync = await getSyncEngine();
    const result = await runAutoSync();

    expect(removePendingAction).not.toHaveBeenCalled();
    expect(result.failedCount).toBe(1);
  });

  it('نوع غير معروف — يُحذف من الطابور ويُكمل', async () => {
    getPendingActions.mockResolvedValue([makeAction('UNKNOWN_ACTION_XYZ', {})]);

    const runAutoSync = await getSyncEngine();
    const result = await runAutoSync();

    expect(removePendingAction).toHaveBeenCalledTimes(1);
    expect(result.failedCount).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. مزامنة متعددة العمليات
// ─────────────────────────────────────────────────────────────────────────────

describe('مزامنة متعددة العمليات', () => {
  it('يعالج عدة عمليات بالترتيب ويحذف الناجحة فقط', async () => {
    getPendingActions.mockResolvedValue([
      makeAction('CREATE_ORDER', { n: 1 }),
      makeAction('QUICK_SALE',   { n: 2 }),
      makeAction('DELETE_ORDER', { id: 3 }),
    ]);

    axios.post.mockResolvedValueOnce(created({ id: 1 })); // CREATE_ORDER
    axios.post.mockResolvedValueOnce(created({ id: 2 })); // QUICK_SALE
    axios.delete.mockResolvedValueOnce(ok());             // DELETE_ORDER

    const runAutoSync = await getSyncEngine();
    const result = await runAutoSync();

    expect(result.successCount).toBe(3);
    expect(result.failedCount).toBe(0);
    expect(removePendingAction).toHaveBeenCalledTimes(3);
  });

  it('يكمل الطابور حتى لو فشلت عملية وسط (غير 401/403)', async () => {
    getPendingActions.mockResolvedValue([
      makeAction('CREATE_ORDER', { n: 1 }),
      makeAction('QUICK_SALE',   { n: 2 }),  // ستفشل بـ 400
      makeAction('DELETE_ORDER', { id: 3 }),
    ]);

    axios.post
      .mockResolvedValueOnce(created({ id: 1 }))   // CREATE_ORDER — نجح
      .mockResolvedValueOnce(axiosError(400));      // QUICK_SALE   — فشل نهائي

    axios.delete.mockResolvedValueOnce(ok());       // DELETE_ORDER — نجح

    const runAutoSync = await getSyncEngine();
    const result = await runAutoSync();

    expect(result.successCount).toBe(2);
    expect(result.failedCount).toBe(1);
    expect(removePendingAction).toHaveBeenCalledTimes(3); // الناجحتان + الـ 400
  });

  it('يوقف فوراً عند 401 حتى لو بقيت عمليات', async () => {
    getPendingActions.mockResolvedValue([
      makeAction('CREATE_ORDER', {}),
      makeAction('QUICK_SALE',   {}),
      makeAction('DELETE_ORDER', { id: 1 }),
    ]);

    axios.post.mockReturnValueOnce(axiosError(401));

    const runAutoSync = await getSyncEngine();
    const result = await runAutoSync();

    // المزامنة توقفت في أول عملية
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(result.authRequired).toBe(true);
    expect(removePendingAction).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. إرسال التوكن في الترويسات
// ─────────────────────────────────────────────────────────────────────────────

describe('التوثيق والترويسات', () => {
  it('يُرسل Authorization header عند وجود token', async () => {
    localStorage.setItem('token', 'my-jwt-token');
    getPendingActions.mockResolvedValue([makeAction('CREATE_ORDER', {})]);
    axios.post.mockResolvedValue(ok());

    const runAutoSync = await getSyncEngine();
    await runAutoSync();

    const config = axios.post.mock.calls[0][2];
    expect(config.headers.Authorization).toBe('Bearer my-jwt-token');
  });

  it('يُرسل بدون Authorization عند غياب token', async () => {
    localStorage.removeItem('token');
    getPendingActions.mockResolvedValue([makeAction('CREATE_ORDER', {})]);
    axios.post.mockResolvedValue(ok());

    const runAutoSync = await getSyncEngine();
    await runAutoSync();

    const config = axios.post.mock.calls[0][2];
    expect(config.headers.Authorization).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. اختبارات الحالات الحدّية (Edge Cases)
// ─────────────────────────────────────────────────────────────────────────────

describe('الحالات الحدّية', () => {
  it('DIRECT_SALE بدون customer_phone لا يضيف المعامل للرابط', async () => {
    const payload = { qr_code: 'ABC', note: '' }; // بدون customer_phone
    getPendingActions.mockResolvedValue([makeAction('DIRECT_SALE', payload)]);
    axios.post.mockResolvedValue(ok());

    const runAutoSync = await getSyncEngine();
    await runAutoSync();

    const url = axios.post.mock.calls[0][0];
    expect(url).not.toContain('customer_phone');
  });

  it('استجابة 204 (بدون محتوى) تعدّ نجاحاً', async () => {
    getPendingActions.mockResolvedValue([makeAction('DELETE_ORDER', { id: 5 })]);
    axios.delete.mockResolvedValue({ status: 204, data: null });

    const runAutoSync = await getSyncEngine();
    const result = await runAutoSync();

    expect(result.successCount).toBe(1);
    expect(removePendingAction).toHaveBeenCalledOnce();
  });

  it('استدعاء onProgressCallback عند وجوده مع وصف العملية', async () => {
    const progress = vi.fn();
    getPendingActions.mockResolvedValue([makeAction('CREATE_ORDER', {}, 'طلب تقدم')]);
    axios.post.mockResolvedValue(ok());

    const runAutoSync = await getSyncEngine();
    await runAutoSync(progress);

    // الكود يستخدم description أو type: "جاري مزامنة: {description || type}"
    expect(progress).toHaveBeenCalledWith(expect.stringContaining('طلب تقدم'));
  });
});
