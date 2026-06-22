import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import {
  // الأيقونات الجديدة للإحصائيات والتنبيهات الحديثة
  Clock, PackageOpen, CheckCircle2, Truck, AlertCircle,
  
  // باقي أيقونات الشاشة والعمليات الأساسية
  Plus, Search, Package, Layers, Camera, ScanLine, Pencil, 
  Copy, Check, User, Phone, MapPin, MessageSquare, X, 
  Minus, RefreshCw, Trash2, TrendingUp, ShieldCheck, Download,
  Loader2, ChevronDown, ChevronUp, ShoppingCart, FileText,
  Hash, BadgeCheck, Info
} from 'lucide-react';
import { orderApi } from '../api/orderApi';
import { fetchEmployeesApi } from '../api/userApi';

// ========= مكوّن Toast للتنبيهات العائمة =========
function ToastContainer({ toasts }) {
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 max-w-sm w-full px-4 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`p-3.5 rounded-xl shadow-lg border text-sm font-medium flex items-center gap-3 transition-all pointer-events-auto ${
            t.type === 'error'   ? 'bg-red-50 text-red-800 border-red-200' :
            t.type === 'warning' ? 'bg-amber-50 text-amber-800 border-amber-200' :
            'bg-emerald-50 text-emerald-800 border-emerald-200'
          }`}
        >
          {t.type === 'error'
            ? <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
            : t.type === 'warning'
            ? <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
            : <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          }
          <span className="leading-tight">{t.message}</span>
        </div>
      ))}
    </div>
  );
}

// ========= شارة حالة الطلب =========
function StatusBadge({ status, className = '' }) {
  const cfg = {
    'معلق':          'bg-amber-50 text-amber-700 border-amber-200',
    'قيد التجهيز':  'bg-blue-50 text-blue-700 border-blue-200',
    'تم التجهيز':   'bg-emerald-50 text-emerald-700 border-emerald-200',
    'جاري الشحن':   'bg-purple-50 text-purple-700 border-purple-200',
    'ملغي':         'bg-red-50 text-red-700 border-red-200',
    'تم التوصيل':   'bg-sky-50 text-sky-700 border-sky-200',
  };
  return (
    <span className={`text-[10px] px-2.5 py-0.5 rounded-full border font-bold ${cfg[status] || 'bg-slate-50 text-slate-600 border-slate-200'} ${className}`}>
      {status}
    </span>
  );
}

// ========= أيقونة حالة الطلب =========
function StatusIcon({ status }) {
  const cls = {
    'معلق':          'bg-amber-50 text-amber-700 border-amber-100',
    'قيد التجهيز':  'bg-blue-50 text-blue-700 border-blue-100',
    'تم التجهيز':   'bg-emerald-50 text-emerald-700 border-emerald-100',
    'جاري الشحن':   'bg-purple-50 text-purple-700 border-purple-100',
    'ملغي':         'bg-red-50 text-red-700 border-red-100',
  }[status] || 'bg-slate-50 text-slate-500 border-slate-200';

  return (
    <div className={`p-2 rounded-xl border shrink-0 ${cls}`}>
      {status === 'معلق'         && <Clock className="h-5 w-5" />}
      {status === 'قيد التجهيز' && <Layers className="h-5 w-5" />}
      {status === 'تم التجهيز'  && <CheckCircle2 className="h-5 w-5" />}
      {status === 'جاري الشحن'  && <Truck className="h-5 w-5" />}
      {status === 'ملغي'        && <X className="h-5 w-5" />}
      {!['معلق','قيد التجهيز','تم التجهيز','جاري الشحن','ملغي'].includes(status) && <Package className="h-5 w-5" />}
    </div>
  );
}

// ========= الصفحة الرئيسية =========
export default function SalesPage() {

  // ---- States الأساسية ----
  const [orders, setOrders]           = useState([]);
  const [isLoading, setIsLoading]     = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [inventoryStats, setInventoryStats] = useState(null);
  const [showProductsSection, setShowProductsSection] = useState(true); // true تعني مفتوح بشكل افتراضي

  // ---- States للفلترة والبحث ----
  const [searchQuery, setSearchQuery]   = useState('');
  const [activeFilter, setActiveFilter] = useState('الكل');
  const [filterEmployee, setFilterEmployee] = useState('الكل');
  const [employeesList, setEmployeesList] = useState([]);

  // ---- States للنوافذ المنبثقة ----
  const [selectedOrder, setSelectedOrder]     = useState(null);
  const [isCreateOpen, setIsCreateOpen]       = useState(false);
  const [isDetailOpen, setIsDetailOpen]       = useState(false);
  const [isScannerOpen, setIsScannerOpen]     = useState(false);
  const [isTrackingOpen, setIsTrackingOpen]   = useState(false);
  const [isEditOpen, setIsEditOpen]           = useState(false);

  // ---- States العمليات ----
  const [copiedId, setCopiedId]           = useState(null);
  const [manualBarcode, setManualBarcode] = useState('');
  const [toasts, setToasts]               = useState([]);
  const [isSaving, setIsSaving]           = useState(false);
  const [isScanning, setIsScanning]       = useState(false);
  const [isDeleting, setIsDeleting]       = useState(false);
  const [isAssigning, setIsAssigning]     = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  // ---- States إنشاء الطلب ----
  const [newOrderForm, setNewOrderForm] = useState({
    customer_name: '', 
    customer_phones: [''], // 🔥 تحولت إلى مصفوفة تبدأ برقم واحد فارغ
    address: '',
    social_media_source: '', 
    notes: '', 
    items: [],
  });
  const [availableProducts, setAvailableProducts] = useState([]);
  const [loadingProducts, setLoadingProducts]     = useState(false);
  const [selectedVariants, setSelectedVariants]   = useState([]); // [{variant_id, quantity, label}]

  // 1. دالة لتحديث رقم معين داخل مصفوفة الفورم الأساسي
  const handleNewOrderPhoneChange = (index, value) => {
    const updatedPhones = [...newOrderForm.customer_phones];
    updatedPhones[index] = value; // نترك التعديل مرن أثناء الكتابة
    setNewOrderForm(prev => ({ ...prev, customer_phones: updatedPhones }));
  };

  // 2. دالة لإضافة حقل رقم جديد داخل نفس الفورم (اختياري)
  const addNewOrderPhoneField = () => {
    setNewOrderForm(prev => ({ ...prev, customer_phones: [...prev.customer_phones, ''] }));
  };

  // 3. دالة لحذف حقل رقم معين من داخل نفس الفورم
  const removeNewOrderPhoneField = (index) => {
    setNewOrderForm(prev => ({
      ...prev,
      customer_phones: prev.customer_phones.filter((_, i) => i !== index)
    }));
  };

  // 4. 🔥 دالة تصفير الفورم بالكامل (تُستدعى عند الإغلاق أو بعد نجاح الحفظ لمنع بقاء الأرقام القديمة)
  const resetCreateForm = useCallback(() => {
    setNewOrderForm({
      customer_name: '', 
      customer_phones: [''], // ترجع لأصلها حقل واحد فارغ ونظيف
      address: '',
      social_media_source: '', 
      notes: '', 
      items: [],
    });
    setSelectedVariants([]); // تصفير المنتجات المختارة
  }, []);

  // 5. 🔥 دالة معالجة البيانات وتجهيز الـ Payload المقاوم للأخطاء قبل الإرسال للسيرفر
  // 🔥 دالة إنشاء الطلب الكاملة والمعدلة لتتوافق مع مصفوفة الأرقام الجديدة وتمنع خطأ الـ trim
 
  // ---- States الشحن ----
  const [deliveryType, setDeliveryType] = useState('');
  const [carrierName, setCarrierName]   = useState('');

  // ---- States التعديل ----
  const [editForm, setEditForm] = useState({
    customer_name: '', customer_phones: '', address: '', notes: '',
  });

// 2. 🔥 دالة واحدة موحدة وذكية لإطلاق التنبيهات (تمنع التراكم وتدعم أخطاء السيرفر)
const showToast = useCallback((message, type = 'success') => {
  // 1. مسح أي إشعار سابق فوراً لمنع التراكم فوق الواجهة
  toast.dismiss();

  // 2. تنظيف ومعالجة الرسالة في حال وصولها ككائن خطأ (Error Object) أو نص مباشر
  let displayMessage = 'حدث خطأ في العملية';
  
  if (typeof message === 'string') {
    displayMessage = message;
  } else if (message && typeof message === 'object') {
    // إذا مررت الدالة كائن خطأ من الـ catch، نستخرج منه النص الصحيح
    displayMessage = message.response?.data?.message || message.message || JSON.stringify(message);
  }

  // 3. فحص تلقائي احتياطي: لو النص يحتوي على دلالة خطأ، نحول اللون للأحمر تلقائياً
  const isError = type === 'error' || 
    (typeof displayMessage === 'string' && (displayMessage.includes('خطأ') || displayMessage.includes('لا يطابق') || displayMessage.includes('فشل')));

  // 4. إطلاق الإشعار المتوافق مع الـ Toaster الرئيسي فوراً
  if (isError) {
    toast.error(displayMessage);
  } else if (type === 'loading') {
    toast.loading(displayMessage);
  } else {
    toast.success(displayMessage);
  }
}, []);


const handleScanProduct = async (barcodeValue) => {
  try {
    // تأكد من أن الاسم هنا هو ما يتوقعه السيرفر تماماً (مثال: { barcode: ... })
    const response = await orderApi.scanProduct(selectedOrder.id, { barcode: barcodeValue.trim() });
    
    if (response) {
      showToast('تمت عملية المسح بنجاح');
      fetchOrders(); // لتحديث الجدول فوراً
    }
  } catch (err) {
    // 🔥 استخراج رسالة الخطأ القادمة من الباك اند مباشرة لتعرف سبب الـ 400
    const backendMessage = err.response?.data?.message || err.message || 'حدث خطأ أثناء المسح';
    showToast(backendMessage, 'error');
  }
};



  // ========= جلب الطلبات من الـ API =========
  const fetchOrders = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    else setIsRefreshing(true);
    try {
      const data = await orderApi.getOrders({ limit: 100 });
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      showToast(typeof err === 'string' ? err : 'فشل تحميل الطلبات', 'error');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [showToast]);

  // ========= جلب إحصائيات المخزون =========
  const fetchInventoryStats = useCallback(async () => {
    // تمرير '7d' لعرض إحصائيات الأسبوع الأخير بشكل تفاعلي وسريع، أو اتركها 'all' إذا كنت تفضل الإحصاء التراكمي الشامل
    const stats = await orderApi.getInventoryStats('all');
    if (stats) setInventoryStats(stats);
  }, []);

  // ========= جلب المنتجات للاختيار في نموذج الطلب =========
  const fetchAvailableProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const products = await orderApi.getAllProductsWithVariants();
      setAvailableProducts(products);
    } catch {
      showToast('تعذر تحميل قائمة المنتجات', 'warning');
    } finally {
      setLoadingProducts(false);
    }
  }, [showToast]);

  // ========= التحميل الأولي =========
  const fetchEmployeesList = useCallback(async () => {
    try {
      const res = await fetchEmployeesApi({ limit: 100 });
      setEmployeesList(res.users || []);
    } catch (err) {
      console.error('Fetch Employees Error:', err);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    fetchInventoryStats();
    fetchEmployeesList();
  }, [fetchOrders, fetchInventoryStats, fetchEmployeesList]);

  const handleCopyToClipboard = (text, message = 'تم النسخ إلى الحافظة') => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    showToast(message);
  };

  // ========= منع السكرول الخلفي عند فتح واجهة إنشاء طلب =========
