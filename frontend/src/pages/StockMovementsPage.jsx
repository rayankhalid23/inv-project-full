import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Search, Filter, Calendar, ScanLine, AlertTriangle, RefreshCw, 
  ArrowDownLeft, ArrowUpRight, Undo2, FileText, X, ChevronDown, 
  ChevronUp, Copy, Check, User, Info, Layers
} from 'lucide-react';

// --- بيانات تاريخية متكاملة لعام 2026 لمحاكاة سجل تدقيق مخزون MySQL دقيق ---
const INITIAL_MOVEMENTS = [
  {
    id: "MOV-2026-881",
    type: "وارد",
    productName: "قميص كلاسيك برعندي",
    sku: "BLG-SH-BUR-XL",
    size: "XL",
    color: "برعندي",
    orderId: "ORD-2026-001",
    employeeName: "أحمد المولد",
    employeeEmail: "a.mohammad@bellagio.sa",
    quantityDelta: 50,
    quantityBefore: 200,
    quantityAfter: 250,
    createdAt: "2026-05-17 08:30",
    notes: "استلام وتوريد شحنة جديدة من المصنع الإقليمي وتحديث الرفوف الرئيسية",
    rawJson: { event: "STOCK_IN", source: "factory_delivery", batch_id: "BTCH-992", db_latency_ms: 14 }
  },
  {
    id: "MOV-2026-882",
    type: "صادر",
    productName: "بنطال جينز رمادي فاخر",
    sku: "BLG-JN-GRY-34",
    size: "34",
    color: "رمادي",
    orderId: "ORD-2026-001",
    employeeName: "سلطان العتيبي",
    employeeEmail: "s.alotaibi@bellagio.sa",
    quantityDelta: -2,
    quantityBefore: 45,
    quantityAfter: 43,
    createdAt: "2026-05-17 09:15",
    notes: "تجهيز تلقائي عبر مسح الباركود لصالح طلب مبيعات العميل أحمد عبد الله",
    rawJson: { event: "ORDER_SCAN_OUT", checkout_type: "pos_system", terminal_id: "TERM-04", db_latency_ms: 8 }
  },
  {
    id: "MOV-2026-883",
    type: "تالف",
    productName: "حذاء رياضي رمادي خفيف",
    sku: "BLG-SHW-GRY-42",
    size: "42",
    color: "رمادي/برعندي",
    orderId: "N/A",
    employeeName: "أحمد المولد",
    employeeEmail: "a.mohammad@bellagio.sa",
    quantityDelta: -1,
    quantityBefore: 12,
    quantityAfter: 11,
    createdAt: "2026-05-16 11:20",
    notes: "استبعاد قطعة تالفة بسبب وجود قطع في النسيج الجانبي أثناء الجرد الدوري",
    rawJson: { event: "WASTE_DISPOSAL", reason_code: "fabric_tear", approved_by: "MGR-01", db_latency_ms: 22 }
  },
  {
    id: "MOV-2026-884",
    type: "تعديل",
    productName: "قميص كلاسيك برعندي",
    sku: "BLG-SH-BUR-L",
    size: "L",
    color: "برعندي",
    orderId: "ORD-2026-099",
    employeeName: "سارة الشمري",
    employeeEmail: "s.alshammari@bellagio.sa",
    quantityDelta: 5,
    quantityBefore: 88,
    quantityAfter: 93,
    createdAt: "2026-05-16 14:45",
    notes: "تعديل يدوي لتصحيح خطأ إدخال سابق وموازنة الفروقات بين الدفتري والفعلي",
    rawJson: { event: "MANUAL_ADJUSTMENT", audit_session: "AUD-2026-V1", db_latency_ms: 11 }
  },
  {
    id: "MOV-2026-885",
    type: "إرجاع",
    productName: "بنطال جينز رمادي فاخر",
    sku: "BLG-JN-GRY-34",
    size: "34",
    color: "رمادي",
    orderId: "ORD-2026-003",
    employeeName: "سلطان العتيبي",
    employeeEmail: "s.alotaibi@bellagio.sa",
    quantityDelta: 1,
    quantityBefore: 43,
    quantityAfter: 44,
    createdAt: "2026-05-15 16:10",
    notes: "مرتجع شحنة بالكامل من شركة التوصيل وإعادة تصنيف القطعة كمتاحة للبيع",
    rawJson: { event: "CUSTOMER_RETURN", return_condition: "excellent", courier: "aramex", db_latency_ms: 19 }
  }
];

