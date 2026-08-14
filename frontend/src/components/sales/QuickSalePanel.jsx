import React, {
  useState, useCallback, useMemo, forwardRef, useImperativeHandle,
} from 'react';
import {
  User, Phone, Trash2, Plus, Minus, CheckCircle2, Loader2, Printer,
  ShoppingCart, ReceiptText, Camera, CameraOff, AlertCircle,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { orderApi } from '../../api/orderApi';
import ProductPicker from '../products/ProductPicker';

/**
 * =====================================================================
 * لوحة البيع السريع — تُعرض **داخل** لوحة المسح الجانبية مباشرة
 * =====================================================================
 * لا نافذة منفصلة ولا ضغطة إضافية: بمجرد اختيار تبويب "بيع" تظهر هذه
 * الواجهة كاملة في نفس اللوحة.
 *
 * تستخدم كاميرا لوحة المسح نفسها (لا تفتح كاميرا ثانية): الأب يمرّر
 * الأصناف الممسوحة عبر addResolvedVariant، فتُضاف للسلة فوراً ويستمر
 * المسح دون مقاطعة.
 */
const QuickSalePanel = forwardRef(function QuickSalePanel(
  { products = [], onSaleComplete, onBusyChange,
    cameraSlot = null, cameraOpen = false, onToggleCamera, scanError = '' },
  ref
) {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [items, setItems] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [invoice, setInvoice] = useState(null);
  const [submitError, setSubmitError] = useState('');
  const [touched, setTouched] = useState({ name: false, phone: false });

  // ===== قواعد التحقق =====
  // الاسم اختياري: إن تُرك فارغاً يُسجَّل الطلب باسم افتراضي.
  // أما إن كُتب فيجب ألا يكون حرفاً واحداً أو أرقاماً فقط.
  const nameValue = customerName.trim();
  const nameError =
    nameValue.length === 0 ? ''
      : nameValue.length < 2 ? 'الاسم قصير جداً — حرفان على الأقل'
      : /^\d+$/.test(nameValue) ? 'الاسم لا يصح أن يكون أرقاماً فقط'
      : '';

  const phoneValue = customerPhone.trim();
  const phoneError =
    phoneValue.length === 0 ? ''
      : !/^\d+$/.test(phoneValue) ? 'الرقم يجب أن يحتوي أرقاماً فقط'
      : phoneValue.length !== 10 ? `الرقم يجب أن يكون 10 أرقام (أدخلت ${phoneValue.length})`
      : !phoneValue.startsWith('09') ? 'الرقم يجب أن يبدأ بـ 09'
      : '';

  const cartEmpty = items.length === 0;
  const hasBlockingError = Boolean(nameError || phoneError) || cartEmpty;

  const total = useMemo(
    () => items.reduce((s, i) => s + Number(i.price || 0) * i.quantity, 0),
    [items]
  );

  /** يضيف صنفاً للسلة مع احترام حد المخزون */
  const addItem = useCallback((entry) => {
    if (!entry?.variant_id) return;
    if ((entry.available ?? 0) <= 0) {
      toast.error(`"${entry.product_name}" نفد من المخزون`);
      return;
    }
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.variant_id === entry.variant_id);
      if (idx > -1) {
        const next = prev[idx].quantity + 1;
        if (next > prev[idx].available) {
          toast.error(`المتاح ${prev[idx].available} قطعة فقط`);
          return prev;
        }
        const copy = [...prev];
        copy[idx] = { ...copy[idx], quantity: next };
        toast.success(`${entry.product_name} × ${next}`);
        return copy;
      }
      toast.success(`أُضيف: ${entry.product_name}`);
      return [...prev, { ...entry, quantity: 1 }];
    });
  }, []);

  // يستدعيها الأب عند التقاط كود من الكاميرا أو الإدخال اليدوي
  useImperativeHandle(ref, () => ({
    addResolvedVariant(v) {
      addItem({
        variant_id: v.variant_id,
        product_name: v.product_name,
        color_name: v.color_name,
        size_name: v.size_name,
        price: Number(v.selling_price || 0),
        available: v.quantity_available ?? 0,
      });
    },
    hasItems: () => items.length > 0,
  }), [addItem, items.length]);

  /** إضافة من مُنتقي المنتجات (نفس مُنتقي شاشة "طلب جديد") */
  const handlePickerAdd = useCallback((variant, colorName, productName, sizeName, product) => {
    addItem({
      variant_id: variant.id ?? variant.variant_id,
      product_name: productName,
      color_name: colorName,
      size_name: sizeName,
      price: Number(product?.price ?? product?.prices?.selling_price ?? 0),
      available: variant.quantity_available ?? 0,
    });
  }, [addItem]);

  const changeQty = (variantId, delta) => {
    setItems((prev) => prev.flatMap((i) => {
      if (i.variant_id !== variantId) return [i];
      const q = i.quantity + delta;
      if (q <= 0) return [];
      if (q > i.available) {
        toast.error(`المتاح ${i.available} قطعة فقط`);
        return [i];
      }
      return [{ ...i, quantity: q }];
    }));
  };

  const resetAll = () => {
    setItems([]); setCustomerName(''); setCustomerPhone(''); setInvoice(null);
    setSubmitError(''); setTouched({ name: false, phone: false });
  };

  const confirmSale = async () => {
    setTouched({ name: true, phone: true });
    setSubmitError('');

    if (cartEmpty) {
      setSubmitError('السلة فارغة — امسح كوداً أو اختر صنفاً من القائمة');
      return;
    }
    if (nameError || phoneError) {
      setSubmitError('صحّح الحقول المعلّمة بالأحمر أولاً');
      return;
    }

    setIsSubmitting(true);
    onBusyChange?.(true);
    try {
      const result = await orderApi.quickSale({
        // الاسم اختياري — نضع بديلاً واضحاً حتى تبقى الفاتورة مفهومة
        customer_name: nameValue || 'زبون نقدي',
        customer_phone: phoneValue || null,
        items: items.map((i) => ({ variant_id: i.variant_id, quantity: i.quantity })),
      });
      setInvoice({ ...result, phone: phoneValue });
      toast.success('تمت عملية البيع بنجاح 🎉');
      onSaleComplete?.();
    } catch (err) {
      const msg = typeof err === 'string' ? err : (err?.message || 'فشلت عملية البيع');
      setSubmitError(msg);          // تظهر داخل اللوحة ولا تختفي كالتنبيه العابر
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
      onBusyChange?.(false);
    }
  };

  const downloadInvoice = async () => {
    if (!invoice?.order_id) return;
    setIsDownloading(true);
    try {
      await orderApi.downloadOrderInvoice(invoice.order_id);
      toast.success('تم تنزيل الفاتورة');
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'تعذّر تنزيل الفاتورة');
    } finally {
      setIsDownloading(false);
    }
  };

  // ================= شاشة الفاتورة بعد إتمام البيع =================
  if (invoice) {
    return (
      <div className="space-y-3 text-right">
        <div className="flex items-center justify-center gap-2 text-emerald-600">
          <CheckCircle2 className="w-6 h-6" />
          <span className="font-black text-sm">تمت عملية البيع بنجاح</span>
        </div>

        <div className="border-2 border-slate-200 rounded-2xl overflow-hidden">
          <div className="bg-slate-900 text-white px-3 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <ReceiptText className="w-4 h-4" />
              <span className="font-bold text-xs">فاتورة بيع مباشر</span>
            </div>
            <span className="font-mono font-black text-sm">#{invoice.order_id}</span>
          </div>

          <div className="px-3 py-2 border-b border-slate-100 grid grid-cols-2 gap-1 text-[11px]">
            <div>
              <span className="text-slate-400 block">العميل</span>
              <span className="font-bold text-slate-800">{invoice.customer_name}</span>
            </div>
            <div className="text-left">
              <span className="text-slate-400 block">الهاتف</span>
              <span className="font-bold text-slate-800 font-mono" dir="ltr">{invoice.phone || '—'}</span>
            </div>
          </div>

          <div className="max-h-40 overflow-y-auto divide-y divide-slate-100">
            {(invoice.items || []).map((it, i) => {
              const unit = Number(it.price_at_order ?? 0);
              return (
                <div key={i} className="px-3 py-2 flex items-center justify-between text-[11px]">
                  <div className="min-w-0">
                    <span className="font-bold text-slate-800 block truncate">{it.product_name}</span>
                    <span className="text-[10px] text-slate-400">{it.color_name} / {it.size}</span>
                  </div>
                  <div className="text-left shrink-0 pr-2">
                    <span className="font-mono text-slate-500 block">{unit.toFixed(2)} × {it.quantity}</span>
                    <span className="font-mono font-bold text-[#800000]">{(unit * it.quantity).toFixed(2)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-slate-900 text-white px-3 py-2.5 flex items-center justify-between">
            <span className="text-[11px] text-slate-300">الإجمالي المدفوع</span>
            <span className="font-mono font-black text-lg text-emerald-400">
              {Number(invoice.total_price ?? 0).toFixed(2)} د.ل
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={downloadInvoice}
            disabled={isDownloading}
            className="flex items-center justify-center gap-1.5 bg-[#800000] hover:bg-[#660000] disabled:opacity-60 text-white py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95"
          >
            {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            تنزيل الفاتورة
          </button>
          <button
            type="button"
            onClick={resetAll}
            className="bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95"
          >
            بيع جديد
          </button>
        </div>
      </div>
    );
  }

  // ================= واجهة البيع =================
  const fieldBase =
    'w-full rounded-xl px-3.5 py-2.5 text-[13px] outline-none transition-all border';
  const okStyle = 'bg-slate-50 border-slate-200 focus:border-[#800000] focus:bg-white';
  const errStyle = 'border-red-300 bg-red-50 focus:border-red-400';

  return (
    <div className="space-y-4 text-right">
      {/* ===== 1) بيانات العميل ===== */}
      <section className="space-y-2.5">
        <h4 className="text-[11px] font-black text-slate-700 flex items-center gap-1.5">
          <User className="w-3.5 h-3.5 text-[#800000]" /> بيانات العميل
          <span className="text-[10px] text-slate-400 font-medium">(كلها اختيارية)</span>
        </h4>

        {/* عمود واحد على الهاتف وعمودان على الشاشات الأكبر */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 block">اسم العميل</label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, name: true }))}
              placeholder="اتركه فارغاً لزبون نقدي"
              className={`${fieldBase} ${touched.name && nameError ? errStyle : okStyle}`}
            />
            {touched.name && nameError && (
              <p className="text-[10px] font-bold text-red-500">{nameError}</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
              <Phone className="w-3 h-3 text-slate-400" /> رقم الهاتف
            </label>
            <div className="relative">
              <input
                type="tel"
                inputMode="numeric"
                dir="ltr"
                maxLength={10}
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, ''))}
                onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
                placeholder="09XXXXXXXX"
                className={`${fieldBase} text-center tracking-wide ${
                  touched.phone && phoneError ? errStyle : okStyle
                }`}
              />
              {phoneValue && !phoneError && (
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500 text-sm">✓</span>
              )}
            </div>
            {touched.phone && phoneError && (
              <p className="text-[10px] font-bold text-red-500">{phoneError}</p>
            )}
          </div>
        </div>
      </section>

      {/* ===== 2) الكاميرا (مخفية افتراضياً) ===== */}
      {cameraSlot && (
        <section className="space-y-2">
          <button
            type="button"
            onClick={onToggleCamera}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-bold border transition-all active:scale-[0.98] ${
              cameraOpen
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {cameraOpen ? <CameraOff className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
            {cameraOpen ? 'إغلاق الكاميرا' : 'مسح بالكاميرا (اختياري)'}
          </button>

          {cameraOpen && (
            <div className="space-y-1.5">
              {cameraSlot}
              <p className="text-[10px] text-slate-400 text-center">
                وجّه الكود أمام الكاميرا — يُضاف الصنف للسلة تلقائياً
              </p>
              {scanError && (
                <p className="text-[10px] font-bold text-red-500 text-center">{scanError}</p>
              )}
            </div>
          )}
        </section>
      )}

      {/* ===== 3) اختيار المنتجات ===== */}
      <section className="space-y-1.5">
        <h4 className="text-[11px] font-black text-slate-700">اختر الأصناف</h4>
        <ProductPicker
          products={products}
          showPrice
          maxHeight="max-h-40"
          onAddVariant={handlePickerAdd}
          placeholder="ابحث بالاسم أو الكود أو المقاس..."
        />
      </section>

      {/* ===== 4) السلة ===== */}
      {items.length > 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold border-b border-slate-200 pb-1.5">
            <span className="flex items-center gap-1.5 text-slate-700">
              <ShoppingCart className="w-3.5 h-3.5" /> السلة ({items.length})
            </span>
            <span className="text-[#800000] font-mono">{total.toFixed(2)} د.ل</span>
          </div>

          <div className="max-h-36 overflow-y-auto space-y-1.5">
            {items.map((i) => (
              <div key={i.variant_id} className="bg-white rounded-lg px-2 py-1.5 flex items-center gap-2 border border-slate-100">
                <div className="min-w-0 flex-1">
                  <span className="text-[11px] font-bold text-slate-800 block truncate">{i.product_name}</span>
                  <span className="text-[10px] text-slate-400">
                    {i.color_name} / {i.size_name} · {Number(i.price).toFixed(2)} د.ل
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={() => changeQty(i.variant_id, -1)}
                    className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center">
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="font-mono font-bold text-xs w-5 text-center">{i.quantity}</span>
                  <button type="button" onClick={() => changeQty(i.variant_id, 1)}
                    className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center">
                    <Plus className="w-3 h-3" />
                  </button>
                  <button type="button" onClick={() => setItems((p) => p.filter((x) => x.variant_id !== i.variant_id))}
                    className="w-6 h-6 rounded bg-red-50 hover:bg-red-100 text-red-500 flex items-center justify-center mr-0.5">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-slate-400 text-center py-3.5 border border-dashed border-slate-200 rounded-xl">
          السلة فارغة — اختر صنفاً من القائمة أو امسحه بالكاميرا
        </p>
      )}

      {/* ===== 5) رسالة الخطأ العامة + التأكيد ===== */}
      {submitError && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-[11px] font-bold text-red-700 leading-relaxed">{submitError}</p>
        </div>
      )}

      <button
        type="button"
        onClick={confirmSale}
        disabled={isSubmitting || hasBlockingError}
        className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3.5 rounded-xl text-[13px] font-black transition-all active:scale-[0.98] shadow-sm shadow-emerald-600/20"
      >
        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
        {isSubmitting ? 'جاري الحفظ...' : `تأكيد البيع وإصدار الفاتورة (${total.toFixed(2)} د.ل)`}
      </button>
    </div>
  );
});

export default QuickSalePanel;
