import React, { useState, useMemo, useEffect } from 'react';
import { 
  Plus, Search, Package, Clock, Layers, CheckCircle2, 
  Camera, ScanLine, Pencil, Copy, Check, User, Phone, 
  MapPin, MessageSquare, X, Minus, Truck, RefreshCw, 
  Trash2, TrendingUp, ShieldCheck, AlertCircle
} from 'lucide-react';

// --- بيانات تجريبية متكاملة لضمان التشغيل الفوري لمحاكاة النظام الفعلي ---
const INITIAL_INVENTORY = { actual: 1240, reserved: 185, available: 1055 };
const INITIAL_ORDERS = [
  {
    id: "ORD-2026-001",
    customerName: "أحمد عبد الله التميمي",
    phone: "0501234567",
    address: "الرياض - حي الياسمين - شارع العليا",
    notes: "يرجى التوصيل بعد الساعة 4 عصراً ولف الشحنة جيداً ضد الصدمات",
    status: "معلق",
    createdAt: "2026-05-17 08:30",
    paymentMethod: "مدى",
    items: [
      { id: "P1", name: "قميص كلاسيك برعندي", size: "XL", color: "برعندي", barcode: "6901234567890", quantityRequired: 2, quantityScanned: 0, image: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=150" },
      { id: "P2", name: "بنطال جينز رمادي فاخر", size: "34", color: "رمادي", barcode: "6909876543210", quantityRequired: 1, quantityScanned: 0, image: "https://images.unsplash.com/photo-1542272604-787c3835535d?w=150" }
    ]
  },
  {
    id: "ORD-2026-002",
    customerName: "سارة محمد الشمري",
    phone: "0559876543",
    address: "جدة - حي النعيم - برج الشاشة",
    notes: "توصيل مستعجل - طلب هدايا",
    status: "قيد التجهيز",
    createdAt: "2026-05-17 09:15",
    paymentMethod: "بطاقة ائتمان",
    items: [
      { id: "P3", name: "حذاء رياضي رمادي خفيف", size: "42", color: "رمادي/برعندي", barcode: "6905556667771", quantityRequired: 1, quantityScanned: 1, image: "https://images.unsplash.com/photo-1491553895911-0055eca6402d?w=150" }
    ]
  },
  {
    id: "ORD-2026-003",
    customerName: "خالد بن الوليد",
    phone: "0531112223",
    address: "الدمام - حي الشاطئ",
    notes: "",
    status: "تم التجهيز",
    createdAt: "2026-05-16 14:00",
    paymentMethod: "الدفع عند الاستلام",
    items: [
      { id: "P1", name: "قميص كلاسيك برعندي", size: "L", color: "برعندي", barcode: "6901234567890", quantityRequired: 1, quantityScanned: 1, image: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=150" }
    ],
    deliveryType: "شركة توصيل",
    carrierName: "أرامكس",
    trackingRegistered: false
  }
];

export default function SalesPage() {
  // --- States لإدارة الواجهة والتفاعلات ---
  const [orders, setOrders] = useState(INITIAL_ORDERS);
  const [inventory, setInventory] = useState(INITIAL_INVENTORY);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("الكل");
  
  // States للتحكم بالنوافذ المنبثقة (Dialogs)
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isTrackingOpen, setIsTrackingOpen] = useState(false);
  
  // إدارات العمليات والنسخ والتراجع
  const [copiedId, setCopiedId] = useState(null);
  const [scanHistory, setScanHistory] = useState([]); // لحفظ تتبع عمليات المسح للتراجع الإيجابي (Optimistic UI)
  const [manualBarcode, setManualBarcode] = useState("");
  const [toasts, setToasts] = useState([]);
  
  // خيارات الشحن وتجهيز التسليم
  const [deliveryType, setDeliveryType] = useState("");
  const [carrierName, setCarrierName] = useState("");
  
  // بيانات نموذج الطلب الجديد
  const [newOrderForm, setNewOrderForm] = useState({
    customerName: "", phone: "", address: "", notes: "", paymentMethod: "مدى", items: []
  });

  // مسبار الإرسال والحفظ (Loading indicators)
  const [isSaving, setIsSaving] = useState(false);

  // --- دوال مساعدة لإظهار التنبيهات الذكية (Toast System) ---
  const showToast = (message, type = "success") => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  // --- تصفية والبحث في الطلبات ---
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const matchesSearch = 
        order.customerName.includes(searchQuery) || 
        order.id.includes(searchQuery) || 
        order.phone.includes(searchQuery);
      
      const matchesFilter = activeFilter === "الكل" || order.status === activeFilter;
      
      return matchesSearch && matchesFilter;
    });
  }, [orders, searchQuery, activeFilter]);

  // حساب أعداد الفلاتر بشكل ديناميكي
  const filterCounts = useMemo(() => {
    return {
      "الكل": orders.length,
      "معلق": orders.filter(o => o.status === "معلق").length,
      "قيد التجهيز": orders.filter(o => o.status === "قيد التجهيز").length,
      "تم التجهيز": orders.filter(o => o.status === "تم التجهيز").length,
    };
  }, [orders]);

  // --- تنفيذ آلية النسخ الذكي للمعرفات ---
  const handleCopyId = (id) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    showToast("تم نسخ رقم الطلب بنجاح");
    setTimeout(() => setCopiedId(null), 2000);
  };

  // --- نظام التجهيز الذكي والمسح المتفائل (Optimistic UI) ---
  const handleBarcodeScan = (barcodeValue) => {
    if (!selectedOrder) return;
    
    // البحث عن المنتج المطابق للباركود داخل الطلب الحالي
    const targetItemIndex = selectedOrder.items.findIndex(item => item.barcode === barcodeValue);
    
    if (targetItemIndex === -1) {
      showToast("خطأ: الباركود الممسوح لا يطابق أي منتج في هذا الطلب", "error");
      return;
    }

    const item = selectedOrder.items[targetItemIndex];
    if (item.quantityScanned >= item.quantityRequired) {
      showToast(`المنتج ${item.name} تم استيفاء كميته المطلوبة بالفعل`, "error");
      return;
    }

    // تحديث متفائل فوري للواجهة (Optimistic Update)
    const updatedItems = [...selectedOrder.items];
    updatedItems[targetItemIndex] = {
      ...item,
      quantityScanned: item.quantityScanned + 1
    };

    const allScanned = updatedItems.every(i => i.quantityScanned === i.quantityRequired);
    const nextStatus = allScanned ? "تم التجهيز" : "قيد التجهيز";

    // تحديث الحالة الفرعية والحالة العامة للطلبات
    const updatedOrder = { ...selectedOrder, items: updatedItems, status: nextStatus };
    
    // حفظ السجل من أجل عملية التراجع (Undo)
    setScanHistory(prev => [...prev, { orderId: selectedOrder.id, barcode: barcodeValue, previousItems: selectedOrder.items, previousStatus: selectedOrder.status }]);
    
    setSelectedOrder(updatedOrder);
    setOrders(prev => prev.map(o => o.id === selectedOrder.id ? updatedOrder : o));
    
    showToast(`تم مسح ${item.name} بنجاح (${updatedItems[targetItemIndex].quantityScanned}/${item.quantityRequired})`);
    
    if (allScanned && selectedOrder.status !== "تم التجهيز") {
      showToast("اكتمل تجهيز الطلب بالكامل وتحول إلى حالة جاهز للشحن!", "success");
    }
    
    setManualBarcode("");
  };

  // التراجع عن آخر مسح للباركود
  const handleUndoLastScan = () => {
    if (scanHistory.length === 0) return;
    const lastAction = scanHistory[scanHistory.length - 1];
    
    setOrders(prev => prev.map(o => {
      if (o.id === lastAction.orderId) {
        const restored = { ...o, items: lastAction.previousItems, status: lastAction.previousStatus };
        if (selectedOrder && selectedOrder.id === o.id) {
          setSelectedOrder(restored);
        }
        return restored;
      }
      return o;
    }));

    setScanHistory(prev => prev.slice(0, -1));
    showToast("تم التراجع عن خطوة المسح الأخيرة وعمل موازنة فورية", "warning");
  };

  // --- معالجة إنشاء طلب جديد بالتحقق المطلوب ---
  const handleCreateOrder = (e) => {
    e.preventDefault();
    if (!newOrderForm.customerName || !newOrderForm.phone || !newOrderForm.address) {
      showToast("خطأ: يرجى ملء كافة الحقول الأساسية للعميل", "error");
      return;
    }

    setIsSaving(true);
    
    // محاكاة الإرسال إلى FastAPI backend في غضون ثانية
    setTimeout(() => {
      const generatedId = `ORD-2026-00${orders.length + 1}`;
      const mockNewOrder = {
        id: generatedId,
        ...newOrderForm,
        status: "معلق",
        createdAt: "2026-05-17 10:00",
        items: [
          { id: "P1", name: "قميص كلاسيك برعندي", size: "L", color: "برعندي", barcode: "6901234567890", quantityRequired: 1, quantityScanned: 0, image: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=150" }
        ]
      };

      setOrders([mockNewOrder, ...orders]);
      // خصم المحجوز من المخزون تلقائياً كقاعدة عمل نظام المبيعات والمخازن المشترك
      setInventory(prev => ({
        ...prev,
        reserved: prev.reserved + 1,
        available: prev.available - 1
      }));

      setIsSaving(false);
      setIsCreateOpen(false);
      setNewOrderForm({ customerName: "", phone: "", address: "", notes: "", paymentMethod: "مدى", items: [] });
      showToast(`تم إنشاء الطلب ${generatedId} وحجز السلع من المخزون بنجاح`);
    }, 800);
  };

  // --- تسجيل بيانات تتبع الشحن النهائية والتسليم ---
  const handleConfirmDelivery = () => {
    if (!deliveryType || !carrierName) {
      showToast("خطأ: يرجى إدخال طريقة التوصيل واسم المسؤول/الشركة", "error");
      return;
    }
    
    setOrders(prev => prev.map(o => {
      if (o.id === selectedOrder.id) {
        const updated = { ...o, deliveryType, carrierName, trackingRegistered: true };
        setSelectedOrder(updated);
        return updated;
      }
      return o;
    }));
    
    setIsTrackingOpen(true); // لفتح نافذة نتائج التوصيل كخطوة تالية دلالية
    showToast("تم تثبيت بيانات الشحن اللوجيستية بنجاح");
  };

  const handleFinalTrackingStatus = (statusResult) => {
    setOrders(prev => prev.map(o => {
      if (o.id === selectedOrder.id) {
        const updated = { ...o, status: statusResult === "success" ? "تم التوصيل" : "مرتجع بالكامل" };
        setSelectedOrder(updated);
        return updated;
      }
      return o;
    }));

    if (statusResult === "success") {
      // تعديل المخزون في حالة التسليم الفعلي الناجح (خصم الفعلي وخصم المحجوز)
      setInventory(prev => ({
        ...prev,
        actual: prev.actual - 1,
        reserved: prev.reserved - 1
      }));
      showToast("تم تحديث حالة الطلب إلى (تم التوصيل بنجاح) وتم خصمه نهائياً من المستودع");
    } else {
      // إعادة المنتجات للمخزون المتاح في حالة الإرجاع
      setInventory(prev => ({
        ...prev,
        reserved: prev.reserved - 1,
        available: prev.available + 1
      }));
      showToast("تم إلغاء الشحنة وإعادة الكميات المحجوزة للمخزون المتاح", "warning");
    }
    setIsTrackingOpen(false);
    setIsDetailOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans antialiased pb-24" dir="rtl">
      
      {/* --- نظام التنبيهات العائم في الأعلى --- */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full">
        {toasts.map(t => (
          <div key={t.id} className={`p-4 rounded-xl shadow-lg border text-sm font-medium flex items-center gap-3 transition-all transform animate-fade-in ${
            t.type === "error" ? "bg-red-50 text-red-800 border-red-200" :
            t.type === "warning" ? "bg-amber-50 text-amber-800 border-amber-200" :
            "bg-emerald-50 text-emerald-800 border-emerald-200"
          }`}>
            {t.type === "error" ? <AlertCircle className="h-5 w-5 text-red-600 shrink-0" /> : <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />}
            <div>{t.message}</div>
          </div>
        ))}
      </div>

      {/* --- محتوى لوحة التحكم الرئيسي للمبيعات --- */}
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        
        {/* Page Header (ترتيب متجاوب دقيق جداً) */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">إدارة المبيعات والطلبات</h1>
            <p className="text-xs text-slate-500 font-medium">لوحة التحكم المركزية للطلبات، تجهيز الشحنات الفوري ومراقبة جرد المستودع.</p>
          </div>
          <button 
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#6b1d2f] text-white hover:bg-[#541624] active:scale-95 transition-all shadow-sm shadow-[#6b1d2f]/20 self-start sm:self-auto"
          >
            <Plus className="h-4 w-4 text-white" />
            <span>طلب جديد</span>
            <span className="bg-white/20 text-[11px] px-1.5 py-0.5 rounded-md font-bold">{orders.length}</span>
          </button>
        </div>

        {/* SalesInventorySummary (ملخص مخزون المبيعات المدمج) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm hover:shadow-md transition-shadow flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs text-slate-500 font-medium block">المخزون الفعلي بالمستودع</span>
              <span className="text-xl font-bold text-blue-600 tracking-tight">{inventory.actual} <span className="text-xs text-slate-400 font-normal">قطعة</span></span>
            </div>
            <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
              <Layers className="h-5 w-5" />
            </div>
          </div>
          
          <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm hover:shadow-md transition-shadow flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs text-slate-500 font-medium block">المخزون المحجوز لذمة طلبات</span>
              <span className="text-xl font-bold text-orange-600 tracking-tight">{inventory.reserved} <span className="text-xs text-slate-400 font-normal">قطعة</span></span>
            </div>
            <div className="h-9 w-9 rounded-lg bg-orange-50 flex items-center justify-center text-orange-600">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>

          <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm hover:shadow-md transition-shadow flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs text-slate-500 font-medium block">المخزون المتاح للبيع الحر</span>
              <span className="text-xl font-bold text-emerald-600 tracking-tight">{inventory.available} <span className="text-xs text-slate-400 font-normal">قطعة</span></span>
            </div>
            <div className="h-9 w-9 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
              <ShieldCheck className="h-5 w-5" />
            </div>
          </div>
        </div>

        {/* حقل البحث الكامل العرض مع عناصر التصفية الفلترية */}
        <div className="space-y-3 bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm">
          <div className="relative rounded-md shadow-sm">
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="block w-full pr-10 pl-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#6b1d2f] focus:border-[#6b1d2f] transition-all"
              placeholder="ابحث بواسطة اسم العميل، رقم الهاتف، أو كود المعرف الرقمي للطلب..."
            />
          </div>

          {/* أزرار الفلترة المتجاوبة القابلة للتمرير الأفقي */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none items-center justify-start">
            {["الكل", "معلق", "قيد التجهيز", "تم التجهيز", "تم التوصيل"].map((tab) => {
              const isActive = activeFilter === tab;
              const count = filterCounts[tab] || orders.filter(o => o.status === tab).length;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveFilter(tab)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border flex items-center gap-2 ${
                    isActive 
                      ? "bg-[#6b1d2f] text-white border-[#6b1d2f] shadow-sm shadow-[#6b1d2f]/10" 
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span>{tab}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Orders List (قائمة الطلبات المحسنة جداً للهياكل الهجينة) */}
        <div className="space-y-2">
          {filteredOrders.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center flex flex-col items-center justify-center space-y-3">
              <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                <Package className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-800">لا توجد طلبات مطابقة</h3>
                <p className="text-xs text-slate-400 max-w-xs mx-auto">لم نعثر على أي نتائج تطابق فلاتر البحث الحالية، تأكد من المدخلات أو أنشئ طلباً جديداً.</p>
              </div>
              <button 
                onClick={() => setIsCreateOpen(true)}
                className="text-xs bg-slate-100 hover:bg-slate-200 border border-slate-300 px-3 py-2 rounded-lg font-bold text-slate-700 transition-all"
              >
                إنشاء أول طلب مبيعات الآن
              </button>
            </div>
          ) : (
            filteredOrders.map((order) => (
              <div
                key={order.id}
                onClick={() => {
                  setSelectedOrder(order);
                  setDeliveryType(order.deliveryType || "");
                  setCarrierName(order.carrierName || "");
                  setIsDetailOpen(true);
                }}
                className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm hover:shadow-md transition-all cursor-pointer active:scale-[0.995]"
              >
                {/* الجزء الأيمن: العميل والمعرف */}
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-xl border shrink-0 ${
                    order.status === "معلق" ? "bg-amber-50 text-amber-700 border-amber-100" :
                    order.status === "قيد التجهيز" ? "bg-blue-50 text-blue-700 border-blue-100" :
                    order.status === "تم التوصيل" ? "bg-slate-100 text-slate-600 border-slate-200" :
                    "bg-emerald-50 text-emerald-700 border-emerald-100"
                  }`}>
                    {order.status === "معلق" ? <Clock className="h-5 w-5" /> : 
                     order.status === "قيد التجهيز" ? <Layers className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                  </div>
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-slate-900 truncate">{order.customerName}</span>
                      <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                        {order.id}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1"><Phone className="h-3 w-3 text-slate-400" /> {order.phone}</span>
                      <span className="hidden sm:inline-block text-slate-300">|</span>
                      <span className="hidden sm:inline-block truncate max-w-xs">{order.address}</span>
                    </div>
                  </div>
                </div>

                {/* الجزء الأيسر والأوسط: تراكم السلع وحالة الطلب البصرية */}
                <div className="flex items-center justify-between md:justify-end gap-4 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
                  {/* تأثير تراكم صور المنتجات المصغرة */}
                  <div className="flex -space-x-2 space-x-reverse items-center overflow-hidden">
                    {order.items.map((item, idx) => (
                      <img 
                        key={idx} 
                        src={item.image} 
                        alt={item.name} 
                        className="h-8 w-8 rounded-lg object-cover border-2 border-white ring-1 ring-slate-200 shadow-sm"
                        title={`${item.name} - العدد: ${item.quantityRequired}`}
                      />
                    ))}
                    {order.items.length > 2 && (
                      <div className="h-8 w-8 rounded-lg bg-slate-100 border-2 border-white text-[10px] font-bold text-slate-600 flex items-center justify-center ring-1 ring-slate-200">
                        +{order.items.length - 2}
                      </div>
                    )}
                  </div>

                  {/* شارة حالة الطلب المتناسقة */}
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`text-[10px] px-2.5 py-0.5 rounded-full border font-bold ${
                      order.status === "معلق" ? "bg-amber-50 border-amber-200 text-amber-700" :
                      order.status === "قيد التجهيز" ? "bg-blue-50 border-blue-200 text-blue-700" :
                      order.status === "تم التوصيل" ? "bg-slate-100 border-slate-300 text-slate-600" :
                      "bg-emerald-50 border-emerald-200 text-emerald-700"
                    }`}>
                      {order.status}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">{order.createdAt}</span>
                  </div>
                </div>

              </div>
            ))
          )}
        </div>

      </div>

      {/* ========================================================================= */}
      {/* 1. OrderFormDialog (نموذج إنشاء طلب جديد مع ربط جرد المخازن التلقائي) */}
      {/* ========================================================================= */}
      {isCreateOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl flex flex-col max-h-[90vh]">
            
            {/* Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 rounded-t-2xl">
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-[#6b1d2f]" />
                <h2 className="text-base font-bold text-slate-900">إنشاء طلب مبيعات جديد</h2>
              </div>
              <button 
                onClick={() => setIsCreateOpen(false)}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Form Content */}
            <form onSubmit={handleCreateOrder} className="p-5 space-y-4 overflow-y-auto flex-1 text-right">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">اسم العميل الثلاثي <span className="text-red-500">*</span></label>
                <input 
                  type="text" 
                  required
                  placeholder="مثال: محمد بن راشد المري"
                  value={newOrderForm.customerName}
                  onChange={(e) => setNewOrderForm(prev => ({ ...prev, customerName: e.target.value }))}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#6b1d2f] focus:border-[#6b1d2f] transition-all bg-slate-50/50"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">رقم الهاتف الجوال <span className="text-red-500">*</span></label>
                  <input 
                    type="tel" 
                    required
                    placeholder="05xxxxxxxx"
                    value={newOrderForm.phone}
                    onChange={(e) => setNewOrderForm(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full text-xs text-left px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#6b1d2f] focus:border-[#6b1d2f] transition-all bg-slate-50/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">طريقة الدفع المختارة</label>
                  <select 
                    value={newOrderForm.paymentMethod}
                    onChange={(e) => setNewOrderForm(prev => ({ ...prev, paymentMethod: e.target.value }))}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#6b1d2f] focus:border-[#6b1d2f] transition-all bg-slate-50"
                  >
                    <option value="مدى">مدى (Mada)</option>
                    <option value="بطاقة ائتمان">بطاقة ائتمان / فيزا</option>
                    <option value="الدفع عند الاستلام">الدفع عند الاستلام</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">عنوان التوصيل السكني بالتفصيل <span className="text-red-500">*</span></label>
                <input 
                  type="text" 
                  required
                  placeholder="المدينة - الحي - اسم الشارع - المعالم المميزة إن وجدت"
                  value={newOrderForm.address}
                  onChange={(e) => setNewOrderForm(prev => ({ ...prev, address: e.target.value }))}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#6b1d2f] focus:border-[#6b1d2f] transition-all bg-slate-50/50"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">ملاحظات خاصة بفريق التجهيز واللوجستيات</label>
                <textarea 
                  rows="2"
                  placeholder="أي تعليمات إضافية بخصوص مواعيد الاستلام أو التعبئة والتغليف..."
                  value={newOrderForm.notes}
                  onChange={(e) => setNewOrderForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#6b1d2f] focus:border-[#6b1d2f] transition-all bg-slate-50/50"
                ></textarea>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                <span className="text-xs font-bold text-slate-700 block">ملخص البضائع الافتراضية المرتبطة بالطلب</span>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>سيتم تضمين: (قميص كلاسيك برعندي XL) بشكل تلقائي للمحاكاة الفورية للربط المخزني.</span>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4 mt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 active:scale-95 transition-all"
                >
                  إلغاء الأمر
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-[#6b1d2f] text-white rounded-lg text-xs font-semibold hover:bg-[#541624] disabled:bg-slate-300 disabled:cursor-not-allowed active:scale-95 transition-all flex items-center gap-1.5"
                >
                  {isSaving ? "جاري حفظ الطلب في الخلفية..." : "تأكيد وإنشاء الطلب"}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. OrderDetailDialog (نافذة تفاصيل الطلب، معالجة المسح والباركود الشاملة) */}
      {/* ========================================================================= */}
      {isDetailOpen && selectedOrder && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-2xl max-w-xl w-full border border-slate-200 shadow-2xl flex flex-col max-h-[90vh]">
            
            {/* Header مع رقم الطلب وإمكانية النسخ الفوري */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 rounded-t-2xl">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-base font-bold text-slate-900">تفاصيل معالجة الطلب:</span>
                <div className="flex items-center gap-1 group bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                  <span className="text-xs font-mono font-bold text-slate-700">{selectedOrder.id}</span>
                  <button 
                    onClick={() => handleCopyId(selectedOrder.id)} 
                    className="p-0.5 hover:bg-white rounded transition-colors text-slate-400 hover:text-slate-600"
                    title="نسخ كود الطلب"
                  >
                    {copiedId === selectedOrder.id ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                  selectedOrder.status === "معلق" ? "bg-amber-50 text-amber-700 border-amber-200" :
                  selectedOrder.status === "قيد التجهيز" ? "bg-blue-50 text-blue-700 border-blue-200" :
                  selectedOrder.status === "تم التوصيل" ? "bg-slate-100 text-slate-500 border-slate-200" :
                  "bg-emerald-50 text-emerald-700 border-emerald-200"
                }`}>
                  {selectedOrder.status}
                </span>
              </div>
              <button 
                onClick={() => setIsDetailOpen(false)}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-5 overflow-y-auto flex-1 space-y-5 text-right">
              
              {/* بيانات العميل والتواصل الاجتماعي اللوجيستي */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <User className="h-4 w-4 text-[#6b1d2f]" />
                    <span>بيانات ومعلومات العميل وعنوان الشحن</span>
                  </h3>
                  <button className="text-[11px] font-bold text-[#6b1d2f] hover:underline flex items-center gap-0.5">
                    <Pencil className="h-3 w-3" /> تعديل البيانات
                  </button>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600">
                  <div className="flex items-center gap-1"><User className="h-3.5 w-3.5 text-slate-400" /> <span className="font-medium">{selectedOrder.customerName}</span></div>
                  <div className="flex items-center gap-1"><Phone className="h-3.5 w-3.5 text-slate-400" /> <span className="font-mono">{selectedOrder.phone}</span></div>
                  <div className="flex items-center gap-1 sm:col-span-2"><MapPin className="h-3.5 w-3.5 text-slate-400 text-right" /> <span>{selectedOrder.address}</span></div>
                  {selectedOrder.notes && (
                    <div className="flex items-start gap-1 sm:col-span-2 bg-amber-50/50 p-2 rounded border border-amber-100 text-amber-900 text-[11px]">
                      <MessageSquare className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                      <span><strong>ملاحظة اللوجستيات:</strong> {selectedOrder.notes}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* قسم التحقق والمسح الضوئي (Barcode Scanning System) */}
              {selectedOrder.status !== "تم التوصيل" && (
                <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                      <ScanLine className="h-4 w-4 text-[#6b1d2f]" />
                      <span>وحدة فحص المنتجات والمسح للباربود الاستدلالي</span>
                    </div>
                    {scanHistory.length > 0 && (
                      <button 
                        onClick={handleUndoLastScan}
                        className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-1 rounded hover:bg-amber-100 flex items-center gap-1 font-bold transition-all"
                      >
                        <RefreshCw className="h-3 w-3" /> التراجع عن آخر مسح
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setIsScannerOpen(true)}
                      className="bg-slate-100 hover:bg-slate-200 border border-slate-300 p-2.5 rounded-lg text-slate-700 flex items-center justify-center gap-1.5 text-xs font-bold shrink-0 transition-all active:scale-95"
                      title="فتح كاميرا الباركود"
                    >
                      <Camera className="h-4 w-4 text-[#6b1d2f]" />
                      <span>تشغيل الماسح الرقمي</span>
                    </button>

                    <div className="flex-1 flex gap-1">
                      <input 
                        type="text" 
                        placeholder="أو أدخل رقم الباركود التابع للسلعة يدوياً..." 
                        value={manualBarcode}
                        onChange={(e) => setManualBarcode(e.target.value)}
                        className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#6b1d2f]"
                      />
                      <button 
                        onClick={() => handleBarcodeScan(manualBarcode)}
                        className="bg-[#6b1d2f] text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-[#541624] transition-all"
                      >
                        تأكيد
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* قائمة البضائع المطلوبة داخل الشحنة مع شريط حالة التقدم */}
              <div className="space-y-2.5">
                <span className="text-xs font-bold text-slate-800 block">المنتجات والقطع المدرجة في بيان التجهيز:</span>
                
                {selectedOrder.items.map((item, index) => {
                  const progressPercentage = (item.quantityScanned / item.quantityRequired) * 100;
                  const isDone = item.quantityScanned === item.quantityRequired;
                  return (
                    <div key={index} className="border border-slate-200 rounded-xl p-3 bg-white space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <img src={item.image} alt={item.name} className="h-12 w-12 rounded-lg object-cover border border-slate-200" />
                          <div className="space-y-0.5">
                            <h4 className="text-xs font-bold text-slate-900">{item.name}</h4>
                            <div className="flex items-center gap-2 text-[10px] text-slate-500 font-medium">
                              <span className="bg-slate-100 px-1 py-0.2 rounded">المقاس: {item.size}</span>
                              <span className="bg-slate-100 px-1 py-0.2 rounded">اللون: {item.color}</span>
                              <span className="font-mono tracking-tight bg-slate-50 px-1 py-0.2 rounded text-slate-400">Barcode: {item.barcode}</span>
                            </div>
                          </div>
                        </div>

                        {/* كمية الممسوح ضد المطلوب */}
                        <div className="text-left shrink-0">
                          <span className={`text-xs font-mono font-bold ${isDone ? "text-emerald-600" : "text-slate-700"}`}>
                            {item.quantityScanned} / {item.quantityRequired}
                          </span>
                          <span className="text-[10px] text-slate-400 block font-medium">الكمية المفحوصة</span>
                        </div>
                      </div>

                      {/* شريط حالة التقدم الديناميكي الفوري (Dynamic Progress Bar) */}
                      <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div 
                          className={`h-1.5 rounded-full transition-all duration-300 ${isDone ? 'bg-emerald-500' : 'bg-blue-500'}`} 
                          style={{ width: `${progressPercentage}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* قسم خيارات الشحن وتأكيد التسليم المتقدم (الخطوة التالية المدمجة) */}
              {selectedOrder.status === "تم التجهيز" && !selectedOrder.trackingRegistered && (
                <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-3 animate-fade-in">
                  <span className="text-xs font-bold text-emerald-900 block flex items-center gap-1">
                    <Truck className="h-4 w-4 text-emerald-700" />
                    <span>اكتمل التجهيز اللوجيستي! يرجى ربط وتثبيت جهة الشحن الفورية:</span>
                  </span>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="space-y-1">
                      <label className="font-bold text-slate-700">نوع الشحن</label>
                      <select 
                        value={deliveryType} 
                        onChange={(e) => setDeliveryType(e.target.value)}
                        className="w-full p-2 border border-slate-300 bg-white rounded-lg"
                      >
                        <option value="">-- اختر الفئة --</option>
                        <option value="شركة توصيل">شركة شحن وتوصيل متعاقدة</option>
                        <option value="توصيل خاص">مندوب توصيل خاص بالنظام</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="font-bold text-slate-700">اسم الناقل أو المندوب المسؤول</label>
                      <input 
                        type="text" 
                        placeholder="مثال: أرامكس، سمسا، مندوب 4"
                        value={carrierName}
                        onChange={(e) => setCarrierName(e.target.value)}
                        className="w-full p-2 border border-slate-300 bg-white rounded-lg"
                      />
                    </div>
                  </div>

                  <button 
                    onClick={handleConfirmDelivery}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2 rounded-lg transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    <Truck className="h-4 w-4 text-white" />
                    <span>تأكيد الإسناد وبدء التوصيل الخارجي</span>
                  </button>
                </div>
              )}

              {/* في حال تم تثبيت بيانات الناقل، إظهار زر تسجيل النتيجة النهائية */}
              {selectedOrder.trackingRegistered && selectedOrder.status !== "تم التوصيل" && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between text-xs">
                  <div className="space-y-0.5">
                    <span className="font-bold text-blue-900 block">تم الشحن بواسطة {selectedOrder.carrierName} ({selectedOrder.deliveryType})</span>
                    <span className="text-slate-500">في انتظار استلام النتيجة من السائق أو العميل.</span>
                  </div>
                  <button 
                    onClick={() => setIsTrackingOpen(true)}
                    className="bg-blue-600 text-white font-bold px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    تسجيل نتيجة التسليم
                  </button>
                </div>
              )}

              {/* زر إلغاء الطلب الإتلافي الحذر */}
              {selectedOrder.status !== "تم التوصيل" && (
                <div className="border-t border-slate-100 pt-4 flex justify-between items-center">
                  <button
                    onClick={() => {
                      if(window.confirm("هل أنت متأكد تماماً من إلغاء هذا الطلب وإعادة السلع المحجوزة تلقائياً للمستودع؟")) {
                        setOrders(prev => prev.filter(o => o.id !== selectedOrder.id));
                        setInventory(prev => ({ ...prev, reserved: prev.reserved - 1, available: prev.available + 1 }));
                        setIsDetailOpen(false);
                        showToast("تم إلغاء الطلب بالكامل وتحرير جرد المخزن فورياً", "warning");
                      }
                    }}
                    className="text-xs text-red-600 hover:text-red-700 font-bold border border-red-200 hover:bg-red-50 px-3 py-2 rounded-lg transition-all flex items-center gap-1"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-600" />
                    <span>إلغاء الطلب وإعادة البضاعة للمخزن</span>
                  </button>
                  <span className="text-[10px] text-slate-400 font-medium">تم الإنشاء بواسطة: موظف المبيعات السحابي</span>
                </div>
              )}

            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. BarcodeScanner Overlay (شاشة محاكاة فحص مسح الباركود الكاملة) */}
      {/* ========================================================================= */}
      {isScannerOpen && (
        <div className="fixed inset-0 bg-black/90 z-[70] flex flex-col items-center justify-center p-4 animate-fade-in text-white">
          <div className="absolute top-4 right-4 left-4 flex items-center justify-between">
            <span className="text-xs font-bold tracking-wider text-slate-300">محاكاة كاميرا مسح الباركود والمطابقة الفورية للمنتج</span>
            <button 
              onClick={() => setIsScannerOpen(false)}
              className="bg-white/10 p-2 rounded-full hover:bg-white/20 text-white transition-all"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="max-w-md w-full space-y-8 text-center">
            {/* إطار العدسة والمستطيل الاستهدافي للـ Barcode */}
            <div className="relative aspect-video w-full bg-slate-800 rounded-2xl border-2 border-dashed border-slate-600 flex flex-col items-center justify-center overflow-hidden shadow-2xl">
              {/* خط الليزر المضيء المتحرك الأنيق لتجربة مستخدم متميزة */}
              <div className="absolute inset-x-0 h-0.5 bg-red-500 shadow-lg shadow-red-500 animate-bounce top-1/2"></div>
              
              <p className="text-xs text-slate-400 px-6 pointer-events-none">
                [ المحاكاة نشطة: انقر على الروابط بالأسفل لتجربة مسح الأكواد المتطابقة فوريّاً ]
              </p>
            </div>

            {/* أزرار مساعدة لاختبار الكاميرا والباركود المتوقع للطلب الحالي بدقة متناهية */}
            <div className="space-y-3">
              <span className="text-xs font-bold text-slate-400 block">أكواد المنتجات المتوقعة في الطلب الحالي للتحقق السريع:</span>
              <div className="flex flex-col gap-2">
                {selectedOrder?.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      handleBarcodeScan(item.barcode);
                      setIsScannerOpen(false);
                    }}
                    className="bg-white/10 hover:bg-white/20 border border-white/10 p-2.5 rounded-xl text-right text-xs transition-all flex items-center justify-between"
                  >
                    <div>
                      <span className="font-bold text-white block">{item.name}</span>
                      <span className="text-[10px] font-mono text-slate-400 block">باركود: {item.barcode}</span>
                    </div>
                    <span className="text-[10px] bg-[#6b1d2f] text-white px-2 py-0.5 rounded font-bold">محاكاة مسح السلعة</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. DeliveryTrackingDialog (نافذة تسجيل النتيجة وتأكيد حالة التسليم) */}
      {/* ========================================================================= */}
      {isTrackingOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full border border-slate-200 shadow-2xl p-5 text-right space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Truck className="h-5 w-5 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900">تسجيل نتيجة التوصيل النهائية</h3>
            </div>

            <p className="text-xs text-slate-500">
              يرجى تحديد الإفادة اللوجستية التي تم استلامها من شركة التوصيل أو المندوب للطلب رقم <strong className="font-mono">{selectedOrder?.id}</strong>.
            </p>

            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleFinalTrackingStatus("success")}
                className="w-full text-right p-3 rounded-xl border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 text-emerald-900 text-xs font-bold transition-all flex items-center justify-between"
              >
                <span>تم التسليم بنجاح للعميل (تم البيع)</span>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              </button>
              
              <button
                onClick={() => handleFinalTrackingStatus("returned")}
                className="w-full text-right p-3 rounded-xl border border-red-200 bg-red-50/50 hover:bg-red-50 text-red-900 text-xs font-bold transition-all flex items-center justify-between"
              >
                <span>مرتجع بالكامل (فشل العميل في الاستلام)</span>
                <AlertCircle className="h-4 w-4 text-red-600" />
              </button>
            </div>

            <div className="flex justify-end pt-2">
              <button 
                onClick={() => setIsTrackingOpen(false)}
                className="text-[11px] font-bold text-slate-400 hover:text-slate-600"
              >
                إغلاق النافذة والعودة لاحقاً
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- شريط التنقل السفلي للهواتف المحمولة (Mobile Bottom Nav) --- */}
      <div className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 px-6 py-2 flex items-center justify-between z-40 shadow-xl">
        <button onClick={() => setActiveFilter("الكل")} className="flex flex-col items-center gap-0.5 text-slate-400 hover:text-[#6b1d2f]">
          <Package className="h-5 w-5" />
          <span className="text-[10px] font-medium">الطلبات</span>
        </button>
        <button onClick={() => setIsCreateOpen(true)} className="flex flex-col items-center justify-center -mt-6 bg-[#6b1d2f] text-white h-12 w-12 rounded-full shadow-lg shadow-[#6b1d2f]/30 border-4 border-white active:scale-95 transition-all">
          <Plus className="h-5 w-5" />
        </button>
        <button onClick={() => { if(orders[0]) { setSelectedOrder(orders[0]); setIsDetailOpen(true); } }} className="flex flex-col items-center gap-0.5 text-slate-400 hover:text-[#6b1d2f]">
          <ScanLine className="h-5 w-5" />
          <span className="text-[10px] font-medium">آخر معالجة</span>
        </button>
      </div>

    </div>
  );
}