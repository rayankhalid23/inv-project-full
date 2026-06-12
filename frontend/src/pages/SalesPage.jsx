import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Search, Package, Clock, Layers, CheckCircle2,
  Camera, ScanLine, Pencil, Copy, Check, User, Phone,
  MapPin, MessageSquare, X, Minus, Truck, RefreshCw,
  Trash2, TrendingUp, ShieldCheck, AlertCircle, Download,
  Loader2, ChevronDown, ChevronUp, ShoppingCart, FileText,
  Hash, BadgeCheck, Info
} from 'lucide-react';
import { orderApi } from '../api/orderApi';
import { fetchEmployeesApi } from '../api/userApi';

// ========= مكوّن Toast للتنبيهات العائمة =========
function ToastContainer({ toasts }) {
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
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
    'تم التوصيل':   'bg-slate-100 text-slate-600 border-slate-300',
    'مرتجع بالكامل':'bg-red-50 text-red-700 border-red-200',
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
    'تم التوصيل':   'bg-slate-100 text-slate-500 border-slate-200',
    'مرتجع بالكامل':'bg-red-50 text-red-700 border-red-100',
  }[status] || 'bg-slate-50 text-slate-500 border-slate-200';

  return (
    <div className={`p-2 rounded-xl border shrink-0 ${cls}`}>
      {status === 'معلق'         && <Clock className="h-5 w-5" />}
      {status === 'قيد التجهيز' && <Layers className="h-5 w-5" />}
      {status === 'تم التجهيز'  && <CheckCircle2 className="h-5 w-5" />}
      {status === 'تم التوصيل'  && <Truck className="h-5 w-5" />}
      {status === 'مرتجع بالكامل' && <RefreshCw className="h-5 w-5" />}
      {!['معلق','قيد التجهيز','تم التجهيز','تم التوصيل','مرتجع بالكامل'].includes(status) && <Package className="h-5 w-5" />}
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
    customer_name: '', customer_phones: '', address: '',
    social_media_source: '', notes: '', items: [],
  });
  const [availableProducts, setAvailableProducts] = useState([]);
  const [loadingProducts, setLoadingProducts]     = useState(false);
  const [selectedVariants, setSelectedVariants]   = useState([]); // [{variant_id, quantity, label}]

  // ---- States الشحن ----
  const [deliveryType, setDeliveryType] = useState('');
  const [carrierName, setCarrierName]   = useState('');

  // ---- States التعديل ----
  const [editForm, setEditForm] = useState({
    customer_name: '', customer_phones: '', address: '', notes: '',
  });

  // ========= دالة Toast =========
  const showToast = useCallback((message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  }, []);

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

  // ========= فلترة الطلبات محلياً =========
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const name   = (order.customer_name || '').toLowerCase();
      const id     = String(order.id || '');
      const phones = Array.isArray(order.customer_phones)
        ? order.customer_phones.join(' ')
        : (order.customer_phones || '');
      const q = searchQuery.toLowerCase();

      const matchSearch = !q || name.includes(q) || id.includes(q) || phones.includes(q);
      const matchFilter = activeFilter === 'الكل' || order.status === activeFilter;
      const matchEmployee = filterEmployee === 'الكل' || order.employee_name === filterEmployee;
      return matchSearch && matchFilter && matchEmployee;
    });
  }, [orders, searchQuery, activeFilter, filterEmployee]);

  // ========= عدادات الفلاتر =========
  const filterCounts = useMemo(() => ({
    'الكل':          orders.length,
    'معلق':          orders.filter(o => o.status === 'معلق').length,
    'قيد التجهيز':  orders.filter(o => o.status === 'قيد التجهيز').length,
    'تم التجهيز':   orders.filter(o => o.status === 'تم التجهيز').length,
    'تم التوصيل':   orders.filter(o => o.status === 'تم التوصيل').length,
    'مرتجع بالكامل':orders.filter(o => o.status === 'مرتجع بالكامل').length,
  }), [orders]);

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

  // ========= إنشاء طلب جديد =========
  const handleCreateOrder = async (e) => {
    e.preventDefault();
    if (!newOrderForm.customer_name.trim() || !newOrderForm.customer_phones.trim() || !newOrderForm.address.trim()) {
      showToast('يرجى ملء جميع الحقول الإلزامية', 'error');
      return;
    }
    if (selectedVariants.length === 0) {
      showToast('يرجى إضافة منتج واحد على الأقل للطلب', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        customer_name: newOrderForm.customer_name.trim(),
        customer_phones: newOrderForm.customer_phones.trim(),
        address: newOrderForm.address.trim(),
        social_media_source: newOrderForm.social_media_source.trim() || null,
        notes: newOrderForm.notes.trim() || null,
        items: selectedVariants.map(v => ({ variant_id: v.variant_id, quantity: v.quantity })),
      };
      const newOrder = await orderApi.createOrder(payload);
      setOrders(prev => [newOrder, ...prev]);
      setIsCreateOpen(false);
      setNewOrderForm({ customer_name: '', customer_phones: '', address: '', social_media_source: '', notes: '', items: [] });
      setSelectedVariants([]);
      fetchInventoryStats();
      showToast(`تم إنشاء الطلب رقم #${newOrder.id} بنجاح`);
    } catch (err) {
      showToast(typeof err === 'string' ? err : 'حدث خطأ أثناء إنشاء الطلب', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // ========= إضافة متغير للطلب =========
  const addVariantToOrder = (variant, colorName, productName, sizeName) => {
    const label = `${productName} - ${colorName} - ${sizeName}`;
    const exists = selectedVariants.find(v => v.variant_id === variant.id);
    if (exists) {
      setSelectedVariants(prev => prev.map(v =>
        v.variant_id === variant.id ? { ...v, quantity: v.quantity + 1 } : v
      ));
    } else {
      setSelectedVariants(prev => [...prev, { variant_id: variant.id, quantity: 1, label }]);
    }
  };

  const removeVariant = (variantId) => {
    setSelectedVariants(prev => prev.filter(v => v.variant_id !== variantId));
  };

  const updateVariantQty = (variantId, qty) => {
    const n = parseInt(qty, 10);
    if (n < 1) { removeVariant(variantId); return; }
    setSelectedVariants(prev => prev.map(v => v.variant_id === variantId ? { ...v, quantity: n } : v));
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

  // ========= تسجيل نتيجة التوصيل =========
  const handleFinalTrackingStatus = async (result) => {
    const newStatus = result === 'success' ? 'تم التوصيل' : 'مرتجع بالكامل';
    try {
      const updated = await orderApi.updateOrderStatus(selectedOrder.id, newStatus);
      setSelectedOrder(prev => ({ ...prev, status: newStatus }));
      setOrders(prev => prev.map(o => o.id === selectedOrder.id ? { ...o, status: newStatus } : o));
      fetchInventoryStats();
      setIsTrackingOpen(false);
      showToast(
        result === 'success'
          ? 'تم تأكيد التسليم وخصمه نهائياً من المستودع'
          : 'تم تسجيل الإرجاع وإعادة الكميات للمخزون',
        result === 'success' ? 'success' : 'warning'
      );
    } catch (err) {
      showToast(typeof err === 'string' ? err : 'حدث خطأ أثناء تحديث الحالة', 'error');
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

  // ========= الإحصائيات =========
  const statsData = useMemo(() => {
    if (!inventoryStats) return { actual: '-', reserved: '-', available: '-' };
    // هيكل get_inventory_dashboard_stats الفعلي:
    // { inventory: { total_inventory, total_reserved, total_sold, total_damaged, total_returns } }
    const inv = inventoryStats?.inventory ?? inventoryStats ?? {};
    return {
      actual:    inv.total_inventory   ?? inv.total_actual_stock    ?? inv.total_available_stock ?? '-',
      reserved:  inv.total_reserved    ?? inv.total_reserved_stock  ?? '-',
      available: (typeof inv.total_inventory === 'number' && typeof inv.total_reserved === 'number')
                   ? (inv.total_inventory - inv.total_reserved)
                   : (inv.total_available_stock ?? '-'),
    };
  }, [inventoryStats]);

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
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#6b1d2f] text-white hover:bg-[#541624] active:scale-95 transition-all shadow-sm shadow-[#6b1d2f]/20"
            >
              <Plus className="h-4 w-4" />
              <span>طلب جديد</span>
              <span className="bg-white/20 text-[11px] px-1.5 py-0.5 rounded-md font-bold">{orders.length}</span>
            </button>
          </div>
        </div>

        {/* ===== إحصائيات المخزون ===== */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { label: 'المخزون الفعلي بالمستودع', value: statsData.actual, color: 'blue', icon: <Layers className="h-5 w-5" /> },
            { label: 'المحجوز لطلبات قيد التجهيز', value: statsData.reserved, color: 'orange', icon: <TrendingUp className="h-5 w-5" /> },
            { label: 'المتاح للبيع الحر', value: statsData.available, color: 'emerald', icon: <ShieldCheck className="h-5 w-5" /> },
          ].map(({ label, value, color, icon }) => (
            <div key={label} className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm hover:shadow-md transition-shadow flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-xs text-slate-500 font-medium block">{label}</span>
                <span className={`text-xl font-bold text-${color}-600 tracking-tight`}>
                  {value} <span className="text-xs text-slate-400 font-normal">قطعة</span>
                </span>
              </div>
              <div className={`h-9 w-9 rounded-lg bg-${color}-50 flex items-center justify-center text-${color}-600`}>
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
            {['الكل', 'معلق', 'قيد التجهيز', 'تم التجهيز', 'تم التوصيل', 'مرتجع بالكامل'].map(tab => {
              const isActive = activeFilter === tab;
              const count = filterCounts[tab] ?? 0;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveFilter(tab)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-[#6b1d2f] text-white border-[#6b1d2f] shadow-sm'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span>{tab}</span>
                  <span className={`text-[10px] font-bold px-1.5 rounded-full ${isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
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

              {/* بيانات العميل */}
              <div className="space-y-1">
                <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-[#6b1d2f]" /> بيانات العميل
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600 block">اسم العميل <span className="text-red-500">*</span></label>
                    <input
                      type="text" required
                      placeholder="الاسم الكامل للعميل"
                      value={newOrderForm.customer_name}
                      onChange={e => setNewOrderForm(p => ({ ...p, customer_name: e.target.value }))}
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#6b1d2f] bg-slate-50/50"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600 block">رقم الهاتف <span className="text-red-500">*</span></label>
                    <input
                      type="tel" required
                      placeholder="05xxxxxxxx"
                      value={newOrderForm.customer_phones}
                      onChange={e => setNewOrderForm(p => ({ ...p, customer_phones: e.target.value }))}
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#6b1d2f] bg-slate-50/50"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600 block">عنوان التوصيل <span className="text-red-500">*</span></label>
                  <input
                    type="text" required
                    placeholder="المدينة - الحي - الشارع"
                    value={newOrderForm.address}
                    onChange={e => setNewOrderForm(p => ({ ...p, address: e.target.value }))}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#6b1d2f] bg-slate-50/50"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600 block">مصدر الطلب (سوشيال ميديا)</label>
                    <input
                      type="text"
                      placeholder="مثال: انستقرام، واتساب..."
                      value={newOrderForm.social_media_source}
                      onChange={e => setNewOrderForm(p => ({ ...p, social_media_source: e.target.value }))}
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#6b1d2f] bg-slate-50/50"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600 block">ملاحظات</label>
                    <input
                      type="text"
                      placeholder="ملاحظات خاصة بالطلب..."
                      value={newOrderForm.notes}
                      onChange={e => setNewOrderForm(p => ({ ...p, notes: e.target.value }))}
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#6b1d2f] bg-slate-50/50"
                    />
                  </div>
                </div>
              </div>

              {/* اختيار المنتجات */}
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5 text-[#6b1d2f]" /> المنتجات المطلوبة <span className="text-red-500">*</span>
                </h3>

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

                {/* المنتجات المختارة */}
                {selectedVariants.length > 0 && (
                  <div className="space-y-1.5 p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-xs font-bold text-slate-700 block">المنتجات المضافة للطلب:</span>
                    {selectedVariants.map(v => (
                      <div key={v.variant_id} className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-lg p-2">
                        <span className="text-xs text-slate-700 flex-1 truncate">{v.label}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          <button type="button" onClick={() => updateVariantQty(v.variant_id, v.quantity - 1)}
                            className="h-6 w-6 rounded bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors">
                            <Minus className="h-3 w-3" />
                          </button>
                          <input
                            type="number" min="1" value={v.quantity}
                            onChange={e => updateVariantQty(v.variant_id, e.target.value)}
                            className="w-10 text-center text-xs border border-slate-200 rounded py-0.5 focus:outline-none focus:ring-1 focus:ring-[#6b1d2f]"
                          />
                          <button type="button" onClick={() => updateVariantQty(v.variant_id, v.quantity + 1)}
                            className="h-6 w-6 rounded bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors">
                            <Plus className="h-3 w-3" />
                          </button>
                          <button type="button" onClick={() => removeVariant(v.variant_id)}
                            className="h-6 w-6 rounded bg-[#6b1d2f]/10 flex items-center justify-center hover:bg-[#6b1d2f]/20 text-[#6b1d2f] transition-colors">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))}
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
                  className="px-4 py-2 bg-[#6b1d2f] text-white rounded-lg text-xs font-semibold hover:bg-[#541624] disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all flex items-center gap-1.5">
                  {isSaving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> جاري الحفظ...</> : 'تأكيد وإنشاء الطلب'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* نافذة تفاصيل الطلب                                        */}
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

                {/* بيانات العميل */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <User className="h-4 w-4 text-[#6b1d2f]" /> بيانات العميل والشحن
                    </h3>
                    <button
                      onClick={handleOpenEdit}
                      className="text-[11px] font-bold text-[#6b1d2f] hover:underline flex items-center gap-0.5"
                    >
                      <Pencil className="h-3 w-3" /> تعديل
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600">
                    <div className="flex items-center gap-1">
                      <User className="h-3.5 w-3.5 text-slate-400" />
                      <span className="font-medium">{selectedOrder.customer_name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5 text-slate-400" />
                      <span className="font-mono">
                        {Array.isArray(selectedOrder.customer_phones)
                          ? selectedOrder.customer_phones.join(' / ')
                          : selectedOrder.customer_phones || '—'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 sm:col-span-2">
                      <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span>{selectedOrder.address || '—'}</span>
                    </div>
                    {selectedOrder.social_media_source && (
                      <div className="flex items-center gap-1 sm:col-span-2 text-[11px] text-slate-500">
                        <Hash className="h-3 w-3 text-slate-400" />
                        <span>المصدر: {selectedOrder.social_media_source}</span>
                      </div>
                    )}
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

                {/* شريط تقدم التجهيز */}
                {selectedOrder.total_ordered_qty != null && (
                  <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-700">تقدم التجهيز</span>
                      <span className="font-mono font-bold text-[#6b1d2f]">
                        {selectedOrder.total_picked_qty}/{selectedOrder.total_ordered_qty} قطعة
                        {' '}({Math.round(selectedOrder.progress_percentage || 0)}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-2 rounded-full transition-all duration-500 ${
                          selectedOrder.progress_percentage >= 100 ? 'bg-emerald-500' : 'bg-blue-500'
                        }`}
                        style={{ width: `${Math.min(selectedOrder.progress_percentage || 0, 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* نظام المسح والباركود */}
                {!['تم التوصيل', 'مرتجع بالكامل'].includes(selectedOrder.status) && (
                  <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                      <ScanLine className="h-4 w-4 text-[#6b1d2f]" />
                      <span>مسح المنتجات (QR / Barcode)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsScannerOpen(true)}
                        className="bg-slate-100 hover:bg-slate-200 border border-slate-300 p-2.5 rounded-lg text-slate-700 flex items-center gap-1.5 text-xs font-bold shrink-0 transition-all"
                      >
                        <Camera className="h-4 w-4 text-[#6b1d2f]" />
                        <span>الماسح الضوئي</span>
                      </button>
                      <div className="flex-1 flex gap-1">
                        <input
                          type="text"
                          placeholder="أدخل رمز QR أو الباركود يدوياً..."
                          value={manualBarcode}
                          onChange={e => setManualBarcode(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleBarcodeScan(manualBarcode)}
                          className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#6b1d2f]"
                        />
                        <button
                          type="button"
                          onClick={() => handleBarcodeScan(manualBarcode)}
                          disabled={isScanning || !manualBarcode.trim()}
                          className="bg-[#6b1d2f] text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-[#541624] disabled:opacity-50 transition-all flex items-center gap-1"
                        >
                          {isScanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'مسح'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* قائمة المنتجات في الطلب */}
                {selectedOrder.items && selectedOrder.items.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-slate-800 block">المنتجات في الطلب:</span>
                    {selectedOrder.items.map((item, idx) => {
                      const progress = item.quantity > 0 ? (item.picked_quantity / item.quantity) * 100 : 0;
                      const isDone   = item.picked_quantity >= item.quantity;
                      return (
                        <div key={item.id || idx} className="border border-slate-200 rounded-xl p-3 bg-white space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              {item.image_url ? (
                                <img
                                  src={item.image_url.startsWith('http') ? item.image_url : `http://localhost:8000${item.image_url}`}
                                  alt={item.product_name}
                                  className="h-12 w-12 rounded-lg object-cover border border-slate-200"
                                  onError={e => { e.target.style.display = 'none'; }}
                                />
                              ) : (
                                <div className="h-12 w-12 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400">
                                  <Package className="h-5 w-5" />
                                </div>
                              )}
                              <div className="space-y-0.5">
                                <h4 className="text-xs font-bold text-slate-900">{item.product_name}</h4>
                                <div className="flex items-center gap-2 text-[10px] text-slate-500">
                                  {item.size       && <span className="bg-slate-100 px-1.5 py-0.5 rounded">المقاس: {item.size}</span>}
                                  {item.color_name && <span className="bg-slate-100 px-1.5 py-0.5 rounded">اللون: {item.color_name}</span>}
                                  {item.variant_id && <span className="font-mono text-slate-400">#{item.variant_id}</span>}
                                </div>
                                {item.price_at_order != null && (
                                  <span className="text-[10px] text-slate-400">
                                    السعر: {Number(item.price_at_order).toLocaleString('ar-SA')} ر.س
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-left shrink-0 flex flex-col items-end gap-1">
                              <span className={`text-xs font-mono font-bold ${isDone ? 'text-emerald-600' : 'text-slate-700'}`}>
                                {item.picked_quantity} / {item.quantity}
                              </span>
                              <span className="text-[10px] text-slate-400 block">ممسوح / مطلوب</span>
                              {!isDone && !['تم التوصيل', 'مرتجع بالكامل'].includes(selectedOrder.status) && (
                                <button
                                  type="button"
                                  onClick={() => handleManualScan(item.variant_id)}
                                  disabled={isScanning}
                                  className="mt-1 text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1 rounded font-bold transition-all disabled:opacity-50 flex items-center gap-1 border border-slate-200"
                                >
                                  <ScanLine className="h-3 w-3" />
                                  تجهيز يدوي
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-1.5 rounded-full transition-all duration-300 ${isDone ? 'bg-emerald-500' : 'bg-blue-500'}`}
                              style={{ width: `${Math.min(progress, 100)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* حركات الطلب / العمليات */}
                {selectedOrder.actions && selectedOrder.actions.length > 0 && (
                  <div className="mt-6 border border-slate-200 rounded-xl p-4 bg-white">
                    <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                      <Clock className="h-4 w-4 text-[#6b1d2f]" />
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

                {/* قسم إسناد الشحن */}
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
                          className="w-full p-2 border border-slate-300 bg-white rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#6b1d2f]"
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
                          placeholder="مثال: أرامكس، سمسا..."
                          value={carrierName}
                          onChange={e => setCarrierName(e.target.value)}
                          className="w-full p-2 border border-slate-300 bg-white rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#6b1d2f]"
                        />
                      </div>
                    </div>
                    <button
                      onClick={handleConfirmDelivery}
                      disabled={isAssigning}
                      className="w-full bg-[#6b1d2f] hover:bg-[#541624] text-white font-bold text-xs py-2 rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isAssigning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Truck className="h-4 w-4" />}
                      تأكيد إسناد الشحن
                    </button>
                  </div>
                )}

                {/* زر تسجيل نتيجة التوصيل */}
                {selectedOrder.delivery_man_name && !['تم التوصيل', 'مرتجع بالكامل'].includes(selectedOrder.status) && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between text-xs">
                    <div className="space-y-0.5">
                      <span className="font-bold text-blue-900 block">
                        تم الشحن بواسطة {selectedOrder.delivery_man_name}
                      </span>
                      <span className="text-slate-500">في انتظار تأكيد نتيجة التسليم.</span>
                    </div>
                    <button
                      onClick={() => setIsTrackingOpen(true)}
                      className="bg-[#6b1d2f] text-white font-bold px-3 py-1.5 rounded-lg hover:bg-[#541624] transition-colors text-xs"
                    >
                      تسجيل النتيجة
                    </button>
                  </div>
                )}

                {/* الإجمالي */}
                {selectedOrder.total_price != null && (
                  <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm">
                    <span className="font-bold text-slate-700">إجمالي الطلب:</span>
                    <span className="font-bold text-[#6b1d2f] text-base">
                      {Number(selectedOrder.total_price).toLocaleString('ar-SA')} ر.س
                    </span>
                  </div>
                )}

                {/* Footer Actions */}
                <div className="border-t border-slate-100 pt-4 flex items-center justify-between flex-wrap gap-2">
                  <button
                    onClick={handleDeleteOrder}
                    disabled={isDeleting || ['تم التوصيل'].includes(selectedOrder.status)}
                    className="text-xs text-[#6b1d2f] hover:text-[#541624] font-bold border border-[#6b1d2f]/30 hover:bg-[#6b1d2f]/5 px-3 py-2 rounded-lg transition-all flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
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
      {/* نافذة تسجيل نتيجة التسليم                                 */}
      {/* ======================================================== */}
      {isTrackingOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full border border-slate-200 shadow-2xl p-5 text-right space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Truck className="h-5 w-5 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900">تسجيل نتيجة التوصيل</h3>
            </div>
            <p className="text-xs text-slate-500">
              يرجى تحديد نتيجة التوصيل للطلب رقم <strong className="font-mono">#{selectedOrder?.id}</strong>
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleFinalTrackingStatus('success')}
                className="w-full text-right p-3 rounded-xl border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 text-emerald-900 text-xs font-bold transition-all flex items-center justify-between"
              >
                <span>تم التسليم بنجاح للعميل</span>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              </button>
              <button
                onClick={() => handleFinalTrackingStatus('returned')}
                className="w-full text-right p-3 rounded-xl border border-[#6b1d2f]/30 bg-[#6b1d2f]/5 hover:bg-[#6b1d2f]/10 text-[#6b1d2f] text-xs font-bold transition-all flex items-center justify-between"
              >
                <span>مرتجع (فشل التسليم)</span>
                <AlertCircle className="h-4 w-4 text-red-600" />
              </button>
            </div>
            <div className="flex justify-end">
              <button onClick={() => setIsTrackingOpen(false)} className="text-[11px] font-bold text-slate-400 hover:text-slate-600">
                إغلاق والعودة لاحقاً
              </button>
            </div>
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
                  className="px-4 py-2 bg-[#6b1d2f] text-white rounded-lg text-xs font-semibold hover:bg-[#541624] disabled:opacity-50 flex items-center gap-1.5">
                  {isSaving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> حفظ...</> : 'حفظ التغييرات'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* شريط التنقل السفلي للموبايل */}
      <div className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 px-6 py-2 flex items-center justify-between z-40 shadow-xl">
        <button onClick={() => setActiveFilter('الكل')} className="flex flex-col items-center gap-0.5 text-slate-400 hover:text-[#6b1d2f]">
          <Package className="h-5 w-5" />
          <span className="text-[10px] font-medium">الطلبات</span>
        </button>
        <button
          onClick={() => { setIsCreateOpen(true); fetchAvailableProducts(); }}
          className="flex flex-col items-center justify-center -mt-6 bg-[#6b1d2f] text-white h-12 w-12 rounded-full shadow-lg border-4 border-white active:scale-95 transition-all"
        >
          <Plus className="h-5 w-5" />
        </button>
        <button onClick={() => fetchOrders(true)} className="flex flex-col items-center gap-0.5 text-slate-400 hover:text-[#6b1d2f]">
          <RefreshCw className={`h-5 w-5 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span className="text-[10px] font-medium">تحديث</span>
        </button>
      </div>

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