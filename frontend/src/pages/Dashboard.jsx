import React, { useEffect, useState } from 'react';
import { 
  Package, Box, ShoppingCart, Clock, CheckCircle, 
  ListTodo, AlertTriangle, RefreshCw, Percent 
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { catalogApi } from '../api/catalogApi';

// --- مكون الأزرار السريعة ---
const QuickAction = ({ label, icon: Icon, color }) => (
  <button className="bg-white border border-slate-100 p-4 rounded-3xl flex flex-col items-center justify-center gap-2 hover:bg-slate-50 transition-all group active:scale-95 shadow-sm">
    <div className={cn("p-2.5 rounded-2xl transition-all group-hover:bg-opacity-80", color)}>
      <Icon className="w-5 h-5" />
    </div>
    <span className="text-[11px] font-black text-slate-700 tracking-tight">{label}</span>
  </button>
);

// --- مكون البطاقة الإحصائية المحسن ---
const StatCard = ({ title, value, icon: Icon, colorClass, isFullWidth }) => (
  <div className={cn(
    "bg-white rounded-[1rem] border border-slate-100 shadow-sm flex items-center transition-all hover:shadow-md",
    isFullWidth 
      ? "col-span-3 p-5 gap-4" 
      : "col-span-1 p-3 xs:p-4 flex-col sm:flex-row text-center sm:text-right gap-2 sm:gap-3"
  )}>
    <div className={cn(
      "rounded-2xl flex items-center justify-center shrink-0", 
      colorClass,
      isFullWidth ? "p-4" : "p-2.5 sm:p-3.5"
    )}>
      <Icon className={cn(isFullWidth ? "w-7 h-7" : "w-5 h-5 sm:w-6 sm:h-6")} />
    </div>
    <div className="w-full min-w-0">
      <p className="text-slate-500 text-[9px] xs:text-[10px] sm:text-xs font-bold tracking-tight truncate">
        {title}
      </p>
      <h3 className={cn(
        "font-black text-slate-900 leading-none tracking-tight mt-1 truncate",
        isFullWidth ? "text-3xl" : "text-base xs:text-lg sm:text-2xl"
      )}>
        {value}
      </h3>
    </div>
  </div>
);

const Dashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // [تعديل محوري]: تمرير 'all' كقيمة افتراضية لتعطيل الفلتر الزمني في الصفحة الرئيسية وجلب كل البيانات
        const response = await catalogApi.getInventoryStats('all');
        
        // فك التغليف لضمان الوصول للكائن الصحيح
        const actualStats = response?.data?.data || response?.data || response;
        
        setStats(actualStats);
      } catch (err) { 
        console.error("Error fetching stats:", err); 
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" dir="rtl">
        <p className="text-sm font-bold text-slate-400 animate-pulse">جاري تحميل الإحصائيات الحقيقية...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6 pb-24 select-none" dir="rtl">
      
      {/* 1. الترحيب */}
      <div className="flex flex-col gap-0.5">
        <h1 className="text-2xl font-black text-slate-900">
          مرحباً، {user?.name || 'ريان'} 👋
        </h1>
        <p className="text-slate-400 text-xs font-bold">إليك ملخص أداء المخزن والطلبات الفعلي</p>
      </div>

      {/* الشبكة الرئيسية الثابتة بـ 3 أعمدة دائماً */}
      <div className="grid grid-cols-3 gap-3 sm:gap-6">
        
        {/* السطر الأول: إجمالي المنتجات */}
        <StatCard 
          title="إجمالي المنتجات المسجلة" 
          value={stats?.inventory?.total_products || 0} 
          icon={Package} 
          colorClass="bg-blue-50 text-blue-600" 
          isFullWidth
        />

        {/* السطر الثاني: المخزون المتوفر، المحجوز، والمباع */}
        <StatCard 
          title="المخزون المتوفر" 
          value={stats?.inventory?.total_inventory || 0} 
          icon={Box} 
          colorClass="bg-emerald-50 text-emerald-900" 
        />
        <StatCard 
          title="الكمية المحجوزة" 
          value={stats?.inventory?.total_reserved || 0} 
          icon={ListTodo} 
          colorClass="bg-amber-50 text-amber-600" 
        />
        <StatCard 
          title="القطع المباعة" 
          value={stats?.inventory?.total_sold || 0} 
          icon={CheckCircle} 
          colorClass="bg-indigo-50 text-indigo-900" 
        />

        {/* السطر الإضافي المطور: معلومات التالف والرواجع ونسبة التالف */}
        <StatCard 
          title="إجمالي التالف" 
          value={stats?.inventory?.damaged || 0} 
          icon={AlertTriangle} 
          colorClass="bg-red-50 text-red-600" 
        />
        <StatCard 
          title="إجمالي الرواجع" 
          value={stats?.inventory?.returns || 0} 
          icon={RefreshCw} 
          colorClass="bg-orange-50 text-orange-600" 
        />
        <StatCard 
          title="نسبة الهالك" 
          value={`${stats?.inventory?.waste_rate || 0}%`} 
          icon={Percent} 
          colorClass="bg-purple-50 text-purple-900" 
        />

        {/* فاصل جمالي مميز للطلبات */}
        <div className="col-span-3 relative py-2 mt-2">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-300"></div>
          </div>
          <div className="relative flex justify-center">
            <span className="bg-[#f8fafc] px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">
              إدارة وحالة الطلبات
            </span>
          </div>
        </div>

        {/* السطر الثالث: الطلبات، قيد التجهيز، والمعلقة */}
        <StatCard 
          title="إجمالي الطلبات" 
          value={stats?.orders?.total || 0} 
          icon={ShoppingCart} 
          colorClass="bg-slate-100 text-slate-700" 
        />
        <StatCard 
          title="قيد التجهيز" 
          value={stats?.orders?.processing || 0} 
          icon={Clock} 
          colorClass="bg-sky-50 text-sky-600" 
        />
        <StatCard 
          title="طلبات معلقة" 
          value={stats?.orders?.pending || 0} 
          icon={ListTodo} 
          colorClass="bg-rose-50 text-rose-600" 
        />

      </div>
    </div>
  );
};

export default Dashboard;