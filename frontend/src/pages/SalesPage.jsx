import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { orderApi, mapStatusToArabic } from '../api/orderApi';
import useQrScanner from '../hooks/useQrScanner';
import {
  // الأيقونات الجديدة للإحصائيات والتنبيهات الحديثة
  Clock, PackageOpen, CheckCircle2, Truck, AlertCircle,
  
  // باقي أيقونات الشاشة والعمليات الأساسية
  Plus, Search, Package, Layers, Camera, ScanLine, Pencil, 
  Copy, Check, User, Phone, MapPin, MessageSquare, X, 
  Minus, RefreshCw, Trash2, TrendingUp, ShieldCheck, Download,
  Loader2, ChevronDown, ChevronUp, ShoppingCart, FileText,
  Hash, BadgeCheck, Info, Zap, Send, Sparkles
} from 'lucide-react';

import { fetchEmployeesApi } from '../api/userApi';
import { saveOfflineAction } from '../utils/idbStorage';
import { isNetworkError } from '../utils/netErrors';
import ProductPicker from '../components/products/ProductPicker';
import { FALLBACK_DARB_SERVICES, FALLBACK_DARB_CITIES } from '../constants/darbAssabilFallback';

const playScanBeep = (isSuccess = true) => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = isSuccess ? 'sine' : 'sawtooth';
    osc.frequency.setValueAtTime(isSuccess ? 880 : 330, ctx.currentTime);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + (isSuccess ? 0.15 : 0.25));
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (isSuccess ? 0.15 : 0.25));
  } catch (e) {}
};



// تم إزالة ToastContainer المخصص — يتم استخدام react-hot-toast مباشرة لمنع ازدواجية نظام الإشعارات

// ========= شارة حالة الطلب =========
function StatusBadge({ status, className = '' }) {
  const cfg = {
    'معلق':              'bg-amber-50 text-amber-700 border-amber-200',
    'قيد التجهيز':      'bg-blue-50 text-blue-700 border-blue-200',
    'تم التجهيز':       'bg-emerald-50 text-emerald-700 border-emerald-200',
    'تم اسناده للتوصيل': 'bg-purple-50 text-purple-700 border-purple-200',
    'جاري الشحن':       'bg-purple-50 text-purple-700 border-purple-200',
    'ملغي':             'bg-red-50 text-red-700 border-red-200',
    'تم التوصيل':       'bg-sky-50 text-sky-700 border-sky-200',
  };
  const displayStatus = status === 'جاري الشحن' ? 'تم اسناده للتوصيل' : status;
  return (
    <span className={`text-[10px] px-2.5 py-0.5 rounded-full border font-bold ${cfg[status] || 'bg-slate-50 text-slate-600 border-slate-200'} ${className}`}>
      {displayStatus}
    </span>
  );
}

