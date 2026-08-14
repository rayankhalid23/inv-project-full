import React, { useState, useEffect } from 'react';
import { mediaUrl, IMAGE_FALLBACK, onImageError } from '../../utils/media';
import { 
  Package, AlertTriangle, ArrowDownUp, RefreshCw, 
  Layers, ShoppingBag, Clock, Trash2, RotateCcw, 
  TrendingUp, Percent, ChevronDown, ChevronUp, Eye,
  Award, ShieldAlert, CornerDownLeft, ArrowDown
} from 'lucide-react';
import { catalogApi } from '../../api/catalogApi'; 
import TimeFilter from '../../components/TimeFilter';

const API_BASE_URL = window.location.origin;

export default function ProductsReport({ period }) {
  const [data, setData] = useState(null);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [allProducts, setAllProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedProduct, setExpandedProduct] = useState(null);


  useEffect(() => {
    let isMounted = true;
    async function fetchAllReportData() {
      try {
        setLoading(true);
        setError(null);
        
        // جلب البيانات المتوازية لضمان سرعة فائقة وعدم تجميد الشاشة
        const [statsResult, analyticsResult, productsResult] = await Promise.all([
        catalogApi.getInventoryStats(period), // تمرير الفترة
        catalogApi.getInventoryTopBottomReports(period), // تمرير الفترة
        catalogApi.getAllProductsWithVariants(period) // تمرير الفترة
      ]);

        if (isMounted) {
          setData(statsResult?.data ? statsResult.data : statsResult);
          setAnalyticsData(analyticsResult);
          setAllProducts(productsResult?.products ? productsResult.products : []);
        }
      } catch (err) {
        console.error("🚨 خطأ أثناء جلب بيانات التقارير:", err);
        if (isMounted) {
          setError(err?.message || String(err));
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }
    fetchAllReportData();
    return () => { isMounted = false; };
  }, [refreshKey, period]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <div className="relative flex items-center justify-center">
          <div className="h-12 w-12 rounded-full border-4 border-slate-200 border-t-slate-900 animate-spin"></div>
          <Package className="h-5 w-5 text-slate-800 absolute animate-pulse" />
        </div>
        <p className="text-xs font-bold text-slate-500 tracking-wide animate-pulse">جاري بناء وتدقيق تقارير المخزن وحساب السلع الراكدة...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50/80 border border-red-100 rounded-2xl p-8 text-center max-w-lg mx-auto my-16 space-y-4 shadow-sm">
        <AlertTriangle className="h-10 w-10 text-red-600 mx-auto animate-bounce" />
        <h3 className="text-sm font-black text-red-900">فشل مزامنة بيانات المخزن والطلبات</h3>
        <p className="text-xs text-red-700 font-medium font-mono bg-white/90 py-2 px-3 rounded-xl border border-red-200/60 leading-relaxed max-h-32 overflow-y-auto">
          {error}
        </p>
        <button 
          onClick={() => setRefreshKey(prev => prev + 1)}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-all shadow-sm"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>إعادة المحاولة الفورية</span>
        </button>
      </div>
    );
  }

  const inv = data?.inventory || {};
  const ord = data?.orders || {};
  const alertCounters = data?.alerts?.counters || {};

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    alert(`تم نسخ الكود: ${text}`);
  };

  const toggleProductExpand = (id) => {
    setExpandedProduct(expandedProduct === id ? null : id);
  };

  return (
    <div className="space-y-8 p-3 max-w-[1600px] mx-auto animate-fade-in duration-300 antialiased text-slate-800 bg-slate-50/50 min-h-screen" dir="rtl">
      
      {/* ==========================================
          القسم الأول: إحصائيات المخزون العامة
          ========================================== */}
        
      <div>
        <div className="flex items-center gap-2 mb-3 px-1">
          <Package className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-[10px] font-black text-slate-400 tracking-wider uppercase">أولاً: الرقابة الكلية علي المخزون و المبيعات </span>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <KpiBox title="إجمالي المنتجات" value={inv.total_products || 0} unit="نوع" icon={Package} color="blue" />
          <KpiBox title="المخزون المتاح" value={inv.total_inventory || 0} unit="قطع" icon={Layers} color="slate" />
          <KpiBox title="المحجوز للطلبات" value={inv.total_reserved || 0} unit="قطعة" icon={Clock} color="orange" />
          <KpiBox title="تم بيعه" value={inv.total_sold || 0} unit="قطعة" icon={TrendingUp} color="green" />
          <KpiBox title="التوالف والهالك" value={inv.damaged || 0} unit="قطعة" icon={Trash2} color="red" />
          <KpiBox title="الرواجع والمرتجع" value={inv.returns || 0} unit="قطعة" icon={RotateCcw} color="purple" />
        </div>
        
        <div className="mt-3 bg-white border border-slate-100 rounded-xl p-3 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-red-50 text-red-600 rounded-lg">
              <Percent className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] sm:text-xs text-slate-500 font-bold">معدل الهدر والتوالف العام</p>
              <p className="hidden sm:block text-[10px] text-slate-400 mt-0.5">النسبة المئوية لقطع التالف من إجمالي سلع المتجر</p>
            </div>
          </div>
          <div className="text-left">
            <span className="text-xl sm:text-2xl font-black text-red-600 font-mono">{inv.waste_rate || 0}%</span>
          </div>
        </div>
      </div>

      {/* فاصل حركة الطلبيات */}
      <div className="relative flex py-2 items-center">
        <div className="flex-grow border-t border-slate-200"></div>
        <span className="flex-shrink mx-4 text-[10px] font-black text-slate-400 bg-transparent px-2">حركة الطلبيات الحالية</span>
        <div className="flex-grow border-t border-slate-200"></div>
      </div>

      {/* ==========================================
          القسم الثاني: إحصائيات الطلبات
          ========================================== */}
      <div>
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <KpiBox title="عدد الطلبات" value={ord.total || 0} unit="طلب" icon={ShoppingBag} color="slate" />
          <KpiBox title="الطلبات المعلقة" value={ord.pending || 0} unit="جديد" icon={AlertTriangle} color="orange" />
          <KpiBox title="قيد التجهيز" value={ord.processing || 0} unit="طلب" icon={Clock} color="blue" />
        </div>
      </div>

      {/* فاصل التنبيهات */}
      <div className="relative flex py-2 items-center">
        <div className="flex-grow border-t border-slate-200"></div>
        <span className="flex-shrink mx-4 text-[10px] font-black text-slate-400 bg-transparent px-2">ملخص النواقص والتنبيهات</span>
        <div className="flex-grow border-t border-slate-200"></div>
      </div>

      {/* ==========================================
          القسم الثالث: تنبيهات النواقص
          ========================================== */}
      <div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <KpiBox title="منتجات تمت" value={alertCounters.out_of_stock_products_count || 0} unit="منتهي" icon={AlertTriangle} color="red" />
          <KpiBox title="منتجات قريب اتم" value={alertCounters.low_stock_products_count || 0} unit="حرج" icon={ArrowDownUp} color="orange" />
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <KpiBox title="متغيرات تمت" value={alertCounters.out_of_stock_variants_count || 0} unit="منتهي" icon={Layers} color="red" />
          <KpiBox title="متغيرات قريب اتم" value={alertCounters.low_stock_variants_count || 0} unit="حرج" icon={ArrowDownUp} color="orange" />
        </div>
      </div>

      {/* ==================================================================
          🔥 الإضافة الاحترافية الأولى: الجداول الـ 4 المنفصلة والمرنة للهاتف
          ================================================================== */}
      <div className="relative flex py-4 items-center">
        <div className="flex-grow border-t-2 border-slate-300"></div>
        <span className="flex-shrink mx-4 text-xs font-black text-slate-500 bg-slate-50 px-3 py-1 0"> التقييمات </span>
        <div className="flex-grow border-t-2 border-slate-300"></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TopBottomList title="أفضل 5 متغيرات مبيعاً ورواجاً" icon={Award} data={analyticsData?.top_5_selling} type="sold" color="green" />
        <TopBottomList title="أقل 5 متغيرات مبيعاً (سلع راكدة)" icon={ArrowDown} data={analyticsData?.bottom_5_selling} type="sold" color="slate" />
        <TopBottomList title="أكثر 5 متغيرات خسارة وهدراً (التوالف)" icon={ShieldAlert} data={analyticsData?.top_5_damaged} type="damaged" color="red" />
        <TopBottomList title="أكثر 5 متغيرات مرتجعة (الرواجع)" icon={RotateCcw} data={analyticsData?.top_5_returned} type="returned" color="purple" />
      </div>

      {/* ==================================================================
          🔥 الإضافة الاحترافية الثانية: جدول المنتجات التفصيلي بالشجرة والأكورديون
          ================================================================== */}
      <div className="relative flex py-4 items-center">
        <div className="flex-grow border-t-2 border-slate-300"></div>
        <span className="flex-shrink mx-4 text-xs font-black text-slate-500 bg-slate-50 px-3 py-1 "> الجرد التفصيلي </span>
        <div className="flex-grow border-t-2 border-slate-300"></div>
      </div>

      <div className="bg-white border border-slate-300 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50/50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-slate-700" />
            <h3 className="text-xs sm:text-sm font-black text-slate-900"> المخزون  :  ({allProducts.length} منتج نشط)</h3>
          </div>
          <span className="text-[10px] bg-slate-200/70 text-slate-600 font-bold px-2 py-0.5 rounded-full">اضغط على أي منتج لاستعراض المقاسات والألوان</span>
        </div>

        <div className="divide-y divide-slate-100">
          {allProducts.map((product) => {
            const isExpanded = expandedProduct === product.product_id;
            return (
              <div key={product.product_id} className="transition-all">
                {/* السطر الرئيسي للمنتج */}
                <div 
  onClick={() => toggleProductExpand(product.product_id)}
  className={`p-3 sm:p-4 flex items-center justify-between gap-2 cursor-pointer transition-all border-b border-transparent ${
    isExpanded 
      ? 'bg-rose-50/40 border-l-4 border-l-rose-900 border-b-rose-100' 
      : 'hover:bg-slate-50/80'
  }`}
>
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <img 
                      src={mediaUrl(product.main_image) || IMAGE_FALLBACK} onError={onImageError} 
                      alt="" 
                      className="w-10 h-10 sm:w-12 sm:h-12 object-cover rounded-xl border border-slate-200 bg-white shrink-0 shadow-sm"
                    />
                    <div className="min-w-0">
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">{product.product_name}</h4>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span 
                          onClick={(e) => { e.stopPropagation(); handleCopy(product.product_code); }}
                          className="font-mono text-[9px] sm:text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold hover:bg-slate-200"
                        >
                          {product.product_code}
                        </span>
                        <span className="text-[9px] text-slate-400 font-medium sm:inline-block hidden">
                          التكلفة: {product.prices?.cost_price} | البيع: {product.prices?.selling_price}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* العدادات التراكمية السريعة للكارد */}
                  {/* العدادات التراكمية السريعة للكارد - محسنة بالكامل للشاشات الصغيرة جداً */}
<div className="flex items-center gap-1.5 sm:gap-4 shrink-0 pl-1 sm:pl-0">
  
  {/* عداد المتاح */}
  <div className="text-center min-w-[32px] sm:min-w-[45px]">
    <span className="block text-[8px] sm:text-[10px] text-slate-400 font-bold leading-none mb-0.5">المتاح</span>
    <span className={`text-[10px] sm:text-sm font-mono font-black ${product.inventory_summary?.total_available > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
      {product.inventory_summary?.total_available}
    </span>
  </div>
  
  {/* عداد المحجوز - الآن يظهر على الهاتف بشكل رشيّق */}
  <div className="text-center min-w-[32px] sm:min-w-[45px]">
    <span className="block text-[8px] sm:text-[10px] text-slate-400 font-bold leading-none mb-0.5">المحجوز</span>
    <span className="text-[10px] sm:text-sm font-mono font-black text-orange-500">
      {product.inventory_summary?.total_reserved}
    </span>
  </div>
  
  {/* 4. عداد المباع */}
  <div className="text-center min-w-[32px] sm:min-w-[45px]">
    <span className="block text-[8px] sm:text-[10px] text-slate-400 font-bold leading-none mb-0.5">المباع</span>
    <span className="text-[10px] sm:text-sm font-mono font-black text-slate-700">
      {product.inventory_summary?.total_sold}
    </span>
  </div>
  
  {/* سهم الفتح والإغلاق */}
  <div className="p-0.5 sm:p-1 text-slate-400 rounded-lg hover:bg-slate-200 transition-all mr-1">
  {isExpanded ? <ChevronUp className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-rose-900 font-black" /> : <ChevronDown className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
  </div>

</div>

                </div>

                {/* شجرة المتغيرات الفرعية المنسدلة (تفتح عند الضغط على المنتج) */}
                {isExpanded && (
  <div className="bg-rose-50/10 p-3 border-t border-b border-rose-100/70 animate-fade-in">
                    {product.variants && product.variants.length > 0 ? (
                      <div className="space-y-2">
                      

                        {/* كروت المتغيرات المرنة جداً في الهاتف والجداول في الحاسوب */}
                        {product.variants.map((variant) => (
                          <div 
                            key={variant.variant_id} 
                            className="bg-white border border-slate-200/60 rounded-xl p-2.5 sm:p-3 sm:grid sm:grid-cols-6 sm:gap-2 sm:items-center shadow-xs"
                          >
                            {/* معلومات المتغير الاساسية */}
                            <div className="col-span-2 flex items-center gap-2.5">
                              <CornerDownLeft className="h-3 w-3 text-slate-300 shrink-0 sm:block hidden" />
                              <img 
                                src={mediaUrl(variant.color_image) || IMAGE_FALLBACK} onError={onImageError} 
                                alt="" 
                                className="w-7 h-7 object-cover rounded-lg border border-slate-200 bg-slate-50 shrink-0 shadow-xs"
                              />
                              <div className="min-w-0">
                                <span className="text-[11px] font-bold text-slate-800">{variant.color_name}</span>
                                <span className="inline-block mr-1.5 px-1.5 py-0.5 bg-slate-100 text-slate-700 font-mono font-black text-[9px] rounded border border-slate-200">
                                  {variant.size_name}
                                </span>
                              </div>
                            </div>

                            {/* تفاصيل الجرد للنسخ المرن للهاتف */}
                            <div className="grid grid-cols-4 gap-0.5 mt-0 pt-0 border-0 sm:grid-cols-4 text-center w-full col-span-4 items-center">
                              <div>
                                <span className="block sm:hidden text-[9px] text-slate-400 font-bold mb-0.5">المتوفر</span>
                                <span className={`text-xs font-mono font-black ${variant.quantity_available > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                  {variant.quantity_available}
                                </span>
                              </div>
                              <div>
                                <span className="block sm:hidden text-[9px] text-slate-400 font-bold mb-0.5">المحجوز</span>
                                <span className="text-xs font-mono font-bold text-orange-500">
                                  {variant.quantity_reserved}
                                </span>
                              </div>
                              <div>
                                <span className="block sm:hidden text-[9px] text-slate-400 font-bold mb-0.5">المباع</span>
                                <span className="text-xs font-mono font-bold text-slate-700">
                                  {variant.total_sold}
                                </span>
                              </div>
                              <div>
                                <span className="block sm:hidden text-[9px] text-slate-400 font-bold mb-0.5">تالف/راجع</span>
                                <span className="text-[10px] font-mono text-slate-500 font-semibold">
                                  {variant.damaged_quantity} ❌ / {variant.returned_quantity} 🔄
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-400 text-center py-2 font-bold">✨ لا توجد متغيرات فرعية (منتج بسيط بدون خيارات إضافية).</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}

/**
 * ==================================================================
 * 📱 مكون القوائم الخمسية المنفصلة التنافسية (UI/UX المخصص للهواتف)
 * ==================================================================
 */
function TopBottomList({ title, icon: Icon, data, type, color }) {
  const schemeMaps = {
    green: { border: 'border-emerald-200', headerBg: 'bg-emerald-600', icon: 'text-emerald-600 bg-white', font: 'text-emerald-700' },
    red: { border: 'border-red-200', headerBg: 'bg-orange-500', icon: 'text-red-700 bg-white', font: 'text-red-700' },
    purple: { border: 'border-purple-200', headerBg: 'bg-blue-900', icon: 'text-purple-700 bg-white', font: 'text-purple-700' },
    slate: { border: 'border-slate-300', headerBg: 'bg-red-800', icon: 'text-slate-800 bg-white', font: 'text-slate-800' }
  };

  const currentScheme = schemeMaps[color] || schemeMaps.slate;

  return (
    <div className={`bg-white border ${currentScheme.border} rounded-2xl shadow-xs overflow-hidden flex flex-col justify-between`}>
      {/* رأس القائمة */}
      <div className={`p-3.5 ${currentScheme.headerBg} flex items-center gap-3`}>
    <div className={`p-1.5 rounded-lg ${currentScheme.icon} shadow-sm`}>
      <Icon className="h-4 w-4" />
    </div>
    <h4 className="text-xs font-black text-white tracking-wide">{title}</h4>
</div>

      {/* محتويات القائمة */}
      <div className="divide-y divide-slate-100/80">
        {data && data.length > 0 ? (
          data.map((item, index) => (
            <div key={`${type}-${item.variant_id}-${index}`} className="p-3 flex items-center justify-between gap-2 hover:bg-slate-50/50 transition-all">
              <div className="flex items-center gap-2.5 min-w-0">
                {/* رتبة العنصر رقمياً بدائرة ذهبية أنيقة */}
                <span className="text-[10px] font-black font-mono w-5 h-5 flex items-center justify-center bg-slate-100 text-slate-500 rounded-full shrink-0">
                  {index + 1}
                </span>
                <img 
                  src={mediaUrl(item.main_image) || IMAGE_FALLBACK} onError={onImageError} 
                  alt="" 
                  className="w-8 h-8 object-cover rounded-lg border border-slate-200 bg-white shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-slate-800 truncate">{item.product_name}</p>
                  <p className="text-[9px] text-slate-400 font-bold mt-0.5 truncate">
                    اللون: <span className="text-slate-600 font-black">{item.color_name}</span> | المقاس: <span className="text-slate-600 font-black">{item.size_name}</span>
                  </p>
                </div>
              </div>

              {/* الرقم الإحصائي والعداد */}
              <div className="text-center shrink-0 bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-100 min-w-[65px]">
  {/* الرقم الأساسي (مباع/تالف/مرتجع) */}
  <span className={`block text-[11px] font-black font-mono ${currentScheme.font}`}>
    {type === 'sold' && item.total_sold}
    {type === 'damaged' && item.damaged_quantity}
    {type === 'returned' && item.returned_quantity}
  </span>
  
  {/* التسمية التوضيحية */}
  <span className="block text-[8px] text-slate-500 font-bold uppercase tracking-tighter mt-0.5">
    {type === 'sold' ? 'قطعة' : type === 'damaged' ? 'تالف' : 'مرتجع'}
  </span>
  
  {/* المخزون المتاح (بشكل أصغر وأكثر هدوءاً) */}
  <div className="border-t border-slate-200 mt-1 pt-0.5">
    <span className="text-[7px] text-slate-400 font-bold">متوفر: {item.quantity_available}</span>
  </div>
</div>
            </div>
          ))
        ) : (
          <p className="text-[10px] text-slate-400 text-center py-6 font-medium">لا توجد بيانات كافية لإدراجها في هذا التقرير حالياً.</p>
        )}
      </div>
    </div>
  );
}

/**
 * ==========================================
 * مكون كروت الـ KPI المعتمد لديك
 * ==========================================
 */
function KpiBox({ title, value, unit, icon: Icon, color }) {
  const colorMaps = {
    blue: { bg: 'bg-blue-50/60', border: 'border-blue-100/50', text: 'text-blue-600' },
    orange: { bg: 'bg-orange-50/60', border: 'border-orange-100/50', text: 'text-orange-600' },
    green: { bg: 'bg-emerald-50/60', border: 'border-emerald-100/50', text: 'text-emerald-600' },
    red: { bg: 'bg-red-50/60', border: 'border-red-100/50', text: 'text-red-600' },
    purple: { bg: 'bg-purple-50/60', border: 'border-purple-100/50', text: 'text-purple-600' },
    slate: { bg: 'bg-slate-50', border: 'border-slate-200/50', text: 'text-slate-700' }
  };

  const selectedColor = colorMaps[color] || colorMaps.slate;

  return (
    <div className="bg-white border border-slate-100 rounded-xl p-2.5 sm:p-4 flex flex-col justify-between shadow-xs transition-all hover:scale-[1.01]">
      <div className="flex items-start justify-between w-full gap-1">
        <span className="text-[10px] sm:text-xs text-slate-400 font-black truncate leading-tight">{title}</span>
        <div className={`p-1 rounded ${selectedColor.bg} ${selectedColor.text} shrink-0`}>
          <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </div>
      </div>
      <div className="mt-2 flex items-baseline gap-1 truncate">
        <span className={`text-base sm:text-2xl font-black font-mono tracking-tight ${selectedColor.text}`}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
        <span className="text-[9px] font-bold text-slate-400 shrink-0">{unit}</span>
      </div>
    </div>
  );
}