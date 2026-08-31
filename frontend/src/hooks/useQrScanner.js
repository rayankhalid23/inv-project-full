import { useCallback, useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { createScanGate } from './scanGate';

/**
 * ماسح QR/باركود موحّد لكل شاشات النظام (البيع المباشر، تجهيز الطلبات،
 * الرواجع والتوالف).
 *
 * لماذا هوك واحد؟ كانت كل شاشة تنسخ منطق الكاميرا لنفسها، فاختلف سلوكها:
 * شاشة تمسح بسرعة وأخرى لا تمسح إطلاقاً. توحيد المنطق هنا يضمن أن أي تحسين
 * في التعرّف أو في منع التكرار يصل لكل الشاشات دفعة واحدة.
 *
 * المشكلتان اللتان يعالجهما هذا الهوك تحديداً:
 *
 * 1) عدم التعرّف على الكود في بعض الشاشات:
 *    السبب الأول كان إعادة تشغيل الكاميرا مع كل رسم للمكوّن، لأن دالة
 *    المعالجة كانت ضمن اعتماديات التأثير. الكاميرا تحتاج ~1.5 ثانية حتى
 *    تستقر وتبدأ فك الترميز، فكانت تُقتل قبل أن تلتقط أي إطار.
 *    الحل: نحتفظ بدالة المعالجة في ref، فلا تتغيّر هوية التأثير أبداً،
 *    ودورة حياة الكاميرا تتبع `active` فقط.
 *    السبب الثاني كان صندوق مسح ثابت 220px على بث بعرض 1280px، أي أن الكود
 *    يجب أن يقع في مساحة صغيرة جداً وسط الشاشة. الآن الصندوق نسبي من حجم
 *    البث الفعلي، ونطلب دقة أعلى وتركيزاً مستمراً، ونستعمل مفكّك الترميز
 *    الأصلي للمتصفح (BarcodeDetector) متى توفّر لأنه أسرع بمراحل.
 *
 * 2) المسح المتكرر للكود نفسه عدة مرات في الثانية:
 *    الكاميرا تُطلق النداء لكل إطار ناجح (10-15 مرة/ثانية)، فيُسجَّل نفس
 *    الصنف مرات عديدة. الآن نوقف فك الترميز فعلياً (pause) لحظة قبول أي كود،
 *    ولا نستأنف إلا بعد انتهاء المعالجة + فاصل قصير، مع منع تكرار *نفس*
 *    الكود لمدة أطول (يمنع الخطأ) وسماح شبه فوري بكود *مختلف* (يبقي المسح
 *    المتتالي سريعاً كما طُلب).
 */

// فاصل قصير جداً بين كودين مختلفين — يكفي لمنع التداخل دون إبطاء الموظف
const DEFAULT_MIN_GAP_MS = 400;
// منع إعادة قراءة نفس الكود — الحارس الحقيقي ضد التسجيل المزدوج بالخطأ
const DEFAULT_SAME_CODE_MS = 2200;

// حصر الصيغ المدعومة يسرّع فك الترميز بشكل ملحوظ: المفكّك لا يجرب
// خوارزميات صيغ لا نستعملها أصلاً في كل إطار.
const SUPPORTED_FORMATS = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
];

/**
 * صندوق المسح نسبي لحجم البث لا ثابت بالبكسل.
 * على الهاتف البث عمودي وعلى الحاسوب أفقي، والقيمة الثابتة كانت تعني
 * مساحة تعرّف صغيرة جداً في الحالة الأولى وضيقة في الثانية.
 */
const buildQrBox = (viewfinderWidth, viewfinderHeight) => {
  const smaller = Math.min(viewfinderWidth || 0, viewfinderHeight || 0);
  if (!smaller) return { width: 250, height: 250 };
  const side = Math.floor(Math.max(180, Math.min(smaller * 0.8, 420)));
  return { width: side, height: side };
};

// دقة أعلى = تفاصيل أكثر في الإطار = تعرّف أسهل على الأكواد الصغيرة المطبوعة
const CAMERA_CONSTRAINTS = {
  facingMode: { ideal: 'environment' },
  width: { ideal: 1280 },
  height: { ideal: 720 },
};

