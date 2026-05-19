import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CornerDownLeft } from 'lucide-react';
import toast from 'react-hot-toast';

import { catalogApi } from '../api/catalogApi';

export default function QuickScanPage({ isOpen, onClose }) {
  const [step, setStep] = useState('scanning'); // scanning | confirm
  const [scanType, setScanType] = useState('return'); // return | waste
  const [barcode, setBarcode] = useState('');
  const [error, setError] = useState('');
  const [scannedProduct, setScannedProduct] = useState(null);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cameraPermission, setCameraPermission] = useState('denied');

  // منع التمرير في الخلفية
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  // تشغيل الكاميرا وإدارة الصلاحيات الحقيقية
  useEffect(() => {
    if (isOpen && step === 'scanning') {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } })
        .then(stream => {
          setCameraPermission('granted');
          const videoElement = document.getElementById('scanner-video');
          if (videoElement) videoElement.srcObject = stream;
          window.localCameraStream = stream;
        })
        .catch(err => {
          console.error("Camera access denied:", err);
          setCameraPermission('denied');
        });
    }

    return () => {
      if (window.localCameraStream) {
        window.localCameraStream.getTracks().forEach(track => track.stop());
        window.localCameraStream = null;
      }
    };
  }, [isOpen, step]);

  const handleClose = () => {
    setBarcode('');
    setError('');
    setScannedProduct(null);
    setReason('');
    setStep('scanning');
    onClose();
  };

  // 1. مرحلة فحص الباركود: جلب بيانات المتغير الحقيقية للتأكد من وجوده قبل التعديل
  const handleBarcodeSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    const cleanBarcode = barcode.trim();
    if (!cleanBarcode) return;

    try {
      // نقوم بإرسال الرمز باسم qr_code مباشرة كما تتوقعه قاعدة البيانات والباك إند
      const result = await catalogApi.getFilteredVariants({ qr_code: cleanBarcode });
      
      // التحقق من أن الباك إند أعاد نتائج تطابق هذا الرمز
      if (result && result.items && result.items.length > 0) {
        const matchedVariant = result.items[0];
        setScannedProduct({
          name: matchedVariant.product_name || "منتج غير مسمى",
          sku: matchedVariant.sku || cleanBarcode,
          available: matchedVariant.quantity_available || 0,
          qr_code: cleanBarcode // حفظ الرمز لاستخدامه في الخطوة التالية
        });
        setStep('confirm');
      } else {
        setError('عذراً، لم يتم العثور على المنتج في النظام!');
      }
    } catch (err) {
      // استقبال وعرض رسالة الخطأ القادمة مباشرة من الباك إند
      setError(typeof err === 'string' ? err : (err.response?.data?.detail || 'خطأ أثناء الاتصال بالسيرفر.'));
    }
  };

  // 2. مرحلة الاعتماد النهائي: استدعاء دوال الباك إند الحقيقية لتحديث قاعدة البيانات
  const handleConfirmSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const targetNote = reason.trim() || (scanType === 'return' ? 'مرتجع عبر ماسح سريع' : 'تالف عبر ماسح سريع');
      
      if (scanType === 'return') {
        // نمرر الرمز والملاحظة فقط طبقاً لمنطق standalone_return_logic
        await catalogApi.processScanReturn(scannedProduct.qr_code, targetNote);
      } else {
        // نمرر الرمز والملاحظة فقط طبقاً لمنطق process_damage_logic
        await catalogApi.processScanDamage(scannedProduct.qr_code, targetNote);
      }

      setIsSubmitting(false);
      toast.success('تمت العملية بنجاح!');
      handleClose();
    } catch (err) {
      setIsSubmitting(false);
      // استقبال وعرض رسائل الحظر الحقيقية القادمة من الباك إند (مثل: "لا توجد كمية متاحة لإتلافها")
      setError(typeof err === 'string' ? err : (err.response?.data?.detail || 'فشلت العملية في السيرفر.'));
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 font-sans select-none bg-black/40 backdrop-blur-sm" dir="rtl">
          <div className="absolute inset-0 cursor-pointer" onClick={handleClose} />

          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', duration: 0.3 }}
            className="relative bg-white w-full max-w-[380px] rounded-[32px] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.15)] z-10 overflow-hidden text-center"
          >
            {/* زر الإغلاق العلوي */}
            <button type="button" onClick={handleClose} className="absolute top-5 right-5 p-1 bg-transparent text-slate-800 hover:opacity-70 transition-opacity">
              <X className="w-6 h-6 stroke-[2.5px]" />
            </button>

            {/* عنوان الواجهة مع المربع الأزرق والأيقونة البيضاء المطابقة للصورة */}
            <div className="flex items-center justify-center gap-2 mb-6 mt-2">
              <div className="flex items-center justify-center bg-[#800000] text-white p-1 rounded-lg shadow-sm">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 14 4 9l5-5" />
                  <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-slate-900">
                {scanType === 'return' ? 'مسح رواجع' : 'مسح تالف'}
              </h3>
            </div>

            {/* وضع التبديل السريع بين الرواجع والتالف للتجربة المرنة في الفرونت */}
            {step === 'scanning' && (
              <div className="flex bg-slate-100 p-1 rounded-xl mb-4 gap-1 text-xs font-bold">
                <button type="button" onClick={() => setScanType('return')} className={`flex-1 py-2 rounded-lg transition-all ${scanType === 'return' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>رواجع</button>
                <button type="button" onClick={() => setScanType('waste')} className={`flex-1 py-2 rounded-lg transition-all ${scanType === 'waste' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500'}`}>تالف</button>
              </div>
            )}

            {/* ================= الخطوة 1: شاشة فحص الباركود والكاميرا ================= */}
            {step === 'scanning' && (
              <div className="space-y-4">
                <div className="relative h-64 w-full bg-black rounded-[24px] overflow-hidden flex items-center justify-center border border-slate-900">
                  {cameraPermission === 'granted' ? (
                    <video id="scanner-video" autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <div className="relative w-24 h-24 border-2 border-dashed border-white/20 rounded-2xl flex items-center justify-center">
                      <div className="w-8 h-0.5 bg-white/20 rounded" />
                    </div>
                  )}
                </div>

                {cameraPermission === 'denied' && (
                  <p className="text-[13px] font-medium text-red-500 tracking-wide mt-2">تعذَّر فتح الكاميرا. تأكد من منح الإذن.</p>
                )}

<form onSubmit={handleBarcodeSubmit} className="flex flex-col gap-3">
  {/* حقل الإدخال */}
  <input 
    type="text" 
    value={barcode} 
    onChange={(e) => setBarcode(e.target.value)} 
    placeholder="دخل الباركود يدوياً ثم Enter" 
    className="w-full px-4  border border-slate-300 py-3.5 bg-[#f4f5f7] border border-transparent focus:border-slate-200 focus:bg-white rounded-[18px] text-[14px] text-center font-medium text-slate-800 outline-none transition-all placeholder:text-slate-400" 
  />

  {/* الزر (جعلناه يأخذ العرض الكامل ليتناسب مع شكل الحقل) */}
  <button 
    type="submit"
    className="w-full py-3.5 border border-slate-300 font-bold rounded-[18px] text-[13px] transition-all duration-300 bg-[#F4F5F7] text-black hover:bg-[#800000] hover:text-white"
  >
    مسح
  </button>

  {/* رسالة الخطأ */}
  {error && <p className="text-xs font-bold text-red-600 text-center">{error}</p>}
</form>
              </div>
            )}

            {/* ================= الخطوة 2: لوحة تأكيد البيانات والكمية قبل الاستدعاء المباشر ================= */}
            {step === 'confirm' && scannedProduct && (
              <form onSubmit={handleConfirmSubmit} className="space-y-4 text-right">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 block mr-1">سبب الإجراء / ملاحظات</label>
                  <input 
                    type="text"
                    value={reason} 
                    onChange={(e) => setReason(e.target.value)} 
                    placeholder="مثال: مرتجع زبون، تالف تعبئة..." 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-slate-400 focus:bg-white rounded-xl text-xs outline-none font-medium transition-all" 
                  />
                </div>

                {error && <p className="text-xs font-bold text-red-600 text-center">{error}</p>}

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => { setStep('scanning'); setError(''); }} className="flex-1 py-3 border border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl text-xs transition-colors">إلغاء</button>
                  <button 
                    type="submit" 
                    disabled={isSubmitting} 
                    className={`flex-[2] py-3 border border-slate-300 font-bold rounded-xl text-xs transition-all duration-300 bg-[#F4F5F7] text-black hover:bg-[#800000] hover:text-white`}
                  >
                    {isSubmitting ? 'جاري الحفظ...' : 'تأكيد المسحة (قطعة واحدة)'}
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