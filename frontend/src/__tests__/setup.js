import { IDBFactory } from 'fake-indexeddb';
import { vi } from 'vitest';

// Mock virtual:pwa-register (not available in test env)
vi.mock('virtual:pwa-register', () => ({
  registerSW: vi.fn(() => vi.fn()),
}));

// قبل كل اختبار: استبدال IndexedDB بنسخة جديدة نظيفة تماماً
// + مسح localStorage حتى لا تتسرب بيانات بين الاختبارات
beforeEach(() => {
  global.indexedDB = new IDBFactory();
  localStorage.clear();
});