export default function useQrScanner({
  elementId,
  active,
  onScan,
  minGapMs = DEFAULT_MIN_GAP_MS,
  sameCodeCooldownMs = DEFAULT_SAME_CODE_MS,
  onError,
  errorMessage = 'تعذّر فتح الكاميرا. تأكد من إعطاء إذن الكاميرا، أو استخدم البحث/الإدخال اليدوي.',
}) {
  const [status, setStatus] = useState('idle');   // idle | loading | active | error
  const [cameraError, setCameraError] = useState('');
  const [isCoolingDown, setIsCoolingDown] = useState(false);

  const scannerRef = useRef(null);
  // رقم تسلسلي لكل محاولة تشغيل. التشغيل غير متزامن (إذن الكاميرا، انتظار
  // العنصر، بدء البث)، فقد تُطلب محاولة جديدة قبل انتهاء السابقة — مثلاً
  // عودة سريعة من شاشة التأكيد لشاشة المسح. أي محاولة اكتشفت أن رقمها لم
  // يعد الأحدث تنسحب بهدوء وتترك الساحة للأحدث، بدل أن ترفض الجديدة (فتبقى
  // الكاميرا مطفأة) أو تكمل بالتوازي معها (فتتصارعان على نفس العنصر).
  const runIdRef = useRef(0);
  const mountedRef = useRef(true);


  // الدوال والقيم المتغيّرة تعيش في refs حتى تبقى هوية التأثير ثابتة،
  // فلا تُعاد تهيئة الكاميرا مع كل رسم للمكوّن.
  const onScanRef = useRef(onScan);
  const onErrorRef = useRef(onError);
  const gapRef = useRef(minGapMs);
  const sameCodeRef = useRef(sameCodeCooldownMs);
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);
  useEffect(() => { gapRef.current = minGapMs; }, [minGapMs]);
  useEffect(() => { sameCodeRef.current = sameCodeCooldownMs; }, [sameCodeCooldownMs]);

  // بوابة منع التكرار — منطق خالص مُختبَر في scanGate.js.
  // تُنشأ مرة واحدة وتقرأ مهلها من الـ refs عند كل قرار، فتغيّر الخيارات لا
  // يعيد بناءها (وإلا ضاع تاريخ آخر مسح المخزَّن فيها).
  const gateRef = useRef(null);
  if (!gateRef.current) {
    gateRef.current = createScanGate({
      minGapMs: () => gapRef.current,
      sameCodeCooldownMs: () => sameCodeRef.current,
    });
  }

  const stop = useCallback(async () => {
    // أي محاولة تشغيل جارية تصبح قديمة فور طلب الإيقاف
    runIdRef.current += 1;
    const instance = scannerRef.current;
    scannerRef.current = null;
    if (instance) {
      try {
        if (instance.isScanning) await instance.stop();
        instance.clear();
      } catch { /* الكاميرا قد تكون توقفت أصلاً — لا شيء نفعله */ }
    }
    gateRef.current.reset();
    if (mountedRef.current) {
      setIsCoolingDown(false);
      setStatus('idle');
    }
  }, []);

  /**
   * بوابة قبول الكود: تُنفَّذ لكل إطار ناجح، ويجب أن تكون رخيصة وصارمة.
   * ترتيب الفحوص من الأرخص للأغلى مقصود.
   */
  const handleDecoded = useCallback((decodedText) => {
    const code = gateRef.current.accept(decodedText);
    if (!code) return;

    if (mountedRef.current) setIsCoolingDown(true);

    // إيقاف فك الترميز فعلياً بدل الاكتفاء بالأعلام: أي إطار يصل أثناء
    // المعالجة لن يُفكّ أصلاً، فيستحيل تسجيل نفس القطعة مرتين.
    try { scannerRef.current?.pause(false); } catch { /* غير مهم */ }

    const release = () => {
      gateRef.current.release();
      if (mountedRef.current) setIsCoolingDown(false);
      try {
        if (scannerRef.current && scannerRef.current.isScanning) scannerRef.current.resume();
      } catch { /* توقفت الكاميرا أثناء المعالجة */ }
    };

    let result;
    try {
      result = onScanRef.current?.(code);
    } catch (err) {
      console.warn('QR scan handler failed:', err);
      release();
      return;
    }

    // ندعم المعالج المتزامن وغير المتزامن معاً: ننتظر انتهاء العملية فعلياً
    // (نداء الخادم مثلاً) قبل بدء عدّ الفاصل، وإلا استؤنف المسح والطلب
    // السابق ما زال جارياً.
    Promise.resolve(result)
      .catch(() => { /* الشاشة نفسها مسؤولة عن عرض الخطأ */ })
      .finally(() => { setTimeout(release, gapRef.current); });
  }, []);

  const start = useCallback(async () => {
    // نغلق أي بث سابق أولاً، ثم نحجز رقم المحاولة — بهذا الترتيب تحديداً،
    // لأن stop() يُبطل المحاولات الجارية بزيادة العداد، فلو حجزنا الرقم قبله
    // لأبطل محاولتنا نحن.
    await stop();

    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    const isStale = () => runIdRef.current !== runId || !mountedRef.current;

    if (!mountedRef.current) return;
    setStatus('loading');
    setCameraError('');

    try {
      // العنصر الحاوي قد لا يكون في الـ DOM بعد إذا كان داخل أنيميشن فتح
      // (framer-motion)، فننتظره بضعة إطارات بدل الفشل فوراً.
      let container = null;
      for (let i = 0; i < 20 && !container; i += 1) {
        container = document.getElementById(elementId);
        if (isStale()) return;
        if (!container) await new Promise((r) => setTimeout(r, 50));
      }
      if (isStale()) return;
      if (!container) throw new Error('Scanner container not found: ' + elementId);

      const html5QrCode = new Html5Qrcode(elementId, {
        formatsToSupport: SUPPORTED_FORMATS,
        // المفكّك الأصلي في المتصفح (BarcodeDetector) أسرع وأدق بكثير من
        // نسخة الجافاسكربت، ومدعوم على كروم أندرويد وهو جهاز الموظفين.
        useBarCodeDetectorIfSupported: true,
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        verbose: false,
      });
      if (isStale()) return;
      scannerRef.current = html5QrCode;

      const scanConfig = {
        fps: 15,
        qrbox: buildQrBox,
        aspectRatio: 1.0,
        disableFlip: false,
      };

      try {
        await html5QrCode.start(CAMERA_CONSTRAINTS, scanConfig, handleDecoded, () => {});
      } catch (primaryErr) {
        // بعض الأجهزة ترفض قيد facingMode. نعيد المحاولة باختيار الكاميرا
        // الخلفية بالاسم، ثم بأي كاميرا متاحة، قبل أن نعلن الفشل.
        const cameras = await Html5Qrcode.getCameras();
        if (!cameras || cameras.length === 0) throw primaryErr;
        const back = cameras.find((c) => /back|rear|environment/i.test(c.label || ''));
        const chosen = back || cameras[cameras.length - 1];
        await html5QrCode.start(chosen.id, scanConfig, handleDecoded, () => {});
      }

      // تركيز مستمر يجعل الكود المطبوع الصغير يُقرأ دون أن يبعد الموظف يده
      // ويقرّبها. غير مدعوم على كل الأجهزة، ففشله لا يعني فشل المسح.
      try {
        await html5QrCode.applyVideoConstraints({
          advanced: [{ focusMode: 'continuous' }],
        });
      } catch { /* الجهاز لا يدعم التحكم بالتركيز */ }

      if (isStale()) {
        // محاولة أحدث سبقتنا: نغلق *نسختنا* تحديداً لا ما في scannerRef،
        // فذاك قد يكون بث المحاولة الأحدث ولا يجوز أن نقتله.
        try {
          if (html5QrCode.isScanning) await html5QrCode.stop();
          html5QrCode.clear();
        } catch { /* أُغلق أصلاً */ }
        if (scannerRef.current === html5QrCode) scannerRef.current = null;
        return;
      }
      setStatus('active');
    } catch (err) {
      if (isStale()) return;
      console.warn('Camera start failed:', err);
      scannerRef.current = null;
      setStatus('error');
      setCameraError(errorMessage);
      onErrorRef.current?.(err);
    }
  }, [elementId, stop, handleDecoded, errorMessage]);

  // دورة حياة الكاميرا تعتمد على `active` فقط — كل الاعتماديات الأخرى ثابتة
  // الهوية عمداً، وإلا أُعيد تشغيل الكاميرا مع كل رسم فلا تمسح شيئاً.
  useEffect(() => {
    mountedRef.current = true;
    if (active) start();
    else stop();
    return () => {
      mountedRef.current = false;
      stop();
    };
  }, [active, start, stop]);

  return { status, cameraError, isCoolingDown, restart: start, stop };
}
