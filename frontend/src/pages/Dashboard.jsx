import React from 'react';
import { 
  Package, TrendingDown, DollarSign, PlusCircle, 
  ScanBarcode, History, Trash2, ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';

// --- مكون البطاقة الإحصائية (Stats Card) ---
const StatCard = ({ title, value, subtext, icon: Icon, colorClass, alert }) => (
  <div className={cn(
    "bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between transition-all hover:shadow-md",
    alert && "border-orange-100 bg-orange-50/10"
  )}>
    <div className="flex justify-between items-start">
      <div className={cn("p-3 rounded-2xl", colorClass)}>
        <Icon className="w-6 h-6" />
      </div>
      {alert && <TrendingDown className="w-5 h-5 text-orange-500 animate-pulse" />}
    </div>
    <div className="mt-6">
      <p className="text-slate-500 text-sm font-medium tracking-wide">{title}</p>
      <h3 className="text-3xl font-black mt-1 text-slate-900 leading-none">{value}</h3>
      {subtext && <p className={cn("text-[11px] mt-2 font-bold", alert ? "text-orange-600" : "text-slate-400")}>{subtext}</p>}
    </div>
  </div>
);

// --- مكون الأزرار السريعة (Quick Action) ---
const QuickAction = ({ label, icon: Icon, color }) => (
  <button className="bg-white border border-slate-100 p-5 rounded-3xl flex flex-col items-center justify-center gap-3 hover:bg-slate-50 transition-all group active:scale-95 shadow-sm">
    <div className={cn("p-3.5 rounded-2xl transition-all group-hover:bg-opacity-80", color)}>
      <Icon className="w-6 h-6" />
    </div>
    <span className="text-xs font-black text-slate-700 tracking-tight">{label}</span>
  </button>
);

const Dashboard = () => {
  const { user } = useAuth();

  return (
    <div className="space-y-8" dir="rtl">
      
      {/* 1. الترحيب (بدون أي قوائم أو أزرار إعدادات) */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-black text-slate-900">
          مرحباً بك مجدداً، {user?.name || 'أحمد'} 👋
        </h1>
        <p className="text-slate-500 text-sm font-medium">إليك ملخص أداء النظام لليوم</p>
      </div>

      {/* 2. شبكة الإحصائيات - تصميم أنظف */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard 
          title="إجمالي المنتجات" 
          value="1,284" 
          icon={Package} 
          colorClass="bg-blue-100 text-blue-600" 
        />
        <StatCard 
          title="نقص المخزون" 
          value="12" 
          subtext="تحتاج إلى طلب توريد فوراً" 
          icon={TrendingDown} 
          colorClass="bg-orange-100 text-orange-600"
          alert 
        />
        <StatCard 
          title="قيمة المخزون" 
          value="₺45,200" 
          icon={DollarSign} 
          colorClass="bg-emerald-100 text-emerald-600" 
        />
      </div>

      {/* 3. الأزرار السريعة */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <QuickAction label="مسح باركود" icon={ScanBarcode} color="bg-slate-900 text-white" />
        <QuickAction label="منتج جديد" icon={PlusCircle} color="bg-blue-600 text-white" />
        <QuickAction label="إضافة مخزون" icon={ArrowUpRight} color="bg-emerald-600 text-white" />
        <QuickAction label="تسجيل تالف" icon={Trash2} color="bg-red-600 text-white" />
      </div>

      {/* 4. قسم الحركات الأخيرة - تصميم مستقر واحترافي */}
      <div className="bg-white border border-slate-100 rounded-[2rem] overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-50 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-100 rounded-lg text-slate-400">
              <History className="w-5 h-5" />
            </div>
            <h2 className="font-black text-slate-800 tracking-tight">آخر حركات المخزون</h2>
          </div>
          <button className="text-xs text-blue-600 font-black hover:bg-blue-50 px-3 py-1.5 rounded-full transition-colors underline-offset-4">عرض السجل الكامل</button>
        </div>
        
        <div className="divide-y divide-slate-50">
          {[
            { name: "آيفون 15 برو", type: "إضافة مخزون", qty: "+5", time: "منذ 10 دقائق", icon: ArrowUpRight, color: "text-emerald-600", bg: "bg-emerald-50" },
            { name: "سماعات سوني", type: "مبيعات", qty: "-2", time: "منذ ساعة", icon: ArrowDownRight, color: "text-red-600", bg: "bg-red-50" },
            { name: "شاحن سريع 20 وات", type: "مبيعات", qty: "-1", time: "منذ ساعتين", icon: ArrowDownRight, color: "text-red-600", bg: "bg-red-50" },
          ].map((item, i) => (
            <div key={i} className="p-5 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
              <div className="flex items-center gap-4">
                <div className={cn("p-2.5 rounded-xl", item.bg)}>
                  <item.icon className={cn("w-5 h-5", item.color)} />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800 leading-none">{item.name}</p>
                  <p className="text-[11px] text-slate-400 font-medium mt-1.5">{item.time} • {item.type}</p>
                </div>
              </div>
              <span className={cn("font-black text-sm tabular-nums", item.color)}>{item.qty}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;