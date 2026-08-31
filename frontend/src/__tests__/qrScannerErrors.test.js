import { describe, it, expect, afterEach } from 'vitest';
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

  it('يرجع للرسالة الافتراضية لسبب غير مصنَّف', () => {
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    Object.defineProperty(navigator, 'mediaDevices', { value: {}, configurable: true });
    const err = Object.assign(new Error('weird'), { name: 'SomeWeirdError' });
    const msg = resolveCameraErrorMessage(err, 'fallback-message');
    expect(msg).toBe('fallback-message');
  });
});
