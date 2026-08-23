import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search, Filter, Calendar, AlertTriangle, RefreshCw,
  ArrowDownLeft, ArrowUpRight, Undo2, FileText, X,
  ChevronDown, User, Info, Layers, Loader2,
  ChevronRight, ChevronLeft, Package, ShoppingBag,
  Phone, MapPin, ExternalLink
} from 'lucide-react';

import { catalogApi } from '../api/catalogApi';
import { orderApi }   from '../api/orderApi';

const BACKEND = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL)
  ? import.meta.env.VITE_API_URL.replace('/api', '')
  : window.location.origin;

// ✅ إصلاح: كانت الدالة تحذف /static من المسار مما يُسبب 404 لكل الصور
function imgUrl(path) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${BACKEND}${clean}`;
}

export default function StockMovementsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // البيانات والتحميل
  const [movements,   setMovements]   = useState([]);
  const [totalItems,  setTotalItems]  = useState(0);
  const [isLoading,   setIsLoading]   = useState(true);
  const [errorMsg,    setErrorMsg]    = useState(null);

  // الصفحات
  const [currentPage, setCurrentPage] = useState(1);
  const limit = 20;

  // الفلاتر
  const [searchQuery,  setSearchQuery]  = useState('');
  const [typeFilter,   setTypeFilter]   = useState('الكل');
  const [periodFilter, setPeriodFilter] = useState('الكل');
  const [groupBy,      setGroupBy]      = useState('التاريخ');

  // نوافذ التفاصيل
  const [selectedMov,   setSelectedMov]   = useState(null);
  const [isMovOpen,     setIsMovOpen]     = useState(false);

  const [selectedGroup, setSelectedGroup] = useState(null);
  const [isGroupOpen,   setIsGroupOpen]   = useState(false);
  const [orderData,     setOrderData]     = useState(null);
  const [orderLoading,  setOrderLoading]  = useState(false);

  // الفلاتر الممررة بالرابط
  const urlProductId = searchParams.get('product_id');
  const urlVariantId = searchParams.get('variant_id');
  const urlUserId    = searchParams.get('user_id');
  const urlOrderId   = searchParams.get('related_order_id') || searchParams.get('order_id');

  useEffect(() => {
    if      (urlProductId) setSearchQuery(`المنتج: ${urlProductId}`);
    else if (urlVariantId) setSearchQuery(`المتغير: ${urlVariantId}`);
    else if (urlUserId)    setSearchQuery(`الموظف: ${urlUserId}`);
    else if (urlOrderId)   setSearchQuery(`الطلب: ${urlOrderId}`);
  }, [urlProductId, urlVariantId, urlUserId, urlOrderId]);

  const clearUrlFilters = () => {
    setSearchParams({});
    setSearchQuery('');
    setTypeFilter('الكل');
    setPeriodFilter('الكل');
    setCurrentPage(1);
    setErrorMsg(null);
    // ✅ إصلاح BUG-19: إعادة groupBy للقيمة الافتراضية عند مسح الفلاتر
    setGroupBy('التاريخ');
  };

  const typeToBackend   = { 'وارد': 'in', 'صادر': 'out', 'تالف': 'damage', 'تعديل': 'adjustment', 'إرجاع': 'return' };
  const backendToUI     = {
    in: 'وارد', out: 'صادر', sale: 'صادر',
    damage: 'تالف', adjustment: 'تعديل', return: 'إرجاع',
    initial_stock: 'وارد', add_stock: 'وارد',
    manual_adjust: 'تعديل', clear_returns: 'مسح رواجع', clear_damages: 'مسح توالف'
  };
  const periodToBackend = { 'اليوم': 'today', 'هذا الأسبوع': 'week', 'هذا الشهر': 'month' };

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const params = {
        skip:          (currentPage - 1) * limit,
        limit:         limit,
        movement_type: typeToBackend[typeFilter] || null,
        time_preset:   periodToBackend[periodFilter] || null,
      };
      if (urlProductId) params.product_id       = parseInt(urlProductId);
      if (urlVariantId) params.variant_id       = parseInt(urlVariantId);
      if (urlUserId)    params.user_id          = parseInt(urlUserId);
      if (urlOrderId)   params.related_order_id = parseInt(urlOrderId);
      // ✅ إصلاح BUG-18: تمرير البحث النصي كـ search param وليس فقط للأرقام
      if (!urlProductId && !urlVariantId && !urlUserId && !urlOrderId && searchQuery.trim()) {
        const q = searchQuery.trim();
        if (/^\d+$/.test(q)) {
          // بحث برقم الطلب
          params.related_order_id = parseInt(q);
        } else {
          // ✅ بحث نصي حقيقي كان يُتجاهل سابقاً
          params.search = q;
        }
      }

      const res   = await catalogApi.getInventoryLedger(params);
      const list  = Array.isArray(res) ? res : (res.items || []);
      const total = res.total !== undefined ? res.total : list.length;

      const mapped = list.map(item => {
        const vObj = item.variant || {};
        const cObj = vObj.color  || {};
        const pObj = item.product || cObj.product || {};
        const uObj = item.user   || {};
        return {
          id:                item.id,
          rawMovementType:   item.movement_type,
          type:              backendToUI[item.movement_type] || 'تحويل',
          productName:       pObj.name  || item.product_name  || 'منتج غير معرف',
          productCode:       pObj.code  || '—',
          size:              vObj.size  || item.variant_size  || '—',
          color:             cObj.color_name || cObj.name || item.variant_color || '—',
          quantityAvailable: vObj.quantity_available !== undefined ? vObj.quantity_available : '—',
          rawOrderId:        item.related_order_id || null,
          orderId:           item.related_order_id ? `ORD-${item.related_order_id}` : 'N/A',
          employeeName:      uObj.name || item.responsible_user || 'النظام التلقائي',
          quantityDelta:     item.quantity_change  ?? 0,
          quantityBefore:    item.quantity_before  ?? 0,
          quantityAfter:     item.quantity_after   ?? 0,
          damageReason:      item.damage_reason    || null,
          notes:             item.notes            || 'لا توجد ملاحظات إضافية',
          createdAt:         item.created_at
            ? new Date(item.created_at).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })
            : 'N/A',
          productImage: item.product_image || pObj.main_image || cObj.color_image || null,
        };
      });

      setMovements(mapped);
      setTotalItems(total);
    } catch (err) {
      console.error('Ledger error:', err);
      setErrorMsg(err?.message || err || 'حدث خطأ أثناء تحميل البيانات.');
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, typeFilter, periodFilter, searchQuery,
      urlProductId, urlVariantId, urlUserId, urlOrderId]);

  useEffect(() => {
    const t = setTimeout(fetchData, 400);
    return () => clearTimeout(t);
  }, [fetchData]);

  useEffect(() => { setCurrentPage(1); }, [searchQuery, typeFilter, periodFilter]);

  // تجميع الطلبات (فقط المبيعات) - والتوالف والرواجع تبقى فردية
  const { orderGroups, otherMovements } = useMemo(() => {
    const groupMap = {};
    const others   = [];
    movements.forEach(mov => {
      const isSale = mov.rawOrderId && ['sale', 'out'].includes(mov.rawMovementType);
      if (isSale) {
        if (!groupMap[mov.rawOrderId]) {
          groupMap[mov.rawOrderId] = {
            rawOrderId:   mov.rawOrderId,
            orderId:      mov.orderId,
            employeeName: mov.employeeName,
            createdAt:    mov.createdAt,
            image:        null,
            movements:    [],
          };
        }
        if (!groupMap[mov.rawOrderId].image && mov.productImage) {
          groupMap[mov.rawOrderId].image = mov.productImage;
        }
        groupMap[mov.rawOrderId].movements.push(mov);
      } else {
        others.push(mov);
      }
    });
    return { orderGroups: Object.values(groupMap), otherMovements: others };
  }, [movements]);

  const metrics = useMemo(() => {
    let totalIn = 0, totalOut = 0;
    movements.forEach(m => {
      if (m.quantityDelta > 0) totalIn  += m.quantityDelta;
      else                     totalOut += Math.abs(m.quantityDelta);
    });
    return { totalIn, totalOut };
  }, [movements]);

  const openGroup = useCallback(async (group) => {
    setSelectedGroup(group);
    setIsGroupOpen(true);
    setOrderData(null);
    document.body.style.overflow = 'hidden';
    if (group.rawOrderId) {
      setOrderLoading(true);
      try {
        const d = await orderApi.getOrderDetails(group.rawOrderId);
        setOrderData(d);
      } catch (e) {
        console.error('Order detail fetch error:', e);
      } finally {
        setOrderLoading(false);
      }
    }
  }, []);

  const closeGroup = useCallback(() => {
    setIsGroupOpen(false);
    setSelectedGroup(null);
    setOrderData(null);
    document.body.style.overflow = '';
  }, []);

  const movMeta = (type) => {
    switch (type) {
      case 'وارد':  return { icon: ArrowDownLeft, cls: 'text-emerald-600 bg-emerald-50 border-emerald-200' };
      case 'صادر':  return { icon: ArrowUpRight,  cls: 'text-red-600 bg-red-50 border-red-200' };
      case 'تالف':  return { icon: AlertTriangle, cls: 'text-amber-600 bg-amber-50 border-amber-200' };
      case 'إرجاع': return { icon: Undo2,         cls: 'text-violet-600 bg-violet-50 border-violet-200' };
      case 'تعديل': return { icon: RefreshCw,     cls: 'text-blue-600 bg-blue-50 border-blue-200' };
      default:        return { icon: FileText,      cls: 'text-slate-600 bg-slate-50 border-slate-200' };
    }
  };

  const totalPages = Math.ceil(totalItems / limit);
  const hasContent = orderGroups.length > 0 || otherMovements.length > 0;

  return (
    <div className="min-h-screen bg-slate-50 font-sans antialiased pb-24" dir="rtl">
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">

        {/* الهيدر الرئيسي */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">سجل حركات المخزن المباشر</h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              طلبات المبيعات تُجمَّع في بطاقة طلب واحدة — التوالف والرواجع تُعرض منفردة للتفصيل.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              +{metrics.totalIn} وارد بالصفحة
            </div>
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              -{metrics.totalOut} صادر بالصفحة
            </div>
          </div>
        </div>

        {/* بنر الفلتر الممرر */}
        {(urlProductId || urlVariantId || urlUserId || urlOrderId) && (
          <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-blue-800 font-medium">
              <Info className="h-4 w-4 text-blue-600 shrink-0" />
              <span>أنت تستعرض سجلات مفلترة بناءً على توجيه من شاشة أخرى.</span>
            </div>
            <button onClick={clearUrlFilters} className="text-xs bg-white text-blue-700 border border-blue-300 px-2.5 py-1 rounded-lg hover:bg-blue-100 transition-colors font-bold">
              إلغاء الفلتر
            </button>
          </div>
        )}

        {/* رسالة الخطأ */}
        {errorMsg && (
          <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            <p className="text-xs">{errorMsg}</p>
          </div>
        )}

        {/* شريط البحث والفلاتر */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
            <div className="relative lg:col-span-2">
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-400" />
              </div>
              <input type="text" value={searchQuery}
                disabled={!!(urlProductId || urlVariantId || urlUserId || urlOrderId)}
                onChange={e => setSearchQuery(e.target.value)}
                className="block w-full pr-10 pl-3 py-2 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:bg-white focus:ring-1 focus:ring-[#6b1d2f] focus:outline-none transition-all disabled:opacity-60"
                placeholder="أدخل رقم الطلب للبحث السريع..." />
            </div>

            <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-2 bg-slate-50/50">
              <Filter className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="w-full text-xs bg-transparent py-2 focus:outline-none text-slate-700 font-medium">
                <option value="الكل">كل العمليات المخزنية</option>
                <option value="وارد">وارد / استلام شحنات</option>
                <option value="صادر">صادر / مبيعات طلبيات</option>
                <option value="تالف">تالف / استبعاد بضائع</option>
                <option value="تعديل">تعديل جرد يدوي</option>
                <option value="إرجاع">مرتجع بضائع العميل</option>
              </select>
            </div>

            <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-2 bg-slate-50/50">
              <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <select value={periodFilter} onChange={e => setPeriodFilter(e.target.value)} className="w-full text-xs bg-transparent py-2 focus:outline-none text-slate-700 font-medium">
                <option value="الكل">كل المدد الزمنية</option>
                <option value="اليوم">اليوم الحالي</option>
                <option value="هذا الأسبوع">آخر 7 أيام (أسبوع)</option>
                <option value="هذا الشهر">آخر 30 يوم (شهر)</option>
              </select>
            </div>

            <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-2 bg-slate-50/50">
              <Layers className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <select value={groupBy} onChange={e => setGroupBy(e.target.value)} className="w-full text-xs bg-transparent py-2 focus:outline-none text-[#6b1d2f] font-bold">
                <option value="التاريخ">تجميع حسب: التاريخ</option>
                <option value="الموظف">تجميع حسب: الموظف</option>
                <option value="النوع">تجميع حسب: النوع</option>
              </select>
            </div>
          </div>
        </div>

        {/* عرض القوائم */}
        <div className="space-y-6 relative min-h-[200px]">
          {isLoading && (
            <div className="absolute inset-0 bg-white/70 backdrop-blur-[2px] z-20 flex items-center justify-center rounded-xl transition-all">
              <div className="flex flex-col items-center gap-2 bg-white px-6 py-4 rounded-xl shadow-md border border-slate-200">
                <Loader2 className="h-6 w-6 text-[#6b1d2f] animate-spin" />
                <span className="text-xs font-bold text-slate-600">مزامنة البيانات الحية من الخادم...</span>
              </div>
            </div>
          )}

          {!hasContent && !isLoading ? (
            <div className="bg-white border border-slate-200 rounded-xl p-16 text-center flex flex-col items-center justify-center space-y-3 shadow-sm">
              <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                <Filter className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">لا توجد حركات مخزنية مطابقة للفلترة</h3>
              <p className="text-xs text-slate-400 max-w-xs">لم يسجل النظام أي حركة تطابق المدخلات حالياً.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* قسم طلبات المبيعات المجمعة */}
              {orderGroups.length > 0 && (
                <section className="space-y-3">
                  <div className="flex items-center gap-2 px-1">
                    <span className="text-xs font-black text-slate-700 bg-slate-200/80 px-2.5 py-1 rounded-lg">
                      حركات عمليات الطلبات
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">({orderGroups.length} عملية طلب)</span>
                  </div>
                  {orderGroups.map(grp => (
                    <OrderGroupCard key={grp.rawOrderId} group={grp} onClick={() => openGroup(grp)} movMeta={movMeta} />
                  ))}
                </section>
              )}

              {/* قسم حركات المخزن الأخرى (توالف، رواجع، توريد...) */}
              {otherMovements.length > 0 && (
                <section className="space-y-3">
                  <div className="flex items-center gap-2 px-1">
                    <span className="text-xs font-black text-slate-700 bg-slate-200/80 px-2.5 py-1 rounded-lg">
                      حركات مخزنية فردية (توالف / رواجع / تعديلات)
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">({otherMovements.length} حركة)</span>
                  </div>
                  {otherMovements.map(mov => {
                    const { icon: Icon, cls } = movMeta(mov.type);
                    const isPos = mov.quantityDelta > 0;
                    return (
                      <div key={mov.id}
                        onClick={() => { setSelectedMov(mov); setIsMovOpen(true); document.body.style.overflow = 'hidden'; }}
                        className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-sm hover:shadow-md transition-all cursor-pointer group">
                        <div className="flex items-center gap-4">
                          <div className={`h-12 w-12 rounded-xl border flex items-center justify-center shrink-0 ${cls}`}>
                            <Icon className="h-6 w-6" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-slate-900">{mov.productName}</h4>
                            <p className="text-[11px] text-slate-500 font-medium mt-0.5">{mov.color} • {mov.size}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="text-right hidden sm:block">
                            <p className="text-xs font-bold text-slate-700">{mov.employeeName}</p>
                            <p className="text-[10px] text-slate-400 font-mono" dir="ltr">{mov.createdAt}</p>
                          </div>
                          <div className={`text-lg font-black font-mono px-4 py-1.5 rounded-lg border ${isPos ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-red-700 bg-red-50 border-red-200'}`}>
                            {isPos ? `+${mov.quantityDelta}` : mov.quantityDelta}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </section>
              )}
            </div>
          )}
        </div>

        {/* الترقيم */}
        {!isLoading && totalPages > 1 && (
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs text-slate-500 font-medium">
              إجمالي الحركات: <strong className="text-slate-900">{totalItems}</strong> سجل
            </span>
            <div className="flex items-center gap-2">
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1.5 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition-colors">
                <ChevronRight className="h-4 w-4" />
              </button>
              <span className="text-xs font-bold text-slate-700 px-2">صفحة {currentPage} من {totalPages}</span>
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-1.5 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition-colors">
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* نافذة تفاصيل الطلب المجمع */}
      {isGroupOpen && selectedGroup && (
        <OrderGroupModal group={selectedGroup} orderData={orderData} isLoading={orderLoading} onClose={closeGroup} movMeta={movMeta} />
      )}

      {/* نافذة تفاصيل الحركة الفردية */}
      {isMovOpen && selectedMov && (
        <SingleMovModal mov={selectedMov} onClose={() => { setIsMovOpen(false); document.body.style.overflow = ''; }} movMeta={movMeta} />
      )}
    </div>
  );
}

