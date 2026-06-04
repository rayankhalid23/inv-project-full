import React, { useState, useEffect } from 'react';
import { 
  Users, Activity, CheckCircle2, ShieldAlert, 
  TrendingUp, TrendingDown, RefreshCw, ChevronDown, 
  ChevronUp, Award, Layers, ShoppingBag, RotateCcw, 
  Trash2, Shield, Calendar, Sparkles
} from 'lucide-react';
import { KpiCard, ReportCard, SectionHeader } from './ReportShared';
import { fetchEmployeeStatisticsApi, fetchPerformanceAnalyticsApi } from '../../api/userApi';

const API_BASE_URL = 'http://localhost:8000';

export default function EmployeesReport({ period }) {
  const [stats, setStats] = useState(null);
  const [performance, setPerformance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedEmployee, setExpandedEmployee] = useState(null);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        
        // جلب البيانات بشكل متوازي من الباك إند
        const [statsRes, performanceRes] = await Promise.all([
          fetchEmployeeStatisticsApi(),
          fetchPerformanceAnalyticsApi({ period })
        ]);

        if (isMounted) {
          setStats(statsRes);
          setPerformance(performanceRes);
        }
      } catch (err) {
        console.error("Error loading employee reports:", err);
        if (isMounted) {
          setError(err?.response?.data?.detail || err?.message || "حدث خطأ أثناء تحميل تقارير الموظفين");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadData();
    return () => { isMounted = false; };
  }, [period, refreshKey]);

  const toggleExpand = (empName) => {
    setExpandedEmployee(expandedEmployee === empName ? null : empName);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <div className="relative flex items-center justify-center">
          <div className="h-12 w-12 rounded-full border-4 border-slate-200 border-t-[#6b1d2f] animate-spin"></div>
          <Users className="h-5 w-5 text-[#6b1d2f] absolute animate-pulse" />
        </div>
        <p className="text-xs font-bold text-slate-500 tracking-wide animate-pulse">جاري تحليل سجلات النشاط وتدقيق كفاءة الموظفين...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50/80 border border-red-100 rounded-2xl p-8 text-center max-w-lg mx-auto my-16 space-y-4 shadow-sm" dir="rtl">
        <ShieldAlert className="h-10 w-10 text-red-600 mx-auto animate-bounce" />
        <h3 className="text-sm font-black text-red-900">فشل مزامنة بيانات الموظفين</h3>
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

  // استخراج البيانات
  const totalEmp = stats?.total_employees || 0;
  const activeEmp = stats?.active_employees || 0;
  const deletedEmp = stats?.deleted_employees || 0;
  const admins = stats?.admins_count || 0;
  const managers = stats?.managers_count || 0;
  const employees = stats?.employees_count || 0;

  const topEmp = performance?.top_performer;
  const bottomEmp = performance?.bottom_performer;
  const list = performance?.sorted_employees || [];

  return (
    <div className="space-y-6" dir="rtl">
    
    {/* ==========================================
    القسم الأول: إحصائيات الموظفين العامة
    ========================================== */}
<div>
  <div className="flex items-center  gap-2 mb-3 px-1">
    <Users className="h-3.5 w-3.5 text-slate-400" />
    <span className="text-[10px] font-black text-slate-400 tracking-wider uppercase">أولاً :  الرقابة الكلية على سجل الموظفين</span>
  </div>
  <div className="grid grid-cols-3  gap-2  sm:gap-4">
    <KpiBox title="إجمالي الموظفين" value={totalEmp} unit="موظف" icon={Users} color="slate" />
    <KpiBox title="الموظفين النشطين" value={activeEmp} unit="نشط" icon={Activity} color="purple" />
    <KpiBox title="الموظفين المحذوفين" value={deletedEmp} unit="محذوف" icon={Trash2} color="red" />
    <KpiBox title="المسؤولين" value={admins} unit="مسؤول" icon={Shield} color="green" />
    <KpiBox title="المدراء" value={managers} unit="مدير" icon={Award} color="blue" />
    <KpiBox title="الموظفين العاديين" value={employees} unit="فرد" icon={Layers} color="orange" />
  </div>
</div>

{/* فاصل حركة النشاط */}
<div className="relative flex py-2 items-center">
  <div className="flex-grow border-t border-slate-200"></div>
  <span className="flex-shrink mx-4 text-[10px] font-black text-slate-400 bg-transparent px-2">تقييمات الموظفين </span>
  <div className="flex-grow border-t border-slate-200"></div>
</div>


{/* شبكة التقارير */}
<div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
  {[
    { title: "المسؤولون", data: performance?.admins, color: "emerald" },
    { title: "المدراء", data: performance?.managers, color: "blue" },
    { title: "الموظفون", data: performance?.staff, color: "purple" }

  ].map((sec) => (
    <div key={sec.title} className="bg-white border border-slate-300 rounded-2xl shadow-xs overflow-hidden">
      <div className={`p-3.5 bg-${sec.color}-50/50 border-b border-slate-100 flex items-center gap-2`}>
        <div className={`p-1.5 rounded-lg bg-${sec.color}-50 text-${sec.color}-600`}>
          <Award className="h-4 w-4" />
        </div>
        <h4 className="text-xs font-black text-slate-900">{sec.title}</h4>
      </div>
      
      <div className="p-3 grid grid-cols-2 gap-2">
        {/* الأفضل */}
        <div className="bg-green-900 p-2 rounded-xl">
  {/* العنوان: استخدام green-200 يعطي تباين خفيف وأنيق */}
  <p className="text-[9px] font-bold text-green-200 mb-1 uppercase tracking-wider">
    الأفضل نشاطاً
  </p>
  
  {/* الاسم: استخدام white يضمن وضوحاً تاماً فوق الأخضر الداكن */}
  <p className="text-[11px] font-black truncate text-white">
    {sec.data?.top?.[0]?.employee_name || "---"}
  </p>
</div>
        {/* الأسوأ */}
       {/* الأسوأ */}
<div className="bg-red-800 p-2 rounded-xl">
  {/* العنوان: استخدام red-200 يظهر بوضوح تام فوق الخلفية الحمراء الداكنة */}
  <p className="text-[9px] font-bold text-red-200 mb-1 uppercase tracking-wider">
    الأقل نشاطاً
  </p>
  
  {/* الاسم: استخدام white يجعل الاسم يبرز كمعلومة أساسية */}
  <p className="text-[11px] font-black truncate text-white">
    {sec.data?.bottom?.[0]?.employee_name || "---"}
  </p>
</div>




      </div>
    </div>
  ))}
</div>
{/* فاصل حركة النشاط */}
<div className="relative flex py-2 items-center">
  <div className="flex-grow border-t border-slate-200"></div>
  <span className="flex-shrink mx-4 text-[10px] font-black text-slate-400 bg-transparent px-2">حركة النشاط الوظيفي الحالية</span>
  <div className="flex-grow border-t border-slate-200"></div>
</div>

{["admins", "managers", "staff"].map((roleKey) => {
  const roleData = performance?.[roleKey];
  if (!roleData?.list?.length) return null;

  // تعريف التنسيقات والألوان الثابتة لكل رتبة لضمان عمل Tailwind بشكل صحيح
  const roleStyles = {
    admins: { 
      label: "المسؤولون", icon: Shield, 
      activeBg: "bg-emerald-50/40", activeBorder: "border-l-emerald-700 border-b-emerald-100",
      contentBg: "bg-emerald-50/10", contentBorder: "border-emerald-100/70",
      textPrimary: "text-emerald-600", chevronColor: "text-emerald-700"
    },
    managers: { 
      label: "المدراء", icon: Award, 
      activeBg: "bg-blue-50/40", activeBorder: "border-l-blue-700 border-b-blue-100",
      contentBg: "bg-blue-50/10", contentBorder: "border-blue-100/70",
      textPrimary: "text-blue-600", chevronColor: "text-blue-700"
    },
    staff: { 
      label: "الموظفون", icon: Users, 
      activeBg: "bg-purple-50/40", activeBorder: "border-l-purple-700 border-b-purple-100",
      contentBg: "bg-purple-50/10", contentBorder: "border-purple-100/70",
      textPrimary: "text-purple-600", chevronColor: "text-purple-700"
    }
  };
  
  const style = roleStyles[roleKey];

  return (
    <div key={roleKey} className="mb-10">
      
      {/* الحاوية الرئيسية للقائمة */}
      <div className="bg-white border border-slate-300 rounded-2xl shadow-sm overflow-hidden">
        
        {/* رأس القائمة */}
        <div className="p-4 bg-slate-50/50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <style.icon className="h-4 w-4 text-slate-700" />
            <h3 className="text-xs sm:text-sm font-black text-slate-900">
              {style.label} : ({roleData.list.length} موظف نشط)
            </h3>
          </div>
          <span className="text-[10px] bg-slate-200/70 text-slate-600 font-bold px-3 py-1 rounded-full hidden sm:block">
            اضغط على أي موظف لاستعراض سجل العمليات
          </span>
        </div>

        {/* عناصر القائمة (الموظفين) */}
        <div className="divide-y divide-slate-100">
          {roleData.list.map((emp, index) => {
            const isExpanded = expandedEmployee === emp.id;
            
            return (
              <div key={emp.id} className="transition-all">
                
                {/* السطر الرئيسي للموظف */}
                <div 
                  onClick={() => toggleExpand(emp.id)}
                  className={`p-3 sm:p-4 flex items-center justify-between gap-2 cursor-pointer transition-all border-b border-transparent ${
                    isExpanded 
                      ? `${style.activeBg} border-l-4 ${style.activeBorder}` 
                      : 'hover:bg-slate-50/80'
                  }`}
                >
                  {/* الجانب الأيمن: البيانات الأساسية */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center text-lg sm:text-xl text-slate-400 font-black font-mono rounded-xl border border-slate-200 bg-white shrink-0 shadow-sm">
                      {index + 1}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">{emp.employee_name}</h4>
                    </div>
                  </div>

                  {/* الجانب الأيسر: العدادات التراكمية */}
                  <div className="flex items-center gap-1.5 sm:gap-4 shrink-0 pl-1 sm:pl-0">
                    <div className="text-center min-w-[32px] sm:min-w-[45px]">
                      <span className="block text-[8px] sm:text-[10px] text-slate-400 font-bold leading-none mb-1">العمليات</span>
                      <span className={`text-[10px] sm:text-sm font-mono font-black ${style.textPrimary}`}>
                        {emp.total_operations}
                      </span>
                    </div>

                    <div className="p-0.5 sm:p-1 text-slate-400 rounded-lg hover:bg-slate-200 transition-all mr-1">
                      {isExpanded 
                        ? <ChevronUp className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${style.chevronColor} font-black`} /> 
                        : <ChevronDown className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      }
                    </div>
                  </div>
                </div>

                {/* شجرة التفاصيل المنسدلة (تفتح عند الضغط على الموظف) */}
                {isExpanded && (
                  <div className={`${style.contentBg} p-4 border-t border-b ${style.contentBorder} animate-fade-in`}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {Object.entries(emp.categories)
                        .filter(([catKey]) => {
                          // تصفية: إذا كان الرتبة "موظفون" يتم إخفاء هذه الأقسام
                          if (roleKey === "staff" && ["catalogs", "employees", "products"].includes(catKey.toLowerCase())) {
                            return false;
                          }
                          return true;
                        })
                        .map(([catKey, actions]) => {
                          // قاموس التعريب للبطاقات
                          const catLabels = { 
                            catalogs: "الكتالوجات", employees: "الموظفين", products: "المنتجات",
                            sales: "المبيعات", orders: "الطلبات",
                            damages: "تالف", returns: "مرتجع"
                          };
                          
                          const title = catLabels[catKey] || catKey;
                          const total = catKey === "damages" || catKey === "returns" 
                                      ? actions.total 
                                      : ((actions.adds || 0) + (actions.updates || 0) + (actions.deletes || 0));

                          return (
                            <div key={catKey} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between min-h-[90px] transition-all hover:shadow-md">
                              
                              {/* الجزء العلوي: الاسم (يمين) والإجمالي (يسار) */}
                              <div className="flex items-start justify-between w-full mb-3">
                                <span className="text-[11px] font-black text-slate-500 uppercase tracking-wide">
                                  {title}
                                </span>
                                <span className="text-xl font-black text-rose-900 leading-none">
                                  {total}
                                </span>
                              </div>

                              {/* الجزء السفلي: تفاصيل إضافة/تعديل/حذف في المنتصف */}
                              {!(catKey === "damages" || catKey === "returns") && (
                                <div className="flex items-center justify-center gap-6 mt-auto pt-2 border-t border-slate-50">
                                  
                                  {/* إضافة */}
                                  <div className="flex flex-col items-center">
                                    <span className="text-[8px] text-slate-400 font-bold mb-0.5">إضافة</span>
                                    <span className="text-[11px] font-mono font-black text-emerald-600">
                                      {actions.adds || 0}
                                    </span>
                                  </div>

                                  {/* تعديل */}
                                  <div className="flex flex-col items-center">
                                    <span className="text-[8px] text-slate-400 font-bold mb-0.5">تعديل</span>
                                    <span className="text-[11px] font-mono font-black text-blue-600">
                                      {actions.updates || 0}
                                    </span>
                                  </div>

                                  {/* حذف */}
                                  <div className="flex flex-col items-center">
                                    <span className="text-[8px] text-slate-400 font-bold mb-0.5">حذف</span>
                                    <span className="text-[11px] font-mono font-black text-rose-600">
                                      {actions.deletes || 0}
                                    </span>
                                  </div>
                                  
                                </div>
                              )}
                            </div>
                          );
                      })}
                    </div>
                  </div>
                )}
                
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
})}
      
    </div>
  );
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
}
