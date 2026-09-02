import { describe, it, expect, beforeEach } from 'vitest';
import { Html5Qrcode } from 'html5-qrcode';
import { VideoConstraintsUtil } from 'html5-qrcode/esm/utils';
import { REAR_CAMERA_SELECTOR, VIDEO_CONSTRAINTS } from '../hooks/useQrScanner';

/**
 * انحدار الكاميرا: إعادة هيكلة الماسح إلى هوك موحّد مرّرت كائن
 * MediaTrackConstraints كوسيط أول لـ Html5Qrcode.start()، وهو موضع تتحقق منه
 * المكتبة بصرامة (مفتاح واحد فقط: facingMode نصاً أو { exact }، أو deviceId).
 * النتيجة: createVideoConstraints ترمي نصاً قبل إلغاء معاملة تغيير الحالة،
 * فتبقى النسخة عالقة ولا تفتح الكاميرا على أي جهاز إطلاقاً.
 *
 * هذه الاختبارات تتحقق من قيودنا مقابل مُتحقّق المكتبة الحقيقي، لا مقابل نسخة
 * مقلَّدة منه — فلو غيّرت المكتبة شروطها في ترقية لاحقة يسقط الاختبار فوراً.
 */
describe('قيود الكاميرا مقابل مُتحقّق html5-qrcode الحقيقي', () => {
  let scanner;

  beforeEach(() => {
    document.body.innerHTML = '<div id="test-reader"></div>';
    scanner = new Html5Qrcode('test-reader', { verbose: false });
  });

  it('REAR_CAMERA_SELECTOR مقبول كوسيط أول ويُترجم للكاميرا الخلفية', () => {
    expect(() => scanner.createVideoConstraints(REAR_CAMERA_SELECTOR)).not.toThrow();
    expect(scanner.createVideoConstraints(REAR_CAMERA_SELECTOR)).toEqual({
      facingMode: 'environment',
    });
  });

  it('الكائن الذي سبّب العطل يرمي فعلاً — إثبات سبب الانحدار', () => {
    const broken = {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    };
    expect(() => scanner.createVideoConstraints(broken)).toThrow(/exactly 1 key/);
  });

  it('حتى بمفتاح واحد، صيغة { ideal } مرفوضة في الوسيط الأول', () => {
    expect(() => scanner.createVideoConstraints({ facingMode: { ideal: 'environment' } }))
      .toThrow(/exact/);
  });

  it('VIDEO_CONSTRAINTS صالحة في موضعها الصحيح (config.videoConstraints)', () => {
    const logger = { logError: () => {}, log: () => {}, warn: () => {} };
    expect(VideoConstraintsUtil.isMediaStreamConstraintsValid(VIDEO_CONSTRAINTS, logger)).toBe(true);
  });

  it('قيود الكاميرا المختارة بالـ deviceId (المسار الاحتياطي) صالحة أيضاً', () => {
    const logger = { logError: () => {}, log: () => {}, warn: () => {} };
    const fallback = {
      deviceId: { exact: 'camera-id-123' },
      width: VIDEO_CONSTRAINTS.width,
      height: VIDEO_CONSTRAINTS.height,
    };
    expect(VideoConstraintsUtil.isMediaStreamConstraintsValid(fallback, logger)).toBe(true);
    expect(() => scanner.createVideoConstraints('camera-id-123')).not.toThrow();
  });
});