useEffect(() => {
  if (isCreateOpen) {
    // إيقاف السكرول تماماً وإضافة مظهر ثابت
    document.body.style.overflow = 'hidden';
  } else {
    // إعادة السكرول لطبيعته عند إغلاق النافذة
    document.body.style.overflow = 'unset';
  }

  // دالة التنظيف (Cleanup) لضمان عدم تعليق السكرول عند مغادرة الصفحة
  return () => {
    document.body.style.overflow = 'unset';
  };
}, [isCreateOpen]);

useEffect(() => {
  if (isCreateOpen || isEditOpen) {
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = 'unset';
  }

  return () => {
    document.body.style.overflow = 'unset';
  };
}, [isCreateOpen, isEditOpen]);
// أضف هذا الـ useEffect في أعلى المكون مع بقية الـ hooks
useEffect(() => {
  // إذا كان مودال التعديل أو مودال العرض مفتوحاً، جمد السكرول الخلفي
  if (isEditOpen || selectedOrder) {
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = 'unset';
  }
  
  // دالة التنظيف لضمان إرجاع السكرول عند مغادرة الصفحة
  return () => {
    document.body.style.overflow = 'unset';
  };
}, [isEditOpen, selectedOrder]);

  // ========= فلترة الطلبات محلياً =========
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const name   = (order.customer_name || '').toLowerCase();
      const id     = String(order.id || '');
      const phones = Array.isArray(order.customer_phones)
        ? order.customer_phones.join(' ')
        : (order.customer_phones || '');
      const q = searchQuery.toLowerCase();

      // 1. مطابقة البحث
      const matchSearch = !q || name.includes(q) || id.includes(q) || phones.includes(q);
      
      // 2. 🔥 مطابقة الفلتر الذكي المحدث لحالة التوصيل الشاملة
      let matchFilter = activeFilter === 'الكل' || order.status === activeFilter;
      if (activeFilter === 'تم اسناده للتوصيل') {
        matchFilter = order.status === 'تم اسناده للتوصيل' || order.status === 'جاري الشحن';
      }

      // 3. مطابقة الموظف
      const matchEmployee = filterEmployee === 'الكل' || order.employee_name === filterEmployee;
      
      return matchSearch && matchFilter && matchEmployee;
    });
  }, [orders, searchQuery, activeFilter, filterEmployee]);

 

  // ========= نسخ ID =========
  const handleCopyId = (id) => {
    navigator.clipboard.writeText(String(id));
    setCopiedId(id);
    showToast('تم نسخ رقم الطلب');
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ========= فتح تفاصيل طلب =========
  const handleOpenDetail = async (order) => {
    setSelectedOrder(order);
    setDeliveryType('');
    setCarrierName('');
    setIsDetailOpen(true);
    setDetailLoading(true);
    try {
      const details = await orderApi.getOrderDetails(order.id);
      setSelectedOrder(details);
    } catch (err) {
      showToast(typeof err === 'string' ? err : 'تعذر جلب تفاصيل الطلب', 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  // ========= مسح QR لتجهيز المنتج =========
  const handleBarcodeScan = async (barcodeValue) => {
    if (!selectedOrder || !barcodeValue.trim()) return;
    setIsScanning(true);
    try {
      const result = await orderApi.scanOrderItem(selectedOrder.id, barcodeValue.trim());
      showToast(result?.message || 'تم مسح المنتج بنجاح');
      setManualBarcode('');
      // تحديث تفاصيل الطلب بعد المسح
      const updated = await orderApi.getOrderDetails(selectedOrder.id);
      setSelectedOrder(updated);
      setOrders(prev => prev.map(o => o.id === updated.id ? { ...o, status: updated.status } : o));
    } catch (err) {
      showToast(typeof err === 'string' ? err : 'الكود الممسوح لا يطابق أي منتج في هذا الطلب', 'error');
    } finally {
      setIsScanning(false);
    }
  };

  // ========= مسح يدوي لتجهيز المنتج =========
  const handleManualScan = async (variantId) => {
    if (!selectedOrder || !variantId) return;
    setIsScanning(true);
    try {
      const result = await orderApi.scanOrderItemManual(selectedOrder.id, variantId);
      showToast(result?.message || 'تم التجهيز اليدوي بنجاح');
      const updated = await orderApi.getOrderDetails(selectedOrder.id);
      setSelectedOrder(updated);
      setOrders(prev => prev.map(o => o.id === updated.id ? { ...o, status: updated.status } : o));
    } catch (err) {
      showToast(typeof err === 'string' ? err : 'حدث خطأ أثناء التجهيز اليدوي', 'error');
    } finally {
      setIsScanning(false);
    }
  };

  const handleCreateOrder = async (e) => {
    e.preventDefault();
    
    // 1. فحص وتأمين الأرقام المكتوبة وتصفية الحقول الفارغة
    const cleanedPhones = Array.isArray(newOrderForm.customer_phones)
      ? newOrderForm.customer_phones.map(p => p.trim()).filter(p => p !== '')
      : [];

    // 2. فحص ملء الحقول الإلزامية الأساسية أولاً (الاسم، العنوان، ووجود رقم هاتف رئيسي واحد على الأقل)
    if (!newOrderForm.customer_name.trim() || !newOrderForm.address.trim() || cleanedPhones.length === 0) {
      showToast('يرجى ملء جميع الحقول الإلزامية واشتراط رقم هاتف واحد على الأقل', 'error');
      return;
    }

    // 3. قيد الهاتف الذكي: فحص الأرقام المدخلة (يجب أن تبدأ بـ 09 وتتكون من 10 أرقام)
    const phoneRegex = /^09\d{8}$/;
    for (const phone of cleanedPhones) {
      if (!phoneRegex.test(phone)) {
        showToast(`رقم الهاتف (${phone}) غير صحيح! يجب أن يبدأ بـ 09 ويتكون من 10 أرقام فقط بدون حروف.`, 'error');
        return;
      }
    }

    // 4. فحص إضافة منتجات للطلب
    if (selectedVariants.length === 0) {
      showToast('يرجى إضافة منتج واحد على الأقل للطلب', 'error');
      return;
    }

    setIsSaving(true);
    try {
      // 5. بناء الـ Payload النظيف لإرساله إلى السيرفر كمصفوفة
      const payload = {
        customer_name:       newOrderForm.customer_name.trim(),
        customer_phones:     cleanedPhones, // تمرير مصفوفة الأرقام النظيفة والمفحوصة بالكامل
        address:             newOrderForm.address.trim(),
        social_media_source: newOrderForm.social_media_source?.trim() || null,
        notes:               newOrderForm.notes?.trim() || null,
        items:               selectedVariants.map(v => ({ variant_id: v.variant_id, quantity: v.quantity })),
      };
      
      const newOrder = await orderApi.createOrder(payload);
      
      // 6. تحديث الاستيت المحلية بنجاح
      setOrders(prev => [newOrder, ...prev]);
      setIsCreateOpen(false);
      
      // 7. تصفير الحقول وإرجاع مصفوفة الهواتف لحالتها الأصلية النظيفة ['']
      setNewOrderForm({ 
        customer_name: '', 
        customer_phones: [''], // إعادة تعيينها كمصفوفة تبدأ برقم واحد فارغ للمرة القادمة
        address: '', 
        social_media_source: '', 
        notes: '', 
        items: [] 
      });
      setSelectedVariants([]);
      
      if (typeof fetchInventoryStats === 'function') fetchInventoryStats();
      showToast(`تم إنشاء الطلب رقم #${newOrder.id} بنجاح`);
    } catch (err) {
      const backendMessage = err.response?.data?.message || err.message || 'حدث خطأ أثناء إنشاء الطلب';
      showToast(backendMessage, 'error');
    } finally {
      setIsSaving(false);
    }
  };


// ========= إضافة متغير للطلب (مربوط مع المخزون والتنبيهات المحلية المخصصة) =========
const addVariantToOrder = (variant, colorName, productName, sizeName) => {
  const label = `${productName} - ${colorName} - ${sizeName}`;
  
  // قراءة المخزون المتاح مباشرة من حقل قاعدة البيانات الصحيح quantity_available
  const availableStock = variant.quantity_available !== undefined ? variant.quantity_available : 0;

  // 1. فحص إذا كان المخزون المتاح صفراً أو أقل (باستخدام شو توست المخصصة لديك)
  if (availableStock <= 0) {
    showToast(`عذراً، الصنف (${label}) غير متوفر في المخزون حالياً!`, 'error');
    return;
  }

  const exists = selectedVariants.find(v => v.variant_id === variant.id);
  
  if (exists) {
    // 2. التحقق من عدم تجاوز المتاح عند الضغط على إضافة مجدداً
    if (exists.quantity >= availableStock) {
      showToast(`وصلت للحد الأقصى المتاح في المخزون لهذا الصنف (${availableStock} قطع).`, 'error');
      return;
    }

    setSelectedVariants(prev => prev.map(v =>
      v.variant_id === variant.id ? { ...v, quantity: v.quantity + 1 } : v
    ));
    
    showToast(`تمت زيادة كمية الصنف المختار`, 'success');
  } else {
    // 3. إضافة الصنف وتخزين كمية المخزون الفعلي معه للتحكم اللاحق في السلة
    setSelectedVariants(prev => [...prev, { variant_id: variant.id, quantity: 1, label, stock: availableStock }]);
    
    showToast(`تم إضافة الصنف للطلب بنجاح`, 'success');
  }
};
  

const removeVariant = (variantId) => {
  setSelectedVariants(prev => prev.filter(v => v.variant_id !== variantId));
};

const updateVariantQty = (variantId, qty) => {
  const n = parseInt(qty, 10);
  // إذا نزلت الكمية عن 1، يتم حذف المنتج من السلة تلقائياً كما في منطقك السابق
  if (n < 1) { 
    removeVariant(variantId); 
    return; 
  }
  
  // فحص المخزون ومنع الزيادة قبل تحديث الـ State
  let stockExceeded = false;
  let availableStock = 0;

  setSelectedVariants(prev => {
    // 1. نتحقق أولاً إذا كانت الكمية الجديدة تتخطى المخزون المتاح المتوفر في الكائن (v.stock)
    const target = prev.find(v => v.variant_id === variantId);
    if (target && n > target.stock) {
      stockExceeded = true;
      availableStock = target.stock;
      return prev; // إرجاع المصفوفة كما هي دون تعديل الكمية
    }

    // 2. إذا كانت الكمية آمنة، نقوم بالتحديث بشكل طبيعي
    return prev.map(v => v.variant_id === variantId ? { ...v, quantity: n } : v);
  });

  // 3. إطلاق التنبيه الحديث إذا تم تجاوز المخزون
  if (stockExceeded) {
    showToast(`نعتذر منك، المخزون لا يكفي! المتاح في المستودع هو (${availableStock}) قطع فقط.`, 'error');
  }
};

  // ========= حذف الطلب =========
  const handleDeleteOrder = async () => {
    if (!selectedOrder) return;
    if (!window.confirm(`هل أنت متأكد من إلغاء الطلب رقم #${selectedOrder.id}؟`)) return;
    setIsDeleting(true);
    try {
      await orderApi.deleteOrder(selectedOrder.id);
      setOrders(prev => prev.filter(o => o.id !== selectedOrder.id));
      setIsDetailOpen(false);
      fetchInventoryStats();
      showToast('تم إلغاء الطلب وإعادة الكميات للمخزون', 'warning');
    } catch (err) {
      showToast(typeof err === 'string' ? err : 'حدث خطأ أثناء حذف الطلب', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // ========= إسناد بيانات التوصيل =========
  const handleConfirmDelivery = async () => {
    if (!deliveryType || !carrierName.trim()) {
      showToast('يرجى اختيار نوع الشحن وإدخال اسم الناقل', 'error');
      return;
    }
    setIsAssigning(true);
    try {
      const updated = await orderApi.assignDelivery(selectedOrder.id, carrierName.trim(), deliveryType);
      setSelectedOrder(prev => ({ ...prev, delivery_man_name: carrierName, status: updated.status }));
      setOrders(prev => prev.map(o => o.id === updated.id ? { ...o, status: updated.status } : o));
      showToast('تم إسناد بيانات الشحن بنجاح');
    } catch (err) {
      showToast(typeof err === 'string' ? err : 'حدث خطأ أثناء إسناد الشحن', 'error');
    } finally {
      setIsAssigning(false);
    }
  };



  // ========= تحميل الفاتورة =========
  const handleDownloadInvoice = async () => {
    if (!selectedOrder) return;
    setIsDownloading(true);
    try {
      await orderApi.downloadOrderInvoice(selectedOrder.id);
      showToast('تم تحميل الفاتورة بنجاح');
    } catch (err) {
      showToast(typeof err === 'string' ? err : 'حدث خطأ أثناء تحميل الفاتورة', 'error');
    } finally {
      setIsDownloading(false);
    }
  };

  // ========= تعديل بيانات الطلب =========
  const handleOpenEdit = () => {
    if (!selectedOrder) return;
    setEditForm({
      customer_name:   selectedOrder.customer_name || '',
      customer_phones: Array.isArray(selectedOrder.customer_phones)
        ? selectedOrder.customer_phones[0] || ''
        : selectedOrder.customer_phones || '',
      address: selectedOrder.address || '',
      notes:   selectedOrder.notes   || '',
    });
    setIsEditOpen(true);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const payload = {
        customer_name:   editForm.customer_name.trim(),
        customer_phones: editForm.customer_phones.trim() ? [editForm.customer_phones.trim()] : undefined,
        address: editForm.address.trim(),
        notes:   editForm.notes.trim() || null,
      };
      await orderApi.updateOrder(selectedOrder.id, payload);
      setSelectedOrder(prev => ({
        ...prev,
        customer_name:   payload.customer_name,
        customer_phones: payload.customer_phones || prev.customer_phones,
        address: payload.address,
        notes:   payload.notes,
      }));
      setOrders(prev => prev.map(o =>
        o.id === selectedOrder.id
          ? { ...o, customer_name: payload.customer_name }
          : o
      ));
      setIsEditOpen(false);
      showToast('تم تحديث بيانات الطلب بنجاح');
    } catch (err) {
      showToast(typeof err === 'string' ? err : 'حدث خطأ أثناء التعديل', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // ---- مرجع صندوق البحث ---
  const searchRef = useRef(null);

  // ========= 1. حساب إحصائيات الكروت (مغلقة وسليمة) =========
  // ========= الإحصائيات المحدثة والمطابقة للـ JSON الفعلي =========
  // ========= الإحصائيات المحدثة والمتزامنة فورياً مع الفلاتر والـ State =========
  const statsData = useMemo(() => {
    // جلب بيانات المخزون الاحتياطية من السيرفر
    const root = inventoryStats?.data || inventoryStats || {};
    const inv = root.inventory || {};

    return {
      // 1. إحصائيات المخزون (تعتمد على جلب السيرفر)
      actual:    inv.total_inventory ?? '-',
      reserved:  inv.total_reserved  ?? '-',
      available: (typeof inv.total_inventory === 'number' && typeof inv.total_reserved === 'number')
                   ? (inv.total_inventory - inv.total_reserved)
                   : '-',

      // 2. 🔥 عدادات الطلبيات المحسوبة حياً وفورياً من المصفوفة المحلية المتزامنة
      pendingOrders:    orders.filter(o => o.status === 'معلق').length,
      processingOrders: orders.filter(o => o.status === 'قيد التجهيز').length,
      readyOrders:      orders.filter(o => o.status === 'تم التجهيز').length,
      // يبحث عن 'تم اسناده للتوصيل' أو 'جاري الشحن' ليضمن ظهورها فوراً
     shippingOrders: orders.filter(o => o.status === 'تم اسناده للتوصيل' || o.status === 'جاري الشحن').length,
    };
  }, [inventoryStats, orders]); // 🎯 يراقب المصفوفة ليعيد الحساب في نفس اللحظة تلقائياً

  // ========= 2. حساب عدادات الفلاتر العلوية (مستقلة تماماً) =========
  const filterCounts = useMemo(() => ({
    'الكل':          orders.length,
    'معلق':          orders.filter(o => o.status === 'معلق').length,
    'قيد التجهيز':  orders.filter(o => o.status === 'قيد التجهيز').length,
    'تم التجهيز':   orders.filter(o => o.status === 'تم التجهيز').length,
    'تم اسناده للتوصيل': orders.filter(o => o.status === 'تم اسناده للتوصيل' || o.status === 'جاري الشحن').length,
    'ملغي':         orders.filter(o => o.status === 'ملغي').length,
  }), [orders]); // <--- هنا تم إغلاق الدالة الثانية بنجاح!

  // ========= واجهة التحميل =========
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center" dir="rtl">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#6b1d2f] mx-auto" />
          <p className="text-sm text-slate-500 font-medium">جاري تحميل بيانات الطلبات...</p>
        </div>
      </div>
    );
  }

  // ========================= RENDER =========================
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans antialiased pb-24" dir="rtl">

      <ToastContainer toasts={toasts} />

      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">

        {/* ===== Header ===== */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">إدارة المبيعات والطلبات</h1>
            <p className="text-xs text-slate-500 font-medium">
              لوحة التحكم المركزية للطلبات — {orders.length} طلب مسجل في النظام
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => fetchOrders(true)}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              تحديث
            </button>
            <button
  onClick={() => { setIsCreateOpen(true); fetchAvailableProducts(); }}
  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#800000] text-white hover:bg-[#660000] active:scale-95 transition-all shadow-sm shadow-[#800000]/20"
>
  <Plus className="h-4 w-4" />
  <span>طلب جديد</span>
</button>
          </div>
        </div>

   {/* ===== إحصائيات الطلبيات والحالات اليومية المتزامنة فورياً ===== */}
   <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { 
              label: 'طلبات معلقة', 
              value: statsData.pendingOrders, 
              bg: 'bg-amber-50', 
              text: 'text-amber-600', 
              border: 'border-amber-200', 
              icon: <Clock className="h-5 w-5" /> 
            },
            { 
              label: 'قيد التجهيز', 
              value: statsData.processingOrders, 
              bg: 'bg-blue-50', 
              text: 'text-blue-600', 
              border: 'border-blue-200', 
              icon: <PackageOpen className="h-5 w-5" /> 
            },
            { 
              label: 'تم التجهيز', 
              value: statsData.readyOrders, 
              bg: 'bg-emerald-50', 
              text: 'text-emerald-600', 
              border: 'border-emerald-200', 
              icon: <CheckCircle2 className="h-5 w-5" /> 
            },
            { 
              label: 'تم اسناده للتوصيل', 
              value: statsData.shippingOrders, 
              bg: 'bg-purple-50', 
              text: 'text-purple-600', 
              border: 'border-purple-200', 
              icon: <Truck className="h-5 w-5" /> 
            },
          ].map(({ label, value, bg, text, border, icon }) => (
            <div 
              key={label} 
              className={`bg-white border ${border} p-4 rounded-xl shadow-sm hover:shadow-md transition-all flex items-center justify-between`}
            >
              <div className="space-y-1">
                <span className="text-xs text-slate-500 font-medium block">{label}</span>
                <span className={`text-2xl font-bold ${text} tracking-tight`}>
                  {value} <span className="text-xs text-slate-400 font-normal">طلب</span>
                </span>
              </div>
              <div className={`h-9 w-9 rounded-lg ${bg} flex items-center justify-center ${text}`}>
                {icon}
              </div>
            </div>
          ))}
        </div>
        {/* ===== البحث والفلترة ===== */}
        <div className="space-y-3 bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative rounded-md flex-1">
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-400" />
              </div>
              <input
                ref={searchRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="block w-full pr-10 pl-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#6b1d2f] focus:border-[#6b1d2f] transition-all"
                placeholder="ابحث بواسطة الاسم أو رقم الطلب أو رقم الهاتف..."
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 hover:text-slate-600">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="w-full md:w-48 shrink-0 relative">
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <User className="h-4 w-4 text-slate-400" />
              </div>
              <select
                value={filterEmployee}
                onChange={(e) => setFilterEmployee(e.target.value)}
                className="block w-full pr-10 pl-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#6b1d2f] focus:border-[#6b1d2f] transition-all"
              >
                <option value="الكل">كل الموظفين</option>
                {employeesList.map(emp => (
                  <option key={emp.id} value={emp.name}>{emp.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none items-center">
            {['الكل', 'معلق', 'قيد التجهيز', 'تم التجهيز', 'تم اسناده للتوصيل'].map(tab => {
              const isActive = activeFilter === tab;
              const count = filterCounts[tab] ?? 0;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveFilter(tab)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-[#800000] text-white border-[#800000] shadow-sm'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-[#800000]/5 hover:text-[#800000] hover:border-[#800000]/30'
                  }`}
                >
                  <span>{tab}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    isActive 
                      ? 'bg-white/20 text-white' 
                      : 'bg-slate-100 text-slate-500'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ===== قائمة الطلبات ===== */}
        <div className="space-y-2">
          {filteredOrders.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center flex flex-col items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                <Package className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">لا توجد طلبات مطابقة</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                  {searchQuery || activeFilter !== 'الكل'
                    ? 'لم نعثر على نتائج تطابق فلاتر البحث الحالية.'
                    : 'لم يتم إنشاء أي طلب بعد. ابدأ بإنشاء أول طلب مبيعات.'}
                </p>
              </div>
              <button
                onClick={() => { setIsCreateOpen(true); fetchAvailableProducts(); }}
                className="text-xs bg-[#6b1d2f] text-white border border-[#6b1d2f] px-4 py-2 rounded-lg font-bold transition-all hover:bg-[#541624]"
              >
                إنشاء طلب جديد
              </button>
            </div>
          ) : (
            filteredOrders.map(order => (
              <div
                key={order.id}
                onClick={() => handleOpenDetail(order)}
                className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm hover:shadow-md hover:border-slate-300 transition-all cursor-pointer active:scale-[0.998]"
              >
                <div className="flex items-start gap-3">
                  <StatusIcon status={order.status} />
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-slate-900 truncate">{order.customer_name}</span>
                      <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                        #{order.id}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      {Array.isArray(order.customer_phones) && order.customer_phones[0] && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3 text-slate-400" />
                          {order.customer_phones[0]}
                        </span>
                      )}
                      {order.address && (
                        <span className="hidden sm:inline-block truncate max-w-xs text-slate-400">{order.address}</span>
                      )}
                    </div>
                    {order.total_price != null && (
                      <span className="text-[11px] text-slate-400 font-medium">
                        الإجمالي: <span className="font-bold text-slate-700">{Number(order.total_price).toLocaleString('ar-SA')} ر.س</span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between md:justify-end gap-4 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <StatusBadge status={order.status} />
                    {order.created_at && (
                      <span className="text-[10px] text-slate-400 font-medium">
                        {new Date(order.created_at).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

      </div>

      {/* ======================================================== */}
      {/* نافذة إنشاء طلب جديد                                     */}
      {/* ======================================================== */}
      {isCreateOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl flex flex-col max-h-[90vh]">

            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 rounded-t-2xl">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-[#6b1d2f]" />
                <h2 className="text-base font-bold text-slate-900">إنشاء طلب مبيعات جديد</h2>
              </div>
              <button onClick={() => { setIsCreateOpen(false); setSelectedVariants([]); }} className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateOrder} className="p-5 space-y-4 overflow-y-auto flex-1 text-right">

            {/* بيانات العميل - إعادة تصميم الهيكلية لتتحمل تمدد الأرقام بسلاسة */}
            <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                  <User className="h-4 w-4 text-[#800000]" />
                  <h3 className="text-xs font-bold text-slate-800">بيانات العميل الأساسية</h3>
                </div>

                {/* الصف الأول: اسم العميل يأخذ المساحة بالكامل لراحة التوزيع البصري */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600 block">اسم العميل بالكامل <span className="text-red-500">*</span></label>
                  <input
                    type="text" required
                    placeholder="أدخل الاسم الثلاثي أو الثنائي للعميل"
                    value={newOrderForm.customer_name}
                    onChange={e => setNewOrderForm(p => ({ ...p, customer_name: e.target.value }))}
                    className="w-full text-xs px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-[#800000] focus:ring-2 focus:ring-[#800000]/5 bg-slate-50/50 transition-all focus:bg-white"
                  />
                </div>

                {/* الصف الثاني: حاوية الهاتف مستقلة بذاتها لكي تتمدد للأسفل بحرية دون التأثير على الحقول المجاورة */}
                <div className="bg-slate-50/30 border border-slate-200/60 rounded-2xl p-3 space-y-2">
                  <label className="text-xs font-bold text-slate-700 block flex items-center gap-1">
                    أرقام التواصل <span className="text-red-500">*</span>
                  </label>
                  
                  {/* الحقل الرئيسي مع زر الـ + الملاصق */}
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type="tel"
                        required
                        placeholder="09xxxxxxxx (الرقم الرئيسي)"
                        value={newOrderForm.customer_phones[0] || ''}
                        onChange={e => handleNewOrderPhoneChange(0, e.target.value)}
                        className="w-full text-xs pl-3 pr-8 py-2.5 border border-slate-200 rounded-xl bg-white font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#800000] focus:ring-2 focus:ring-[#800000]/5 transition-all"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold font-mono text-slate-400">01</span>
                    </div>
                    
                    <button
                      type="button"
                      onClick={addNewOrderPhoneField}
                      className="h-10 w-10 flex items-center justify-center rounded-xl bg-[#800000] text-white hover:bg-[#600000] active:scale-95 shadow-sm transition-all shrink-0"
                      title="إضافة رقم هاتف آخر"
                    >
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                  </div>

                  {/* الحقول الفرعية تنبثق بشكل طولي فخم دون التأثير على بقية النوافذ */}
                  {newOrderForm.customer_phones.slice(1).map((phone, index) => {
                    const actualIndex = index + 1;
                    return (
                      <div key={actualIndex} className="flex items-center gap-2 animate-fadeIn pl-2 border-r-2 border-slate-200 mt-2">
                        <div className="relative flex-1">
                          <input
                            type="tel"
                            placeholder={`رقم إضافي مساعد 0${actualIndex + 1}`}
                            value={phone}
                            onChange={e => handleNewOrderPhoneChange(actualIndex, e.target.value)}
                            className="w-full text-xs pl-3 pr-8 py-2.5 border border-slate-200 rounded-xl bg-white font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#800000] focus:ring-2 focus:ring-[#800000]/5 transition-all"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold font-mono text-slate-300">0{actualIndex + 1}</span>
                        </div>
                        
                        <button
                          type="button"
                          onClick={() => removeNewOrderPhoneField(actualIndex)}
                          className="h-9 w-9 flex items-center justify-center rounded-xl bg-red-50 text-red-500 hover:bg-red-100 transition-all active:scale-95 shrink-0"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* بقية تفاصيل الشحن والملاحظات منسقة وموحدة بذكاء */}
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600 block">عنوان التوصيل بالكامل <span className="text-red-500">*</span></label>
                    <input
                      type="text" required
                      placeholder="المدينة / المنطقة / أقرب نقطة دالة"
                      value={newOrderForm.address}
                      onChange={e => setNewOrderForm(p => ({ ...p, address: e.target.value }))}
                      className="w-full text-xs px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-[#800000] focus:ring-2 focus:ring-[#800000]/5 bg-slate-50/50 transition-all focus:bg-white"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-600 block">اسم حساب العميل على السوشيال ميديا</label>
                      <input
                        type="text"
                        placeholder="رابط الحساب أو اسم المستخدم (يوزر)"
                        value={newOrderForm.social_media_source}
                        onChange={e => setNewOrderForm(p => ({ ...p, social_media_source: e.target.value }))}
                        className="w-full text-xs px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-[#800000] focus:ring-2 focus:ring-[#800000]/5 bg-slate-50/50 transition-all focus:bg-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-600 block">ملاحظات خاصة بالتوصيل</label>
                      <input
                        type="text"
                        placeholder="توقيت التسليم المفضل، ملاحظة للمندوب..."
                        value={newOrderForm.notes}
                        onChange={e => setNewOrderForm(p => ({ ...p, notes: e.target.value }))}
                        className="w-full text-xs px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-[#800000] focus:ring-2 focus:ring-[#800000]/5 bg-slate-50/50 transition-all focus:bg-white"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* اختيار المنتجات */}
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowProductsSection(!showProductsSection)}
                  className="w-full flex items-center justify-between text-xs font-bold text-slate-700 py-1 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <Package className="h-3.5 w-3.5 text-[#800000]" /> المنتجات المطلوبة <span className="text-red-500">*</span>
                  </span>
                  <span className="text-slate-400 transition-transform duration-200">
  {showProductsSection ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
</span>
                </button>

                {showProductsSection && (
                  <>
                    {loadingProducts ? (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                        <span className="text-xs text-slate-400 mr-2">جاري تحميل المنتجات...</span>
                      </div>
                    ) : availableProducts.length === 0 ? (
                      <div className="text-center py-4 text-xs text-slate-400">لا توجد منتجات متاحة في الوقت الحالي</div>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto border border-slate-200 rounded-xl p-2">
                        {availableProducts.map(product => (
                          <ProductSelector
                            key={product.id}
                            product={product}
                            onAddVariant={addVariantToOrder}
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}
{/* المنتجات المختارة */}
{selectedVariants.length > 0 && (
                  <div className="space-y-2 p-3 bg-slate-50 rounded-xl border border-slate-200/60 shadow-sm">
                    <div className="flex items-center justify-between border-b border-slate-200/50 pb-1.5 mb-1">
                      <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-[#800000]"></span>
                        المنتجات المضافة للطلب
                      </span>
                      <span className="bg-[#800000]/10 text-[#800000] text-[10px] px-2 py-0.5 rounded-full font-bold">
                        {selectedVariants.length} أصناف
                      </span>
                    </div>

                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-0.5">
                      {selectedVariants.map(v => (
                        <div key={v.variant_id} className="flex items-center justify-between gap-3 bg-white border border-slate-100 rounded-xl p-2.5 shadow-sm transition-all hover:border-slate-200">
                          <span className="text-xs font-medium text-slate-700 flex-1 truncate">{v.label}</span>
                          
                          <div className="flex items-center gap-1.5 shrink-0 bg-slate-50 border border-slate-100 rounded-lg p-0.5">
                            <button type="button" onClick={() => updateVariantQty(v.variant_id, v.quantity - 1)}
                              className="h-5.5 w-5.5 rounded-md bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors shadow-sm">
                              <Minus className="h-2.5 w-2.5" />
                            </button>
                            
                            <input
                              type="number" min="1" value={v.quantity}
                              onChange={e => updateVariantQty(v.variant_id, parseInt(e.target.value) || 1)}
                              className="w-8 text-center text-xs bg-transparent font-bold text-slate-800 focus:outline-none"
                            />
                            
                            <button type="button" onClick={() => updateVariantQty(v.variant_id, v.quantity + 1)}
                              className="h-5.5 w-5.5 rounded-md bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors shadow-sm">
                              <Plus className="h-2.5 w-2.5" />
                            </button>

                            <div className="w-px h-4 bg-slate-200 mx-0.5" />

                            <button type="button" onClick={() => removeVariant(v.variant_id)}
                              className="h-5.5 w-5.5 rounded-md bg-red-50 flex items-center justify-center text-red-600 hover:bg-red-100 transition-colors">
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* أزرار الإجراء */}
              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
                <button type="button" onClick={() => { setIsCreateOpen(false); setSelectedVariants([]); }}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 transition-all">
                  إلغاء
                </button>
                <button type="submit" disabled={isSaving}
                  className="px-4 py-2 bg-[#800000] text-white rounded-lg text-xs font-semibold hover:bg-[#660000] disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all flex items-center gap-1.5">
                  {isSaving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> جاري الحفظ...</> : 'تأكيد وإنشاء الطلب'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ======================================================== */}
      {/* نافذة تفاصيل الطلب المطور بالهوية البرغندية والنسخ الذكي     */}
      {/* ======================================================== */}
      {isDetailOpen && selectedOrder && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full border border-slate-200 shadow-2xl flex flex-col max-h-[90vh]">

            {/* Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 rounded-t-2xl">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-base font-bold text-slate-900">تفاصيل الطلب:</span>
                <div className="flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                  <span className="text-xs font-mono font-bold text-slate-700">#{selectedOrder.id}</span>
                  <button onClick={() => handleCopyId(selectedOrder.id)} className="p-0.5 hover:bg-white rounded text-slate-400 hover:text-slate-600 transition-colors">
                    {copiedId === selectedOrder.id ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
                <StatusBadge status={selectedOrder.status} />
              </div>
              <button onClick={() => setIsDetailOpen(false)} className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            {detailLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                <span className="text-xs text-slate-400 mr-2">جاري جلب التفاصيل...</span>
              </div>
            ) : (
              <div className="p-5 overflow-y-auto flex-1 space-y-5 text-right">

                {/* بيانات العميل والشحن */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <User className="h-4 w-4 text-[#800000]" /> بيانات العميل والشحن
                    </h3>
                    <button
                      onClick={handleOpenEdit}
                      className="text-[11px] font-bold text-[#800000] hover:underline flex items-center gap-0.5"
                    >
                      <Pencil className="h-3 w-3" /> تعديل
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600">
                    {/* اسم العميل */}
                    <div className="flex items-center gap-1">
                      <User className="h-3.5 w-3.5 text-slate-400" />
                      <span className="font-medium">{selectedOrder.customer_name}</span>
                    </div>

                    {/* عنوان التوصيل */}
                    <div className="flex items-center gap-1 sm:col-span-2">
                      <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span>{selectedOrder.address || '—'}</span>
                    </div>

                    {/* إدارة نسخ أرقام الهواتف التفاعلية بلمسة واحدة */}
                    <div className="sm:col-span-2 space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 block pr-1">أرقام الهواتف (اضغط على الرقم للنسخ):</span>
                      <div className="flex flex-wrap gap-1.5">
                        {Array.isArray(selectedOrder.customer_phones) ? (
                          selectedOrder.customer_phones.map((phone, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => handleCopyToClipboard(phone, `تم نسخ الرقم: ${phone}`)}
                              className="flex items-center gap-1 bg-white hover:bg-slate-100 border border-slate-200 px-2 py-1 rounded-lg transition-all shadow-sm text-slate-700 font-mono text-xs group active:scale-95"
                            >
                              <Phone className="h-3 w-3 text-[#800000]" />
                              <span>{phone}</span>
                              <Copy className="h-2.5 w-2.5 text-slate-400 opacity-60 group-hover:opacity-100 transition-all mr-0.5" />
                            </button>
                          ))
                        ) : selectedOrder.customer_phones ? (
                          <button
                            type="button"
                            onClick={() => handleCopyToClipboard(selectedOrder.customer_phones, 'تم نسخ رقم الهاتف')}
                            className="flex items-center gap-1 bg-white hover:bg-slate-100 border border-slate-200 px-2 py-1 rounded-lg transition-all shadow-sm text-slate-700 font-mono text-xs group active:scale-95"
                          >
                            <Phone className="h-3 w-3 text-[#800000]" />
                            <span>{selectedOrder.customer_phones}</span>
                            <Copy className="h-2.5 w-2.5 text-slate-400 opacity-60 group-hover:opacity-100 transition-all mr-0.5" />
                          </button>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </div>
                    </div>

                    {/* حساب السوشيال ميديا مع زر نسخ الحساب المباشر */}
                    {selectedOrder.social_media_source && (
                      <div className="flex items-center justify-between gap-1 sm:col-span-2 text-[11px] text-slate-500 bg-white/60 border border-slate-200/40 rounded-lg p-1.5 pl-2 mt-1">
                        <div className="flex items-center gap-1">
                          <Hash className="h-3 w-3 text-slate-400" />
                          <span>المصدر: <strong className="text-slate-700">{selectedOrder.social_media_source}</strong></span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopyToClipboard(selectedOrder.social_media_source, 'تم نسخ حساب السوشيال ميديا')}
                          className="flex items-center gap-0.5 text-[10px] font-bold text-[#800000] hover:bg-[#800000]/5 px-2 py-1 rounded border border-[#800000]/10 transition-all active:scale-95 shrink-0"
                        >
                          <Copy className="h-2.5 w-2.5" /> نسخ
                        </button>
                      </div>
                    )}

                    {/* Meticulous Note Section */}
                    {selectedOrder.notes && (
                      <div className="flex items-start gap-1 sm:col-span-2 bg-amber-50/50 p-2 rounded border border-amber-100 text-amber-900 text-[11px]">
                        <MessageSquare className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                        <span><strong>ملاحظة:</strong> {selectedOrder.notes}</span>
                      </div>
                    )}
                  </div>

                  {/* معلومات الموظفين والوقت */}
                  <div className="border-t border-slate-200 pt-2 mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                    {selectedOrder.time_ago && <span>📅 {selectedOrder.time_ago}</span>}
                    {selectedOrder.created_by_name && <span>👤 أنشأه: <strong>{selectedOrder.created_by_name}</strong></span>}
                    {selectedOrder.inventory_employee_name && <span>📦 المخزن: <strong>{selectedOrder.inventory_employee_name}</strong></span>}
                    {selectedOrder.delivery_man_name && <span>🚚 التوصيل: <strong>{selectedOrder.delivery_man_name}</strong></span>}
                  </div>
                </div>

                {/* شريط تقدم التجهيز باللون البرغندي الفخم والأرقام الإنجليزية */}
                {selectedOrder.total_ordered_qty != null && (
                  <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-700">تقدم التجهيز</span>
                      <span className="font-mono font-bold text-[#800000]">
                        <span dir="ltr">
                          {selectedOrder.total_picked_qty} / {selectedOrder.total_ordered_qty}
                        </span> قطعة
                        {' '}(<span dir="ltr">{Math.round(selectedOrder.progress_percentage || 0)}%</span>)
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-2 rounded-full transition-all duration-500 bg-[#800000]"
                        style={{ width: `${Math.min(selectedOrder.progress_percentage || 0, 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* قسم المنتجات المضافة: زر الكاميرا المنفرد وجدول المنتجات المستقل */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-900">المنتجات المضافة للطلب</h4>
                    
                    {/* زر فتح الكاميرا النظيف (بدون أي خانة إدخال يدوي بجانبه) */}
                    <button
                      type="button"
                      onClick={() => {
                        if (typeof setIsScannerOpen === 'function') {
                          setIsScannerOpen(true); 
                        } else if (typeof handleStartScanner === 'function') {
                          handleStartScanner();
                        } else {
                          showToast('جاري فتح كاميرا الباركود...', 'info');
                        }
                      }}
                      className="flex items-center gap-1.5 text-xs font-bold text-white bg-[#800000] hover:bg-[#660000] px-3 py-1.5 rounded-xl shadow-sm transition-all active:scale-95"
                    >
                      <Camera className="h-4 w-4" />
                      <span>فتح كاميرا الباركود</span>
                    </button>
                  </div>

                 
                         {/* جدول عرض المنتجات المضافة للطلب - المطور بالخصائص والصورة والأزرار اليدوية */}
<div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
  {selectedOrder.items && selectedOrder.items.length > 0 ? (
    <div className="divide-y divide-slate-100">
      {selectedOrder.items.map((item, idx) => (
        <div key={idx} className="p-3 flex items-center justify-between text-xs hover:bg-slate-50/80 transition-colors gap-2">
          
          {/* اليمين: الصورة + تفاصيل المنتج الأساسية والخيارات */}
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            {/* صورة المنتج */}
            <div className="h-10 w-10 rounded-lg bg-slate-50 border border-slate-200 shrink-0 flex items-center justify-center overflow-hidden">
              {item.image_url || item.product_image ? (
                <img 
                  src={item.image_url || item.product_image} 
                  alt={item.product_name || item.name} 
                  className="h-full w-full object-cover"
                />
              ) : (
                <Package className="h-5 w-5 text-slate-300" />
              )}
            </div>

            {/* تفاصيل الاسم، الـ SKU، اللون والمقاس */}
            <div className="space-y-1 min-w-0 flex-1">
              <span className="font-bold text-slate-800 block truncate">{item.product_name || item.name}</span>
              
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-500">
                <span className="font-mono" dir="ltr">SKU: {item.sku || '—'}</span>
                
                {/* كبسولة اللون */}
                {(item.color || item.product_color) && (
                  <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                    اللون: <strong>{item.color || item.product_color}</strong>
                  </span>
                )}
                
                {/* كبسولة المقاس */}
                {(item.size || item.product_size) && (
                  <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                    المقاس: <strong>{item.size || item.product_size}</strong>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* اليسار: عداد الكميات المجهزة + زر المسح اليدوي المستقل */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* عداد الكمية */}
            <div className="text-left min-w-[55px]">
              <span className="text-[10px] text-slate-400 block font-medium">تم مسحه</span>
              <span className="font-mono font-bold text-slate-800 text-xs" dir="ltr">
                {item.picked_qty || 0} / {item.qty || item.quantity}
              </span>
            </div>

            {/* زر مسح يدوي المخصص لكل سطر منتج منفرد */}
            <button
              type="button"
              onClick={() => {
                if (typeof handlePickItemManually === 'function') {
                  handlePickItemManually(item);
                } else if (typeof handleIncrementItem === 'function') {
                  handleIncrementItem(item); // دالة بديلة إن وجدت لتجهيز القطعة
                }
              }}
              className="bg-[#800000]/5 hover:bg-[#800000] text-[#800000] hover:text-white px-2.5 py-1.5 rounded-lg font-bold text-[11px] transition-all border border-[#800000]/10 active:scale-95 shadow-sm"
            >
              مسح يدوي
            </button>
          </div>

        </div>
      ))}
    </div>
  ) : (
    <div className="p-6 text-center text-slate-400 text-xs">لا توجد منتجات مضافة لهذا الطلب.</div>
  )}
</div>
                </div>

                {/* حركات الطلب / سجل العمليات */}
                {selectedOrder.actions && selectedOrder.actions.length > 0 && (
                  <div className="mt-6 border border-slate-200 rounded-xl p-4 bg-white">
                    <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                      <Clock className="h-4 w-4 text-[#800000]" />
                      سجل حركات الطلب
                    </h3>
                    <div className="overflow-x-auto rounded-lg border border-slate-100">
                      <table className="w-full text-xs text-right">
                        <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                          <tr>
                            <th className="px-3 py-2 font-bold whitespace-nowrap">الحركة</th>
                            <th className="px-3 py-2 font-bold whitespace-nowrap">المسؤول</th>
                            <th className="px-3 py-2 font-bold whitespace-nowrap text-left">الوقت</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedOrder.actions.map((action, idx) => {
                            let actionName = action.action_type;
                            if (actionName === 'created') actionName = 'إنشاء الطلب';
                            else if (actionName === 'item_scanned') actionName = 'مسح منتج';
                            else if (actionName === 'delivery_assigned') actionName = 'إسناد الشحن';
                            else if (actionName === 'status_updated') actionName = 'تحديث الحالة';
                            
                            return (
                              <tr key={idx} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                                <td className="px-3 py-2 font-medium text-slate-800">{actionName}</td>
                                <td className="px-3 py-2 text-slate-600">
                                  <div className="flex items-center gap-1.5">
                                    <div className="h-5 w-5 rounded bg-slate-100 flex items-center justify-center shrink-0">
                                      <User className="h-3 w-3 text-slate-400" />
                                    </div>
                                    {action.user_name}
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-slate-500 font-mono text-left" dir="ltr">
                                  {action.created_at ? new Date(action.created_at).toLocaleString('ar-SA') : '-'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* قسم إسناد الشحن الفوري عند اكتمال التجهيز */}
                {selectedOrder.status === 'تم التجهيز' && (
                  <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-3">
                    <span className="text-xs font-bold text-emerald-900 flex items-center gap-1">
                      <Truck className="h-4 w-4 text-emerald-700" />
                      اكتمل التجهيز! يرجى إسناد جهة الشحن:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="space-y-1">
                        <label className="font-bold text-slate-700">نوع الشحن</label>
                        <select
                          value={deliveryType}
                          onChange={e => setDeliveryType(e.target.value)}
                          className="w-full p-2 border border-slate-300 bg-white rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#800000]"
                        >
                          <option value="">-- اختر --</option>
                          <option value="شركة توصيل">شركة شحن وتوصيل متعاقدة</option>
                          <option value="توصيل خاص">مندوب توصيل خاص</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="font-bold text-slate-700">اسم الناقل أو المندوب</label>
                        <input
                          type="text"
                          placeholder="مثال: درب السبيل ..."
                          value={carrierName}
                          onChange={e => setCarrierName(e.target.value)}
                          className="w-full p-2 border border-slate-300 bg-white rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#800000]"
                        />
                      </div>
                    </div>
                    <button
                      onClick={handleConfirmDelivery}
                      disabled={isAssigning}
                      className="w-full bg-[#800000] hover:bg-[#660000] text-white font-bold text-xs py-2 rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isAssigning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Truck className="h-4 w-4" />}
                      تأكيد إسناد الشحن
                    </button>
                  </div>
                )}

                {/* إجمالي قيمة الطلب: باللون البرغندي الحاد الصريح وبالأرقام الإنجليزية المنسقة */}
                {selectedOrder.total_price != null && (
                  <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm">
                    <span className="font-bold text-slate-700">إجمالي الطلب:</span>
                    <span className="font-black text-[#800000] text-base font-mono" dir="ltr">
                      {Number(selectedOrder.total_price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} LYD
                    </span>
                  </div>
                )}

                {/* الفوتر وأزرار التحكم: زر الإلغاء الموحد بالبرغندي والأيقونات التفاعلية */}
                <div className="border-t border-slate-100 pt-4 flex items-center justify-between flex-wrap gap-2">
                  <button
                    onClick={handleDeleteOrder}
                    disabled={isDeleting}
                    className="text-xs text-[#800000] hover:text-[#660000] font-bold border border-[#800000]/30 hover:bg-[#800000]/5 px-3 py-2 rounded-lg transition-all flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    إلغاء الطلب
                  </button>

                  <button
                    onClick={handleDownloadInvoice}
                    disabled={isDownloading}
                    className="text-xs font-bold border border-slate-300 px-3 py-2 rounded-lg hover:bg-slate-50 transition-all flex items-center gap-1 text-slate-600 disabled:opacity-50"
                  >
                    {isDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    تحميل الفاتورة
                  </button>
                </div>

              </div>
            )}
          </div>
        </div>
      )}

      

      {/* ======================================================== */}
      {/* نافذة الماسح الضوئي (محاكاة)                              */}
      {/* ======================================================== */}
      {isScannerOpen && (
        <div className="fixed inset-0 bg-black/90 z-[70] flex flex-col items-center justify-center p-4 text-white">
          <div className="absolute top-4 right-4 left-4 flex items-center justify-between">
            <span className="text-xs font-bold tracking-wider text-slate-300">ماسح رمز QR / Barcode</span>
            <button onClick={() => setIsScannerOpen(false)} className="bg-white/10 p-2 rounded-full hover:bg-white/20 transition-all">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="max-w-md w-full space-y-6 text-center">
            <div className="relative aspect-video w-full bg-slate-800 rounded-2xl border-2 border-dashed border-slate-600 flex flex-col items-center justify-center overflow-hidden shadow-2xl">
              <div className="absolute inset-x-0 h-0.5 bg-[#6b1d2f] shadow-lg shadow-[#6b1d2f]/50 animate-bounce top-1/2" />
              <ScanLine className="h-16 w-16 text-slate-600 mb-2" />
              <p className="text-xs text-slate-400 px-6">اختر منتجاً من الأسفل لمحاكاة المسح</p>
            </div>
            {selectedOrder?.items && (
              <div className="space-y-2">
                <span className="text-xs text-slate-400 block font-bold">المنتجات المتوقعة في الطلب:</span>
                {selectedOrder.items.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      handleBarcodeScan(String(item.variant_id));
                      setIsScannerOpen(false);
                    }}
                    className="w-full bg-white/10 hover:bg-white/20 border border-white/10 p-3 rounded-xl text-right text-xs transition-all flex items-center justify-between"
                  >
                    <div>
                      <span className="font-bold text-white block">{item.product_name}</span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {item.color_name && `${item.color_name} - `}{item.size && item.size}
                        {' '} | Variant ID: {item.variant_id}
                      </span>
                    </div>
                    <span className="text-[10px] bg-[#6b1d2f] text-white px-2 py-0.5 rounded font-bold shrink-0">محاكاة مسح</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}



      {/* ======================================================== */}
      {/* نافذة تعديل بيانات الطلب                                  */}
      {/* ======================================================== */}
      {isEditOpen && selectedOrder && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[65] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 rounded-t-2xl">
              <div className="flex items-center gap-2">
                <Pencil className="h-4 w-4 text-[#6b1d2f]" />
                <h2 className="text-sm font-bold text-slate-900">تعديل بيانات الطلب #{selectedOrder.id}</h2>
              </div>
              <button onClick={() => setIsEditOpen(false)} className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSaveEdit} className="p-5 space-y-3 overflow-y-auto flex-1 text-right">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600 block">اسم العميل</label>
                <input
                  type="text" required
                  value={editForm.customer_name}
                  onChange={e => setEditForm(p => ({ ...p, customer_name: e.target.value }))}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#6b1d2f]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600 block">رقم الهاتف</label>
                <input
                  type="tel"
                  value={editForm.customer_phones}
                  onChange={e => setEditForm(p => ({ ...p, customer_phones: e.target.value }))}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#6b1d2f]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600 block">عنوان التوصيل</label>
                <input
                  type="text" required
                  value={editForm.address}
                  onChange={e => setEditForm(p => ({ ...p, address: e.target.value }))}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#6b1d2f]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600 block">ملاحظات</label>
                <textarea
                  rows="2"
                  value={editForm.notes}
                  onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#6b1d2f] resize-none"
                />
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                <button type="button" onClick={() => setIsEditOpen(false)} className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50">
                  إلغاء
                </button>
                <button type="submit" disabled={isSaving}
                  className="px-4 py-2 bg-[#6b1d2f] text-white rounded-lg text-xs font-semibold hover:bg-[#541624] ...">
                  {isSaving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> حفظ...</> : 'حفظ التغييرات'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

// ========= مكوّن اختيار المنتج =========
function ProductSelector({ product, onAddVariant }) {
  const [isOpen, setIsOpen] = useState(false);
  const getImageUrl = (path) => path ? (path.startsWith('http') ? path : `http://localhost:8000/${path.replace(/^[\\\\/]+/, '')}`) : null;

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(p => !p)}
        className="w-full flex items-center justify-between p-2.5 bg-slate-50 hover:bg-slate-100 transition-colors text-right"
      >
        <div className="flex items-center gap-3">
          {product.image ? (
            <img src={getImageUrl(product.image)} alt={product.name} className="h-8 w-8 rounded object-cover border border-slate-200 shrink-0" />
          ) : (
            <div className="h-8 w-8 rounded bg-slate-200 flex items-center justify-center border border-slate-200 shrink-0">
              <Package className="h-4 w-4 text-slate-400 shrink-0" />
            </div>
          )}
          <span className="text-xs font-bold text-slate-800">{product.name}</span>
        </div>
        {isOpen ? <ChevronUp className="h-3.5 w-3.5 text-slate-400 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />}
      </button>
      {isOpen && product.colors?.map(color => (
        <div key={color.id} className="border-t border-slate-100">
          <div className="px-3 py-2 bg-white text-[11px] font-bold text-slate-600 flex items-center gap-2">
            {color.color_image ? (
               <img src={getImageUrl(color.color_image)} alt={color.color_name} className="h-5 w-5 rounded-full object-cover border border-slate-200 shrink-0" />
            ) : (
               <span className="h-2 w-2 rounded-full bg-slate-300 inline-block shrink-0" />
            )}
            {color.color_name}
          </div>
          {color.variants?.map(variant => (
            <button
              type="button"
              key={variant.id}
              onClick={() => onAddVariant(variant, color.color_name, product.name, variant.size_name || variant.size || 'N/A')}
              className="w-full flex items-center justify-between px-4 py-2 hover:bg-blue-50 transition-colors text-right border-t border-slate-50"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-700 font-medium">
                  {variant.size_name || variant.size || 'N/A'}
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                  (variant.quantity_available || 0) > 0
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-red-50 text-red-600'
                }`}>
                  متاح: {variant.quantity_available ?? 0}
                </span>
              </div>
              <span className="text-[10px] text-[#6b1d2f] font-bold bg-[#6b1d2f]/10 px-2 py-0.5 rounded">
                + إضافة
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}