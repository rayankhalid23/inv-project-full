import React from 'react';
import { Award } from 'lucide-react';

// كرت المؤشرات الرئيسية KPI
export const KpiCard = ({ title, value, icon: Icon, type = "blue", subtext }) => {
  const colors = {
    blue: "bg-blue-50/80 border-blue-100 text-blue-700 from-blue-500",
    green: "bg-emerald-50/80 border-emerald-100 text-emerald-700 from-emerald-500",
    red: "bg-red-50/80 border-red-100 text-red-700 from-red-500",
    purple: "bg-purple-50/80 border-purple-100 text-purple-700 from-purple-500",
    orange: "bg-orange-50/80 border-orange-100 text-orange-700 from-orange-500",
    teal: "bg-teal-50/80 border-teal-100 text-teal-700 from-teal-500"
  };

  return (
    <div className={`bg-white border rounded-2xl p-5 relative overflow-hidden shadow-sm transition-all hover:shadow-md`}>
      <div className="absolute top-0 right-0 h-1 w-full bg-gradient-to-l opacity-20" />
      <div className="flex items-center justify-between">
        <div className="space-y-1.5 text-right">
          <p className="text-xs font-semibold text-slate-400">{title}</p>
          <h3 className="text-2xl font-black text-slate-800 tracking-tight font-mono">{value}</h3>
          {subtext && <p className="text-[10px] font-bold text-slate-400">{subtext}</p>}
        </div>
        <div className={`h-11 w-11 rounded-xl flex items-center justify-center border ${colors[type]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
};

// ترويسة الأقسام داخل التقرير
export const SectionHeader = ({ title, sub }) => (
  <div className="space-y-0.5 text-right pb-3 border-b border-slate-100">
    <h3 className="text-sm font-black text-slate-900">{title}</h3>
    {sub && <p className="text-xs text-slate-400 font-medium">{sub}</p>}
  </div>
);

// الحاوية القياسية للتقارير
export const ReportCard = ({ children, className = "" }) => (
  <div className={`bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4 ${className}`}>
    {children}
  </div>
);

// جدول عرض البيانات المتجاوب
export const DataTable = ({ headers, children }) => (
  <div className="w-full overflow-x-auto border border-slate-100 rounded-xl bg-white">
    <table className="w-full text-right border-collapse">
      <thead>
        <tr className="bg-slate-50 border-b border-slate-100">
          {headers.map((h, i) => (
            <th key={i} className="px-4 py-3 text-xs font-bold text-slate-500 whitespace-nowrap">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-50 text-xs text-slate-600 font-medium">
        {children}
      </tbody>
    </table>
  </div>
);

// شارة تحديد اللون البصري للمنتج
export const ColorDot = ({ colorName }) => (
  <div className="flex items-center gap-1.5 justify-start">
    <span className="w-2.5 h-2.5 rounded-full border border-slate-300 shadow-sm" style={{ backgroundColor: colorName === 'برعندي' ? '#6b1d2f' : colorName === 'رمادي' ? '#94a3b8' : '#334155' }} />
    <span>{colorName}</span>
  </div>
);

// شارة رتبة المبيعات الفاخرة
export const RankBadge = ({ rank }) => {
  const badges = {
    1: { style: "bg-amber-50 text-amber-700 border-amber-200", label: "الأول 🥇" },
    2: { style: "bg-slate-100 text-slate-700 border-slate-200", label: "الثاني 🥈" },
    3: { style: "bg-orange-50 text-orange-700 border-orange-200", label: "الثالث 🥉" },
  };
  const current = badges[rank] || { style: "bg-slate-50 text-slate-500 border-slate-200", label: `${rank}` };
  return (
    <span className={`px-2 py-0.5 rounded-lg border text-[10px] font-black tracking-tight ${current.style}`}>
      {current.label}
    </span>
  );
};