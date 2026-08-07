import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShoppingCart, RotateCcw, AlertTriangle, Camera, RefreshCw, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

import { catalogApi } from '../api/catalogApi';
import { enqueueOfflineAction } from '../utils/offlineSync';

export default function QuickScanPage({ isOpen, onClose }) {
  const navigate = useNavigate();
  const isVisible = isOpen !== undefined ? isOpen : true;

  const [step, setStep] = useState('scanning'); // scanning | confirm
  const [scanType, setScanType] = useState('return'); // return | waste | sale
  const [barcode, setBarcode] = useState('');
  const [error, setError] = useState('');
  const [scannedProduct, setScannedProduct] = useState(null);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cameraStatus, setCameraStatus] = useState('idle'); // idle | loading | active | error
  const [cameraErrorMsg, setCameraErrorMsg] = useState('');

  const videoRef = useRef(null);
  const mediaStreamRef = useRef(null);

  // إيقاف بث الكاميرا بنظافة
  const stopCamera = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (window.localCameraStream) {
      window.localCameraStream.getTracks().forEach(track => track.stop());
      window.localCameraStream = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraStatus('idle');
  }, []);

  // دالة التعامل مع الرمز الممسوح
  const processScannedCode = useCallback(async (scannedCode) => {
    if (!scannedCode) return;
    const cleanBarcode = String(scannedCode).trim();
    setBarcode(cleanBarcode);
    setError('');

    try {
      const result = await catalogApi.getFilteredVariants({ qr_code: cleanBarcode, search: cleanBarcode });
      
      if (result && result.items && result.items.length > 0) {
        // المطابقة الدقيقة أو استلام أول عنصر مطابق للفلاتر
        const matchedVariant = result.items.find(item => 
          item.qr_code === cleanBarcode || 
          (item.qr_code && item.qr_code.includes(cleanBarcode))
        ) || result.items[0];

        setScannedProduct({
          name: matchedVariant.product_name || "منتج غير مسمى",
          sku: matchedVariant.sku || matchedVariant.product_code || cleanBarcode,
          available: matchedVariant.quantity_available || 0,
          qr_code: matchedVariant.qr_code || cleanBarcode
        });
        stopCamera();
        setStep('confirm');
      } else {
        setError(`لم يتم العثور على منتج للكود: ${cleanBarcode}`);
      }
    } catch (err) {
      setError(typeof err === 'string' ? err : (err.response?.data?.detail || 'خطأ أثناء البحث عن المنتج.'));
    }
  }, [stopCamera]);

  // تشغيل الكاميرا المباشرة داخل المربع الأسود عبر getUserMedia بتدرج قياسي
  const startCamera = useCallback(async () => {
    setCameraStatus('loading');
    setCameraErrorMsg('');

    if (typeof navigator === 'undefined' || !navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      setCameraStatus('error');
      if (typeof window !== 'undefined' && window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        setCameraErrorMsg('تتطلب الكاميرا المباشرة داخل المربع الأسود تشغيل الموقع عبر HTTPS أو localhost بحسب قوانين المتصفحات الأمنية.');
      } else {
        setCameraErrorMsg('تعذر تشغيل الكاميرا المباشرة. تأكد من منح الإذن للمتصفح.');
      }
      return;
    }

    stopCamera();

    const constraintsList = [
      { video: { facingMode: { exact: "environment" } } },
      { video: { facingMode: "environment" } },
      { video: { facingMode: "user" } },
      { video: true }
    ];

    let stream = null;
    let lastError = null;

    for (const constraint of constraintsList) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraint);
        if (stream) break;
      } catch (err) {
        lastError = err;
      }
    }

    if (stream) {
      mediaStreamRef.current = stream;
      window.localCameraStream = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (e) {
          console.warn("Video play error:", e);
        }
      }
      setCameraStatus('active');
    } else {
      console.warn("Camera getUserMedia failed:", lastError);
      setCameraStatus('error');
      if (lastError?.name === 'NotAllowedError' || lastError?.name === 'PermissionDeniedError') {
        setCameraErrorMsg('تم رفض إذن الكاميرا. يرجى الضغط على إعدادات المتصفح وتفعيل الكاميرا للموقع.');
      } else {
        setCameraErrorMsg('تعذر التوصيل بالكاميرا. اضغط "تفعيل الكاميرا داخل المربع" أدناه.');
      }
    }
  }, [stopCamera]);

  useEffect(() => {
    if (isVisible) {
      document.body.style.overflow = 'hidden';
      if (step === 'scanning') {
        startCamera();
      }
    } else {
      document.body.style.overflow = 'unset';
      stopCamera();
    }

    return () => {
      document.body.style.overflow = 'unset';
      stopCamera();
    };
  }, [isVisible, step, startCamera, stopCamera]);

  const handleClose = () => {
    stopCamera();
    setBarcode('');
    setError('');
    setScannedProduct(null);
    setReason('');
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
      
      enqueueOfflineAction(actionType, { qr_code: scannedProduct.qr_code, note: targetNote }, desc);
      setIsSubmitting(false);
      toast.success('أوفلاين: تم حفظ العملية محلياً! سيتم رفعها عند الاتصال 📡');
      handleClose();
      return;
    }

    try {
      if (scanType === 'return') {
        await catalogApi.processScanReturn(scannedProduct.qr_code, targetNote);
      } else if (scanType === 'waste') {
        await catalogApi.processScanDamage(scannedProduct.qr_code, targetNote);
      } else {
        // بيع مباشر
        await catalogApi.processScanSale(scannedProduct.qr_code, targetNote);
      }

      setIsSubmitting(false);
      const successMsg =
        scanType === 'return' ? 'تم تسجيل المرتجع بنجاح!' :
        scanType === 'waste'  ? 'تم تسجيل التالف بنجاح!'  :
        'تم البيع وخصمه من المخزون بنجاح!';
      toast.success(successMsg);
      handleClose();
    } catch (err) {
      if (!navigator.onLine || err.message?.includes('Network Error')) {
        const actionType = scanType === 'return' ? 'SCAN_RETURN' : scanType === 'waste' ? 'SCAN_DAMAGE' : 'DIRECT_SALE';
        const desc = scanType === 'return' ? `مرتجع لـ ${scannedProduct.name}` : scanType === 'waste' ? `تالف لـ ${scannedProduct.name}` : `بيع مباشر لـ ${scannedProduct.name}`;
        enqueueOfflineAction(actionType, { qr_code: scannedProduct.qr_code, note: targetNote }, desc);
        setIsSubmitting(false);
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
            className="relative bg-white w-full sm:max-w-[420px] rounded-t-[28px] sm:rounded-[28px] p-5 pb-8 sm:pb-5 shadow-[0_-10px_60px_rgba(0,0,0,0.18)] z-10 text-center max-h-[90vh] overflow-y-auto"
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

            {/* ============= الخطوة 1: شاشة المسح والكاميرا المباشرة داخل المربع الأسود ============= */}
            {step === 'scanning' && (
              <div className="space-y-4">
                {/* المربع الأسود للكاميرا المباشرة */}
                <div className="relative h-56 w-full bg-black rounded-2xl overflow-hidden flex items-center justify-center border border-slate-900 shadow-inner">
                  
                  {/* فيديو بث الكاميرا المباشر الحقيقي داخل المربع الأسود دائماً */}
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
                      cameraStatus === 'active' ? 'opacity-100' : 'opacity-0 pointer-events-none'
                    }`}
                  />

                  {/* حالة الانتظار أو الإشعار عند غلق الإذن داخل المربع الأسود */}
                  {cameraStatus !== 'active' && (
                    <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center gap-2 text-white/80 p-4 text-center z-10">
                      {cameraStatus === 'loading' ? (
                        <>
                          <RefreshCw className="w-8 h-8 animate-spin text-[#800000]" />
                          <span className="text-xs font-bold text-slate-200">جاري فتح الكاميرا المباشرة داخل المربع...</span>
                        </>
                      ) : (
                        <>
                          <Camera className="w-8 h-8 text-[#800000] mb-1" />
                          <p className="text-[11px] text-slate-300 font-medium px-2 leading-relaxed max-w-xs">
                            {cameraErrorMsg || 'اضغط على زر تفعيل الكاميرا أدناه لمنح الإذن وتشغيل الكاميرا المباشرة هنا.'}
                          </p>
                          
                          <button
                            type="button"
                            onClick={startCamera}
                            className="mt-1 px-4 py-2.5 bg-[#800000] hover:bg-[#990000] text-white font-bold rounded-xl text-xs flex items-center gap-2 transition-all shadow-md active:scale-95"
                          >
                            <Camera className="w-4 h-4" />
                            <span>تفعيل الكاميرا المباشرة هنا 📷</span>
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {/* خط المسح المتحرك الليزري داخل المربع الأسود عند اشتغال الكاميرا */}
                  {cameraStatus === 'active' && (
                    <div className="absolute inset-x-4 h-0.5 bg-[#800000] shadow-lg shadow-[#800000]/80 animate-bounce top-1/2 rounded-full z-20 pointer-events-none" />
                  )}
                </div>

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
                      scanType === 'return' ? 'bg-blue-600 hover:bg-blue-700' :
                      scanType === 'waste'  ? 'bg-red-600 hover:bg-red-700'   :
                      'bg-emerald-600 hover:bg-emerald-700'
                    }`}
                  >
                    بحث وتأكيد
                  </button>
                  {error && <p className="text-xs font-bold text-red-600 text-center leading-relaxed">{error}</p>}
                </form>
              </div>
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