import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShoppingCart, RotateCcw, AlertTriangle, Camera, RefreshCw, Lock, Phone, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';

import { catalogApi } from '../api/catalogApi';
import { orderApi } from '../api/orderApi';
import QuickSalePanel from '../components/sales/QuickSalePanel';
import { saveOfflineAction } from '../utils/idbStorage';
import { isNetworkError } from '../utils/netErrors';

const playScanBeep = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
    osc.onended = () => ctx.close();
  } catch (e) {}
};

export default function QuickScanPage({ isOpen, onClose }) {
  const navigate = useNavigate();
  const isVisible = isOpen !== undefined ? isOpen : true;

  const [step, setStep] = useState('scanning'); // scanning | confirm
  const [scanType, setScanType] = useState('return'); // return | waste | sale
  const [barcode, setBarcode] = useState('');
  const [error, setError] = useState('');
  const [scannedProduct, setScannedProduct] = useState(null);
  const [reason, setReason] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  // منتجات لوحة البيع المدمجة
  const [quickSaleProducts, setQuickSaleProducts] = useState([]);
  const [loadingQuickSale, setLoadingQuickSale] = useState(false);

  /** إعادة جلب المنتجات بعد بيع ناجح حتى تُعرض الكميات المحدَّثة */
  const refreshSaleProducts = useCallback(async () => {
    try {
      const products = await orderApi.getAllProductsWithVariants();
      setQuickSaleProducts(products || []);
    } catch {
      /* الفشل هنا لا يمنع إتمام البيع */
    }
  }, []);

  // فارغ = مقبول (الحقل اختياري)؛ وإلا يجب أن يكون 10 أرقام تبدأ بـ 09
  const phoneInvalid = customerPhone.length > 0 && !/^09\d{8}$/.test(customerPhone);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cameraStatus, setCameraStatus] = useState('idle'); // idle | loading | active | error
  const [cameraErrorMsg, setCameraErrorMsg] = useState('');
  // في وضع البيع الكاميرا مخفية افتراضياً ويفتحها المستخدم عند الحاجة
  const [cameraEnabled, setCameraEnabled] = useState(false);

  const html5QrCodeRef = useRef(null);
  const lastScanTimeRef = useRef(0);
  const isProcessingScanRef = useRef(false);
  const scanCooldownRef = useRef(false);
  const [scanCooldown, setScanCooldown] = useState(false);
  const [lastScannedFeedback, setLastScannedFeedback] = useState('');

  // لوحة البيع المدمجة + مرجع للنوع الحالي.
  // نستخدم ref للنوع لأن processScannedCode تُمرَّر لكاميرا Html5Qrcode مرة
  // واحدة، فلو قرأت scanType من الإغلاق لبقيت على قيمته وقت التسجيل.
  const salePanelRef = useRef(null);
  const scanTypeRef = useRef(scanType);
  useEffect(() => { scanTypeRef.current = scanType; }, [scanType]);

  // تحميل المنتجات تلقائياً بمجرد اختيار تبويب "بيع" (مرة واحدة فقط)،
  // فلا يحتاج المستخدم أي ضغطة إضافية للوصول لواجهة البيع.
  //
  // نستخدم ref للحارس لا state: لو وُضع مؤشر التحميل ضمن قائمة الاعتماديات
  // لأعاد تشغيل التأثير فور رفعه، فيُلغى الطلب الجاري ويبقى المؤشر معلّقاً.
  const saleProductsRequestedRef = useRef(false);
  useEffect(() => {
    if (!isVisible || scanType !== 'sale') return;
    if (saleProductsRequestedRef.current) return;

    saleProductsRequestedRef.current = true;
    setLoadingQuickSale(true);
    orderApi.getAllProductsWithVariants()
      .then((products) => setQuickSaleProducts(products || []))
      .catch(() => {
        saleProductsRequestedRef.current = false;   // اسمح بإعادة المحاولة
        toast.error('تعذّر تحميل قائمة المنتجات');
      })
      .finally(() => setLoadingQuickSale(false));
  }, [isVisible, scanType]);

  // إيقاف بث الكاميرا بنظافة
  const stopCamera = useCallback(async () => {
    if (html5QrCodeRef.current) {
      try {
        await html5QrCodeRef.current.stop();
        html5QrCodeRef.current.clear();
      } catch (e) {}
      html5QrCodeRef.current = null;
    }
    isProcessingScanRef.current = false;
    scanCooldownRef.current = false;
    setScanCooldown(false);
    setLastScannedFeedback('');
    setCameraStatus('idle');
  }, []);

  // دالة التعامل مع الرمز الممسوح
  const processScannedCode = useCallback(async (scannedCode) => {
    if (!scannedCode) return;
    const cleanBarcode = String(scannedCode).trim();
    setBarcode(cleanBarcode);
    setError('');

    try {
      // نستخدم محلّل الخادم: يفهم نص الـ QR المطبوع (VAR:id|SKU:code) والمسار
      // المخزّن وكود المنتج معاً. البحث السابق كان يطابق النص الممسوح مع العمود
      // مباشرة، فكان يفشل مع أغلب المنتجات لأن العمود يخزّن مسار الصورة.
      const v = await catalogApi.resolveScannedCode(cleanBarcode);

      // في وضع البيع: نضيف الصنف مباشرة للسلة ونبقى على شاشة المسح
      // ليتمكن الموظف من مسح عدة أصناف متتالية دون أي ضغطة إضافية.
      if (v && v.variant_id && scanTypeRef.current === 'sale') {
        salePanelRef.current?.addResolvedVariant(v);
        setBarcode('');
        setLastScannedFeedback(`تمت إضافة: ${v.product_name || 'منتج'} بالسلة`);
        return;
      }

      if (v && v.variant_id) {
        setScannedProduct({
          name: v.product_name || "منتج غير مسمى",
          sku: v.product_code || cleanBarcode,
          available: v.quantity_available || 0,
          price: v.selling_price || 0,
          color: v.color_name,
          size: v.size_name,
          // نمرّر القيمة المخزّنة فعلاً ليطابقها الخادم عند التنفيذ
          qr_code: v.qr_code || cleanBarcode
        });
        setLastScannedFeedback(`تم التعرف على: ${v.product_name}`);
        stopCamera();
        setStep('confirm');
      } else {
        setError(`لم يتم العثور على منتج للكود: ${cleanBarcode}`);
        setLastScannedFeedback(`لم يتم العثور على الصنف: ${cleanBarcode}`);
      }
    } catch (err) {
      const errMsg = typeof err === 'string' ? err : (err.response?.data?.detail || 'خطأ أثناء البحث عن المنتج.');
      setError(errMsg);
      setLastScannedFeedback(errMsg);
    }
  }, [stopCamera]);

  // تشغيل الكاميرا المباشرة والمسح التلقائي المباشر فور التعرف على الكود
  const startCamera = useCallback(async () => {
    setCameraStatus('loading');
    setCameraErrorMsg('');

    try {
      await stopCamera();

      const html5QrCode = new Html5Qrcode("quick-scan-camera-reader");
      html5QrCodeRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          if (!decodedText || isProcessingScanRef.current || scanCooldownRef.current) return;
          const now = Date.now();
          if (now - lastScanTimeRef.current < 1800) return;

          lastScanTimeRef.current = now;
          isProcessingScanRef.current = true;
          scanCooldownRef.current = true;
          setScanCooldown(true);
          setLastScannedFeedback('جاري معالجة الكود...');

          playScanBeep();
          processScannedCode(decodedText).finally(() => {
            // فاصل زمني هادئ يمنع التذبذب وتكرار المسح
            setTimeout(() => {
              isProcessingScanRef.current = false;
              scanCooldownRef.current = false;
              setScanCooldown(false);
              setLastScannedFeedback('');
            }, 1600);
          });
        },
        () => {}
      );

      setCameraStatus('active');
    } catch (err) {
      console.warn("Camera start error:", err);
      setCameraStatus('error');
      setCameraErrorMsg('تعذر فتح الكاميرا المباشرة تلقائياً. أدخل الكود يدوياً أدناه.');
    }
  }, [stopCamera, processScannedCode]);

  // في وضع البيع تبقى الكاميرا مغلقة حتى يطلبها المستخدم (الاختيار من القائمة
  // أسرع في الغالب)، بينما تُفتح تلقائياً في المرتجع والتالف لأن المسح هو
  // الإجراء الأساسي فيهما.
  const cameraShouldRun = step === 'scanning' && (scanType !== 'sale' || cameraEnabled);

  useEffect(() => {
    if (isVisible) {
      document.body.style.overflow = 'hidden';
      if (cameraShouldRun) {
        startCamera();
      } else {
        stopCamera();
      }
    } else {
      document.body.style.overflow = 'unset';
      stopCamera();
    }

    return () => {
      document.body.style.overflow = 'unset';
      stopCamera();
    };
  }, [isVisible, cameraShouldRun, startCamera, stopCamera]);

  // إغلاق الكاميرا تلقائياً عند مغادرة تبويب البيع حتى لا تبقى تعمل بالخلفية
  useEffect(() => {
    if (scanType !== 'sale') setCameraEnabled(false);
  }, [scanType]);

  const handleClose = () => {
    stopCamera();
    setBarcode('');
    setError('');
    setScannedProduct(null);
    setReason('');
    setCustomerPhone('');
    setStep('scanning');
    if (typeof onClose === 'function') {
      onClose();
    } else {
      navigate(-1);
    }
  };

  // 1. مرحلة فحص الباركود اليدوي
  const handleBarcodeSubmit = async (e) => {
    if (e) e.preventDefault();
    processScannedCode(barcode);
  };

  // 2. مرحلة الاعتماد النهائي
  const handleConfirmSubmit = async (e) => {
    e.preventDefault();

    // لا نمنع الإرسال إن كان الحقل فارغاً — هو اختياري — بل فقط إن كُتب خطأً
    if (scanType === 'sale' && phoneInvalid) {
      setError('رقم الزبون غير صحيح. صححه أو امسحه بالكامل.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    const targetNote = reason.trim() || (
      scanType === 'return' ? 'مرتجع عبر ماسح سريع' :
      scanType === 'waste'  ? 'تالف عبر ماسح سريع'  :
      'بيع مباشر عبر ماسح سريع'
    );

    if (!navigator.onLine) {
      const actionType = scanType === 'return' ? 'SCAN_RETURN' : scanType === 'waste' ? 'SCAN_DAMAGE' : 'DIRECT_SALE';
      const desc = scanType === 'return' ? `مرتجع لـ ${scannedProduct.name}` : scanType === 'waste' ? `تالف لـ ${scannedProduct.name}` : `بيع مباشر لـ ${scannedProduct.name}`;
      
      const saved = await saveOfflineAction(actionType, {
        qr_code: scannedProduct.qr_code,
        note: targetNote,
        // يُرسل مع البيع فقط، ويُحفظ في الطابور ليُرفع مع العملية عند عودة النت
        ...(scanType === 'sale' && customerPhone ? { customer_phone: customerPhone } : {}),
      }, desc);
      setIsSubmitting(false);
      if (!saved) {
        setError('تعذّر حفظ العملية محلياً! حاول مرة أخرى.');
        return;
      }
      toast.success('أوفلاين: تم حفظ العملية محلياً! سيتم رفعها عند الاتصال 📡');
      handleClose();
      return;
    }

    let saleResult = null;
    try {
      if (scanType === 'return') {
        const retRes = await catalogApi.processScanReturn(scannedProduct.qr_code, targetNote);
        setIsSubmitting(false);
        toast.success(retRes?.message || 'تم تسجيل المرتجع بنجاح!');
      } else if (scanType === 'waste') {
        const damRes = await catalogApi.processScanDamage(scannedProduct.qr_code, targetNote);
        setIsSubmitting(false);
        toast.success(damRes?.message || 'تم تسجيل التالف بنجاح!');
      } else {
        // بيع مباشر — يُنشئ طلباً وفاتورة ويسجّل حركة مخزون
        saleResult = await catalogApi.processScanSale(scannedProduct.qr_code, targetNote, customerPhone || null);
        setIsSubmitting(false);
        const invoiceNo = saleResult?.order_id;
        toast.success(invoiceNo
          ? `تم البيع بنجاح — الفاتورة رقم #${invoiceNo} 🧾`
          : (saleResult?.message || 'تم البيع وخصمه من المخزون بنجاح!'));
      }
      handleClose();
    } catch (err) {
      if (isNetworkError(err)) {
        const actionType = scanType === 'return' ? 'SCAN_RETURN' : scanType === 'waste' ? 'SCAN_DAMAGE' : 'DIRECT_SALE';
        const desc = scanType === 'return' ? `مرتجع لـ ${scannedProduct.name}` : scanType === 'waste' ? `تالف لـ ${scannedProduct.name}` : `بيع مباشر لـ ${scannedProduct.name}`;
        const saved = await saveOfflineAction(actionType, {
        qr_code: scannedProduct.qr_code,
        note: targetNote,
        // يُرسل مع البيع فقط، ويُحفظ في الطابور ليُرفع مع العملية عند عودة النت
        ...(scanType === 'sale' && customerPhone ? { customer_phone: customerPhone } : {}),
      }, desc);
        setIsSubmitting(false);
        if (!saved) {
          setError('تعذّر حفظ العملية محلياً! حاول مرة أخرى.');
          return;
        }
        toast.success('أوفلاين: تم حفظ العملية محلياً! سيتم رفعها عند الاتصال 📡');
        handleClose();
      } else {
        setIsSubmitting(false);
        setError(typeof err === 'string' ? err : (err.response?.data?.detail || 'فشلت العملية في السيرفر.'));
      }
    }
  };

  const typeConfig = {
    return: {
      label: 'راجع',
      icon: <RotateCcw className="w-3.5 h-3.5" />,
      color: 'text-blue-600',
      activeBg: 'bg-white shadow-sm',
      confirmColor: 'bg-blue-600 hover:bg-blue-700',
      placeholder: 'مثال: مرتجع زبون، خطأ في المقاس...',
      titleColor: 'text-blue-700',
    },
    waste: {
      label: 'تالف',
      icon: <AlertTriangle className="w-3.5 h-3.5" />,
      color: 'text-red-600',
      activeBg: 'bg-white shadow-sm',
      confirmColor: 'bg-red-600 hover:bg-red-700',
      placeholder: 'مثال: تالف تعبئة، كسر في المنتج...',
      titleColor: 'text-red-700',
    },
    sale: {
      label: 'بيع',
      icon: <ShoppingCart className="w-3.5 h-3.5" />,
      color: 'text-emerald-600',
      activeBg: 'bg-white shadow-sm',
      confirmColor: 'bg-emerald-600 hover:bg-emerald-700',
      placeholder: 'مثال: بيع مباشر، كاشير...',
      titleColor: 'text-emerald-700',
    },
  };

  const currentConfig = typeConfig[scanType];

  /**
   * مربع الكاميرا — عنصر واحد يُستخدم في الأوضاع الثلاثة.
   * في وضع البيع يُمرَّر إلى لوحة البيع لتضعه بين حقول العميل والمنتجات،
   * فيبقى تعريفه في مكان واحد بلا تكرار.
   */
  const cameraBox = (
    <div className="relative h-48 sm:h-56 w-full bg-black rounded-2xl overflow-hidden flex items-center justify-center border border-slate-800 shadow-inner group">
      <div id="quick-scan-camera-reader" className="w-full h-full object-cover"></div>

      {cameraStatus !== 'active' && (
        <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-xs flex flex-col items-center justify-center gap-3 text-white z-10 p-4">
          {cameraStatus === 'loading' ? (
            <div className="flex flex-col items-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-[#800000]" />
              <span className="text-xs font-bold text-slate-300">جاري فتح الكاميرا...</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={startCamera}
              className="px-5 py-2.5 bg-[#800000] hover:bg-[#990000] text-white font-bold rounded-xl text-xs flex items-center gap-2 transition-all shadow-md active:scale-95"
            >
              <Camera className="w-4 h-4" />
              <span>تشغيل الكاميرا</span>
            </button>
          )}
        </div>
      )}

      {cameraStatus === 'active' && (
        <>
          {/* إطار المسح الليزري الأنيق والمبسط */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-20">
            <div className="relative w-44 h-44 sm:w-48 sm:h-48 border border-white/15 rounded-2xl">
              <div className="absolute -top-1 -left-1 w-5 h-5 border-t-2 border-l-2 border-emerald-400 rounded-tl-lg"></div>
              <div className="absolute -top-1 -right-1 w-5 h-5 border-t-2 border-r-2 border-emerald-400 rounded-tr-lg"></div>
              <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-2 border-l-2 border-emerald-400 rounded-bl-lg"></div>
              <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-2 border-r-2 border-emerald-400 rounded-br-lg"></div>
              
              <div className="absolute inset-x-2 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse top-1/2 -translate-y-1/2"></div>
            </div>
          </div>

          {/* وميض نجاح أنيق وسلس بدون نصوص مكدسة */}
          {scanCooldown && (
            <div className="absolute inset-0 bg-emerald-950/70 backdrop-blur-[2px] flex items-center justify-center z-30 animate-in fade-in duration-200">
              <div className="bg-emerald-500/20 border border-emerald-400/50 backdrop-blur-md px-4 py-2 rounded-2xl flex items-center gap-2 text-emerald-300 shadow-xl scale-105 transition-all">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span className="text-xs font-black truncate max-w-[200px]">
                  {lastScannedFeedback || 'تم المسح بنجاح'}
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <AnimatePresence>
      {isVisible && (
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center font-sans select-none bg-black/50 backdrop-blur-sm" dir="rtl">
          <div className="absolute inset-0 cursor-pointer" onClick={handleClose} />

          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className={`relative bg-white w-full rounded-t-[28px] sm:rounded-[28px] p-5 pb-8 sm:pb-5 shadow-[0_-10px_60px_rgba(0,0,0,0.18)] z-10 text-center max-h-[92vh] overflow-y-auto transition-[max-width] duration-300 ${
              scanType === 'sale' ? 'sm:max-w-[560px]' : 'sm:max-w-[420px]'
            }`}
          >
            {/* زر الإغلاق */}
            <button type="button" onClick={handleClose} className="absolute top-4 right-4 p-1.5 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-600 transition-all">
              <X className="w-4 h-4 stroke-[2.5px]" />
            </button>

            {/* Handle bar للموبايل */}
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4 sm:hidden" />

            {/* عنوان */}
            <div className="flex items-center justify-center gap-2 mb-5">
              <div className="flex items-center justify-center bg-[#800000] text-white p-1.5 rounded-lg shadow-sm">
                <Camera className="w-4 h-4" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">
                {step === 'scanning'
                  ? 'مسح سريع'
                  : scanType === 'return' ? 'تأكيد المرتجع'
                  : scanType === 'waste'  ? 'تأكيد التالف'
                  : 'تأكيد البيع المباشر'}
              </h3>
            </div>

            {/* تبديل النوع — يظهر فقط في مرحلة المسح */}
            {step === 'scanning' && (
              <div className="flex bg-slate-100 p-1 rounded-xl mb-4 gap-1 text-xs font-bold">
                {(['return', 'waste', 'sale']).map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setScanType(type)}
                    className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1 transition-all ${
                      scanType === type
                        ? `${typeConfig[type].activeBg} ${typeConfig[type].color}`
                        : 'text-slate-500'
                    }`}
                  >
                    {typeConfig[type].icon}
                    {typeConfig[type].label}
                  </button>
                ))}
              </div>
            )}

            {/* ============= الخطوة 1: المسح ============= */}
            {step === 'scanning' && (
              scanType === 'sale' ? (
                /* وضع البيع: الترتيب هو بيانات العميل ← الكاميرا (اختيارية) ← المنتجات.
                   الكاميرا تُمرَّر كعنصر ليضعها اللوح في مكانها الصحيح بينها. */
                loadingQuickSale ? (
                  <div className="flex items-center justify-center gap-2 py-10 text-slate-400">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span className="text-xs font-bold">جاري تحميل المنتجات...</span>
                  </div>
                ) : (
                  <QuickSalePanel
                    ref={salePanelRef}
                    products={quickSaleProducts}
                    onSaleComplete={refreshSaleProducts}
                    cameraOpen={cameraEnabled}
                    onToggleCamera={() => setCameraEnabled((v) => !v)}
                    cameraSlot={cameraBox}
                    scanError={error}
                  />
                )
              ) : (
                <div className="space-y-4">
                  {cameraBox}

                  <form onSubmit={handleBarcodeSubmit} className="flex flex-col gap-3 pt-1">
                    <input
                      type="text"
                      value={barcode}
                      onChange={(e) => setBarcode(e.target.value)}
                      placeholder="أدخل الباركود / كود المنتج يدوياً ثم Enter"
                      autoFocus
                      className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 focus:border-slate-400 focus:bg-white rounded-2xl text-[14px] text-center font-medium text-slate-800 outline-none transition-all placeholder:text-slate-400"
                    />
                    <button
                      type="submit"
                      className={`w-full py-3.5 font-bold rounded-2xl text-[13px] transition-all duration-300 text-white ${
                        scanType === 'return' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'
                      }`}
                    >
                      بحث وتأكيد
                    </button>
                    {error && <p className="text-xs font-bold text-red-600 text-center leading-relaxed">{error}</p>}
                  </form>
                </div>
              )
            )}

            {/* ============= الخطوة 2: تأكيد البيانات ============= */}
            {step === 'confirm' && scannedProduct && (
              <form onSubmit={handleConfirmSubmit} className="space-y-4 text-right">
                {/* بطاقة المنتج */}
                <div className={`p-3 rounded-xl border ${
                  scanType === 'sale' ? 'bg-emerald-50 border-emerald-200' :
                  scanType === 'return' ? 'bg-blue-50 border-blue-200' :
                  'bg-red-50 border-red-200'
                }`}>
                  <p className="text-[11px] font-bold text-slate-500 mb-0.5">المنتج الممسوح</p>
                  <p className="font-bold text-slate-800 text-sm">{scannedProduct.name}</p>
                  <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                    {scannedProduct.sku} — المتاح: <span className="font-bold text-slate-700">{scannedProduct.available}</span>
                  </p>
                </div>

                {/* تحذير البيع */}
                {scanType === 'sale' && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 flex items-start gap-2">
                    <ShoppingCart className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-amber-800 font-medium leading-tight">
                      سيتم خصم <strong>قطعة واحدة</strong> من المخزون وإضافتها لسجل المبيعات فوراً.
                    </p>
                  </div>
                )}

                {/* رقم الزبون — للبيع فقط، اختياري تماماً ويُحفظ في الفاتورة */}
                {scanType === 'sale' && (
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5">
                      <Phone className="w-3 h-3 text-slate-400" />
                      رقم الزبون
                      <span className="text-slate-400 font-medium">(اختياري)</span>
                    </label>
                    <div className="relative">
                      <input
                        type="tel"
                        inputMode="numeric"
                        dir="ltr"
                        maxLength={10}
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, ''))}
                        placeholder="09XXXXXXXX"
                        className={`w-full px-4 py-3 bg-slate-50 border rounded-xl text-xs outline-none font-medium transition-all text-center tracking-wide
                          ${phoneInvalid
                            ? 'border-red-300 bg-red-50 focus:border-red-400'
                            : 'border-slate-200 focus:border-slate-400 focus:bg-white'}`}
                      />
                      {customerPhone && !phoneInvalid && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500 text-sm">✓</span>
                      )}
                    </div>
                    {phoneInvalid && (
                      <p className="text-[10px] font-bold text-red-500">
                        الرقم يجب أن يكون 10 أرقام ويبدأ بـ 09 — أو اتركه فارغاً
                      </p>
                    )}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 block">ملاحظات (اختياري)</label>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={currentConfig.placeholder}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-slate-400 focus:bg-white rounded-xl text-xs outline-none font-medium transition-all"
                  />
                </div>

                {error && <p className="text-xs font-bold text-red-600 text-center">{error}</p>}

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => { setStep('scanning'); setError(''); setScannedProduct(null); startCamera(); }}
                    className="flex-1 py-3 border border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl text-xs transition-colors"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className={`flex-[2] py-3 font-bold rounded-xl text-xs transition-all duration-200 text-white disabled:opacity-60 ${currentConfig.confirmColor}`}
                  >
                    {isSubmitting ? 'جاري الحفظ...' :
                      scanType === 'return' ? 'تأكيد تسجيل المرتجع' :
                      scanType === 'waste'  ? 'تأكيد تسجيل التالف'  :
                      '✓ تأكيد البيع المباشر'}
                  </button>
                </div>
              </form>
            )}

          </motion.div>
        </div>
      )}

    </AnimatePresence>
  );
}