import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Html5Qrcode } from 'html5-qrcode';
import { REAR_CAMERA_SELECTOR, VIDEO_CONSTRAINTS } from '../hooks/useQrScanner';

/**
 * تشغيل حقيقي لـ Html5Qrcode.start() من المكتبة نفسها (لا نسخة مقلَّدة)، مع
 * تزييف navigator.mediaDevices فقط. الهدف قياس **أين** يتوقف المسار:
 *
 *  - بالقيود القديمة: يفشل قبل أن يصل إلى getUserMedia إطلاقاً، أي أن الكاميرا
 *    لم تُطلب من النظام ولا مرة — ولهذا لم يظهر للمستخدم أي طلب إذن، ولم تكن
 *    المشكلة في الإذن ولا في HTTPS.
 *  - بالقيود الجديدة: يصل إلى getUserMedia ويطلب الكاميرا الخلفية فعلاً.
 *
 * (ما بعد ذلك — تشغيل عنصر <video> — لا تدعمه jsdom، وهو خارج نطاق العطل.)
 */
describe('مسار تشغيل الكاميرا الحقيقي عبر html5-qrcode', () => {
  let getUserMedia;
  const originalMediaDevices = navigator.mediaDevices;

  beforeEach(() => {
    document.body.innerHTML = '<div id="reader"></div>';
    getUserMedia = vi.fn(() => Promise.reject(
      Object.assign(new Error('no camera in jsdom'), { name: 'NotFoundError' }),
    ));
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia, enumerateDevices: vi.fn(() => Promise.resolve([])) },
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: originalMediaDevices, configurable: true,
    });
  });

  const scanConfig = { fps: 15, aspectRatio: 1.0, disableFlip: false };

  it('القيود القديمة: تفشل قبل الوصول إلى getUserMedia — الكاميرا لم تُطلب أصلاً', async () => {
    const broken = {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    };
    const scanner = new Html5Qrcode('reader', { verbose: false });
    await expect(scanner.start(broken, scanConfig, () => {}, () => {})).rejects.toBeDefined();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('القيود القديمة تُعطّل النسخة نهائياً: أي محاولة تالية ترفض فوراً', async () => {
    const broken = { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } };
    const scanner = new Html5Qrcode('reader', { verbose: false });
    await scanner.start(broken, scanConfig, () => {}, () => {}).catch(() => {});

    // إعادة المحاولة على *نفس* النسخة — وهو ما كان يفعله المسار الاحتياطي
    let secondError;
    try {
      await scanner.start('some-camera-id', scanConfig, () => {}, () => {});
    } catch (e) {
      secondError = e;
    }
    expect(String(secondError)).toMatch(/already under transition/);
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('القيود الجديدة: تصل إلى getUserMedia وتطلب الكاميرا الخلفية فعلاً', async () => {
    const scanner = new Html5Qrcode('reader', { verbose: false });
    await scanner.start(
      REAR_CAMERA_SELECTOR,
      { ...scanConfig, videoConstraints: VIDEO_CONSTRAINTS },
      () => {},
      () => {},
    ).catch(() => { /* jsdom لا تشغّل <video> — الفشل هنا بعد نقطة العطل */ });

    expect(getUserMedia).toHaveBeenCalled();
    const requested = getUserMedia.mock.calls[0][0];
    expect(requested.video).toMatchObject({ facingMode: { ideal: 'environment' } });
    expect(requested.video.width).toEqual({ ideal: 1280 });
  });

  it('نسخة جديدة لكل محاولة تتفادى قفل الحالة — أساس المسار الاحتياطي', async () => {
    const first = new Html5Qrcode('reader', { verbose: false });
    await first.start({ facingMode: { ideal: 'x' } }, scanConfig, () => {}, () => {}).catch(() => {});

    const second = new Html5Qrcode('reader', { verbose: false });
    await second.start(
      REAR_CAMERA_SELECTOR,
      { ...scanConfig, videoConstraints: VIDEO_CONSTRAINTS },
      () => {}, () => {},
    ).catch(() => {});

    // النسخة الجديدة وصلت للكاميرا رغم فشل السابقة
    expect(getUserMedia).toHaveBeenCalled();
  });
});
