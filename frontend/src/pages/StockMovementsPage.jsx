import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Search, Filter, Calendar, AlertTriangle, RefreshCw, 
  ArrowDownLeft, ArrowUpRight, Undo2, FileText, X, ChevronDown, 
  ChevronUp, Copy, Check, User, Info, Layers, Loader2, ChevronRight, ChevronLeft, Image
} from 'lucide-react';

// استيراد ملف الـ api الخاص بك المكتوب فيه دالة getInventoryLedger
import { catalogApi } from '../api/catalogApi'; 

export default function StockMovementsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  
  // --- States لإدارة البيانات وحالة التحميل ---
  const [movements, setMovements] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);
  
  // التحكم في الصفحات (Pagination)
  const [currentPage, setCurrentPage] = useState(1);
  const limit = 20; 

  // فلاتر الواجهة
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("الكل");
  const [periodFilter, setPeriodFilter] = useState("الكل");
  const [groupBy, setGroupBy] = useState("التاريخ"); 
  
  // تفاصيل النافذة المنبثقة
  const [selectedMovement, setSelectedMovement] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isJsonExpanded, setIsJsonExpanded] = useState(false);
  const [copiedText, setCopiedText] = useState(null);

  // قراءة الفلاتر الممررة عبر الرابط (Deep Linking) لربط الشاشات ببعضها
  const urlProductId = searchParams.get('product_id');
  const urlVariantId = searchParams.get('variant_id');
  const urlUserId = searchParams.get('user_id');
  const urlOrderId = searchParams.get('related_order_id') || searchParams.get('order_id');

  // مزامنة فلاتر الرابط مع صندوق البحث عند التحميل الأول
  useEffect(() => {
    if (urlProductId) setSearchQuery(`المنتج: ${urlProductId}`);
    else if (urlVariantId) setSearchQuery(`المتغير: ${urlVariantId}`);
    else if (urlUserId) setSearchQuery(`الموظف: ${urlUserId}`);
    else if (urlOrderId) setSearchQuery(`الطلب: ${urlOrderId}`);
  }, [urlProductId, urlVariantId, urlUserId, urlOrderId]);

  const clearUrlFilters = () => {
    setSearchParams({});
    setSearchQuery("");
    setTypeFilter("الكل");
    setPeriodFilter("الكل");
    setCurrentPage(1);
    setErrorMessage(null);
  };

  // --- دوال المطابقة الدقيقة مع معاملات الباك إند ---
  const mapTypeToBackend = (uiType) => {
    const types = { 
      'وارد': 'in', 
      'صادر': 'out', 
      'تالف': 'damage', 
      'تعديل': 'adjustment', 
      'إرجاع': 'return' 
    };
    return types[uiType] || null;
  };

  const mapBackendToUIType = (backendType) => {
    const types = { 
      'in': 'وارد', 
      'out': 'صادر', 
      'damage': 'تالف', 
      'adjustment': 'تعديل', 
      'return': 'إرجاع' 
    };
    return types[backendType] || 'تحويل';
  };

  // المزامنة مع معاملات الوقت إن كان الباك إند يدعمها، وإلا تمرر كـ null آمن
  const mapPeriodToBackend = (uiPeriod) => {
    const periods = { 'اليوم': 'today', 'هذا الأسبوع': 'week', 'هذا الشهر': 'month' };
    return periods[uiPeriod] || null;
  };

  const fetchLedgerData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      // 1. تجهيز المعاملات الفلترة المطابقة للباك إند بدقة 100%
      const params = {
        skip: (currentPage - 1) * limit,
        limit: limit,
        movement_type: mapTypeToBackend(typeFilter),
        time_preset: mapPeriodToBackend(periodFilter) // ممررة للترابط المستقبلي
      };
  
      if (urlProductId) params.product_id = parseInt(urlProductId);
      if (urlVariantId) params.variant_id = parseInt(urlVariantId);
      if (urlUserId) params.user_id = parseInt(urlUserId);
      if (urlOrderId) params.related_order_id = parseInt(urlOrderId);
  
      // إذا قام المستخدم بكتابة رقم مباشر في الصندوق، نعتبره بحثاً برقم الطلب المرتبط
      if (!urlProductId && !urlVariantId && !urlUserId && !urlOrderId && searchQuery) {
        if (/^\d+$/.test(searchQuery)) {
          params.related_order_id = parseInt(searchQuery); 
        }
      }
  
      // 2. استدعاء السيرفر من خلال الدالة المعتمدة
      const response = await catalogApi.getInventoryLedger(params);
      const itemsList = Array.isArray(response) ? response : (response.items || []);
      const totalCount = response.total !== undefined ? response.total : itemsList.length;
  
      // 3. 🌟 ربط ومطابقة الحقول الفعلية (Mapping)
      const mappedItems = itemsList.map(item => {
        const variantObj = item.variant || {};
        const colorObj = variantObj.color || {};
        const productObj = item.product || colorObj.product || {}; 
        const userObj = item.user || {};
  
        return {
          id: item.id,
          variantId: item.variant_id,
          productId: item.product_id,
          type: mapBackendToUIType(item.movement_type),
          productName: productObj.name || "منتج غير معرف",
          productCode: productObj.code || "—",
          size: variantObj.size || "—",
          color: colorObj.name || "—",
          qrCode: variantObj.qr_code || null,
          quantityAvailable: variantObj.quantity_available !== undefined ? variantObj.quantity_available : "—",
          orderId: item.related_order_id ? `ORD-${item.related_order_id}` : "N/A",
          employeeName: userObj.name || "النظام التلقائي",
          quantityDelta: item.quantity_change ?? 0,
          quantityBefore: item.quantity_before ?? 0,
          quantityAfter: item.quantity_after ?? 0,
          damageReason: item.damage_reason || null,
          createdAt: item.created_at ? new Date(item.created_at).toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'short' }) : "N/A",
          notes: item.notes || "لا توجد ملاحظات إضافية",
          rawJson: item 
        };
      });
  
      setMovements(mappedItems);
      setTotalItems(totalCount);
  
    } catch (error) {
      console.error("Ledger Mapping Crash:", error);
      setErrorMessage(error || "حدث خطأ أثناء تحميل ومزامنة البيانات مع السيرفر.");
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, typeFilter, periodFilter, searchQuery, urlProductId, urlVariantId, urlUserId, urlOrderId]);

  // تنفيذ طلب جلب البيانات مع تطبيق الـ Debounce للحماية من كثرة الطلبات
  useEffect(() => {
    const handler = setTimeout(() => {
      fetchLedgerData();
    }, 400);
    return () => clearTimeout(handler);
  }, [fetchLedgerData]);

  // تصفير مؤشر الصفحات تلقائياً عند تغيير فلاتر البحث
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, typeFilter, periodFilter]);

  // --- حساب إجماليات سريعة للصفحة المعروضة حالياً ---
  const currentMetrics = useMemo(() => {
    let totalIn = 0;
    let totalOut = 0;
    movements.forEach(m => {
      if (m.quantityDelta > 0) totalIn += m.quantityDelta;
      else totalOut += Math.abs(m.quantityDelta);
    });
    return { totalIn, totalOut };
  }, [movements]);

  // --- منطق التجميع البصري الديناميكي في الواجهة ---
  const groupedMovements = useMemo(() => {
    const groups = {};
    movements.forEach(mov => {
      let key = "";
      if (groupBy === "التاريخ") {
        key = mov.createdAt.split(" ")[0] || "بدون تاريخ"; 
      } else if (groupBy === "الموظف") {
        key = mov.employeeName;
      } else if (groupBy === "النوع") {
        key = mov.type;
      }

      if (!groups[key]) groups[key] = [];
      groups[key].push(mov);
    });
    return groups;
  }, [movements, groupBy]);

  const getMovementMeta = (type) => {
    switch (type) {
      case "وارد": return { icon: ArrowDownLeft, color: "text-emerald-600 bg-emerald-50 border-emerald-200" };
      case "صادر": return { icon: ArrowUpRight, color: "text-red-600 bg-red-50 border-red-200" };
      case "تالف": return { icon: AlertTriangle, color: "text-amber-600 bg-amber-50 border-amber-200", label: "توالف" };
      case "إرجاع": return { icon: Undo2, color: "text-violet-600 bg-violet-50 border-violet-200", label: "رواجع" };
      case "تعديل": return { icon: RefreshCw, color: "text-blue-600 bg-blue-50 border-blue-200" };
      default: return { icon: FileText, color: "text-slate-600 bg-slate-50 border-slate-200" };
    }
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const totalPages = Math.ceil(totalItems / limit);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans antialiased pb-24" dir="rtl">
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">

        {/* --- Header --- */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">سجل حركات المخزن المباشر</h1>
            <p className="text-xs text-slate-500 font-medium">نظام التدقيق والرقابة الشامل الحقيقي المرتبط بقاعدة البيانات الحية فوراً.</p>
          </div>
          
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>+{currentMetrics.totalIn} صنف وارد بالصفحة</span>
            </div>
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
              <span>-{currentMetrics.totalOut} صنف صادر بالصفحة</span>
            </div>
          </div>
        </div>

        {/* --- بنر التصفية الخارجية النشطة --- */}
        {(urlProductId || urlVariantId || urlUserId || urlOrderId) && (
          <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl flex items-center justify-between animate-fade-in">
            <div className="flex items-center gap-2 text-xs text-blue-800 font-medium">
              <Info className="h-4 w-4 text-blue-600 shrink-0" />
              <span>أنت تستعرض الآن سجلات مفلترة تلقائياً بناءً على توجيه من شاشة أخرى.</span>
            </div>
            <button 
              onClick={clearUrlFilters}
              className="text-xs bg-white text-blue-700 border border-blue-300 px-2.5 py-1 rounded-lg hover:bg-blue-100 transition-colors font-bold"
            >
              إلغاء الفلتر الخارجي والعودة للكل
            </button>
          </div>
        )}

        {/* --- عرض رسائل الخطأ من السيرفر --- */}
        {errorMessage && (
          <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1 w-full">
              <p className="font-bold">فشلت عملية جلب سجل الحركة:</p>
              <p className="font-mono text-red-600 break-words">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* --- الفلاتر وبار البحث المتوافق --- */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
            
            {/* بار البحث المرتبط برقم الطلب للباك إند */}
            <div className="relative lg:col-span-2 rounded-md shadow-sm">
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="text"
                value={searchQuery}
                disabled={!!(urlProductId || urlVariantId || urlUserId || urlOrderId)}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="block w-full pr-10 pl-3 py-2 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:bg-white focus:ring-1 focus:ring-[#6b1d2f] focus:outline-none transition-all disabled:opacity-60"
                placeholder="أدخل رقم الطلب للبحث السريع (مثال: 86)..."
              />
            </div>

            {/* فلتر النوع المتطابق مع السيرفر */}
            <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-2 bg-slate-50/50">
              <Filter className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full text-xs bg-transparent py-2 focus:outline-none text-slate-700 font-medium"
              >
                <option value="الكل">كل العمليات المخزنية</option>
                <option value="وارد">وارد / استلام شحنات</option>
                <option value="صادر">صادر / مبيعات طلبيات</option>
                <option value="تالف">تالف / استبعاد بضائع</option>
                <option value="تعديل">تعديل جرد يدوي</option>
                <option value="إرجاع">مرتجع بضائع العميل</option>
              </select>
            </div>

            {/* فلتر المدة الزمنية */}
            <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-2 bg-slate-50/50">
              <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <select
                value={periodFilter}
                onChange={(e) => setPeriodFilter(e.target.value)}
                className="w-full text-xs bg-transparent py-2 focus:outline-none text-slate-700 font-medium"
              >
                <option value="الكل">كل المدد الزمنية</option>
                <option value="اليوم">اليوم الحالي</option>
                <option value="هذا الأسبوع">آخر 7 أيام (أسبوع)</option>
                <option value="هذا الشهر">آخر 30 يوم (شهر)</option>
              </select>
            </div>

            {/* آلية التجميع البصري */}
            <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-2 bg-slate-50/50">
              <Layers className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value)}
                className="w-full text-xs bg-transparent py-2 focus:outline-none text-slate-700 font-bold text-[#6b1d2f]"
              >
                <option value="التاريخ">تجميع حسب: تاريخ اليوم</option>
                <option value="الموظف">تجميع حسب: اسم الموظف</option>
                <option value="النوع">تجميع حسب: نوع الحركة</option>
              </select>
            </div>

          </div>
        </div>

        {/* --- القائمة والبيانات المجمعة --- */}
        <div className="space-y-6 relative min-h-[200px]">
          {isLoading && (
             <div className="absolute inset-0 bg-white/70 backdrop-blur-[2px] z-20 flex items-center justify-center rounded-xl transition-all">
               <div className="flex flex-col items-center gap-2 bg-white px-6 py-4 rounded-xl shadow-md border border-slate-200">
                 <Loader2 className="h-6 w-6 text-[#6b1d2f] animate-spin" />
                 <span className="text-xs font-bold text-slate-600">مزامنة البيانات الحية من الخادم...</span>
               </div>
             </div>
          )}

          {Object.keys(groupedMovements).length === 0 && !isLoading ? (
            <div className="bg-white border border-slate-200 rounded-xl p-16 text-center flex flex-col items-center justify-center space-y-3 shadow-sm">
              <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                <Filter className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-800">لا توجد حركات مخزنية مطابقة للفلترة</h3>
                <p className="text-xs text-slate-400 max-w-xs mx-auto">لم يسجل النظام أي حركة تطابق المدخلات في قاعدة البيانات حالياً.</p>
              </div>
            </div>
          ) : (
            Object.keys(groupedMovements).map((groupKey) => (
              <div key={groupKey} className="space-y-2.5 animate-fade-in">
                
                {/* فاصل المجموعات الدلالي */}
                <div className="flex items-center gap-2 px-1">
                  <span className="text-xs font-black text-slate-700 bg-slate-200/80 px-2.5 py-1 rounded-lg">
                    {groupKey}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400">
                    ({groupedMovements[groupKey].length} عملية)
                  </span>
                </div>

                {/* الحركات الفردية */}
                <div className="space-y-2">
                  {groupedMovements[groupKey].map((mov) => {
                    const Meta = getMovementMeta(mov.type);
                    const isPositive = mov.quantityDelta > 0;
                    return (
                      <div
  key={mov.id}
  onClick={() => { setSelectedMovement(mov); setIsDetailOpen(true); document.body.style.overflow = 'hidden'; }}
  className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-sm hover:shadow-md transition-all cursor-pointer group"
>
  {/* الجزء الأيمن: الأيقونة + الاسم */}
  <div className="flex items-center gap-4">
    <div className={`h-12 w-12 rounded-xl border flex items-center justify-center shrink-0 ${Meta.color}`}>
      <Meta.icon className="h-6 w-6" />
    </div>
    <div>
      <h4 className="text-sm font-bold text-slate-900">{mov.productName}</h4>
      <p className="text-[11px] text-slate-500 font-medium mt-0.5">
        {mov.color} • {mov.size}
      </p>
    </div>
  </div>

  {/* الجزء الأيسر: المسؤول والتاريخ والكمية */}
  <div className="flex items-center gap-8">
    <div className="text-right hidden sm:block">
      <p className="text-xs font-bold text-slate-700">{mov.employeeName}</p>
      <p className="text-[10px] text-slate-400 font-mono" dir="ltr">{mov.createdAt?.replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))}</p>
    </div>
    <div className={`text-lg font-black font-mono px-4 py-1.5 rounded-lg border ${isPositive ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-red-700 bg-red-50 border-red-200"}`}>
      {isPositive ? `+${mov.quantityDelta}` : mov.quantityDelta}
    </div>
  </div>
</div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* --- نظام نقل الصفحات (Pagination Controls) --- */}
        {!isLoading && totalPages > 1 && (
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-sm mt-6">
            <span className="text-xs text-slate-500 font-medium">
              إجمالي الحركات في النظام: <strong className="text-slate-900">{totalItems}</strong> سجل
            </span>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition-colors disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <span className="text-xs font-bold text-slate-700 px-2">
                صفحة {currentPage} من {totalPages}
              </span>
              <button 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition-colors disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

      </div>

  {/* --- نافذة التفاصيل والمراجعة الشاملة --- */}
{isDetailOpen && selectedMovement && (() => {
  // تعريف Meta محلياً داخل النطاق الصحيح لمنع أخطاء الـ Reference
  const Meta = getMovementMeta(selectedMovement.type);
  
  // شرط ذكي للتحقق من التوالف والرواجع لإخفاء البيانات غير المرغوبة
  const isSpecialMovement = ["تالف", "إرجاع"].includes(selectedMovement.type);

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* رأسية النافذة بتنسيق احترافي */}
        <div className="flex items-start justify-between p-5 border-b border-slate-100 relative">
          {/* اليمين: الأيقونة + اسم المنتج */}
          <div className="flex items-center gap-4">
            <div className={`h-16 w-16 rounded-2xl flex items-center justify-center shrink-0 ${Meta.color}`}>
              <Meta.icon className="h-8 w-8" />
            </div>
            <div className="text-right">
              <h3 className="text-sm font-bold text-slate-900">{selectedMovement.productName}</h3>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                {selectedMovement.color} | {selectedMovement.size}
              </p>
            </div>
          </div>
  
          {/* اليسار: الموظف + التاريخ بالأرقام الإنجليزية + زر الإغلاق */}
          <div className="text-left flex flex-col items-end gap-2">
            <button 
              onClick={() => { setIsDetailOpen(false); document.body.style.overflow = ''; }}
              className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="text-left">
              <p className="text-xs font-bold text-slate-700">{selectedMovement.employeeName}</p>
              <p className="text-[10px] text-slate-400 font-mono mt-0.5" dir="ltr">
                {selectedMovement.createdAt?.replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))}
              </p>
            </div>
          </div>
        </div>
  
        {/* جسم النافذة (التفاصيل) */}
        <div className="p-5 overflow-y-auto space-y-4 text-right">
          <div className="text-center pb-3 border-b border-slate-100 space-y-1">
            <span className={`inline-flex text-[10px] font-bold px-3 py-0.5 rounded-full border ${
              selectedMovement.quantityDelta > 0 ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"
            }`}>
              عملية: {selectedMovement.type}
            </span>
          </div>
  
          {/* بطاقة جرد المخزون قبل وبعد */}
          <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200 text-center" dir="ltr">
            <div className="space-y-0.5">
              <span className="text-[10px] text-slate-400 block font-medium">المخزون قبل</span>
              <span className="text-xs font-mono font-bold text-slate-600">{selectedMovement.quantityBefore}</span>
            </div>
            <div className="space-y-0.5 border-x border-slate-200">
              <span className="text-[10px] text-slate-400 block font-medium">صافي التغير</span>
              <span className={`text-xs font-mono font-black ${selectedMovement.quantityDelta > 0 ? "text-emerald-600" : "text-red-600"}`}>
                {selectedMovement.quantityDelta > 0 ? `+${selectedMovement.quantityDelta}` : selectedMovement.quantityDelta}
              </span>
            </div>
            <div className="space-y-0.5">
              <span className="text-[10px] text-slate-400 block font-medium">المخزون بعد</span>
              <span className="text-xs font-mono font-bold text-slate-900">{selectedMovement.quantityAfter}</span>
            </div>
          </div>
  
          {/* المخزن الحالي والباركود / الصورة */}
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex items-center justify-between">
            <div className="space-y-1 text-right">
              <span className="text-[10px] text-slate-400 block font-medium">المخزون الفعلي الحالي:</span>
              <div dir="ltr" className="text-sm font-bold text-slate-900 font-mono inline-block">
                {selectedMovement.quantityAvailable} <span className="text-xs font-sans font-normal text-slate-500">pcs</span>
              </div>
            </div>
            
            {/* ✅ تم تحديث الشرط الخارجي هنا ليتوافق مع حقول قاعدة البيانات ولا يحجب الصورة أبداً */}
            {(selectedMovement.color_image || selectedMovement.main_image || selectedMovement.qr_code || selectedMovement.image || selectedMovement.product?.main_image || selectedMovement.variant?.qr_code || selectedMovement.color?.color_image) && (
              <div className="h-14 w-14 bg-white border border-slate-200 rounded-lg p-1 flex items-center justify-center shadow-sm shrink-0">
                <img 
                  src={(() => {
                    const rawPath = 
                      selectedMovement.color_image || 
                      selectedMovement.main_image || 
                      selectedMovement.qr_code || 
                      selectedMovement.image ||
                      selectedMovement.product?.main_image ||
                      selectedMovement.variant?.qr_code ||
                      selectedMovement.color?.color_image ||
                      selectedMovement.product_color?.color_image;
                    
                    if (!rawPath) return "https://placehold.co/150?text=No+Image";
                    if (rawPath.startsWith('http')) return rawPath;
                    
                    const BACKEND_URL = "http://localhost:5000"; 
                    const cleanPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
                    
                    // 💡 بما أن المسار الكامل أعطى 404 سابقاً، فالسيرفر يتجاهل كلمة static تلقائياً
                    // لذلك قمت بتفعيل حذف كلمة static ليعمل الرابط مباشرة ويجلب الصورة
                    return `${BACKEND_URL}${cleanPath.replace('/static', '')}`;
                  })()} 
                  alt="Product Visual" 
                  className="h-full w-full object-contain rounded-md" 
                  onError={(e) => { 
                    e.target.src = "https://placehold.co/150?text=404+Error"; 
                  }} 
                />
              </div>
            )}
          </div>
  
          {/* المسؤول */}
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 block">المسؤول عن الحركة:</span>
            <div className="border border-slate-200 rounded-lg p-2.5 flex items-center justify-between text-xs bg-white shadow-sm">
              <span className="font-bold text-slate-800">{selectedMovement.employeeName}</span>
              <User className="h-4 w-4 text-slate-400" />
            </div>
          </div>
  
          {/* ملاحظات وتفاصيل إضافية */}
          <div className="space-y-2 text-xs">
            {!isSpecialMovement && (
              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                <span className="text-slate-400">رقم الطلب المرتبط:</span>
                <span className="font-mono font-bold text-slate-700" dir="ltr">{selectedMovement.orderId}</span>
              </div>
            )}
  
            {selectedMovement.damageReason && (
              <div className="space-y-1 bg-orange-50/70 border border-orange-100 p-2 rounded-lg">
                <span className="text-orange-700 font-bold block text-[10px]">سبب التلف:</span>
                <p className="text-orange-900 text-[11px] font-medium">{selectedMovement.damageReason}</p>
              </div>
            )}
  
            <div className="space-y-1">
              <span className="text-slate-400 block">ملاحظات:</span>
              <p className="bg-slate-50 border border-slate-100 p-2.5 rounded-lg text-slate-600 text-[11px] leading-relaxed">
                {selectedMovement.notes}
              </p>
            </div>
          </div>
  
          {/* عرض بيانات الـ JSON */}
          {!isSpecialMovement && (
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
              <button type="button" onClick={() => setIsJsonExpanded(!isJsonExpanded)} className="w-full px-3 py-2 flex items-center justify-between text-[11px] font-bold text-slate-600 bg-slate-100">
                <span>بيانات الحركة التقنية</span>
                {isJsonExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
              {isJsonExpanded && (
                <pre className="p-3 text-[10px] font-mono text-left bg-slate-900 text-emerald-400 overflow-x-auto max-h-48" dir="ltr">
                  {JSON.stringify(selectedMovement.rawJson, null, 2)}
                </pre>
              )}
            </div>
          )}
  
        </div>
      </div>
    </div>
  );
})()}

    </div>
  );
}