import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, ScanLine, Search, Trash2, CheckCircle2,
  Loader2, User, Phone, ArrowRight, Printer, Zap, Camera
} from 'lucide-react';
import { orderApi } from '../api/orderApi';
import { toast } from 'react-hot-toast';
import { Html5Qrcode } from 'html5-qrcode';
import ProductPicker from '../components/products/ProductPicker';

// دالة نغمة المسح المباشر الفوري عند التقاط الكود أمام الكاميرا
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
  } catch (e) {
    // Ignore audio error
  }
};

export default function QuickSaleModal({ isOpen, onClose, availableProducts = [], onSaleComplete }) {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [selectedItems, setSelectedItems] = useState([]);
  const [step, setStep] = useState(1); // 1: المسح والعميل, 2: المراجعة, 3: النجاح
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedOrder, setCompletedOrder] = useState(null);

  // حالات الكاميرا المباشرة
  const [isCameraActive, setIsCameraActive] = useState(true);
  const [cameraError, setCameraError] = useState('');
  const [cameraLoading, setCameraLoading] = useState(false);
  const [lastScanned, setLastScanned] = useState(null);

  const barcodeInputRef = useRef(null);
  const html5QrCodeRef = useRef(null);
  const lastScanTimeRef = useRef(0);

  // تصفية وتجميع المتغيرات المتاحة مع بيانات المنتجات الأب
  const allVariantsList = useRef([]);
  allVariantsList.current = [];
  availableProducts.forEach(prod => {
    if (prod.colors) {
      prod.colors.forEach(col => {
        if (col.variants) {
          col.variants.forEach(v => {
            allVariantsList.current.push({
              variant_id: v.variant_id || v.id,
              product_id: prod.product_id || prod.id,
              product_name: prod.product_name || prod.name,
              product_code: prod.product_code || prod.code,
              main_image: prod.main_image,
              color_name: col.color_name,
              color_image: col.color_image,
              size_name: v.size_name || (v.size ? v.size.name : 'افتراضي'),
              quantity_available: v.quantity_available ?? 0,
              // ✅ إصلاح السعر: getAllProductsWithVariants يسطّح السعر في الحقل
              // `price`، بينما كان يُقرأ من prices.selling_price/selling_price
              // وكلاهما غير موجود بعد التحويل — فكان السعر صفراً دائماً.
              selling_price: Number(
                prod.price ?? prod.prices?.selling_price ?? prod.selling_price ?? 0
              ),
              qr_code: v.qr_code,
              sku: v.sku || v.qr_code || String(v.id)
            });
          });
        }
      });
    }
  });

  // إضافة صنف للقائمة مع فحص المخزون
  const handleAddVariant = useCallback((varObj, qtyToAdd = 1) => {
    if (varObj.quantity_available <= 0) {
      toast.error(`المنتج "${varObj.product_name}" نَفَدَ من المخزون!`);
      return;
    }

    setSelectedItems(prev => {
      const existingIndex = prev.findIndex(item => item.variant_id === varObj.variant_id);
      if (existingIndex > -1) {
        const currentQty = prev[existingIndex].quantity;
        const newQty = currentQty + qtyToAdd;
        if (newQty > varObj.quantity_available) {
          toast.error(`عذراً، الكمية المتاحة في المخزن فقط ${varObj.quantity_available} قطعة`);
          return prev;
        }
        const updated = [...prev];
        updated[existingIndex].quantity = newQty;
        toast.success(`تم التحديث: ${varObj.product_name} (${newQty} قطع)`);
        return updated;
      } else {
        if (qtyToAdd > varObj.quantity_available) {
          toast.error(`عذراً، الكمية المتاحة فقط ${varObj.quantity_available} قطعة`);
          return prev;
        }
        toast.success(`تم مسح وإضافة: ${varObj.product_name}`);
        return [...prev, {
          variant_id: varObj.variant_id,
          product_name: varObj.product_name,
          color_name: varObj.color_name,
          size_name: varObj.size_name,
          image: varObj.color_image || varObj.main_image,
          price: varObj.selling_price,
          quantity: qtyToAdd,
          max_available: varObj.quantity_available
        }];
      }
    });
  }, []);

  /**
   * جسر بين مُنتقي المنتجات المشترك وسلة البيع.
   * المُنتقي يعطينا (variant, colorName, productName, sizeName, product)،
   * والسعر يعيش على مستوى المنتج لا المتغيّر — فنقرأه من المنتج هنا.
   */
  const handlePickerAdd = useCallback((variant, colorName, productName, sizeName, product) => {
    handleAddVariant({
      variant_id: variant.id ?? variant.variant_id,
      product_name: productName,
      color_name: colorName,
      size_name: sizeName,
      color_image: null,
      main_image: product?.image,
      quantity_available: variant.quantity_available ?? 0,
      selling_price: Number(
        product?.price ?? product?.prices?.selling_price ?? product?.selling_price ?? 0
      ),
    }, 1);
  }, [handleAddVariant]);

  // دالة البحث والتعامل مع الكود الممسوح فوراً
  const handleProcessCode = useCallback((scannedText) => {
    if (!scannedText) return;
    const code = String(scannedText).trim();
    if (!code) return;

    const cleanCode = code.replace(/^0+/, '');

    const matched = allVariantsList.current.find(v => {
      const vSku = String(v.sku || '').toLowerCase();
      const vQr = String(v.qr_code || '').toLowerCase();
      const vId = String(v.variant_id);
      const pCode = String(v.product_code || '').toLowerCase();
      const cleanPCode = pCode.replace(/^0+/, '');

      return vSku === code.toLowerCase() ||
             vQr.includes(code.toLowerCase()) ||
             vId === code ||
             pCode === code.toLowerCase() ||
             (cleanCode && cleanPCode === cleanCode);
    });

    if (matched) {
      playScanBeep();
      setLastScanned(matched);
      handleAddVariant(matched, 1);
      setTimeout(() => setLastScanned(null), 1000);
    } else {
      toast.error(`الكود الممسوح (${code}) غير مسجل بالأصناف المتاحة`);
    }
  }, [handleAddVariant]);

  // تشغيل ماسح الكاميرا الحية المباشرة عبر Html5Qrcode
  const startCameraScanner = useCallback(async () => {
    setCameraLoading(true);
    setCameraError('');

    try {
      if (html5QrCodeRef.current) {
        try {
          await html5QrCodeRef.current.stop();
        } catch (e) {
          // ignore stop error
        }
      }

      const qrContainer = document.getElementById("quick-sale-camera-reader");
      if (!qrContainer) {
        setCameraLoading(false);
        return;
      }

      const html5QrCode = new Html5Qrcode("quick-sale-camera-reader");
      html5QrCodeRef.current = html5QrCode;

      const cameraConfig = { fps: 12, qrbox: { width: 220, height: 220 } };

      await html5QrCode.start(
        { facingMode: "environment" },
        cameraConfig,
        (decodedText) => {
          const now = Date.now();
          // خافض تسارع (Throttle): منع التكرار المفرط لنفس الكود خلال 1.2 ثانية
          if (now - lastScanTimeRef.current > 1200) {
            lastScanTimeRef.current = now;
            handleProcessCode(decodedText);
          }
        },
        () => {
          // parse error on frame - normal behaviour
        }
      );

      setCameraLoading(false);
      setIsCameraActive(true);
    } catch (err) {
      console.warn("Html5Qrcode Camera Start Error:", err);
      setCameraLoading(false);
      setCameraError('تعذر فتح الكاميرا المباشرة تلقائياً. تأكد من إعطاء إذن الكاميرا أو استخدام قارئ الباركود/البحث أدناه.');
      setIsCameraActive(false);
    }
  }, [handleProcessCode]);

  // إيقاف الكاميرا بنظافة
  const stopCameraScanner = useCallback(async () => {
    if (html5QrCodeRef.current) {
      try {
        await html5QrCodeRef.current.stop();
        html5QrCodeRef.current.clear();
      } catch (e) {
        // ignore
      }
      html5QrCodeRef.current = null;
    }
    setIsCameraActive(false);
  }, []);

  // إدارة دورة حياة الكاميرا عند الفتح أو التبديل
  useEffect(() => {
    if (isOpen && step === 1 && isCameraActive) {
      startCameraScanner();
    } else {
      stopCameraScanner();
    }

    return () => {
      stopCameraScanner();
    };
  }, [isOpen, step, isCameraActive, startCameraScanner, stopCameraScanner]);

  // ملاحظة: البحث والفلترة والعرض تتم الآن داخل ProductPicker المشترك
  // (نفس المكوّن المستخدم في شاشة "طلب جديد")، فحُذف المنطق المكرر هنا.
  // allVariantsList لا يزال مستخدماً لمطابقة الأكواد الممسوحة بالكاميرا.

  // تعديل كمية صنف
  const handleUpdateQty = (variant_id, delta) => {
    setSelectedItems(prev => {
      return prev.map(item => {
        if (item.variant_id === variant_id) {
          const newQty = item.quantity + delta;
          if (newQty <= 0) return null;
          if (newQty > item.max_available) {
            toast.error(`الكمية المتاحة في المخزن فقط ${item.max_available}`);
            return item;
          }
          return { ...item, quantity: newQty };
        }
        return item;
      }).filter(Boolean);
    });
  };

  const handleRemoveItem = (variant_id) => {
    setSelectedItems(prev => prev.filter(i => i.variant_id !== variant_id));
  };

  const totalPrice = selectedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  // فارغ = مقبول (الحقل اختياري)، وإلا 10 أرقام تبدأ بـ 09
  const phoneInvalid = customerPhone.length > 0 && !/^09\d{8}$/.test(customerPhone);

  // إرسال الطلب وإصدار الفاتورة المباشرة
  const handleConfirmSale = async () => {
    if (!customerName.trim()) {
      toast.error('يرجى إدخال اسم العميل أولاً');
      setStep(1);
      return;
    }
    if (selectedItems.length === 0) {
      toast.error('يرجى إضافة منتج واحد على الأقل للبيع');
      setStep(1);
      return;
    }
    if (phoneInvalid) {
      toast.error('رقم الهاتف غير صحيح — صححه أو امسحه بالكامل');
      setStep(1);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim() || null,
        items: selectedItems.map(item => ({
          variant_id: item.variant_id,
          quantity: item.quantity
        }))
      };

      const result = await orderApi.quickSale(payload);
      setCompletedOrder(result);
      setStep(3);
      toast.success('تمت عملية البيع ونقل المنتجات إلى المباع فوراً! 🎉');
      if (onSaleComplete) onSaleComplete();
    } catch (err) {
      toast.error(typeof err === 'string' ? err : (err.message || 'فشلت عملية البيع'));
    } finally {
      setIsSubmitting(false);
    }
  };

  /** تنزيل الفاتورة PDF من الخادم */
  const handleDownloadInvoice = async () => {
    if (!completedOrder?.order_id) return;
    setIsDownloading(true);
    try {
      await orderApi.downloadOrderInvoice(completedOrder.order_id);
      toast.success('تم تنزيل الفاتورة');
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'تعذّر تنزيل الفاتورة');
    } finally {
      setIsDownloading(false);
    }
  };

  /** تفريغ النموذج لبدء عملية بيع جديدة دون إغلاق النافذة */
  const resetForNewSale = () => {
    setSelectedItems([]);
    setCustomerName('');
    setCustomerPhone('');
    setBarcodeInput('');
    setProductSearch('');
    setCompletedOrder(null);
    setStep(1);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[80] flex items-center justify-center p-3 md:p-6 text-slate-800" dir="rtl">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh]">

        {/* ===== Header ===== */}
        <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#800000] rounded-xl text-white">
              <Zap className="h-5 w-5 animate-pulse" />
            </div>
            <div>
              <h2 className="font-bold text-base md:text-lg">الوصول السريع — عملية بيع مباشرة</h2>
              <p className="text-xs text-slate-300">ضع كود الـ QR أمام الكاميرا فوراً أو أدخله يدوياً</p>
            </div>
          </div>
          <button
            onClick={() => { stopCameraScanner(); onClose(); }}
            className="p-1.5 rounded-full hover:bg-white/10 text-slate-300 hover:text-white transition-all"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ===== Stepper ===== */}
        <div className="bg-slate-100 border-b border-slate-200 px-6 py-2 flex items-center justify-center gap-6 text-xs font-semibold">
          <button
            onClick={() => setStep(1)}
            className={`flex items-center gap-2 transition-all ${step === 1 ? 'text-[#800000] font-bold' : 'text-slate-500'}`}
          >
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 1 ? 'bg-[#800000] text-white' : 'bg-slate-300 text-slate-600'}`}>1</span>
            الكاميرا والمسح السريع
          </button>
          <span className="text-slate-300">←</span>
          <button
            onClick={() => selectedItems.length > 0 && setStep(2)}
            disabled={selectedItems.length === 0}
            className={`flex items-center gap-2 transition-all ${step === 2 ? 'text-[#800000] font-bold' : 'text-slate-400'}`}
          >
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 2 ? 'bg-[#800000] text-white' : 'bg-slate-300 text-slate-600'}`}>2</span>
            مراجعة الفاتورة والتأكيد
          </button>
          <span className="text-slate-300">←</span>
          <span className={`flex items-center gap-2 ${step === 3 ? 'text-emerald-600 font-bold' : 'text-slate-400'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 3 ? 'bg-emerald-600 text-white' : 'bg-slate-300 text-slate-600'}`}>3</span>
            الفاتورة المكتملة
          </span>
        </div>

        {/* ===== Content ===== */}
        <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-4">

          {/* ==================== Step 1 ==================== */}
          {step === 1 && (
            <div className="space-y-4">
              {/* 1. بيانات العميل: الاسم + رقم الهاتف */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <User className="h-4 w-4 text-[#800000]" />
                    اسم العميل: <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    placeholder="أدخل اسم العميل..."
                    className="w-full bg-slate-50 border border-slate-300 focus:border-[#800000] focus:ring-1 focus:ring-[#800000] rounded-xl px-4 py-2 text-xs outline-none transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Phone className="h-4 w-4 text-[#800000]" />
                    رقم الهاتف: <span className="text-slate-400 font-medium">(اختياري)</span>
                  </label>
                  <div className="relative">
                    <input
                      type="tel"
                      inputMode="numeric"
                      dir="ltr"
                      maxLength={10}
                      value={customerPhone}
                      onChange={e => setCustomerPhone(e.target.value.replace(/\D/g, ''))}
                      placeholder="09XXXXXXXX"
                      className={`w-full rounded-xl px-4 py-2 text-xs outline-none transition-all text-center tracking-wide border
                        ${phoneInvalid
                          ? 'border-red-300 bg-red-50 focus:border-red-400'
                          : 'bg-slate-50 border-slate-300 focus:border-[#800000] focus:ring-1 focus:ring-[#800000]'}`}
                    />
                    {customerPhone && !phoneInvalid && (
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500 text-sm">✓</span>
                    )}
                  </div>
                  {phoneInvalid && (
                    <p className="text-[10px] font-bold text-red-500">
                      يجب أن يكون 10 أرقام ويبدأ بـ 09 — أو اتركه فارغاً
                    </p>
                  )}
                </div>
              </div>

              {/* 2. حاوية الكاميرا المباشرة الحية للمسح الفوري */}
              <div className="bg-slate-900 rounded-2xl p-3 text-white space-y-3 shadow-xl relative overflow-hidden border border-slate-800">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span className="font-bold flex items-center gap-2">
                    <ScanLine className="h-4 w-4 text-red-500 animate-pulse" />
                    المسح المباشر فور وضع الـ QR أمام الكاميرا ⚡
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (isCameraActive) stopCameraScanner();
                        else startCameraScanner();
                      }}
                      className="bg-white/10 hover:bg-white/20 text-slate-200 text-[10px] px-2.5 py-1 rounded-lg font-bold transition-all flex items-center gap-1"
                    >
                      <Camera className="h-3 w-3" />
                      {isCameraActive ? 'إيقاف الكاميرا' : 'تشغيل الكاميرا'}
                    </button>
                  </div>
                </div>

                {/* عنصر بث الكاميرا الحقيقي المباشر */}
                <div className="relative aspect-video w-full bg-black rounded-xl overflow-hidden flex items-center justify-center border border-slate-800">
                  <div id="quick-sale-camera-reader" className="w-full h-full object-cover"></div>

                  {cameraLoading && (
                    <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center gap-2 text-white">
                      <Loader2 className="h-7 w-7 animate-spin text-red-500" />
                      <span className="text-xs font-bold">جاري فتح الكاميرا المباشرة...</span>
                    </div>
                  )}

                  {cameraError && (
                    <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center gap-2 text-white p-4 text-center">
                      <Camera className="h-8 w-8 text-red-500" />
                      <p className="text-xs text-slate-300 leading-relaxed max-w-xs">{cameraError}</p>
                      <button
                        type="button"
                        onClick={startCameraScanner}
                        className="mt-2 bg-[#800000] hover:bg-[#660000] text-white px-3 py-1.5 rounded-lg text-xs font-bold"
                      >
                        إعادة المحاولة
                      </button>
                    </div>
                  )}

                  {/* فلاش أخضر تنبيهي فور المسح */}
                  {lastScanned && (
                    <div className="absolute inset-0 bg-emerald-500/30 border-4 border-emerald-500 flex items-center justify-center animate-pulse z-30">
                      <div className="bg-emerald-600 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-2xl flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5" />
                        تم التقاط الكود: {lastScanned.product_name}!
                      </div>
                    </div>
                  )}
                </div>

                {/* إدخال يدوياً بديل */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (barcodeInput.trim()) {
                      handleProcessCode(barcodeInput);
                      setBarcodeInput('');
                    }
                  }}
                  className="flex gap-2"
                >
                  <input
                    ref={barcodeInputRef}
                    type="text"
                    value={barcodeInput}
                    onChange={e => setBarcodeInput(e.target.value)}
                    placeholder="أو اكتب الكود / امسحه بقارئ الباركود المباشر هنا..."
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-red-500 text-center font-mono"
                  />
                  <button
                    type="submit"
                    className="bg-[#800000] hover:bg-[#660000] text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 active:scale-95"
                  >
                    مسح
                  </button>
                </form>
              </div>

              {/* 3. اختيار المنتجات — نفس مُنتقي شاشة "طلب جديد" بالضبط */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Search className="h-4 w-4 text-slate-500" />
                    اختيار المنتجات (الأصفار البادئة غير مهمة):
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">اكتب 8 لجلب 0000008</span>
                </div>
                <ProductPicker
                  products={availableProducts}
                  showPrice
                  maxHeight="max-h-44"
                  onAddVariant={handlePickerAdd}
                />
              </div>

              {/* 4. قائمة الأصناف المضافة بالسلة */}
              {selectedItems.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold border-b border-slate-200 pb-1.5">
                    <span>الأصناف المضافة بالسلة ({selectedItems.length}):</span>
                    <span className="text-[#800000]">{totalPrice.toFixed(2)} د.ل</span>
                  </div>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                    {selectedItems.map((item, idx) => (
                      <div key={idx} className="bg-white p-2 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800">{item.product_name}</span>
                          <span className="text-[10px] text-slate-500">({item.color_name} - {item.size_name})</span>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <div className="flex items-center border rounded-lg overflow-hidden bg-slate-50">
                            <button onClick={() => handleUpdateQty(item.variant_id, -1)} className="px-2 py-0.5 hover:bg-slate-200 text-slate-600 font-bold">-</button>
                            <span className="px-2 py-0.5 font-bold font-mono text-xs">{item.quantity}</span>
                            <button onClick={() => handleUpdateQty(item.variant_id, 1)} className="px-2 py-0.5 hover:bg-slate-200 text-slate-600 font-bold">+</button>
                          </div>
                          <span className="font-bold font-mono text-[#800000]">{(item.price * item.quantity).toFixed(2)} د.ل</span>
                          <button onClick={() => handleRemoveItem(item.variant_id)} className="text-red-500 hover:text-red-700 p-1">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ==================== Step 2 ==================== */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="bg-[#800000]/5 border border-[#800000]/20 rounded-2xl p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-[#800000] text-white flex items-center justify-center font-bold text-lg shadow-md shrink-0">
                  {customerName.charAt(0) || 'ع'}
                </div>
                <div>
                  <span className="text-xs text-slate-500 block font-medium">اسم العميل المسجل:</span>
                  <h3 className="font-bold text-slate-900 text-base">{customerName}</h3>
                  <span className="text-[11px] text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded-full inline-block mt-1">
                    طلب بيع مباشر من المخزن (تفريغ فوراً)
                  </span>
                </div>
              </div>

              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 text-slate-600 font-bold">
                    <tr>
                      <th className="p-3">الصورة والمنتج</th>
                      <th className="p-3">اللون والمقاس</th>
                      <th className="p-3 text-center">الكمية والمتاح</th>
                      <th className="p-3">سعر القطعة</th>
                      <th className="p-3">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedItems.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 transition-all">
                        <td className="p-3 flex items-center gap-2.5">
                          <img
                            src={item.image || '/placeholder.png'}
                            alt=""
                            className="w-9 h-9 rounded-lg object-cover border border-slate-200"
                            onError={e => { e.target.src = '/placeholder.png'; }}
                          />
                          <span className="font-bold text-slate-900">{item.product_name}</span>
                        </td>
                        <td className="p-3 font-medium text-slate-600">
                          {item.color_name} / {item.size_name}
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleUpdateQty(item.variant_id, -1)}
                              className="w-6 h-6 rounded bg-slate-200 hover:bg-slate-300 font-bold text-slate-700"
                            >-</button>
                            <span className="font-bold font-mono px-2">{item.quantity}</span>
                            <button
                              onClick={() => handleUpdateQty(item.variant_id, 1)}
                              className="w-6 h-6 rounded bg-slate-200 hover:bg-slate-300 font-bold text-slate-700"
                            >+</button>
                          </div>
                          <span className="text-[10px] text-slate-400 block mt-0.5">المتاح: {item.max_available}</span>
                        </td>
                        <td className="p-3 font-mono font-semibold text-slate-700">{item.price} د.ل</td>
                        <td className="p-3 font-mono font-bold text-[#800000]">{(item.price * item.quantity).toFixed(2)} د.ل</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="bg-slate-900 text-white rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400 block">إجمالي قيمة الفاتورة:</span>
                  <span className="text-2xl font-bold font-mono text-emerald-400">{totalPrice.toFixed(2)} د.ل</span>
                </div>
                <button
                  onClick={handleConfirmSale}
                  disabled={isSubmitting}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-xl font-bold text-sm transition-all shadow-lg flex items-center gap-2 disabled:opacity-50 active:scale-95"
                >
                  {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                  تأكيد وإصدار الفاتورة فوراً
                </button>
              </div>
            </div>
          )}

          {/* ==================== Step 3: الفاتورة ==================== */}
          {step === 3 && completedOrder && (
            <div className="space-y-4">
              <div className="text-center space-y-2">
                <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">تمت عملية البيع بنجاح 🎉</h3>
              </div>

              {/* الفاتورة المعروضة على الشاشة */}
              <div className="border-2 border-slate-200 rounded-2xl overflow-hidden bg-white max-w-xl mx-auto">
                <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="font-bold text-sm">فاتورة بيع مباشر</p>
                    <p className="text-[11px] text-slate-300 font-mono">BELLAGIO</p>
                  </div>
                  <div className="text-left">
                    <p className="text-[11px] text-slate-300">رقم الفاتورة</p>
                    <p className="font-mono font-bold text-base">#{completedOrder.order_id}</p>
                  </div>
                </div>

                <div className="px-4 py-3 border-b border-slate-100 grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-slate-400 block">العميل</span>
                    <span className="font-bold text-slate-800">{completedOrder.customer_name}</span>
                  </div>
                  <div className="text-left">
                    <span className="text-slate-400 block">رقم الهاتف</span>
                    <span className="font-bold text-slate-800 font-mono" dir="ltr">
                      {customerPhone || '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">التاريخ</span>
                    <span className="font-bold text-slate-800">
                      {new Date().toLocaleDateString('ar-LY')}
                    </span>
                  </div>
                  <div className="text-left">
                    <span className="text-slate-400 block">الحالة</span>
                    <span className="font-bold text-emerald-700">مدفوعة ومسلّمة</span>
                  </div>
                </div>

                <table className="w-full text-right text-[11px]">
                  <thead className="bg-slate-50 text-slate-500 font-bold">
                    <tr>
                      <th className="px-4 py-2">الصنف</th>
                      <th className="px-2 py-2 text-center">الكمية</th>
                      <th className="px-2 py-2">السعر</th>
                      <th className="px-4 py-2">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(completedOrder.items || []).map((it, i) => {
                      const unit = Number(it.price_at_order ?? 0);
                      return (
                        <tr key={i}>
                          <td className="px-4 py-2">
                            <span className="font-bold text-slate-800 block">{it.product_name}</span>
                            <span className="text-[10px] text-slate-400">
                              {it.color_name} / {it.size}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-center font-mono font-bold">{it.quantity}</td>
                          <td className="px-2 py-2 font-mono">{unit.toFixed(2)}</td>
                          <td className="px-4 py-2 font-mono font-bold text-[#800000]">
                            {(unit * it.quantity).toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
                  <span className="text-xs text-slate-300">الإجمالي المدفوع</span>
                  <span className="font-mono font-bold text-xl text-emerald-400">
                    {Number(completedOrder.total_price ?? 0).toFixed(2)} د.ل
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                <button
                  onClick={handleDownloadInvoice}
                  disabled={isDownloading}
                  className="bg-[#800000] hover:bg-[#660000] text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 disabled:opacity-60 active:scale-95"
                >
                  {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                  تنزيل الفاتورة PDF
                </button>
                <button
                  onClick={resetForNewSale}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95"
                >
                  بيع جديد
                </button>
                <button
                  onClick={() => { stopCameraScanner(); onClose(); }}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-5 py-2.5 rounded-xl text-xs font-bold transition-all"
                >
                  إغلاق
                </button>
              </div>
            </div>
          )}

        </div>

        {/* ===== Footer Navigation ===== */}
        {step === 1 && (
          <div className="bg-slate-50 border-t border-slate-200 p-4 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">
              المنتجات بالسلة: {selectedItems.length} | الإجمالي: <strong className="text-[#800000]">{totalPrice.toFixed(2)} د.ل</strong>
            </span>
            <button
              onClick={() => {
                if (!customerName.trim()) {
                  toast.error('يرجى كتابة اسم العميل أولاً');
                  return;
                }
                if (selectedItems.length === 0) {
                  toast.error('يرجى إشراك منتج واحد على الأقل بالسلة');
                  return;
                }
                stopCameraScanner();
                setStep(2);
              }}
              disabled={selectedItems.length === 0 || !customerName.trim()}
              className="bg-[#800000] hover:bg-[#660000] text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 disabled:opacity-50 active:scale-95"
            >
              <span>إكمال مراجعة الطلب</span>
              <ArrowRight className="h-4 w-4 rotate-180" />
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