// ─── كارت عملية الطلب المجمعة ────────────────────────────────────────────────
function OrderGroupCard({ group, onClick, movMeta }) {
  const src      = imgUrl(group.image);
  const totalQty = group.movements.reduce((s, m) => s + Math.abs(m.quantityDelta), 0);
  const preview  = group.movements.slice(0, 4);
  const rest     = group.movements.length - preview.length;

  return (
    <div onClick={onClick} className="bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-lg transition-all cursor-pointer overflow-hidden group">
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-3">
          {src ? (
            <img src={src} alt="صورة المنتج" className="h-12 w-12 object-cover rounded-xl border border-slate-200 shrink-0" onError={e => { e.target.style.display='none'; }} />
          ) : (
            <div className="h-12 w-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
              <ShoppingBag className="h-5 w-5 text-slate-400" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-slate-900">{group.orderId}</span>
              <span className="text-[10px] bg-red-50 border border-red-200 text-red-700 px-2 py-0.5 rounded-full font-bold">
                عملية طلب (صادر)
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
              قام بالعملية: <strong className="text-slate-700">{group.employeeName}</strong> • {group.createdAt}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-center hidden sm:block">
            <p className="text-[10px] text-slate-400 font-medium">{group.movements.length} أصناف في الطلب</p>
            <p className="text-base font-black text-red-600 font-mono">-{totalQty} قطعة</p>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-[#6b1d2f] transition-colors" />
        </div>
      </div>

      {/* جدول مصغر يعرض حركات هذا الطلب */}
      <div className="px-4 pb-4 pt-3 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-400 font-bold border-b border-slate-100">
              <th className="text-right pb-2 pr-0">المنتج</th>
              <th className="text-center pb-2">اللون</th>
              <th className="text-center pb-2">المقاس</th>
              <th className="text-center pb-2">من داره (المسؤول)</th>
              <th className="text-left pb-2 font-mono">الكمية (قبل ← بعد)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {preview.map(m => (
              <tr key={m.id} className="text-slate-700">
                <td className="py-2 font-semibold truncate max-w-[130px]">{m.productName}</td>
                <td className="py-2 text-center text-slate-500">{m.color}</td>
                <td className="py-2 text-center text-slate-500">{m.size}</td>
                <td className="py-2 text-center text-slate-600 font-medium">{m.employeeName}</td>
                <td className="py-2 text-left font-mono text-[11px]" dir="ltr">
                  <span className="text-slate-500">{m.quantityBefore}</span>
                  <span className="text-slate-300 mx-1">→</span>
                  <span className="font-bold text-slate-800">{m.quantityAfter}</span>
                  <span className="text-red-500 font-bold ml-1">(-{Math.abs(m.quantityDelta)})</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rest > 0 && (
          <p className="text-center text-[10px] text-slate-400 font-medium mt-2">
            + {rest} أصناف أخرى في هذه العملية — انقر للطلب وعرض الجدول الكامل
          </p>
        )}
      </div>
    </div>
  );
}

// ─── نافذة التفاصيل الشاملة لعملية الطلب ─────────────────────────────────────
function OrderGroupModal({ group, orderData, isLoading, onClose, movMeta }) {
  const src      = imgUrl(group.image);
  const totalQty = group.movements.reduce((s, m) => s + Math.abs(m.quantityDelta), 0);

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-2xl w-full max-w-3xl border border-slate-200 shadow-2xl flex flex-col max-h-[93vh]">
        {/* هيدر النافذة */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-4">
            {src ? (
              <img src={src} alt="صورة الطلب" className="h-14 w-14 object-cover rounded-xl border border-slate-200 shrink-0" onError={e => { e.target.style.display='none'; }} />
            ) : (
              <div className="h-14 w-14 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                <Package className="h-6 w-6 text-slate-400" />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-slate-900">{group.orderId}</h2>
                <span className="text-[10px] bg-red-50 border border-red-200 text-red-700 px-2.5 py-0.5 rounded-full font-bold">
                  حركة عملية طلب مبيعات
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                مسجل بواسطة: {group.employeeName} • {group.createdAt}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* جسم النافذة */}
        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {/* جميع معلومات الطلب والعميل */}
          {isLoading ? (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center gap-3">
              <Loader2 className="h-5 w-5 text-[#6b1d2f] animate-spin shrink-0" />
              <span className="text-xs text-slate-600 font-bold">جاري جلب كافة معلومات الطلب من السيرفر...</span>
            </div>
          ) : orderData ? (
            <div className="bg-gradient-to-br from-slate-50 to-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
              <h3 className="text-xs font-black text-slate-800 flex items-center gap-2 border-b border-slate-200 pb-2">
                <User className="h-4 w-4 text-[#6b1d2f]" />
                معلومات الطلب والعميل الكاملة
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="flex items-start gap-2.5">
                  <User className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] text-slate-400 mb-0.5">اسم العميل</p>
                    <p className="font-bold text-slate-800">{orderData.customer_name || '—'}</p>
                  </div>
                </div>
                {orderData.customer_phones?.length > 0 && (
                  <div className="flex items-start gap-2.5">
                    <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] text-slate-400 mb-0.5">رقم التواصل</p>
                      <p className="font-bold text-slate-800 font-mono" dir="ltr">
                        {Array.isArray(orderData.customer_phones)
                          ? orderData.customer_phones.join(' | ')
                          : orderData.customer_phones}
                      </p>
                    </div>
                  </div>
                )}
                {orderData.address && (
                  <div className="flex items-start gap-2.5">
                    <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] text-slate-400 mb-0.5">العنوان الكامل</p>
                      <p className="font-bold text-slate-800">{orderData.address}</p>
                    </div>
                  </div>
                )}
                {orderData.social_media_source && (
                  <div className="flex items-start gap-2.5">
                    <ExternalLink className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] text-slate-400 mb-0.5">مصدر الطلب</p>
                      <p className="font-bold text-slate-800">{orderData.social_media_source}</p>
                    </div>
                  </div>
                )}
                {orderData.status && (
                  <div className="flex items-start gap-2.5">
                    <Package className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] text-slate-400 mb-0.5">حالة الطلب</p>
                      <span className="inline-block bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded text-[11px]">
                        {orderData.status}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {/* ملخص إحصائي سريع للعملية */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-[10px] text-red-500 font-medium mb-1">أصناف تم سحبها</p>
              <p className="text-2xl font-black text-red-700">{group.movements.length}</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-[10px] text-amber-600 font-medium mb-1">إجمالي قطع الخروج</p>
              <p className="text-2xl font-black text-amber-700">{totalQty}</p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <p className="text-[10px] text-slate-500 font-medium mb-1">من داره (المسؤول)</p>
              <p className="text-xs font-black text-slate-700 truncate">{group.employeeName}</p>
            </div>
          </div>

          {/* جدول منظم وسهل القراءة يحتوي على كل عملية ونوعها ومن داره والقيمة القديمة والجديدة */}
          <div>
            <h3 className="text-xs font-black text-slate-800 mb-3 flex items-center gap-2">
              <ChevronDown className="h-4 w-4 text-[#6b1d2f]" />
              جدول الحركات التفصيلي لأصناف عملية الطلب
            </h3>
            <div className="border border-slate-200 rounded-xl overflow-hidden overflow-x-auto shadow-sm">
              <table className="w-full text-xs whitespace-nowrap">
                <thead className="bg-slate-100 border-b border-slate-200">
                  <tr className="text-slate-700 font-bold">
                    <th className="text-right p-3">المنتج</th>
                    <th className="text-center p-3">اللون</th>
                    <th className="text-center p-3">المقاس</th>
                    <th className="text-center p-3">نوع العملية</th>
                    <th className="text-center p-3">من داره (المسؤول)</th>
                    <th className="text-center p-3">القيمة القديمة</th>
                    <th className="text-center p-3">القيمة الجديدة</th>
                    <th className="text-center p-3">التغير</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {group.movements.map((mov, idx) => {
                    const { icon: Icon, cls } = movMeta(mov.type);
                    return (
                      <tr key={mov.id} className={idx % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/50 hover:bg-slate-50'}>
                        <td className="p-3">
                          <p className="font-bold text-slate-900 truncate max-w-[130px]">{mov.productName}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{mov.productCode}</p>
                        </td>
                        <td className="p-3 text-center text-slate-600 font-medium">{mov.color}</td>
                        <td className="p-3 text-center text-slate-600 font-medium">{mov.size}</td>
                        <td className="p-3 text-center">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[10px] font-bold ${cls}`}>
                            <Icon className="h-3 w-3" />
                            {mov.type}
                          </span>
                        </td>
                        <td className="p-3 text-center text-slate-700 font-bold">{mov.employeeName}</td>
                        <td className="p-3 text-center font-mono font-bold text-slate-500">{mov.quantityBefore}</td>
                        <td className="p-3 text-center font-mono font-bold text-slate-900">{mov.quantityAfter}</td>
                        <td className="p-3 text-center">
                          <span className={`font-mono font-black ${mov.quantityDelta > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {mov.quantityDelta > 0 ? `+${mov.quantityDelta}` : mov.quantityDelta}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ملاحظات */}
          {group.movements.some(m => m.notes && m.notes !== 'لا توجد ملاحظات إضافية') && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
              <h3 className="text-xs font-black text-slate-700">ملاحظات المسجلة</h3>
              {group.movements
                .filter(m => m.notes && m.notes !== 'لا توجد ملاحظات إضافية')
                .map(m => (
                  <p key={m.id} className="text-[11px] text-slate-600 leading-relaxed">{m.notes}</p>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── نافذة تفاصيل الحركة الفردية (توالف / رواجع / إلخ) ─────────────────────────
function SingleMovModal({ mov, onClose, movMeta }) {
  const { icon: Icon, cls }   = movMeta(mov.type);
  const isSpecial              = ['تالف', 'إرجاع'].includes(mov.type);
  const isPos                  = mov.quantityDelta > 0;
  const src                    = imgUrl(mov.productImage);

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-start justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-4">
            <div className={`h-14 w-14 rounded-2xl border flex items-center justify-center shrink-0 ${cls}`}>
              <Icon className="h-7 w-7" />
            </div>
            <div className="text-right">
              <h3 className="text-sm font-bold text-slate-900">{mov.productName}</h3>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">{mov.color} | {mov.size}</p>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cls}`}>{mov.type}</span>
            </div>
          </div>
          <button onClick={onClose} className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-right">
          {src && (
            <div className="flex justify-center">
              <img src={src} alt="صورة المنتج" className="h-24 w-24 object-cover rounded-xl border border-slate-200 shadow-sm" onError={e => { e.target.style.display='none'; }} />
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200 text-center" dir="ltr">
            <div>
              <span className="text-[10px] text-slate-400 block font-medium">قبل</span>
              <span className="text-sm font-mono font-bold text-slate-600">{mov.quantityBefore}</span>
            </div>
            <div className="border-x border-slate-200">
              <span className="text-[10px] text-slate-400 block font-medium">التغيير</span>
              <span className={`text-sm font-mono font-black ${isPos ? 'text-emerald-600' : 'text-red-600'}`}>
                {isPos ? `+${mov.quantityDelta}` : mov.quantityDelta}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block font-medium">بعد</span>
              <span className="text-sm font-mono font-bold text-slate-900">{mov.quantityAfter}</span>
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-slate-500 font-bold">
                  <th className="text-right p-2.5">البيان</th>
                  <th className="text-left p-2.5">القيمة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr className="bg-white">
                  <td className="p-2.5 text-slate-500">من داره (المسؤول)</td>
                  <td className="p-2.5 font-bold text-slate-800">{mov.employeeName}</td>
                </tr>
                <tr className="bg-slate-50/40">
                  <td className="p-2.5 text-slate-500">التاريخ والوقت</td>
                  <td className="p-2.5 font-mono text-slate-700" dir="ltr">{mov.createdAt}</td>
                </tr>
                {!isSpecial && (
                  <tr className="bg-white">
                    <td className="p-2.5 text-slate-500">رقم الطلب المرتبط</td>
                    <td className="p-2.5 font-mono font-bold text-slate-700">{mov.orderId}</td>
                  </tr>
                )}
                <tr className="bg-slate-50/40">
                  <td className="p-2.5 text-slate-500">الكمية المتاحة حالياً</td>
                  <td className="p-2.5 font-mono font-bold text-slate-800">{mov.quantityAvailable}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {mov.damageReason && (
            <div className="bg-orange-50 border border-orange-200 p-3 rounded-xl">
              <p className="text-orange-700 font-bold text-[10px] mb-1">سبب التلف:</p>
              <p className="text-orange-900 text-[11px] font-medium">{mov.damageReason}</p>
            </div>
          )}

          <div className="space-y-1">
            <span className="text-[10px] text-slate-400 font-bold block">ملاحظات:</span>
            <p className="bg-slate-50 border border-slate-100 p-2.5 rounded-lg text-slate-600 text-[11px] leading-relaxed">
              {mov.notes}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}