export default function StockMovementsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  
  // --- States ---
  const [movements, setMovements] = useState(INITIAL_MOVEMENTS);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("الكل");
  const [periodFilter, setPeriodFilter] = useState("الكل");
  const [groupBy, setGroupBy] = useState("التاريخ"); // خيارات التجميع: التاريخ، الموظف، النوع
  
  const [selectedMovement, setSelectedMovement] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isJsonExpanded, setIsJsonExpanded] = useState(false);
  const [copiedText, setCopiedText] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // --- التعامل مع الروابط العميقة (Deep Linking) القادمة من مسارات أخرى ---
  const urlProductId = searchParams.get('product_id');
  const urlEmployeeName = searchParams.get('employee_name');

  useEffect(() => {
    if (urlProductId) {
      setSearchQuery(urlProductId);
    } else if (urlEmployeeName) {
      setSearchQuery(urlEmployeeName);
    }
  }, [urlProductId, urlEmployeeName]);

  const clearUrlFilters = () => {
    setSearchParams({});
    setSearchQuery("");
  };

  // --- آلية الفلترة المتقدمة الحية ---
  const filteredMovements = useMemo(() => {
    return movements.filter(mov => {
      const matchesSearch = 
        mov.productName.includes(searchQuery) || 
        mov.sku.includes(searchQuery) || 
        mov.employeeName.includes(searchQuery) || 
        mov.orderId.includes(searchQuery);

      const matchesType = typeFilter === "الكل" || mov.type === typeFilter;
      
      // محاكاة فلترة المدة الزمنية بناءً على تاريخ اليوم في النظام 2026-05-17
      let matchesPeriod = true;
      if (periodFilter === "اليوم") {
        matchesPeriod = mov.createdAt.includes("2026-05-17");
      } else if (periodFilter === "أمس") {
        matchesPeriod = mov.createdAt.includes("2026-05-16");
      }

      return matchesSearch && matchesType && matchesPeriod;
    });
  }, [movements, searchQuery, typeFilter, periodFilter]);

  // --- الحسابات الإجمالية للبطاقات الصادرة والواردة (Summary Metrics) ---
  const metrics = useMemo(() => {
    let totalIn = 0;
    let totalOut = 0;
    filteredMovements.forEach(m => {
      if (m.quantityDelta > 0) totalIn += m.quantityDelta;
      else totalOut += Math.abs(m.quantityDelta);
    });
    return { totalIn, totalOut, count: filteredMovements.length };
  }, [filteredMovements]);

  // --- منطق التجميع الديناميكي الذكي (Dynamic Grouping Logic) ---
  const groupedMovements = useMemo(() => {
    const groups = {};
    filteredMovements.forEach(mov => {
      let key = "";
      if (groupBy === "التاريخ") {
        key = mov.createdAt.split(" ")[0]; // استخراج التاريخ فقط بدون الوقت
      } else if (groupBy === "الموظف") {
        key = mov.employeeName;
      } else if (groupBy === "النوع") {
        key = mov.type;
      }

      if (!groups[key]) groups[key] = [];
      groups[key].push(mov);
    });
    return groups;
  }, [filteredMovements, groupBy]);

  // دالة المساعدة للحصول على الألوان والأيقونات الدلالية حسب نوع حركة المخزن
  const getMovementMeta = (type) => {
    switch (type) {
      case "وارد":
        return { icon: ArrowDownLeft, color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
      case "صادر":
        return { icon: ArrowUpRight, color: "text-red-700 bg-red-50 border-red-200" };
      case "تالف":
        return { icon: AlertTriangle, color: "text-orange-700 bg-orange-50 border-orange-200" };
      case "تعديل":
        return { icon: RefreshCw, color: "text-blue-700 bg-blue-50 border-blue-200" };
      case "إرجاع":
        return { icon: Undo2, color: "text-purple-700 bg-purple-50 border-purple-200" };
      default:
        return { icon: FileText, color: "text-slate-700 bg-slate-50 border-slate-200" };
    }
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans antialiased pb-24" dir="rtl">
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">

        {/* --- Page Header مع ملخص التغير اللوجيستي --- */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">حركات وسجلات المخزون</h1>
            <p className="text-xs text-slate-500 font-medium">سجل التدقيق الشامل (Audit Trail) لمراقبة توريد السلع، شحنات الصادر وحالات الهدر.</p>
          </div>
          
          {/* Summary Badges */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>+{metrics.totalIn} صنف وارد</span>
            </div>
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
              <span>-{metrics.totalOut} صنف صادر</span>
            </div>
          </div>
        </div>

        {/* --- بنر التنبيه والفلترة القادمة عبر روابط خارجية (Deep Linking) --- */}
        {(urlProductId || urlEmployeeName) && (
          <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl flex items-center justify-between animate-fade-in">
            <div className="flex items-center gap-2 text-xs text-blue-800 font-medium">
              <Info className="h-4 w-4 text-blue-600 shrink-0" />
              <span>
                أنت تستعرض الآن سجلات مخصصة ومفلترة تلقائياً لـ: 
                <strong> {urlProductId ? `رمز المنتج ${urlProductId}` : `الموظف ${urlEmployeeName}`}</strong>
              </span>
            </div>
            <button 
              onClick={clearUrlFilters}
              className="text-xs bg-white text-blue-700 border border-blue-300 px-2.5 py-1 rounded-lg hover:bg-blue-100 transition-colors font-bold"
            >
              إلغاء الفلتر النشط
            </button>
          </div>
        )}

        {/* --- Filter & Grouping Section (بطاقة موحدة هندسية العرض) --- */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
            
            {/* بار البحث رئيسي */}
            <div className="relative lg:col-span-2 rounded-md shadow-sm">
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="block w-full pr-10 pl-3 py-2 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:bg-white focus:ring-1 focus:ring-[#6b1d2f] focus:outline-none transition-all"
                placeholder="ابحث بواسطة اسم المنتج، SKU، الموظف، أو رقم الطلب..."
              />
            </div>

            {/* فلتر النوع */}
            <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-2 bg-slate-50/50">
              <Filter className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full text-xs bg-transparent py-2 focus:outline-none text-slate-700 font-medium"
              >
                <option value="الكل">كل أنواع العمليات</option>
                <option value="وارد">وارد / استلام</option>
                <option value="صادر">صادر / مبيعات</option>
                <option value="تالف">تالف / استبعاد</option>
                <option value="تعديل">تعديل جرد يدوي</option>
                <option value="إرجاع">إرجاع بضائع</option>
              </select>
            </div>

            {/* فلتر المدة */}
            <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-2 bg-slate-50/50">
              <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <select
                value={periodFilter}
                onChange={(e) => setPeriodFilter(e.target.value)}
                className="w-full text-xs bg-transparent py-2 focus:outline-none text-slate-700 font-medium"
              >
                <option value="الكل">كل الفترات الزمنية</option>
                <option value="اليوم">اليوم (17 مايو)</option>
                <option value="أمس">أمس (16 مايو)</option>
              </select>
            </div>

            {/* معيار تجميع البيانات البصري */}
            <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-2 bg-slate-50/50">
              <Layers className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value)}
                className="w-full text-xs bg-transparent py-2 focus:outline-none text-slate-700 font-bold text-[#6b1d2f]"
              >
                <option value="التاريخ">تجميع حسب: التاريخ</option>
                <option value="الموظف">تجميع حسب: الموظف</option>
                <option value="النوع">تجميع حسب: نوع الحركة</option>
              </select>
            </div>

          </div>
        </div>

        {/* --- Grouped Movements List (عرض قائمة السجلات المجمعة) --- */}
        <div className="space-y-6">
          {Object.keys(groupedMovements).length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-16 text-center flex flex-col items-center justify-center space-y-3">
              <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                <Filter className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-800">لا توجد نتائج مطابقة لسجل الحركة</h3>
                <p className="text-xs text-slate-400 max-w-xs mx-auto">جرب تغيير معايير التصفية أو صياغة البحث للوصول لبيانات التدقيق المطلوبة.</p>
              </div>
            </div>
          ) : (
            Object.keys(groupedMovements).map((groupKey) => (
              <div key={groupKey} className="space-y-2.5">
                
                {/* Group Header (رأس المجموعة الفاصل بصرياً) */}
                <div className="flex items-center gap-2 px-1">
                  <Calendar className="h-4 w-4 text-slate-400" />
                  <span className="text-xs font-bold text-slate-700">{groupKey}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">
                    {groupedMovements[groupKey].length} حركات مخزنية
                  </span>
                </div>

                {/* عناصر المجموعة */}
                <div className="space-y-2">
                  {groupedMovements[groupKey].map((mov) => {
                    const Meta = getMovementMeta(mov.type);
                    const isPositive = mov.quantityDelta > 0;
                    return (
                      <div
                        key={mov.id}
                        onClick={() => {
                          setSelectedMovement(mov);
                          setIsDetailOpen(true);
                          setIsJsonExpanded(false);
                        }}
                        className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm hover:shadow-md transition-all cursor-pointer"
                      >
                        {/* يمين العنصر: الأيقونة الدلالية وبيانات المنتج */}
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`h-9 w-9 rounded-xl border flex items-center justify-center shrink-0 ${Meta.color}`}>
                            <Meta.icon className="h-4 w-4" />
                          </div>
                          
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-xs font-bold text-slate-900 truncate">{mov.productName}</h4>
                              <span className="text-[9px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.2 rounded border border-slate-200">
                                SKU: {mov.sku}
                              </span>
                            </div>
                            
                            <div className="flex items-center gap-2 flex-wrap text-[10px] text-slate-400 font-medium">
                              <span className="bg-slate-50 px-1.5 py-0.2 rounded">المقاس: {mov.size}</span>
                              <span className="bg-slate-50 px-1.5 py-0.2 rounded">اللون: {mov.color}</span>
                              {mov.orderId !== "N/A" && (
                                <span className="bg-[#6b1d2f]/5 text-[#6b1d2f] px-1.5 py-0.2 rounded font-bold">
                                  طلب: {mov.orderId}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* يسار العنصر: الموظف، دلتا التغير والوقت */}
                        <div className="flex items-center justify-between sm:justify-end gap-6 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
                          {/* اسم الموظف - يختفي في الجوال الصغير */}
                          <div className="hidden md:flex items-center gap-1 text-xs text-slate-500 font-medium">
                            <User className="h-3 w-3 text-slate-400" />
                            <span>{mov.employeeName}</span>
                          </div>

                          {/* وقت وتاريخ الحركة */}
                          <span className="text-[10px] text-slate-400 font-mono font-medium">{mov.createdAt.split(" ")[1]}</span>

                          {/* التغير العددي الصافي بالمخزن */}
                          <div className="text-left shrink-0 min-w-[50px]">
                            <span className={`text-sm font-mono font-black ${isPositive ? "text-emerald-600" : "text-red-600"}`}>
                              {isPositive ? `+${mov.quantityDelta}` : mov.quantityDelta}
                            </span>
                            <span className="text-[9px] text-slate-400 block font-medium">قطعة</span>
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

      </div>

      {/* ========================================================================= */}
      {/* MovementDetailDialog (نافذة التفاصيل العميقة لمسار التدقيق المخزني) */}
      {/* ========================================================================= */}
      {isDetailOpen && selectedMovement && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl flex flex-col max-h-[90vh]">
            
            {/* Header النافذة */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 rounded-t-2xl">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-[#6b1d2f]" />
                <span className="text-xs font-black text-slate-900">مراجعة وثيقة الحركة التاريخية</span>
              </div>
              <button 
                onClick={() => setIsDetailOpen(false)}
                className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-5 overflow-y-auto space-y-4 text-right">
              
              {/* ترويسة الحركة الدلالية */}
              <div className="text-center pb-3 border-b border-slate-100 space-y-1">
                <span className={`inline-flex text-[10px] font-bold px-3 py-0.5 rounded-full border ${
                  selectedMovement.type === "وارد" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"
                }`}>
                  عملية {selectedMovement.type}
                </span>
                <h3 className="text-sm font-bold text-slate-900">{selectedMovement.productName}</h3>
                <span className="text-[10px] font-mono text-slate-400 block">ID: {selectedMovement.id} | {selectedMovement.createdAt}</span>
              </div>

              {/* بطاقة مقارنة الكميات الفورية (قبل وبعد التعديل المخزني) */}
              <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
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

              {/* بيانات مسؤول النظام القائم بالعملية */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 block">الموظف المسؤول:</span>
                <div className="border border-slate-200 rounded-lg p-2 flex items-center justify-between text-xs bg-white">
                  <div className="space-y-0.5">
                    <span className="font-bold text-slate-800 block">{selectedMovement.employeeName}</span>
                    <span className="text-[10px] font-mono text-slate-400">{selectedMovement.employeeEmail}</span>
                  </div>
                  <User className="h-4 w-4 text-slate-400" />
                </div>
              </div>

              {/* المراجع والملاحظات النصية المكتوبة */}
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                  <span className="text-slate-400">رقم طلب المبيعات المرجعي:</span>
                  <div className="flex items-center gap-1">
                    <span className="font-mono font-bold text-slate-700">{selectedMovement.orderId}</span>
                    {selectedMovement.orderId !== "N/A" && (
                      <button 
                        onClick={() => handleCopy(selectedMovement.orderId)} 
                        className="p-0.5 hover:bg-slate-100 rounded text-slate-400"
                      >
                        {copiedText === selectedMovement.orderId ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-slate-400 block">تفنيد تبرير الحركة الحرة:</span>
                  <p className="bg-slate-50 border border-slate-100 p-2.5 rounded-lg text-slate-600 text-[11px] leading-relaxed">
                    {selectedMovement.notes}
                  </p>
                </div>
              </div>

              {/* البيانات الفنية الخام (JSON Payload) الخاصة بمهندسي النظام والمشرفين */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
                <button
                  onClick={() => setIsJsonExpanded(!isJsonExpanded)}
                  className="w-full px-3 py-2 flex items-center justify-between text-[11px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200/70 transition-colors"
                >
                  <span>عرض البيانات التقنية المرجعية (System Payload)</span>
                  {isJsonExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
                {isJsonExpanded && (
                  <pre className="p-3 text-[10px] font-mono text-left bg-slate-900 text-emerald-400 overflow-x-auto max-h-32 dir-ltr">
                    {JSON.stringify(selectedMovement.rawJson, null, 2)}
                  </pre>
                )}
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}