// ========= أيقونة حالة الطلب =========
function StatusIcon({ status }) {
  const cls = {
    'معلق':              'bg-amber-50 text-amber-700 border-amber-100',
    'قيد التجهيز':      'bg-blue-50 text-blue-700 border-blue-100',
    'تم التجهيز':       'bg-emerald-50 text-emerald-700 border-emerald-100',
    'تم اسناده للتوصيل': 'bg-purple-50 text-purple-700 border-purple-100',
    'جاري الشحن':       'bg-purple-50 text-purple-700 border-purple-100',
    'ملغي':             'bg-red-50 text-red-700 border-red-100',
    'تم التوصيل':       'bg-sky-50 text-sky-700 border-sky-100',
  }[status] || 'bg-slate-50 text-slate-500 border-slate-200';

  return (
    <div className={`p-2 rounded-xl border shrink-0 ${cls}`}>
      {status === 'معلق'               && <Clock className="h-5 w-5" />}
      {status === 'قيد التجهيز'       && <Layers className="h-5 w-5" />}
      {status === 'تم التجهيز'        && <CheckCircle2 className="h-5 w-5" />}
      {(status === 'تم اسناده للتوصيل' || status === 'جاري الشحن') && <Truck className="h-5 w-5" />}
      {status === 'ملغي'              && <X className="h-5 w-5" />}
      {status === 'تم التوصيل'        && <ShieldCheck className="h-5 w-5" />}
      {!['معلق','قيد التجهيز','تم التجهيز','تم اسناده للتوصيل','جاري الشحن','ملغي','تم التوصيل'].includes(status) && <Package className="h-5 w-5" />}
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

  // ---- States كاميرا ماسح التجهيز السريع للطلب ----
  // حالة الكاميرا ومنع التكرار يديرهما الآن هوك useQrScanner (أسفل الملف)،
  // ولم يبقَ هنا إلا نص التغذية الراجعة المعروض للموظف.
  const [scannerFeedback, setScannerFeedback]         = useState('');
  const selectedOrderIdRef     = useRef(null);

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
  const [productSearchQuery, setProductSearchQuery] = useState(''); // بحث في قائمة المنتجات

  // ---- States الشحن وشركة درب السبيل ----
  const [shippingProvider, setShippingProvider]           = useState('darb_assabil');
  const [darbServices, setDarbServices]                   = useState([]);
  const [darbCitiesAreas, setDarbCitiesAreas]             = useState({});
  const [loadingDarbData, setLoadingDarbData]             = useState(false);
  const [selectedDarbService, setSelectedDarbService]     = useState('67f19a776dabff22987169e9');
  const [selectedDarbCity, setSelectedDarbCity]           = useState('طرابلس');
  const [selectedDarbArea, setSelectedDarbArea]           = useState('');
  const [selectedDarbPaymentBy, setSelectedDarbPaymentBy] = useState('receiver');
  const [deliveryGender, setDeliveryGender]               = useState('رجالي'); // 'رجالي' | 'نسائي'
  const [darbDetailedAddress, setDarbDetailedAddress]     = useState('');

  // States مرحلة إسناد التوصيل
  const [deliveryAssignMethod, setDeliveryAssignMethod]   = useState('local'); // 'darb_assabil' | 'local'
  const [localDriverName, setLocalDriverName]             = useState('');
  const [isDarbModalOpen, setIsDarbModalOpen]             = useState(false);
  const [isSendingDarb, setIsSendingDarb]                 = useState(false);

  // جلب بيانات باقات ومدن درب السبيل عند الحاجة
  const loadDarbDataIfNeeded = useCallback(async (force = false) => {
    if (!force && darbServices.length > 0 && Object.keys(darbCitiesAreas).length > 0) return;
    setLoadingDarbData(true);

    let fetchedServices = null;
    let fetchedCities   = null;

    // محاولة الجلب من الـ API — إذا فشل نستخدم البيانات الاحتياطية مباشرة
    if (navigator.onLine) {
      try {
        const [s, c] = await Promise.all([
          orderApi.getDarbServices(),
          orderApi.getDarbCitiesAndAreas(),
        ]);
        fetchedServices = s;
        fetchedCities   = c;
      } catch (err) {
        console.warn('[Darb] API fetch failed, falling back to local constants:', err?.message);
      }
    }

    // ---- الخدمات ----
    const safeServices =
      Array.isArray(fetchedServices) && fetchedServices.length > 0
        ? fetchedServices
        : FALLBACK_DARB_SERVICES;

    setDarbServices(safeServices);
    const defaultSrv = safeServices.find(s => s.is_default) || safeServices[0];
    if (defaultSrv) {
      setSelectedDarbService(defaultSrv.id || defaultSrv._id || '67f19a776dabff22987169e9');
    }

    // ---- المدن والمناطق ----
    const safeCities =
      fetchedCities && Object.keys(fetchedCities).length > 0
        ? fetchedCities
        : FALLBACK_DARB_CITIES;

    setDarbCitiesAreas(safeCities);
    const cityKeys   = Object.keys(safeCities);
    const initialCity = cityKeys.includes('طرابلس') ? 'طرابلس' : cityKeys[0];
    if (initialCity) {
      setSelectedDarbCity(initialCity);
      const areas = safeCities[initialCity] || [];
      if (areas.length > 0) setSelectedDarbArea(areas[0]);
    }

    setLoadingDarbData(false);
  }, [darbServices.length, darbCitiesAreas]);

  const handleDarbCityChange = (newCity) => {
    setSelectedDarbCity(newCity);
    const areas = darbCitiesAreas[newCity] || [];
    if (areas.length > 0) {
      setSelectedDarbArea(areas[0]);
    } else {
      setSelectedDarbArea('');
    }
  };

  const sortedDarbCities = useMemo(() => {
    return Object.keys(darbCitiesAreas).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [darbCitiesAreas]);

  const availableAreasForSelectedCity = useMemo(() => {
    const list = darbCitiesAreas[selectedDarbCity] || [];
    return [...list].sort((a, b) => a.localeCompare(b, 'ar'));
  }, [darbCitiesAreas, selectedDarbCity]);

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

  // 4. 🔥 دالة تصفير الفورم بالكامل
  const resetCreateForm = useCallback(() => {
    setNewOrderForm({
      customer_name: '', 
      customer_phones: [''],
      address: '',
      social_media_source: '', 
      notes: '', 
      items: [],
    });
    setSelectedVariants([]);
    setShippingProvider('darb_assabil');
    setDeliveryGender('رجالي');
    setDarbDetailedAddress('');
  }, []);

  // ---- States الشحن القديم والتعديل ----
  const [deliveryType, setDeliveryType] = useState('');
  const [carrierName, setCarrierName]   = useState('');

  const [editForm, setEditForm] = useState({
    customer_name: '', customer_phones: [''], address: '', social_media_source: '', notes: '',
  });
  const [editShippingProvider, setEditShippingProvider]       = useState('darb_assabil');
  const [editDarbCity, setEditDarbCity]                       = useState('طرابلس');
  const [editDarbArea, setEditDarbArea]                       = useState('');
  const [editDarbDetailedAddress, setEditDarbDetailedAddress] = useState('');
  const [editDarbService, setEditDarbService]                 = useState('67f19a776dabff22987169e9');
  const [editDarbPaymentBy, setEditDarbPaymentBy]             = useState('receiver');
  const [editSelectedVariants, setEditSelectedVariants]       = useState([]);
  const [editShowProductsSection, setEditShowProductsSection] = useState(false);

  const handleEditDarbCityChange = (newCity) => {
    setEditDarbCity(newCity);
    const areas = darbCitiesAreas[newCity] || [];
    if (areas.length > 0) {
      setEditDarbArea(areas[0]);
    } else {
      setEditDarbArea('');
    }
  };

  const availableAreasForEditCity = useMemo(() => {
    const list = darbCitiesAreas[editDarbCity] || [];
    return [...list].sort((a, b) => a.localeCompare(b, 'ar'));
  }, [darbCitiesAreas, editDarbCity]);

  const handleEditPhoneChange = (index, value) => {
    const updated = [...editForm.customer_phones];
    updated[index] = value;
    setEditForm(p => ({ ...p, customer_phones: updated }));
  };
  const addEditPhoneField = () =>
    setEditForm(p => ({ ...p, customer_phones: [...p.customer_phones, ''] }));
  const removeEditPhoneField = (index) =>
    setEditForm(p => ({ ...p, customer_phones: p.customer_phones.filter((_, i) => i !== index) }));

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
      const data = await orderApi.getOrders({ limit: 200 });
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

  // ========= جلب المنتجات للاختيار في نموذج الطلب — تحميل كسول عند أول فتح فقط =========
  const productsLoadedRef = useRef(false); // ✅ منع إعادة الجلب في كل فتح
  const fetchAvailableProducts = useCallback(async () => {
    if (productsLoadedRef.current) return; // تم التحميل مسبقاً — استخدم الـ cache
    setLoadingProducts(true);
    try {
      const products = await orderApi.getAllProductsWithVariants();
      setAvailableProducts(products);
      productsLoadedRef.current = true; // ✅ علامة: لا تجلب مجدداً
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
      // تجاهل خطأ قائمة الموظفين بهدوء — لا يوقف عمل الصفحة
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    fetchInventoryStats();
    fetchEmployeesList();
    loadDarbDataIfNeeded();
  }, [fetchOrders, fetchInventoryStats, fetchEmployeesList, loadDarbDataIfNeeded]);

  // تحديث تلقائي للقائمة كل 45 ث — يبقي جميع المستخدمين العاملين في نفس الوقت متزامنين
  useEffect(() => {
    const id = setInterval(() => fetchOrders(true), 45_000);
    return () => clearInterval(id);
  }, [fetchOrders]);

  // تحديث الطلب المفتوح تلقائياً إذا تغيّرت بياناته في الخادم أثناء عمل مستخدم آخر
  useEffect(() => { selectedOrderIdRef.current = selectedOrder?.id ?? null; }, [selectedOrder]);
  useEffect(() => {
    const id = selectedOrderIdRef.current;
    if (!id || orders.length === 0) return;
    const fresh = orders.find(o => o.id === id);
    if (!fresh) return;
    // نحدث فقط الحقول القادمة من القائمة (status, tracking...) ونحافظ على
    // بنود الطلب التفصيلية المحلية — القائمة لا تُعيد items فتطمسها بدون هذا الحل
    setSelectedOrder(prev => {
      if (!prev) return fresh;
      return {
        ...prev,
        status:            fresh.status            ?? prev.status,
        total_price:       fresh.total_price       ?? prev.total_price,
        shipping_provider: fresh.shipping_provider ?? prev.shipping_provider,
        tracking_number:   fresh.tracking_number   ?? prev.tracking_number,
        shipment_id:       fresh.shipment_id       ?? prev.shipment_id,
        delivery_info:     fresh.delivery_info     ?? prev.delivery_info,
        // نحافظ على items التفصيلية ما لم تأتِ نسخة أحدث تحتوي عليها
        items: (fresh.items && fresh.items.length > 0) ? fresh.items : prev.items,
      };
    });
  }, [orders]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isCreateOpen) {
      loadDarbDataIfNeeded();
    }
  }, [isCreateOpen, loadDarbDataIfNeeded]);

  const handleCopyToClipboard = (text, message = 'تم النسخ إلى الحافظة') => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    showToast(message);
  };

  // ========= ✅ إصلاح: useEffect موحد واحد لمنع تعارض 3 hooks منفصلة كانت تتصادم =========
  // ⚠️ الاعتماد على selectedOrder كان يسبب تجمّد السكرول: عند إغلاق نافذة التفاصيل
  // يبقى selectedOrder محفوظاً فيظل الشرط صحيحاً ويبقى body مقفولاً للأبد.
  // الحل: الاعتماد على أعلام الفتح الصريحة فقط.
  useEffect(() => {
    const anyModalOpen = isCreateOpen || isEditOpen || isDetailOpen;
    // '' يعيد القيمة للورقة النمطية (body { overflow-x: hidden }) بدل 'unset' الذي يلغيها.
    document.body.style.overflow = anyModalOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isCreateOpen, isEditOpen, isDetailOpen]);

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

  // ========= إغلاق تفاصيل الطلب =========
  // تصفير selectedOrder يمنع بقاء طلب قديم في الذاكرة بعد الإغلاق،
  // ولا نصفّره إذا كانت نافذة التعديل مفتوحة فوقها لأنها تعتمد عليه.
  const handleCloseDetail = () => {
    setIsDetailOpen(false);
    if (!isEditOpen) setSelectedOrder(null);
  };

  // ========= مسح QR لتجهيز المنتج =========
  const handleBarcodeScan = async (barcodeValue) => {
    if (!selectedOrder || !barcodeValue || !barcodeValue.trim()) return;

    // المسح يتطلب تحقق من السيرفر — لا يمكن تنفيذه بدون اتصال
    if (!navigator.onLine) {
      playScanBeep(false);
      showToast('لا يمكن مسح وتجهيز المنتجات بدون اتصال بالإنترنت. تأكد من الاتصال أولاً 📡', 'error');
      setScannerFeedback('لا يوجد اتصال بالإنترنت 📡');
      return;
    }

    const cleanCode = barcodeValue.trim();
    setIsScanning(true);
    setScannerFeedback('جاري معالجة الصنف...');
    try {
      const result = await orderApi.scanOrderItem(selectedOrder.id, cleanCode);
      playScanBeep(true);
      const arabicStatus = mapStatusToArabic(result?.status) || selectedOrder.status;
      const targetVariantId = result?.variant_id;
      const successMsg = result?.message || 'تم مسح وتجهيز الصنف بنجاح';
      showToast(successMsg, 'success');
      setScannerFeedback(successMsg);
      setManualBarcode('');

      // تحديث شاشة تفاصيل الطلب وحالة القطع الممسوحة فوراً في الواجهة
      setSelectedOrder(prev => {
        if (!prev) return prev;
        const items = (prev.items || []).map(it => {
          if (it.variant_id !== targetVariantId) return it;
          const total = it.quantity ?? it.qty ?? 0;
          const next = result?.picked_quantity ?? ((it.picked_quantity ?? 0) + 1);
          return { ...it, picked_quantity: total ? Math.min(next, total) : next };
        });
        const totalPicked = items.reduce((s, it) => s + (it.picked_quantity ?? 0), 0);
        const totalOrdered = prev.total_ordered_qty
          ?? items.reduce((s, it) => s + (it.quantity ?? it.qty ?? 0), 0);
        return {
          ...prev,
          status: arabicStatus,
          items,
          total_picked_qty: totalPicked,
          progress_percentage: totalOrdered ? (totalPicked / totalOrdered) * 100 : 0,
        };
      });

      setOrders(prev => prev.map(o => o.id === selectedOrder.id ? { ...o, status: arabicStatus } : o));
    } catch (err) {
      playScanBeep(false);
      if (isNetworkError(err)) {
        showToast('انقطع الاتصال أثناء المسح. تأكد من الاتصال وأعد المحاولة 📡', 'error');
        setScannerFeedback('انقطع الاتصال أثناء المسح 📡');
      } else {
        const msg = typeof err === 'string' ? err : (err?.response?.data?.detail || err?.message || 'الكود الممسوح لا يطابق أي منتج غير مكتمل في هذا الطلب');
        showToast(msg, 'error');
        setScannerFeedback(msg);
      }
    } finally {
      setIsScanning(false);
    }
  };

  // ========= مسح يدوي لتجهيز المنتج =========
  const handleManualScan = async (variantId) => {
    if (!selectedOrder || !variantId) return;

    if (!navigator.onLine) {
      playScanBeep(false);
      showToast('لا يمكن التجهيز اليدوي بدون اتصال بالإنترنت 📡', 'error');
      return;
    }

    setIsScanning(true);
    try {
      const result = await orderApi.scanOrderItemManual(selectedOrder.id, variantId);
      playScanBeep(true);
      const arabicStatus = mapStatusToArabic(result?.status) || selectedOrder.status;
      showToast(result?.message || 'تم المسح اليدوي وتجهيز القطعة بنجاح', 'success');

      setSelectedOrder(prev => {
        if (!prev) return prev;
        const items = (prev.items || []).map(it => {
          if (it.variant_id !== variantId) return it;
          const total = it.quantity ?? it.qty ?? 0;
          const next = result?.picked_quantity ?? ((it.picked_quantity ?? 0) + 1);
          return { ...it, picked_quantity: total ? Math.min(next, total) : next };
        });
        const totalPicked = items.reduce((s, it) => s + (it.picked_quantity ?? 0), 0);
        const totalOrdered = prev.total_ordered_qty
          ?? items.reduce((s, it) => s + (it.quantity ?? it.qty ?? 0), 0);
        return {
          ...prev,
          status: arabicStatus,
          items,
          total_picked_qty: totalPicked,
          progress_percentage: totalOrdered ? (totalPicked / totalOrdered) * 100 : 0,
        };
      });
      setOrders(prev => prev.map(o => o.id === selectedOrder.id ? { ...o, status: arabicStatus } : o));
    } catch (err) {
      playScanBeep(false);
      if (isNetworkError(err)) {
        showToast('انقطع الاتصال أثناء التجهيز. تأكد من الاتصال وأعد المحاولة 📡', 'error');
      } else {
        const msg = typeof err === 'string' ? err : (err?.response?.data?.detail || err?.message || 'حدث خطأ أثناء التجهيز اليدوي');
        showToast(msg, 'error');
      }
    } finally {
      setIsScanning(false);
    }
  };

  // ========= إدارة كاميرا الماسح الضوئي داخل الطلب =========
  // الماسح موحّد الآن عبر useQrScanner. النسخة السابقة كانت تبني الكاميرا هنا
  // وتضع handleBarcodeScan — وهي دالة تُنشأ من جديد مع كل رسم — ضمن اعتماديات
  // التأثير، فكانت الكاميرا تُغلق وتُفتح مع كل تحديث حالة (وهي كثيرة في هذه
  // الشاشة: تحديث الطلبات كل 45ث، مؤشر المسح، الإشعارات...) فلا تستقر أبداً
  // لتقرأ إطاراً. الهوك يحتفظ بالمعالج في ref فتبقى الكاميرا حيّة.
  const {
    status: scannerCameraStatus,
    cameraError: scannerCameraError,
    isCoolingDown: scannerCooldown,
    restart: startOrderScanner,
  } = useQrScanner({
    elementId: 'order-camera-reader',
    active: isScannerOpen,
    onScan: handleBarcodeScan,
    errorMessage: 'تعذر فتح الكاميرا المباشرة. يمكنك استخدام قارئ الباركود أو الإدخال اليدوي.',
  });

  const handleCreateOrder = async (e) => {
    e.preventDefault();
    
    // 1. فحص وتأمين الأرقام المكتوبة وتصفية الحقول الفارغة
    const cleanedPhones = Array.isArray(newOrderForm.customer_phones)
      ? newOrderForm.customer_phones.map(p => p.trim()).filter(p => p !== '')
      : [];

    // 2. فحص ملء الحقول الإلزامية الأساسية (الاسم، العنوان التفصيلي، ورقم هاتف صحيح)
    const detailedAddr = darbDetailedAddress.trim();
    if (!newOrderForm.customer_name.trim() || !detailedAddr || cleanedPhones.length === 0) {
      showToast('يرجى كتابة اسم العميل، وتحديد العنوان التفصيلي، وإدخال رقم هاتف واحد على الأقل', 'error');
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

    // 5. بناء الـ Payload الموحد — خارج try/catch حتى يبقى متاحاً في catch block
    const finalAddress = `${selectedDarbCity} - ${selectedDarbArea || 'وسط المدينة'} - ${detailedAddr}`;
    const payload = {
      customer_name:       newOrderForm.customer_name.trim(),
      customer_phones:     cleanedPhones,
      address:             finalAddress,
      social_media_source: newOrderForm.social_media_source?.trim() || null,
      notes:               newOrderForm.notes?.trim() || null,
      items:               selectedVariants.map(v => ({ variant_id: v.variant_id, quantity: v.quantity, allow_inspection: v.allow_inspection ?? false, allow_try_on: v.allow_try_on ?? false })),
      shipping_provider:   'darb_assabil',
      darb_service_id:     selectedDarbService,
      darb_city:           selectedDarbCity,
      darb_area:           selectedDarbArea || 'وسط المدينة',
      darb_payment_by:     selectedDarbPaymentBy || 'receiver',
      delivery_gender:     deliveryGender || 'رجالي',
    };

    try {
      if (!navigator.onLine) {
        // دعم الأوفلاين: حفظ الطلب محلياً عند انقطاع النت
        const tempId = Math.floor(1000 + Math.random() * 9000);
        const offlineOrder = {
          id: `OFFLINE-${tempId}`,
          ...payload,
          status: 'معلق',
          created_at: new Date().toISOString(),
          total_price: selectedVariants.reduce((sum, v) => sum + (v.quantity * 0), 0)
        };
        const savedOffline = await saveOfflineAction('CREATE_ORDER', payload, `إنشاء طلب لـ ${payload.customer_name}`);
        if (!savedOffline) {
          showToast('تعذّر حفظ الطلب محلياً! لا تغلق الصفحة وحاول مرة أخرى.', 'error');
          return;
        }

        setOrders(prev => [offlineOrder, ...prev]);
        setIsCreateOpen(false);
        resetCreateForm();
        showToast(`أوفلاين: تم حفظ الطلب محلياً! سيتم رفعه تلقائياً عند الاتصال بالإنترنت 📡`, 'warning');
        return;
      }

      const newOrder = await orderApi.createOrder(payload);
      
      // 6. تحديث الاستيت المحلية بنجاح
      setOrders(prev => [newOrder, ...prev]);
      setIsCreateOpen(false);
      resetCreateForm();
      
      if (typeof fetchInventoryStats === 'function') fetchInventoryStats();

      // التنبيه الذكي للمستخدم
      if (newOrder.darb_shipment_warning) {
        showToast(`تم حفظ الطلب محلياً (#${newOrder.id}) ولكن تعثر إرساله لدرب السبيل تلقائياً: ${newOrder.darb_shipment_warning}`, 'warning', 8000);
      } else if (newOrder.tracking_number) {
        showToast(`تم إنشاء الطلب #${newOrder.id} وتجهيز بوليصة درب السبيل (${newOrder.tracking_number}) بنجاح 🚀`, 'success', 6000);
      } else {
        showToast(`تم إنشاء الطلب رقم #${newOrder.id} بنجاح`);
      }
    } catch (err) {
      if (isNetworkError(err)) {
        // payload مبني خارج try ويحتوي على العنوان الصحيح (المدينة + المنطقة + التفاصيل)
        const savedOffline = await saveOfflineAction('CREATE_ORDER', payload, `إنشاء طلب لـ ${payload.customer_name}`);

        if (!savedOffline) {
          showToast('تعذّر حفظ الطلب محلياً! لا تغلق الصفحة وحاول مرة أخرى.', 'error');
          return;
        }

        setIsCreateOpen(false);
        resetCreateForm();
        showToast(`أوفلاين: تم حفظ الطلب محلياً! سيتم رفعه تلقائياً عند الاتصال 📡`, 'warning');
      } else {
        const backendMessage = err.response?.data?.message || err.message || 'حدث خطأ أثناء إنشاء الطلب';
        showToast(backendMessage, 'error');
      }
    } finally {
      setIsSaving(false);
    }
  };

  // ========= إرسال شحنة درب السبيل وتغيير الحالة فوراً إلى تم اسناده للتوصيل =========
  const handleSendSelectedOrderToDarbDirectly = async (e) => {
    if (e) e.preventDefault();
    if (!selectedOrder) return;

    const shipmentData = {
      service: selectedDarbService || '67f19a776dabff22987169e9',
      city: selectedDarbCity || 'طرابلس',
      area: selectedDarbArea || 'وسط المدينة',
      address: darbDetailedAddress.trim() || selectedOrder.address,
      paymentBy: selectedDarbPaymentBy || 'receiver',
      delivery_gender: deliveryGender || 'رجالي',
      notes: selectedOrder.notes
    };

    // دعم الأوفلاين الكامل: حفظ العملية محلياً وتحديث الواجهة فوراً
    if (!navigator.onLine) {
      const saved = await saveOfflineAction(
        'SEND_DARB_SHIPMENT',
        { order_id: selectedOrder.id, shipment_data: shipmentData },
        `إرسال شحنة درب السبيل للطلب #${selectedOrder.id}`
      );
      if (!saved) {
        showToast('تعذر حفظ العملية محلياً! حاول مرة أخرى 📡', 'error');
        return;
      }

      setSelectedOrder(prev => ({
        ...prev,
        shipping_provider: 'darb_assabil',
        status: 'تم اسناده للتوصيل',
        delivery_man_name: 'درب السبيل (بانتظار المزامنة ⏳)'
      }));

      setOrders(prev => prev.map(o => o.id === selectedOrder.id ? {
        ...o,
        shipping_provider: 'darb_assabil',
        status: 'تم اسناده للتوصيل',
        delivery_man_name: 'درب السبيل (بانتظار المزامنة ⏳)'
      } : o));

      setIsDarbModalOpen(false);
      showToast('أوفلاين: تم حفظ شحنة درب السبيل محلياً! سيتم إرسالها تلقائياً عند الاتصال بالإنترنت 📡', 'warning', 6000);
      return;
    }

    setIsSendingDarb(true);
    try {
      const res = await orderApi.createDarbShipment(selectedOrder.id, shipmentData);

      const updatedTracking = res.tracking_number;
      const updatedShipmentId = res.shipment_id;
      const msg = res.message || (updatedTracking ? `تم إرسال الشحنة لدرب السبيل برقم تتبع: ${updatedTracking} 🚀` : 'تم إسناد الشحنة لدرب السبيل وتحديث الحالة إلى تم اسناده للتوصيل');

      showToast(msg, res.status === 'warning' ? 'warning' : 'success', 6000);

      setSelectedOrder(prev => ({
        ...prev,
        shipping_provider: 'darb_assabil',
        tracking_number: updatedTracking || prev?.tracking_number,
        shipment_id: updatedShipmentId || prev?.shipment_id,
        status: 'تم اسناده للتوصيل',
        delivery_man_name: updatedTracking ? `درب السبيل (${updatedTracking})` : 'شركة درب السبيل'
      }));

      setOrders(prev => prev.map(o => o.id === selectedOrder.id ? {
        ...o,
        shipping_provider: 'darb_assabil',
        tracking_number: updatedTracking || o.tracking_number,
        shipment_id: updatedShipmentId || o.shipment_id,
        status: 'تم اسناده للتوصيل',
        delivery_man_name: updatedTracking ? `درب السبيل (${updatedTracking})` : 'شركة درب السبيل'
      } : o));

      setIsDarbModalOpen(false);
    } catch (err) {
      if (isNetworkError(err)) {
        await saveOfflineAction(
          'SEND_DARB_SHIPMENT',
          { order_id: selectedOrder.id, shipment_data: shipmentData },
          `إرسال شحنة درب السبيل للطلب #${selectedOrder.id}`
        );
        setSelectedOrder(prev => ({
          ...prev,
          shipping_provider: 'darb_assabil',
          status: 'تم اسناده للتوصيل',
          delivery_man_name: 'درب السبيل (بانتظار المزامنة ⏳)'
        }));
        setOrders(prev => prev.map(o => o.id === selectedOrder.id ? {
          ...o,
          shipping_provider: 'darb_assabil',
          status: 'تم اسناده للتوصيل',
          delivery_man_name: 'درب السبيل (بانتظار المزامنة ⏳)'
        } : o));
        setIsDarbModalOpen(false);
        showToast('انقطع الاتصال: تم حفظ إسناد الشحنة لدرب السبيل محلياً وسيتم إرسالها تلقائياً 📡', 'warning', 6000);
        return;
      }
      showToast(typeof err === 'string' ? err : 'تعذر إرسال الشحنة لشركة درب السبيل', 'error');
    } finally {
      setIsSendingDarb(false);
    }
  };


// ========= إضافة متغير للطلب (مربوط مع المخزون والتنبيهات المحلية المخصصة) =========
// مُثبّتة بـ useCallback: تُمرَّر لكل عناصر قائمة المنتجات، ولو تغيّرت هويتها
// في كل تصيير لأبطلت React.memo وأعادت تصيير القائمة كاملة مع كل ضغطة مفتاح.
const addVariantToOrder = useCallback((variant, colorName, productName, sizeName) => {
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
    setSelectedVariants(prev => [...prev, { variant_id: variant.id, quantity: 1, label, stock: availableStock, allow_inspection: false, allow_try_on: false }]);
    
    showToast(`تم إضافة الصنف للطلب بنجاح`, 'success');
  }
}, [selectedVariants, showToast]);


const removeVariant = (variantId) => {
  setSelectedVariants(prev => prev.filter(v => v.variant_id !== variantId));
};

const toggleVariantPermission = (variantId, field) => {
  setSelectedVariants(prev => prev.map(v =>
    v.variant_id === variantId ? { ...v, [field]: !v[field] } : v
  ));
};

const updateVariantQty = (variantId, qty) => {
  const n = parseInt(qty, 10);
  if (n < 1) { removeVariant(variantId); return; }

  // ✅ إصلاح BUG-08: حساب الشرط خارج setState تماماً لمنع side-effects في React 18 Strict Mode
  const target = selectedVariants.find(v => v.variant_id === variantId);
  if (target && n > target.stock) {
    showToast(`نعتذر منك، المخزون لا يكفي! المتاح في المستودع هو (${target.stock}) قطع فقط.`, 'error');
    return;
  }
  setSelectedVariants(prev => prev.map(v => v.variant_id === variantId ? { ...v, quantity: n } : v));
};

// ========= دوال إدارة المنتجات داخل نافذة تعديل الطلب =========
const addVariantToEditOrder = useCallback((variant, colorName, productName, sizeName) => {
  const label = `${productName} - ${colorName} - ${sizeName}`;
  const availableStock = variant.quantity_available !== undefined ? variant.quantity_available : 0;

  const exists = editSelectedVariants.find(v => v.variant_id === variant.id);
  if (exists) {
    if (exists.quantity >= exists.stock) {
      showToast(`وصلت للحد الأقصى المتاح في المخزون (${exists.stock} قطع).`, 'error');
      return;
    }
    setEditSelectedVariants(prev => prev.map(v =>
      v.variant_id === variant.id ? { ...v, quantity: v.quantity + 1 } : v
    ));
    showToast(`تمت زيادة كمية الصنف`, 'success');
  } else {
    if (availableStock <= 0) {
      showToast(`عذراً، الصنف (${label}) غير متوفر في المخزون حالياً!`, 'error');
      return;
    }
    const itemPrice = Number(variant.selling_price ?? variant.price ?? 0);
    setEditSelectedVariants(prev => [...prev, {
      variant_id: variant.id,
      quantity: 1,
      label,
      stock: availableStock,
      price: itemPrice,
      allow_inspection: false,
      allow_try_on: false
    }]);
    showToast(`تمت إضافة الصنف للطلب بنجاح`, 'success');
  }
}, [editSelectedVariants, showToast]);

const removeEditVariant = (variantId) => {
  setEditSelectedVariants(prev => prev.filter(v => v.variant_id !== variantId));
};

const toggleEditVariantPermission = (variantId, field) => {
  setEditSelectedVariants(prev => prev.map(v =>
    v.variant_id === variantId ? { ...v, [field]: !v[field] } : v
  ));
};

const updateEditVariantQty = (variantId, qty) => {
  const n = parseInt(qty, 10);
  if (n < 1) { removeEditVariant(variantId); return; }

  const target = editSelectedVariants.find(v => v.variant_id === variantId);
  if (target && n > target.stock) {
    showToast(`المخزون لا يكفي! المتاح هو (${target.stock}) قطع فقط.`, 'error');
    return;
  }
  setEditSelectedVariants(prev => prev.map(v => v.variant_id === variantId ? { ...v, quantity: n } : v));
};

  // ========= حذف الطلب =========
  const handleDeleteOrder = async () => {
    if (!selectedOrder) return;

    if (
      selectedOrder.status === 'تم اسناده للتوصيل' ||
      selectedOrder.status === 'جاري الشحن' ||
      selectedOrder.status === 'shipped' ||
      selectedOrder.status === 'تم التوصيل' ||
      selectedOrder.status === 'delivered'
    ) {
      showToast('لا يمكن إلغاء الطلب بعد إسناده للتوصيل ⚠️', 'error');
      return;
    }

    if (!navigator.onLine) {
      showToast('لا يمكن إلغاء الطلب بدون اتصال بالإنترنت. يجب الاتصال أولاً لضمان إعادة الكميات للمخزون 📡', 'error');
      return;
    }

    if (!window.confirm(`هل أنت متأكد من إلغاء الطلب رقم #${selectedOrder.id}؟`)) return;
    setIsDeleting(true);
    try {
      await orderApi.deleteOrder(selectedOrder.id);
      setOrders(prev => prev.filter(o => o.id !== selectedOrder.id));
      setIsDetailOpen(false);
      setSelectedOrder(null);
      fetchInventoryStats();
      showToast('تم إلغاء الطلب وإعادة الكميات للمخزون', 'warning');
    } catch (err) {
      if (isNetworkError(err)) {
        showToast('انقطع الاتصال. لم يُحذف الطلب — أعد المحاولة عند عودة الاتصال 📡', 'error');
      } else {
        showToast(typeof err === 'string' ? err : 'حدث خطأ أثناء حذف الطلب', 'error');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  // ========= إسناد سائق توصيل خاص وتحديث الحالة إلى تم اسناده للتوصيل =========
  const handleAssignLocalDelivery = async () => {
    if (!selectedOrder) return;
    if (!localDriverName.trim()) {
      showToast('يرجى إدخال اسم السائق أو المندوب', 'error');
      return;
    }

    const driverName = localDriverName.trim();
    setIsAssigning(true);

    // دعم الأوفلاين: حفظ التغيير محلياً وتحديث الواجهة فوراً
    if (!navigator.onLine) {
      const saved = await saveOfflineAction(
        'UPDATE_ORDER',
        { id: selectedOrder.id, data: { status: 'shipped', delivery_info: `توصيل خاص — ${driverName}` } },
        `إسناد توصيل خاص للطلب #${selectedOrder.id} — ${driverName}`
      );
      setIsAssigning(false);
      if (!saved) {
        showToast('تعذّر حفظ الإسناد محلياً! حاول مرة أخرى 📡', 'error');
        return;
      }
      setSelectedOrder(prev => ({ ...prev, delivery_man_name: driverName, status: 'تم اسناده للتوصيل', shipping_provider: 'local' }));
      setOrders(prev => prev.map(o => o.id === selectedOrder.id ? { ...o, delivery_man_name: driverName, status: 'تم اسناده للتوصيل', shipping_provider: 'local' } : o));
      showToast('أوفلاين: تم حفظ إسناد الطلب محلياً! سيُزامن تلقائياً عند الاتصال 📡', 'warning');
      setLocalDriverName('');
      return;
    }

    try {
      const updated = await orderApi.assignDelivery(selectedOrder.id, driverName, 'توصيل خاص');
      const arabicStatus = mapStatusToArabic(updated.status) || 'تم اسناده للتوصيل';
      setSelectedOrder(prev => ({ ...prev, delivery_man_name: driverName, status: arabicStatus, shipping_provider: 'local' }));
      setOrders(prev => prev.map(o => o.id === (updated.id || selectedOrder.id) ? { ...o, delivery_man_name: driverName, status: arabicStatus, shipping_provider: 'local' } : o));
      showToast('تم إسناد السائق وتحديث الحالة إلى "تم اسناده للتوصيل" بنجاح', 'success');
      setLocalDriverName('');
    } catch (err) {
      if (isNetworkError(err)) {
        const saved = await saveOfflineAction(
          'UPDATE_ORDER',
          { id: selectedOrder.id, data: { status: 'shipped', delivery_info: `توصيل خاص — ${driverName}` } },
          `إسناد توصيل خاص للطلب #${selectedOrder.id} — ${driverName}`
        );
        if (saved) {
          setSelectedOrder(prev => ({ ...prev, delivery_man_name: driverName, status: 'تم اسناده للتوصيل', shipping_provider: 'local' }));
          setOrders(prev => prev.map(o => o.id === selectedOrder.id ? { ...o, delivery_man_name: driverName, status: 'تم اسناده للتوصيل', shipping_provider: 'local' } : o));
          showToast('أوفلاين: تم حفظ إسناد الطلب محلياً! سيُزامن عند الاتصال 📡', 'warning');
          setLocalDriverName('');
        } else {
          showToast('انقطع الاتصال وتعذّر الحفظ محلياً! أعد المحاولة.', 'error');
        }
      } else {
        showToast(typeof err === 'string' ? err : 'حدث خطأ أثناء إسناد الشحن', 'error');
      }
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

    fetchAvailableProducts();
    loadDarbDataIfNeeded();

    const phones = Array.isArray(selectedOrder.customer_phones) && selectedOrder.customer_phones.length > 0
      ? [...selectedOrder.customer_phones]
      : selectedOrder.customer_phones
        ? [selectedOrder.customer_phones]
        : [''];

    let city = selectedDarbCity || 'طرابلس';
    let area = selectedDarbArea || '';
    let detailed = selectedOrder.address || '';

    if (selectedOrder.address && selectedOrder.address.includes(' - ')) {
      const parts = selectedOrder.address.split(' - ');
      if (parts.length >= 2) {
        city = parts[0].trim();
        area = parts[1].trim();
        detailed = parts.slice(2).join(' - ').trim() || parts[1].trim();
      }
    }

    setEditDarbCity(city);
    setEditDarbArea(area);
    setEditDarbDetailedAddress(detailed);
    setEditShippingProvider(selectedOrder.shipping_provider || 'darb_assabil');
    setEditDarbService(selectedOrder.darb_service_id || selectedDarbService || '67f19a776dabff22987169e9');
    setEditDarbPaymentBy(selectedOrder.darb_payment_by || selectedDarbPaymentBy || 'receiver');

    setEditForm({
      customer_name:       selectedOrder.customer_name       || '',
      customer_phones:     phones,
      address:             selectedOrder.address              || '',
      social_media_source: selectedOrder.social_media_source || '',
      notes:               selectedOrder.notes               || '',
    });

    const existingVariants = (selectedOrder.items || [])
      .filter(it => it.deleted_at == null)
      .map(it => {
        const v = it.variant || {};
        const prod = it.product || {};
        const colorName = v.color?.color_name || it.color_name || '';
        const sizeName = v.size?.name || it.size || '';
        const prodName = prod.name || it.product_name || 'منتج';
        const label = `${prodName} ${colorName ? `(${colorName} - ${sizeName})` : ''}`.trim();
        const availableQty = (v.quantity_available ?? 0) + (it.quantity || 1);

        return {
          variant_id: it.variant_id || v.id,
          quantity: it.quantity || 1,
          label: label,
          stock: availableQty,
          price: Number(it.price_at_order || v.selling_price || 0),
          allow_inspection: !!it.allow_inspection,
          allow_try_on: !!it.allow_try_on,
        };
      });

    setEditSelectedVariants(existingVariants);
    setEditShowProductsSection(false);
    setIsEditOpen(true);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();

    const cleanedPhones = Array.isArray(editForm.customer_phones)
      ? editForm.customer_phones.map(p => p.trim()).filter(Boolean)
      : editForm.customer_phones ? [editForm.customer_phones.trim()] : [];

    if (!editForm.customer_name.trim() || cleanedPhones.length === 0) {
      showToast('يرجى إدخال اسم العميل ورقم هاتف واحد على الأقل', 'error');
      return;
    }

    if (editSelectedVariants.length === 0) {
      showToast('يرجى إضافة منتج واحد على الأقل للطلب', 'error');
      return;
    }

    setIsSaving(true);

    const finalAddress = (editShippingProvider === 'darb_assabil' && editDarbCity)
      ? `${editDarbCity} - ${editDarbArea || 'وسط المدينة'} - ${editDarbDetailedAddress || editForm.address}`.trim()
      : (editForm.address.trim() || editDarbDetailedAddress.trim());

    const payload = {
      customer_name:       editForm.customer_name.trim(),
      customer_phones:     cleanedPhones,
      address:             finalAddress,
      social_media_source: editForm.social_media_source?.trim() || null,
      notes:               editForm.notes?.trim() || null,
      shipping_provider:   editShippingProvider,
      darb_city:           editDarbCity || null,
      darb_area:           editDarbArea || null,
      darb_service_id:     editDarbService || null,
      darb_payment_by:     editDarbPaymentBy || 'receiver',
      items: editSelectedVariants.map(v => ({
        variant_id:       v.variant_id,
        quantity:         v.quantity,
        allow_inspection: !!v.allow_inspection,
        allow_try_on:     !!v.allow_try_on
      }))
    };

    // تطبيق التحديث على الواجهة فوراً (optimistic update)
    const applyLocalEdit = (updatedOrderData = null) => {
      setSelectedOrder(prev => ({
        ...prev,
        customer_name:       payload.customer_name,
        customer_phones:     payload.customer_phones,
        address:             payload.address,
        social_media_source: payload.social_media_source,
        notes:               payload.notes,
        total_price:         updatedOrderData?.total_price || prev.total_price,
        items: updatedOrderData?.items || prev.items,
      }));
      setOrders(prev => prev.map(o =>
        o.id === selectedOrder.id
          ? {
              ...o,
              customer_name: payload.customer_name,
              address:       payload.address,
              notes:         payload.notes,
              total_price:   updatedOrderData?.total_price || o.total_price
            }
          : o
      ));
      setIsEditOpen(false);
    };

    // دعم الأوفلاين: حفظ التعديل محلياً وتحديث الواجهة فوراً
    if (!navigator.onLine) {
      const saved = await saveOfflineAction(
        'UPDATE_ORDER',
        { id: selectedOrder.id, data: payload },
        `تعديل بيانات الطلب #${selectedOrder.id}`
      );
      setIsSaving(false);
      if (!saved) {
        showToast('تعذّر حفظ التعديل محلياً! حاول مرة أخرى 📡', 'error');
        return;
      }
      applyLocalEdit();
      showToast('أوفلاين: تم حفظ التعديل محلياً! سيُزامن تلقائياً عند الاتصال 📡', 'warning');
      return;
    }

    try {
      const updated = await orderApi.updateOrder(selectedOrder.id, payload);
      try {
        const freshDetails = await orderApi.getOrderDetails(selectedOrder.id);
        applyLocalEdit(freshDetails);
      } catch (e) {
        applyLocalEdit(updated);
      }
      fetchInventoryStats();
      showToast('تم تحديث بيانات الطلب والمنتجات بنجاح ✅');
    } catch (err) {
      if (isNetworkError(err)) {
        const saved = await saveOfflineAction(
          'UPDATE_ORDER',
          { id: selectedOrder.id, data: payload },
          `تعديل بيانات الطلب #${selectedOrder.id}`
        );
        if (saved) {
          applyLocalEdit();
          showToast('أوفلاين: تم حفظ التعديل محلياً! سيُزامن عند الاتصال 📡', 'warning');
        } else {
          showToast('انقطع الاتصال وتعذّر الحفظ محلياً! أعد المحاولة.', 'error');
        }
      } else {
        showToast(typeof err === 'string' ? err : 'حدث خطأ أثناء التعديل', 'error');
      }
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
    const root = inventoryStats?.data || inventoryStats || {};
    const inv = root.inventory || {};
    const totalInv = inv.total_inventory ?? 0;
    const totalRes = inv.total_reserved ?? 0;

    return {
      actual:    typeof totalInv === 'number' ? totalInv : '-',
      reserved:  typeof totalRes === 'number' ? totalRes : '-',
      // ✅ إصلاح BUG-13: تحديد القيمة بحد أدنى 0 لمنع ظهور رقم سالب
      available: (typeof totalInv === 'number' && typeof totalRes === 'number')
                   ? Math.max(0, totalInv - totalRes)
                   : '-',
      // عدادات الطلبيات محسوبة حياً من المصفوفة
      pendingOrders:    orders.filter(o => o.status === 'معلق').length,
      processingOrders: orders.filter(o => o.status === 'قيد التجهيز').length,
      readyOrders:      orders.filter(o => o.status === 'تم التجهيز').length,
      shippingOrders:   orders.filter(o => o.status === 'تم اسناده للتوصيل' || o.status === 'جاري الشحن').length,
    };
  }, [inventoryStats, orders]);

  // ملاحظة: منطق بحث وفلترة وعرض المنتجات انتقل إلى
  // components/products/ProductPicker.jsx ليُستخدم هنا وفي البيع السريع معاً.

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
            {/* زر "الوصول السريع (بيع مباشر)" انتقل إلى زر المسح في الشريط
                الجانبي ضمن تبويب "بيع" — ليكون كل ما يخص البيع في مكان واحد. */}
            <button
              onClick={() => { setIsCreateOpen(true); fetchAvailableProducts(); loadDarbDataIfNeeded(); }}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#800000] text-white hover:bg-[#660000] active:scale-95 transition-all shadow-sm shadow-[#800000]/20"
            >
              <Plus className="h-4 w-4" />
              <span>طلب جديد</span>
            </button>
          </div>
        </div>

   {/* ===== إحصائيات الطلبيات والحالات اليومية المتزامنة فورياً (2 أعمدة و 2 صفوف على الهاتف) ===== */}
   <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 mb-6">
          {[
            { 
              label: 'طلبات معلقة', 
              value: statsData.pendingOrders, 
              bg: 'bg-amber-50', 
              text: 'text-amber-600', 
              border: 'border-amber-200/80', 
              icon: <Clock className="h-4 w-4 sm:h-5 sm:w-5" /> 
            },
            { 
              label: 'قيد التجهيز', 
              value: statsData.processingOrders, 
              bg: 'bg-blue-50', 
              text: 'text-blue-600', 
              border: 'border-blue-200/80', 
              icon: <PackageOpen className="h-4 w-4 sm:h-5 sm:w-5" /> 
            },
            { 
              label: 'تم التجهيز', 
              value: statsData.readyOrders, 
              bg: 'bg-emerald-50', 
              text: 'text-emerald-600', 
              border: 'border-emerald-200/80', 
              icon: <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5" /> 
            },
            { 
              label: 'تم اسناده للتوصيل', 
              value: statsData.shippingOrders, 
              bg: 'bg-purple-50', 
              text: 'text-purple-600', 
              border: 'border-purple-200/80', 
              icon: <Truck className="h-4 w-4 sm:h-5 sm:w-5" /> 
            },
          ].map(({ label, value, bg, text, border, icon }) => (
            <div 
              key={label} 
              className={`bg-white border ${border} p-3 sm:p-4 rounded-xl sm:rounded-2xl shadow-xs hover:shadow-md transition-all flex items-center justify-between gap-2`}
            >
              <div className="space-y-0.5 sm:space-y-1 min-w-0">
                <span className="text-[11px] sm:text-xs text-slate-500 font-semibold block truncate">{label}</span>
                <div className={`text-lg sm:text-2xl font-black ${text} tracking-tight flex items-baseline gap-1`}>
                  <span>{value}</span>
                  <span className="text-[10px] sm:text-xs text-slate-400 font-normal">طلب</span>
                </div>
              </div>
              <div className={`h-8 w-8 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl ${bg} flex items-center justify-center shrink-0 ${text}`}>
                {icon}
              </div>
            </div>
          ))}
        </div>
        {/* ===== البحث والفلترة ===== */}
        <div className="space-y-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative rounded-xl flex-1">
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-400" />
              </div>
              <input
                ref={searchRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="block w-full pr-10 pl-3 py-2.5 border border-slate-200 rounded-xl text-xs sm:text-sm bg-slate-50/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#800000]/10 focus:border-[#800000] transition-all placeholder:text-slate-400"
                placeholder="ابحث بالاسم أو رقم الهاتف أو رقم الطلب..."
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
                className="block w-full pr-10 pl-3 py-2.5 border border-slate-200 rounded-xl text-xs sm:text-sm bg-slate-50/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#800000]/10 focus:border-[#800000] transition-all text-slate-700 font-medium"
              >
                <option value="الكل">كل الموظفين</option>
                {employeesList.map(emp => (
                  <option key={emp.id} value={emp.name}>{emp.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* شريط تبويبات الحالات مع مسافات واضحة وتصميم مريح على الهاتف والديسكتوب */}
          <div className="flex gap-2 sm:gap-2.5 overflow-x-auto pb-1.5 pt-0.5 scrollbar-none items-center">
            {['الكل', 'معلق', 'قيد التجهيز', 'تم التجهيز', 'تم اسناده للتوصيل', 'ملغي'].map(tab => {
              const isActive = activeFilter === tab;
              const count = filterCounts[tab] ?? 0;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveFilter(tab)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border flex items-center gap-2 shrink-0 select-none active:scale-95 ${
                    isActive
                      ? 'bg-[#800000] text-white border-[#800000] shadow-sm shadow-[#800000]/20'
                      : 'bg-slate-50/70 border-slate-200 text-slate-600 hover:bg-white hover:text-[#800000] hover:border-[#800000]/30'
                  }`}
                >
                  <span>{tab}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center transition-all ${
                    isActive 
                      ? 'bg-white/20 text-white' 
                      : 'bg-white border border-slate-200 text-slate-600'
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
                onClick={() => { setIsCreateOpen(true); fetchAvailableProducts(); loadDarbDataIfNeeded(); }}
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
                        الإجمالي: <span className="font-bold text-slate-700">{Number(order.total_price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} د.ل</span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between md:justify-end gap-4 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <StatusBadge status={order.status} />
                    {order.created_at && (
                      <span className="text-[10px] text-slate-400 font-medium">
                        {new Date(order.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
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

              {/* بيانات العميل الأساسية */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                  <User className="h-4 w-4 text-[#800000]" />
                  <h3 className="text-xs font-bold text-slate-800">بيانات العميل الأساسية</h3>
                </div>

                {/* اسم العميل */}
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

                {/* أرقام التواصل */}
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

                  {/* الحقول الإضافية */}
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

                {/* قسم بيانات الشحن وعنوان التوصيل الموحد */}
                <div className="space-y-3 bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200/80">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Truck className="h-4 w-4 text-[#800000]" />
                      بيانات الشحن وعنوان التوصيل <span className="text-red-500">*</span>
                    </label>
                  </div>

                  {loadingDarbData ? (
                    <div className="flex items-center justify-center py-4 bg-white rounded-xl border border-slate-200 gap-2 text-xs text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
                      <span>جاري جلب المدن والمناطق...</span>
                    </div>
                  ) : (
                    <>
                      {/* المدينة والمنطقة المتسلسلة */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-700 block">
                            المدينة <span className="text-red-500">*</span>
                          </label>
                          <select
                            value={selectedDarbCity}
                            onChange={e => handleDarbCityChange(e.target.value)}
                            className="w-full text-xs px-3 py-2.5 border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-[#800000] focus:ring-2 focus:ring-[#800000]/10 text-slate-800 font-medium"
                          >
                            {sortedDarbCities.map(city => (
                              <option key={city} value={city}>
                                {city}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-700 block">
                            المنطقة <span className="text-red-500">*</span>
                          </label>
                          <select
                            value={selectedDarbArea}
                            onChange={e => setSelectedDarbArea(e.target.value)}
                            className="w-full text-xs px-3 py-2.5 border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-[#800000] focus:ring-2 focus:ring-[#800000]/10 text-slate-800 font-medium"
                          >
                            {availableAreasForSelectedCity.map(area => (
                              <option key={area} value={area}>
                                {area}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* العنوان التفصيلي */}
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-700 block">
                          العنوان التفصيلي (الشارع / أقرب نقطة دالة) <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="مثال: بالقرب من جامع الصقع، عمارة 4"
                          value={darbDetailedAddress}
                          onChange={e => setDarbDetailedAddress(e.target.value)}
                          className="w-full text-xs px-3 py-2.5 border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-[#800000] focus:ring-2 focus:ring-[#800000]/10 text-slate-800"
                        />
                      </div>

                      {/* باقة الخدمة وجهة دفع الشحن (درب السبيل) */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {/* باقة الخدمة الرسمية من درب السبيل */}
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-700 block">
                            نوع باقة الخدمة (درب السبيل) <span className="text-red-500">*</span>
                          </label>
                          <select
                            value={selectedDarbService}
                            onChange={e => {
                              setSelectedDarbService(e.target.value);
                              const srv = darbServices.find(s => s.id === e.target.value);
                              if (srv) setDeliveryGender(srv.name.includes('نسائي') ? 'نسائي' : 'رجالي');
                            }}
                            className="w-full text-xs px-3 py-2.5 border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-[#800000] focus:ring-2 focus:ring-[#800000]/10 text-slate-800 font-medium"
                          >
                            {darbServices.map(srv => (
                              <option key={srv.id} value={srv.id}>
                                {srv.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* جهة دفع الشحن */}
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-700 block">
                            جهة دفع الشحن <span className="text-red-500">*</span>
                          </label>
                          <select
                            value={selectedDarbPaymentBy}
                            onChange={e => setSelectedDarbPaymentBy(e.target.value)}
                            className="w-full text-xs px-3 py-2.5 border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-[#800000] focus:ring-2 focus:ring-[#800000]/10 text-slate-800 font-medium"
                          >
                            <option value="receiver">المستلم (الزبون يدفع)</option>
                            <option value="sender">المرسل (المتجر يدفع)</option>
                          </select>
                        </div>
                      </div>
                    </>
                  )}
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
                    <label className="text-xs font-medium text-slate-600 block">ملاحظات خاصة بالطلب والتوصيل</label>
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
                      <ProductPicker
                        products={availableProducts}
                        onAddVariant={addVariantToOrder}
                      />
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

                    <div className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
                      {selectedVariants.map(v => (
                        <div key={v.variant_id} className="bg-white border border-slate-100 rounded-xl shadow-sm transition-all hover:border-slate-200 overflow-hidden">
                          {/* الصف الأول: اسم المنتج + أزرار الكمية */}
                          <div className="flex items-center justify-between gap-3 p-2.5">
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

                          {/* الصف الثاني: صلاحيات الفتح والقياس */}
                          <div className="flex items-center gap-2 px-2.5 pb-2 border-t border-slate-50 pt-1.5">
                            <button
                              type="button"
                              onClick={() => toggleVariantPermission(v.variant_id, 'allow_inspection')}
                              className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all ${
                                v.allow_inspection
                                  ? 'bg-amber-50 text-amber-700 border-amber-300 shadow-sm'
                                  : 'bg-slate-50 text-slate-400 border-slate-200 hover:border-slate-300'
                              }`}
                            >
                              <span className={`w-2 h-2 rounded-full ${v.allow_inspection ? 'bg-amber-400' : 'bg-slate-300'}`} />
                              يسمح الفتح
                            </button>

                            <button
                              type="button"
                              onClick={() => toggleVariantPermission(v.variant_id, 'allow_try_on')}
                              className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all ${
                                v.allow_try_on
                                  ? 'bg-blue-50 text-blue-700 border-blue-300 shadow-sm'
                                  : 'bg-slate-50 text-slate-400 border-slate-200 hover:border-slate-300'
                              }`}
                            >
                              <span className={`w-2 h-2 rounded-full ${v.allow_try_on ? 'bg-blue-400' : 'bg-slate-300'}`} />
                              يسمح القياس
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
              <button onClick={handleCloseDetail} className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100">
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

                    {/* قسم تفاصيل الشحن وبوليصة درب السبيل */}
                    <div className="sm:col-span-2 bg-slate-50/80 border border-slate-200/80 rounded-xl p-2.5 space-y-2 mt-1">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                          <Truck className="h-3.5 w-3.5 text-[#800000]" />
                          <span>طريقة الشحن والتوصيل:</span>
                          {selectedOrder.shipping_provider === 'darb_assabil' ? (
                            <span className="bg-amber-100 text-amber-800 text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 border border-amber-300">
                              <Zap className="h-3 w-3 text-amber-600" />
                              شركة درب السبيل
                            </span>
                          ) : (
                            <span className="bg-slate-200 text-slate-700 text-[10px] px-2 py-0.5 rounded-full font-bold">
                              توصيل محلي / خاص
                            </span>
                          )}
                        </div>

                        {!selectedOrder.tracking_number && (
                          <button
                            type="button"
                            onClick={() => {
                              loadDarbDataIfNeeded();
                              setDarbDetailedAddress(selectedOrder?.address || '');
                              setIsDarbModalOpen(true);
                            }}
                            className="flex items-center gap-1 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-800 text-[10px] font-bold px-2.5 py-1 rounded-lg transition-all shadow-sm active:scale-95"
                          >
                            <Zap className="h-3 w-3 text-amber-600" />
                            <span>إرسال لدرب السبيل</span>
                          </button>
                        )}
                      </div>

                      {/* رقم التتبع والبوليصة إن وجد */}
                      {selectedOrder.tracking_number ? (
                        <div className="flex items-center justify-between bg-white border border-amber-200/80 rounded-lg p-2 text-xs">
                          <div className="flex items-center gap-1.5">
                            <BadgeCheck className="h-4 w-4 text-emerald-600" />
                            <span className="text-slate-600 font-medium">رقم التتبع / البوليصة:</span>
                            <span className="font-mono font-bold text-amber-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                              {selectedOrder.tracking_number}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCopyToClipboard(selectedOrder.tracking_number, 'تم نسخ رقم تتبع الشحنة')}
                            className="flex items-center gap-1 text-[10px] font-bold text-amber-700 hover:bg-amber-50 px-2 py-1 rounded border border-amber-200 transition-all active:scale-95"
                          >
                            <Copy className="h-3 w-3" />
                            <span>نسخ</span>
                          </button>
                        </div>
                      ) : selectedOrder.shipping_provider === 'darb_assabil' ? (
                        <div className="text-[11px] text-amber-700 bg-amber-50/70 p-1.5 rounded border border-amber-100 flex items-center gap-1">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                          <span>الشحنة معلقة أو لم يتم إصدار البوليصة بعد. يمكنك الضغط على الزر أعلاه لإعادة الإرسال.</span>
                        </div>
                      ) : null}
                    </div>
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
                      onClick={() => setIsScannerOpen(true)}
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
                {item.picked_quantity ?? 0} / {item.quantity ?? item.qty ?? 0}
              </span>
            </div>

            {/* زر مسح يدوي المخصص لكل سطر منتج منفرد */}
            {(() => {
              const picked = item.picked_quantity ?? 0;
              const total  = item.quantity ?? item.qty ?? 0;
              const isDone = total > 0 && picked >= total;
              return (
                <button
                  type="button"
                  disabled={isScanning || isDone}
                  onClick={() => handleManualScan(item.variant_id)}
                  className="bg-[#800000]/5 hover:bg-[#800000] text-[#800000] hover:text-white disabled:opacity-40 disabled:hover:bg-[#800000]/5 disabled:hover:text-[#800000] disabled:cursor-not-allowed px-2.5 py-1.5 rounded-lg font-bold text-[11px] transition-all border border-[#800000]/10 active:scale-95 shadow-sm"
                >
                  {isDone ? 'مكتمل ✓' : 'مسح يدوي'}
                </button>
              );
            })()}
          </div>

        </div>
      ))}
    </div>
  ) : (
    <div className="p-6 text-center text-slate-400 text-xs">لا توجد منتجات مضافة لهذا الطلب.</div>
  )}
</div>
                </div>



                {/* قسم إسناد الشحن والتوصيل الفوري عند اكتمال التجهيز */}
                {(selectedOrder.status === 'تم التجهيز' || selectedOrder.status === 'prepared') && (
                  <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-3.5 animate-fadeIn">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        اكتمل تجهيز كافة الأصناف! اختر طريقة إسناد التوصيل:
                      </span>
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                        جاهز للإسناد
                      </span>
                    </div>

                    {/* تبديل طريقة الإسناد بين درب السبيل وتوصيل خاص */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => { loadDarbDataIfNeeded(); setDeliveryAssignMethod('darb_assabil'); }}
                        className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-bold transition-all ${
                          deliveryAssignMethod === 'darb_assabil'
                            ? 'bg-white border-amber-400 text-amber-800 shadow-sm ring-2 ring-amber-400/20'
                            : 'bg-emerald-100/40 border-emerald-200 text-slate-700 hover:bg-white'
                        }`}
                      >
                        <span className={`w-2.5 h-2.5 rounded-full border-2 ${deliveryAssignMethod === 'darb_assabil' ? 'border-amber-500 bg-amber-500' : 'border-slate-400'}`} />
                        <span className="flex items-center gap-1">
                          <span>شركة درب السبيل</span>
                          <Zap className="h-3 w-3 text-amber-500" />
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeliveryAssignMethod('local')}
                        className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-bold transition-all ${
                          deliveryAssignMethod === 'local'
                            ? 'bg-white border-[#800000] text-[#800000] shadow-sm ring-2 ring-[#800000]/10'
                            : 'bg-emerald-100/40 border-emerald-200 text-slate-700 hover:bg-white'
                        }`}
                      >
                        <span className={`w-2.5 h-2.5 rounded-full border-2 ${deliveryAssignMethod === 'local' ? 'border-[#800000] bg-[#800000]' : 'border-slate-400'}`} />
                        <span>توصيل خاص / محلي</span>
                      </button>
                    </div>

                    {/* محتوى خيار درب السبيل */}
                    {deliveryAssignMethod === 'darb_assabil' && (
                      <div className="bg-white border border-amber-200 rounded-xl p-3 space-y-3 text-xs">
                        <div className="flex items-center justify-between text-slate-700 text-[11px]">
                          <span className="font-medium text-slate-500">عنوان التوصيل المسجل:</span>
                          <span className="font-bold text-slate-800">{selectedOrder.address || '—'}</span>
                        </div>

                        {/* تأكيد نوع التوصيل قبل الإرسال لدرب السبيل */}
                        <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2 text-[11px]">
                          <span className="font-bold text-slate-600">نوع المندوب / التوصيل:</span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setDeliveryGender('رجالي')}
                              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                                deliveryGender === 'رجالي'
                                  ? 'bg-blue-50 text-blue-800 border border-blue-200 shadow-xs'
                                  : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                              }`}
                            >
                              👨 رجالي
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeliveryGender('نسائي')}
                              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                                deliveryGender === 'نسائي'
                                  ? 'bg-rose-50 text-rose-800 border border-rose-200 shadow-xs'
                                  : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                              }`}
                            >
                              👩 نسائي
                            </button>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={handleSendSelectedOrderToDarbDirectly}
                          disabled={isSendingDarb}
                          className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 shadow-md transition-all active:scale-95"
                        >
                          {isSendingDarb
                            ? <><Loader2 className="h-4 w-4 animate-spin" /><span>جاري الإرسال...</span></>
                            : <><Zap className="h-4 w-4" /><span>إرسال الشحنة لشركة درب السبيل 🚀</span></>
                          }
                        </button>
                      </div>
                    )}

                    {/* محتوى خيار التوصيل الخاص / المحلي */}
                    {deliveryAssignMethod === 'local' && (
                      <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2.5 text-xs">
                        <div className="space-y-1">
                          <label className="font-bold text-slate-700 block">اسم السائق أو مندوب التوصيل <span className="text-red-500">*</span></label>
                          <input
                            type="text"
                            placeholder="أدخل اسم السائق (مثال: أحمد، مندوب طرابلس...)"
                            value={localDriverName}
                            onChange={e => setLocalDriverName(e.target.value)}
                            className="w-full p-2.5 border border-slate-300 bg-slate-50 focus:bg-white rounded-xl text-xs focus:outline-none focus:border-[#800000] focus:ring-1 focus:ring-[#800000] font-medium"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleAssignLocalDelivery}
                          disabled={isAssigning || !localDriverName.trim()}
                          className="w-full bg-[#800000] hover:bg-[#660000] text-white font-bold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-md active:scale-95 disabled:opacity-50"
                        >
                          {isAssigning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                          <span>حفظ وإسناد للتوصيل</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* إجمالي قيمة الطلب: باللون البرغندي الحاد الصريح وبالأرقام الإنجليزية المنسقة */}
                {selectedOrder.total_price != null && (
                  <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm">
                    <span className="font-bold text-slate-700">إجمالي الطلب:</span>
                    <span className="font-black text-[#800000] text-base font-mono" dir="ltr">
                      {Number(selectedOrder.total_price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} د.ل
                    </span>
                  </div>
                )}

                {/* الفوتر وأزرار التحكم: زر الإلغاء الموحد بالبرغندي والأيقونات التفاعلية */}
                <div className="border-t border-slate-100 pt-4 flex items-center justify-between flex-wrap gap-2">
                  {!(
                    selectedOrder.status === 'تم اسناده للتوصيل' ||
                    selectedOrder.status === 'جاري الشحن' ||
                    selectedOrder.status === 'shipped' ||
                    selectedOrder.status === 'تم التوصيل' ||
                    selectedOrder.status === 'delivered'
                  ) && (
                    <button
                      onClick={handleDeleteOrder}
                      disabled={isDeleting}
                      className="text-xs text-[#800000] hover:text-[#660000] font-bold border border-[#800000]/30 hover:bg-[#800000]/5 px-3 py-2 rounded-lg transition-all flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      إلغاء الطلب
                    </button>
                  )}

                  <button
                    onClick={handleDownloadInvoice}
                    disabled={isDownloading}
                    className="text-xs font-bold border border-slate-300 px-3 py-2 rounded-lg hover:bg-slate-50 transition-all flex items-center gap-1 text-slate-600 disabled:opacity-50 mr-auto"
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
      {/* نافذة ماسح الباركود وQR المباشر لتجهيز الطلب              */}
      {/* ======================================================== */}
      {isScannerOpen && selectedOrder && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-[80] flex flex-col items-center justify-center p-3 sm:p-4 text-white font-sans select-none" dir="rtl">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
            
            {/* الهيدر العلوي الأنيق */}
            <div className="p-4 border-b border-slate-800/80 bg-slate-900/90 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-[#800000] text-white shadow-md">
                  <ScanLine className="h-5 w-5" />
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white">ماسح تجهيز الطلب #{selectedOrder.id}</h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                      {selectedOrder.customer_name}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">وجّه الكاميرا نحو باركود المنتج أو امسح بالجهاز اليدوي</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsScannerOpen(false)}
                className="h-8 w-8 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-all active:scale-95"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto flex-1">
              {/* شريط تقدم التجهيز العام */}
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-300">نسبة اكتمال تجهيز الأصناف</span>
                  <span className="font-mono font-bold text-amber-400">
                    <span dir="ltr">
                      {selectedOrder.total_picked_qty || 0} / {selectedOrder.total_ordered_qty || 0}
                    </span> قطعة ({Math.round(selectedOrder.progress_percentage || 0)}%)
                  </span>
                </div>
                <div className="w-full bg-slate-800/80 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${
                      (selectedOrder.progress_percentage || 0) >= 100 ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50' : 'bg-[#800000]'
                    }`}
                    style={{ width: `${Math.min(selectedOrder.progress_percentage || 0, 100)}%` }}
                  />
                </div>
              </div>

              {/* مربع الكاميرا الفعلي المباشر */}
              <div className="relative h-48 sm:h-52 w-full bg-black rounded-2xl overflow-hidden flex items-center justify-center border border-slate-800 shadow-inner group">
                <div id="order-camera-reader" className="w-full h-full object-cover"></div>

                {scannerCameraStatus !== 'active' && (
                  <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-xs flex flex-col items-center justify-center gap-3 text-white z-10 p-4">
                    {scannerCameraStatus === 'loading' ? (
                      <div className="flex flex-col items-center gap-2">
                        <RefreshCw className="w-6 h-6 animate-spin text-[#800000]" />
                        <span className="text-xs font-bold text-slate-300">جاري فتح الكاميرا...</span>
                      </div>
                    ) : (
                      <>
                        {scannerCameraError && (
                          <p className="text-[11px] font-bold text-amber-300 text-center leading-relaxed max-w-[240px]">
                            {scannerCameraError}
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={startOrderScanner}
                          className="px-5 py-2.5 bg-[#800000] hover:bg-[#990000] text-white font-bold rounded-xl text-xs flex items-center gap-2 transition-all shadow-md active:scale-95"
                        >
                          <Camera className="w-4 h-4" />
                          <span>تشغيل الكاميرا</span>
                        </button>
                      </>
                    )}
                  </div>
                )}

                {scannerCameraStatus === 'active' && (
                  <>
                    {/* إطار المسح الليزري الأنيق والمبسط */}
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-20">
                      <div className="relative w-40 h-40 sm:w-48 sm:h-48 border border-white/15 rounded-2xl">
                        <div className="absolute -top-1 -left-1 w-5 h-5 border-t-2 border-l-2 border-emerald-400 rounded-tl-lg"></div>
                        <div className="absolute -top-1 -right-1 w-5 h-5 border-t-2 border-r-2 border-emerald-400 rounded-tr-lg"></div>
                        <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-2 border-l-2 border-emerald-400 rounded-bl-lg"></div>
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-2 border-r-2 border-emerald-400 rounded-br-lg"></div>
                        
                        <div className="absolute inset-x-2 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse top-1/2 -translate-y-1/2"></div>
                      </div>
                    </div>

                    {/* وميض نجاح أنيق وسلس بدون نصوص مكدسة */}
                    {scannerCooldown && (
                      <div className="absolute inset-0 bg-emerald-950/70 backdrop-blur-[2px] flex items-center justify-center z-30 animate-in fade-in duration-200">
                        <div className="bg-emerald-500/20 border border-emerald-400/50 backdrop-blur-md px-4 py-2 rounded-2xl flex items-center gap-2 text-emerald-300 shadow-xl scale-105 transition-all">
                          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                          <span className="text-xs font-black truncate max-w-[200px]">
                            {scannerFeedback || 'تم المسح بنجاح'}
                          </span>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* خانة إدخال الباركود اليدوي أو مسدس الباركود */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (manualBarcode.trim()) {
                    handleBarcodeScan(manualBarcode);
                  }
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  autoFocus
                  value={manualBarcode}
                  onChange={e => setManualBarcode(e.target.value)}
                  placeholder="أدخل الباركود أو امسح بالمسدس ثم اضغط Enter..."
                  className="flex-1 bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#800000] focus:ring-1 focus:ring-[#800000] text-center font-mono transition-all"
                />
                <button
                  type="submit"
                  disabled={isScanning || !manualBarcode.trim()}
                  className="bg-[#800000] hover:bg-[#990000] disabled:opacity-40 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 shrink-0 flex items-center gap-1"
                >
                  {isScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : 'مسح'}
                </button>
              </form>

              {/* قائمة بنود الطلب التفاعلية مع أزرار المسح الفوري */}
              <div className="space-y-2 text-right">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Package className="h-3.5 w-3.5 text-[#800000]" />
                    بنود الطلب ({selectedOrder.items?.length || 0} أصناف):
                  </span>
                </div>

                <div className="max-h-52 overflow-y-auto space-y-1.5 pr-0.5">
                  {selectedOrder.items && selectedOrder.items.map((item, idx) => {
                    const picked = item.picked_quantity ?? 0;
                    const total  = item.quantity ?? item.qty ?? 1;
                    const isDone = picked >= total;

                    return (
                      <div
                        key={idx}
                        className={`w-full border p-2.5 rounded-xl text-xs transition-all flex items-center justify-between gap-2.5 ${
                          isDone 
                            ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-200' 
                            : 'bg-slate-950/50 border-slate-800 hover:border-slate-700 text-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${isDone ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                          <div className="min-w-0 flex-1">
                            <span className="font-bold block truncate text-slate-100">{item.product_name || item.name}</span>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                              {(item.color_name || item.color) && <span>اللون: {item.color_name || item.color}</span>}
                              {(item.size || item.size_name) && <span>المقاس: {item.size || item.size_name}</span>}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded-lg border ${
                            isDone ? 'bg-emerald-900/40 border-emerald-700 text-emerald-300' : 'bg-slate-800 border-slate-700 text-slate-200'
                          }`} dir="ltr">
                            {picked} / {total}
                          </span>

                          <button
                            type="button"
                            disabled={isDone || isScanning}
                            onClick={() => handleManualScan(item.variant_id)}
                            className={`text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-all active:scale-95 shadow-sm ${
                              isDone
                                ? 'bg-emerald-800/40 text-emerald-300 border border-emerald-700/40 cursor-default'
                                : 'bg-[#800000] hover:bg-[#990000] text-white'
                            }`}
                          >
                            {isDone ? 'مكتمل ✓' : 'مسح يدوي'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* الفوتر */}
            <div className="p-3.5 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                الحالة الحالية: <strong className="text-white">{selectedOrder.status}</strong>
              </span>
              <button
                type="button"
                onClick={() => setIsScannerOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-all"
              >
                إغلاق الماسح
              </button>
            </div>

          </div>
        </div>
      )}



      {/* ======================================================== */}
      {/* نافذة تعديل بيانات الطلب الشاملة (عميل + شحن + منتجات)   */}
      {/* ======================================================== */}
      {isEditOpen && selectedOrder && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[65] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl flex flex-col max-h-[92vh]">

            {/* رأس النافذة */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 rounded-t-2xl">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-[#800000]/10 text-[#800000]">
                  <Pencil className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-slate-900">تعديل بيانات الطلب #{selectedOrder.id}</h2>
                  <p className="text-[11px] text-slate-500 font-medium">تعديل بيانات العميل، تفاصيل التوصيل والمنتجات المطلوبة</p>
                </div>
              </div>
              <button onClick={() => setIsEditOpen(false)} className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 text-right">

              {/* 1. بيانات العميل الأساسية */}
              <div className="space-y-3 bg-slate-50/50 p-3.5 rounded-2xl border border-slate-200/60">
                <div className="flex items-center gap-2 border-b border-slate-200/50 pb-2">
                  <User className="h-4 w-4 text-[#800000]" />
                  <h3 className="text-xs font-bold text-slate-800">بيانات العميل الأساسية</h3>
                </div>

                {/* اسم العميل */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600 block">اسم العميل بالكامل <span className="text-red-500">*</span></label>
                  <input
                    type="text" required
                    placeholder="أدخل الاسم الثلاثي أو الثنائي للعميل"
                    value={editForm.customer_name}
                    onChange={e => setEditForm(p => ({ ...p, customer_name: e.target.value }))}
                    className="w-full text-xs px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-[#800000] focus:ring-2 focus:ring-[#800000]/5 bg-white transition-all text-slate-800 font-medium"
                  />
                </div>

                {/* أرقام التواصل */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 block">أرقام التواصل <span className="text-red-500">*</span></label>

                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type="tel"
                        required
                        placeholder="09xxxxxxxx (الرقم الرئيسي)"
                        value={editForm.customer_phones[0] || ''}
                        onChange={e => handleEditPhoneChange(0, e.target.value)}
                        className="w-full text-xs pl-3 pr-8 py-2.5 border border-slate-200 rounded-xl bg-white font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#800000] focus:ring-2 focus:ring-[#800000]/5 transition-all"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold font-mono text-slate-400">01</span>
                    </div>
                    <button
                      type="button"
                      onClick={addEditPhoneField}
                      className="h-10 w-10 flex items-center justify-center rounded-xl bg-[#800000] text-white hover:bg-[#600000] active:scale-95 shadow-sm transition-all shrink-0"
                      title="إضافة رقم هاتف آخر"
                    >
                      <Plus className="h-4 w-4 stroke-[2.5]" />
                    </button>
                  </div>

                  {editForm.customer_phones.slice(1).map((phone, index) => {
                    const actualIndex = index + 1;
                    return (
                      <div key={actualIndex} className="flex items-center gap-2 animate-fadeIn pl-2 border-r-2 border-slate-200 mt-2">
                        <div className="relative flex-1">
                          <input
                            type="tel"
                            placeholder={`رقم إضافي مساعد 0${actualIndex + 1}`}
                            value={phone}
                            onChange={e => handleEditPhoneChange(actualIndex, e.target.value)}
                            className="w-full text-xs pl-3 pr-8 py-2.5 border border-slate-200 rounded-xl bg-white font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#800000] focus:ring-2 focus:ring-[#800000]/5 transition-all"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold font-mono text-slate-300">0{actualIndex + 1}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeEditPhoneField(actualIndex)}
                          className="h-9 w-9 flex items-center justify-center rounded-xl bg-red-50 text-red-500 hover:bg-red-100 transition-all active:scale-95 shrink-0"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 2. بيانات الشحن وعنوان التوصيل */}
              <div className="space-y-3 bg-slate-50/50 p-3.5 rounded-2xl border border-slate-200/60">
                <div className="flex items-center gap-2 border-b border-slate-200/50 pb-2">
                  <Truck className="h-4 w-4 text-[#800000]" />
                  <h3 className="text-xs font-bold text-slate-800">بيانات الشحن والتوصيل</h3>
                </div>

                {/* المدينة والمنطقة */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 block">
                      المدينة <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={editDarbCity}
                      onChange={e => handleEditDarbCityChange(e.target.value)}
                      className="w-full text-xs px-3 py-2.5 border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-[#800000] focus:ring-2 focus:ring-[#800000]/10 text-slate-800 font-medium"
                    >
                      {sortedDarbCities.map(city => (
                        <option key={city} value={city}>
                          {city}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 block">
                      المنطقة <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={editDarbArea}
                      onChange={e => setEditDarbArea(e.target.value)}
                      className="w-full text-xs px-3 py-2.5 border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-[#800000] focus:ring-2 focus:ring-[#800000]/10 text-slate-800 font-medium"
                    >
                      {availableAreasForEditCity.map(area => (
                        <option key={area} value={area}>
                          {area}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* العنوان التفصيلي */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-[#800000]" />
                    العنوان التفصيلي (الشارع / أقرب نقطة دالة) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: بالقرب من جامع الصقع، عمارة 4"
                    value={editDarbDetailedAddress}
                    onChange={e => setEditDarbDetailedAddress(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-[#800000] focus:ring-2 focus:ring-[#800000]/10 text-slate-800 font-medium"
                  />
                </div>

                {/* باقة الخدمة وجهة دفع الشحن */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 block">
                      باقة الخدمة (درب السبيل)
                    </label>
                    <select
                      value={editDarbService}
                      onChange={e => setEditDarbService(e.target.value)}
                      className="w-full text-xs px-3 py-2.5 border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-[#800000] focus:ring-2 focus:ring-[#800000]/10 text-slate-800 font-medium"
                    >
                      {darbServices.map(srv => (
                        <option key={srv.id} value={srv.id}>
                          {srv.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 block">
                      جهة دفع الشحن
                    </label>
                    <select
                      value={editDarbPaymentBy}
                      onChange={e => setEditDarbPaymentBy(e.target.value)}
                      className="w-full text-xs px-3 py-2.5 border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-[#800000] focus:ring-2 focus:ring-[#800000]/10 text-slate-800 font-medium"
                    >
                      <option value="receiver">المستلم (الزبون يدفع)</option>
                      <option value="sender">المرسل (المتجر يدفع)</option>
                    </select>
                  </div>
                </div>

                {/* السوشيال ميديا والملاحظات */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-600 block">حساب السوشيال ميديا</label>
                    <input
                      type="text"
                      placeholder="يوزر انستغرام أو فيسبوك"
                      value={editForm.social_media_source}
                      onChange={e => setEditForm(p => ({ ...p, social_media_source: e.target.value }))}
                      className="w-full text-xs px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-[#800000] focus:ring-2 focus:ring-[#800000]/5 bg-white transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-600 block">ملاحظات الطلب</label>
                    <input
                      type="text"
                      placeholder="توقيت التسليم، ملاحظة للمندوب..."
                      value={editForm.notes}
                      onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))}
                      className="w-full text-xs px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-[#800000] focus:ring-2 focus:ring-[#800000]/5 bg-white transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* 3. المنتجات والكميات المطلوبة */}
              <div className="space-y-2.5 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setEditShowProductsSection(!editShowProductsSection)}
                  className="w-full flex items-center justify-between text-xs font-bold text-slate-700 py-1.5 px-2 hover:bg-slate-50 rounded-xl transition-colors border border-dashed border-slate-200"
                >
                  <span className="flex items-center gap-1.5 text-[#800000]">
                    <Plus className="h-4 w-4" /> إضافة أصناف جديدة للطلب من الكتالوج
                  </span>
                  <span className="text-slate-400">
                    {editShowProductsSection ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </span>
                </button>

                {editShowProductsSection && (
                  <div className="animate-fadeIn">
                    {loadingProducts ? (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                        <span className="text-xs text-slate-400 mr-2">جاري تحميل المنتجات...</span>
                      </div>
                    ) : availableProducts.length === 0 ? (
                      <div className="text-center py-4 text-xs text-slate-400">لا توجد منتجات متاحة في المخزن</div>
                    ) : (
                      <ProductPicker
                        products={availableProducts}
                        onAddVariant={addVariantToEditOrder}
                      />
                    )}
                  </div>
                )}

                {/* قائمة المنتجات المحجوزة في الطلب */}
                <div className="space-y-2 p-3 bg-slate-50/70 rounded-2xl border border-slate-200/60 shadow-xs">
                  <div className="flex items-center justify-between border-b border-slate-200/50 pb-1.5 mb-1">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Package className="h-4 w-4 text-[#800000]" />
                      أصناف الطلب الحالية
                    </span>
                    <span className="bg-[#800000]/10 text-[#800000] text-[10px] px-2 py-0.5 rounded-full font-bold">
                      {editSelectedVariants.length} أصناف
                    </span>
                  </div>

                  {editSelectedVariants.length === 0 ? (
                    <div className="text-center py-4 text-xs text-slate-400">
                      لم يتم اختيار أي أصناف. يجب إضافة صنف واحد على الأقل.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-0.5">
                      {editSelectedVariants.map(v => (
                        <div key={v.variant_id} className="bg-white border border-slate-200/80 rounded-xl p-2.5 shadow-xs transition-all hover:border-slate-300">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-bold text-slate-800 flex-1 truncate">{v.label}</span>

                            <div className="flex items-center gap-1.5 shrink-0 bg-slate-50 border border-slate-200 rounded-lg p-0.5">
                              <button
                                type="button"
                                onClick={() => updateEditVariantQty(v.variant_id, v.quantity - 1)}
                                className="h-6 w-6 rounded-md bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors shadow-xs"
                              >
                                <Minus className="h-3 w-3" />
                              </button>

                              <input
                                type="number"
                                min="1"
                                value={v.quantity}
                                onChange={e => updateEditVariantQty(v.variant_id, parseInt(e.target.value) || 1)}
                                className="w-10 text-center font-bold text-xs bg-transparent focus:outline-none text-slate-800"
                              />

                              <button
                                type="button"
                                onClick={() => updateEditVariantQty(v.variant_id, v.quantity + 1)}
                                className="h-6 w-6 rounded-md bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors shadow-xs"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={() => removeEditVariant(v.variant_id)}
                              className="text-red-400 hover:text-red-600 p-1 rounded-md hover:bg-red-50 transition-colors shrink-0"
                              title="حذف الصنف من الطلب"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>

                          {/* خيارات المعاينة والقياس */}
                          <div className="flex items-center gap-3 mt-2 pt-2 border-t border-slate-100 text-[10px]">
                            <label className="flex items-center gap-1.5 cursor-pointer text-slate-600">
                              <input
                                type="checkbox"
                                checked={!!v.allow_inspection}
                                onChange={() => toggleEditVariantPermission(v.variant_id, 'allow_inspection')}
                                className="rounded border-slate-300 text-[#800000] focus:ring-[#800000] h-3.5 w-3.5"
                              />
                              <span>سماح بالمعاينة</span>
                            </label>

                            <label className="flex items-center gap-1.5 cursor-pointer text-slate-600">
                              <input
                                type="checkbox"
                                checked={!!v.allow_try_on}
                                onChange={() => toggleEditVariantPermission(v.variant_id, 'allow_try_on')}
                                className="rounded border-slate-300 text-[#800000] focus:ring-[#800000] h-3.5 w-3.5"
                              />
                              <span>سماح بالقياس</span>
                            </label>

                            {v.price > 0 && (
                              <span className="mr-auto font-bold text-slate-700">
                                {(v.price * v.quantity).toFixed(2)} د.ل
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* إجمالي قيمة الطلب التقديري */}
                  {editSelectedVariants.length > 0 && (
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 text-xs font-bold text-slate-800">
                      <span>إجمالي القطع: {editSelectedVariants.reduce((sum, v) => sum + v.quantity, 0)} قطعة</span>
                      <span className="text-[#800000]">
                        الإجمالي: {editSelectedVariants.reduce((sum, v) => sum + (v.price || 0) * v.quantity, 0).toFixed(2)} د.ل
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* أزرار الإجراء */}
              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="px-4 py-2.5 border border-slate-300 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50 transition-all"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSaving || editSelectedVariants.length === 0}
                  className="px-5 py-2.5 bg-[#800000] text-white rounded-xl text-xs font-bold hover:bg-[#660000] disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all flex items-center gap-1.5 shadow-sm shadow-[#800000]/20"
                >
                  {isSaving ? <><Loader2 className="h-4 w-4 animate-spin" /> جاري الحفظ والتحديث...</> : 'حفظ التعديلات الشاملة ✓'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* نافذة إرسال الشحنة لشركة درب السبيل (Darb Assabil Modal)  */}
      {/* ======================================================== */}
      {isDarbModalOpen && selectedOrder && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[75] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-amber-50/50 rounded-t-2xl">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-100 text-amber-800">
                  <Zap className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">إرسال الشحنة لشركة درب السبيل</h2>
                  <p className="text-[11px] text-slate-500">للطلب #{selectedOrder.id} - العميل: {selectedOrder.customer_name}</p>
                </div>
              </div>
              <button onClick={() => setIsDarbModalOpen(false)} className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSendSelectedOrderToDarbDirectly} className="p-5 space-y-4 overflow-y-auto flex-1 text-right">
              {loadingDarbData ? (
                <div className="flex flex-col items-center justify-center py-8 gap-2 text-xs text-slate-500">
                  <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
                  <span>جاري تحميل باقات ومدن التوصيل...</span>
                </div>
              ) : (
                <>
                  {/* باقة الخدمة */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 block">
                      باقة الخدمة (Service Package) <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={selectedDarbService}
                      onChange={e => setSelectedDarbService(e.target.value)}
                      className="w-full text-xs px-3 py-2.5 border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-500/10 text-slate-800 font-medium"
                    >
                      {darbServices.map(srv => (
                        <option key={srv.id} value={srv.id}>
                          {srv.name} {srv.description ? `— ${srv.description}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* المدينة والمنطقة المتسلسلة */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700 block">
                        المدينة المدعومة <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={selectedDarbCity}
                        onChange={e => handleDarbCityChange(e.target.value)}
                        className="w-full text-xs px-3 py-2.5 border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-500/10 text-slate-800 font-medium"
                      >
                        {sortedDarbCities.map(city => (
                          <option key={city} value={city}>
                            {city}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700 block">
                        المنطقة <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={selectedDarbArea}
                        onChange={e => setSelectedDarbArea(e.target.value)}
                        className="w-full text-xs px-3 py-2.5 border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-500/10 text-slate-800 font-medium"
                      >
                        {availableAreasForSelectedCity.map(area => (
                          <option key={area} value={area}>
                            {area}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* العنوان التفصيلي */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 block">
                      العنوان التفصيلي (الشارع / أقرب نقطة دالة) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="مثال: بالقرب من جامع الصقع، عمارة 4"
                      value={darbDetailedAddress}
                      onChange={e => setDarbDetailedAddress(e.target.value)}
                      className="w-full text-xs px-3 py-2.5 border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-500/10 text-slate-800"
                    />
                  </div>

                  {/* جهة دفع الشحن */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 block">
                      جهة دفع تكلفة الشحن (Payment By)
                    </label>
                    <select
                      value={selectedDarbPaymentBy}
                      onChange={e => setSelectedDarbPaymentBy(e.target.value)}
                      className="w-full text-xs px-3 py-2.5 border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-500/10 text-slate-800"
                    >
                      <option value="receiver">المستلم (الزبون يدفع الشحن عند الاستلام - الافتراضي)</option>
                      <option value="sender">المرسل (المتجر يتحمل تكلفة الشحن)</option>
                      <option value="sales">المبيعات (مخصوم من إجمالي المبيعات)</option>
                    </select>
                  </div>
                </>
              )}

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setIsDarbModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 transition-all"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSendingDarb || loadingDarbData}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5 shadow-sm active:scale-95"
                >
                  {isSendingDarb ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>جاري إرسال الشحنة...</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-3.5 w-3.5" />
                      <span>تأكيد وإصدار بوليصة الشحن</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
