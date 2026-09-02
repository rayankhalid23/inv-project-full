import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { resolveCameraErrorMessage } from '../hooks/useQrScanner';

/**
 * قبل الإصلاح: أي فشل بفتح الكاميرا (رفض إذن، لا كاميرا، اتصال غير آمن...)
 * كان يعرض نفس الرسالة العامة "امنح إذن الكاميرا"، فيضلّل التشخيص خصوصاً في
 * حالة فتح التطبيق من الهاتف عبر http على عنوان شبكة بدل https/localhost —
 * وهي بالضبط الحالة اللي تمنع navigator.mediaDevices من الوجود إطلاقاً.
 */
describe('resolveCameraErrorMessage — دقة رسالة فشل الكاميرا', () => {
  const originalIsSecureContext = window.isSecureContext;
  const originalMediaDevices = navigator.mediaDevices;

  afterEach(() => {
    Object.defineProperty(window, 'isSecureContext', { value: originalIsSecureContext, configurable: true });
    Object.defineProperty(navigator, 'mediaDevices', { value: originalMediaDevices, configurable: true });
  });

  it('يميّز اتصال غير آمن (http على عنوان شبكة) عن مشكلة إذن عادية', () => {
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    const msg = resolveCameraErrorMessage(new Error('any'), 'fallback');
    expect(msg).toMatch(/HTTPS/);
    expect(msg).not.toMatch(/رفض/);
  });

  it('يميّز غياب navigator.mediaDevices عن رفض الإذن', () => {
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
    const msg = resolveCameraErrorMessage(new Error('any'), 'fallback');
    expect(msg).toMatch(/https/);
  });

  it('يعطي رسالة رفض الإذن الصحيحة لـ NotAllowedError', () => {
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    Object.defineProperty(navigator, 'mediaDevices', { value: {}, configurable: true });
    const err = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    const msg = resolveCameraErrorMessage(err, 'fallback');
    expect(msg).toMatch(/رفض/);
  });

  it('يعطي رسالة "لا يوجد كاميرا" لـ NotFoundError', () => {
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    Object.defineProperty(navigator, 'mediaDevices', { value: {}, configurable: true });
    const err = Object.assign(new Error('none'), { name: 'NotFoundError' });
    const msg = resolveCameraErrorMessage(err, 'fallback');
    expect(msg).toMatch(/لم يتم العثور/);
  });

  it('يعطي رسالة "مستخدَمة من تطبيق آخر" لـ NotReadableError', () => {
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    Object.defineProperty(navigator, 'mediaDevices', { value: {}, configurable: true });
    const err = Object.assign(new Error('busy'), { name: 'NotReadableError' });
    const msg = resolveCameraErrorMessage(err, 'fallback');
    expect(msg).toMatch(/مستخدَمة/);
  });

  /**
   * html5-qrcode لا ترمي DOMException إطلاقاً — كل مسارات الفشل فيها ترفض
   * بنصوص عادية. الاعتماد على err.name وحده كان يجعل كل التصنيفات أعلاه كوداً
   * ميتاً، فيرى المستخدم الرسالة العامة مهما كان السبب الحقيقي.
   */
  describe('أخطاء html5-qrcode النصية (لا كائنات DOMException)', () => {
    beforeEach(() => {
      Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
      Object.defineProperty(navigator, 'mediaDevices', { value: {}, configurable: true });
    });

    it('يستخرج رفض الإذن من نص "Error getting userMedia"', () => {
      const err = 'Error getting userMedia, error = NotAllowedError: Permission denied';
      expect(resolveCameraErrorMessage(err, 'fallback')).toMatch(/رفض/);
    });

    it('يستخرج غياب الكاميرا من النص', () => {
      const err = 'Error getting userMedia, error = NotFoundError: Requested device not found';
      expect(resolveCameraErrorMessage(err, 'fallback')).toMatch(/لم يتم العثور/);
    });

    it('يستخرج "مستخدَمة من تطبيق آخر" من النص', () => {
      const err = 'Error getting userMedia, error = NotReadableError: Could not start video source';
      expect(resolveCameraErrorMessage(err, 'fallback')).toMatch(/مستخدَمة/);
    });

    it('يقرأ السبب من err.message أيضاً لا من err.name فقط', () => {
      const err = new Error('Error getting userMedia, error = OverconstrainedError: width');
      expect(resolveCameraErrorMessage(err, 'fallback')).toMatch(/لا تدعم الإعدادات/);
    });

    it('نص غير مصنَّف يبقى على الرسالة الافتراضية', () => {
      const err = 'Cannot transition to a new state, already under transition';
      expect(resolveCameraErrorMessage(err, 'fallback-message')).toBe('fallback-message');
    });
  });

  it('يرجع للرسالة الافتراضية لسبب غير مصنَّف', () => {
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    Object.defineProperty(navigator, 'mediaDevices', { value: {}, configurable: true });
    const err = Object.assign(new Error('weird'), { name: 'SomeWeirdError' });
    const msg = resolveCameraErrorMessage(err, 'fallback-message');
    expect(msg).toBe('fallback-message');
  });
});
