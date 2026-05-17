import React from 'react';
import { 
  UserCircle, X, Activity, Scan, AlertTriangle, 
  ShoppingBag, Users, Package, RotateCcw, Clock,
  Phone, Shield, Calendar, CheckCircle2, MinusCircle
} from 'lucide-react';

const EmployeeDetailsModal = ({ isOpen, onClose, employeeStats }) => {
  if (!isOpen) return null;

  if (!employeeStats) {
    return (
      <div className="fixed inset-0 z-[999] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
        <div className="bg-white p-8 rounded-3xl text-center shadow-2xl">
          <div className="w-12 h-12 border-4 border-[#800000] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="font-bold text-slate-600">جاري جلب ملف الموظف...</p>
        </div>
      </div>
    );
  }

  const { 
    employee_info, 
    grand_total, 
    products_activity, 
    employees_activity, 
    orders_activity, 
    logistics_activity 
  } = employeeStats;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-slate-50 w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-[3rem] shadow-2xl border border-white relative animate-in fade-in zoom-in-95 duration-300 no-scrollbar" dir="rtl">
        
        {/* زر الإغلاق العائم */}
        <button 
          onClick={onClose} 
          className="absolute top-6 left-6 z-[60] p-3 bg-white/80 hover:bg-red-500 hover:text-white rounded-2xl transition-all shadow-sm text-slate-400"
        >
          <X size={20} />
        </button>

        {/* 1. قسم معلومات الموظف الأساسية - بتنسيق مدمج وحديث */}
        <div className="relative bg-white px-8 pt-10 pb-6 rounded-b-[3.5rem] shadow-sm border-b border-slate-100 overflow-hidden">
          {/* لمسة خلفية ناعمة */}
          <div className="absolute top-0 right-0 w-full h-32 bg-gradient-to-b from-slate-50/80 to-transparent pointer-events-none"></div>

          <div className="relative flex flex-col md:flex-row items-start justify-between gap-4">
            
            {/* الجزء الأيمن: الهوية الشخصية */}
            <div className="flex items-center gap-5">
              <div className="relative">
              <div className="w-20 h-20 bg-[#800000] rounded-full flex items-center justify-center text-white border-[4px] border-white shadow-xl shadow-slate-200/50">
                 <span className="text-2xl font-black uppercase tracking-tighter">
                   {employee_info?.["الاسم"]?.split(' ').map(n => n[0]).join('').slice(0, 2) || "??"}
                 </span>
                </div>
              </div>

              <div className="space-y-0.5">
                <h2 className="text-xl font-black text-slate-800 tracking-tight">
                  {employee_info?.["الاسم"] || "اسم الموظف"}
                </h2>
                <div className="flex items-center gap-1.5 text-[#800000] font-bold text-[12px] bg-red-50/80 px-2.5 py-0.5 rounded-lg border border-red-100/50 w-fit">
                  <Shield size={12} />
                  <span>{employee_info?.["الرتبة"] || "موظف"}</span>
                </div>
              </div>
            </div>

            {/* الجزء الأيسر: الحالة والنشاط العام */}
            <div className="flex flex-col items-end gap-2 pt-2">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-black shadow-sm border ${
                employee_info?.["الحالة"] === "نشط" 
                  ? "bg-emerald-50 text-emerald-600 border-emerald-100" 
                  : "bg-red-50 text-red-600 border-red-100"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  employee_info?.["الحالة"] === "نشط" ? "bg-emerald-500 animate-pulse" : "bg-red-500"
                }`}></span>
                {employee_info?.["الحالة"] || "غير محدد"}
              </div>
            </div>
          </div>

          {/* تفاصيل التواصل - موزعة بذكاء ومسافات أقل */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-8">
            {[
              { label: "رقم الهاتف", value: employee_info?.["رقم الهاتف"], icon: <Phone size={16} />, color: "text-blue-500" },
              { label: "تاريخ الانضمام", value: employee_info?.["تاريخ التسجيل"], icon: <Calendar size={16} />, color: "text-orange-500" },
      
            ].map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-3.5 bg-slate-50/40 rounded-2xl border border-slate-100/50 hover:bg-white hover:shadow-md hover:shadow-slate-200/50 transition-all duration-300 group">
                <div className="flex flex-col">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{item.label}</span>
                  <span className="text-sm font-black text-slate-700">{item.value || "---"}</span>
                </div>
                <div className={`w-9 h-9 bg-white rounded-xl flex items-center justify-center ${item.color} shadow-sm group-hover:scale-110 transition-transform`}>
                  {item.icon}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 2. قسم الإحصائيات العملية - لم يتم التعديل على منطق البيانات */}
        <div className="p-8 space-y-6">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-6 bg-[#800000] rounded-full"></div>
              <h3 className="text-md font-black text-slate-800 uppercase tracking-tight">سجل النشاطات</h3>
            </div>
            <div className="bg-gray-100 text-slate-800 px-5 py-2 rounded-2xl shadow-sm flex items-center gap-3 border border-gray-200">
             <p className="text-[10px] font-bold uppercase text-black">الإجمالي</p>
             <p className="text-xl font-black text-[#800000]">{grand_total}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <StatsGroup title="إدارة المنتجات" icon={<Package className="text-blue-600" />} data={products_activity} />
            <StatsGroup title="إدارة الموظفين" icon={<Users className="text-purple-600" />} data={employees_activity} />
            <StatsGroup title="عمليات الطلبات" icon={<ShoppingBag className="text-emerald-600" />} data={orders_activity} />
            
            <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-orange-50 rounded-xl">
                  <Activity className="text-orange-600" size={18} />
                </div>
                <h3 className="font-black text-slate-800 text-xs">اللوجستيات</h3>
              </div>
              <div className="space-y-3">
                <DetailRow label="عمليات مسح QR" value={logistics_activity?.scans} icon={<Scan size={14}/>} />
                <DetailRow label="منتجات تالفة" value={logistics_activity?.damages} icon={<AlertTriangle size={14}/>} />
                <DetailRow label="رواجع المبيعات" value={logistics_activity?.returns} icon={<RotateCcw size={14}/>} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const StatsGroup = ({ title, icon, data }) => (
  <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm transition-all hover:shadow-lg hover:shadow-slate-200/50">
    <div className="flex items-center gap-3 mb-6">
      <div className="p-2 bg-slate-50 rounded-xl">{icon}</div>
      <h3 className="font-black text-slate-800 text-xs">{title}</h3>
    </div>
    <div className="grid grid-cols-3 gap-2">
      <StatBox label="إضافة" value={data?.adds} color="text-emerald-600" bg="bg-emerald-50/50" />
      <StatBox label="تعديل" value={data?.updates} color="text-blue-600" bg="bg-blue-50/50" />
      <StatBox label="حذف" value={data?.deletes} color="text-red-600" bg="bg-red-50/50" />
    </div>
  </div>
);

const StatBox = ({ label, value, color, bg }) => (
  <div className={`text-center py-3 px-2 rounded-2xl ${bg} border border-transparent transition-all`}>
    <p className="text-[9px] font-bold text-slate-400 mb-0.5">{label}</p>
    <p className={`text-xl font-black ${color}`}>{value || 0}</p>
  </div>
);

const DetailRow = ({ label, value, icon }) => (
  <div className="flex items-center justify-between p-3 bg-slate-50/30 rounded-xl border border-transparent hover:border-slate-100 transition-all group">
    <div className="flex items-center gap-2">
      <span className="p-1.5 bg-white rounded-lg text-slate-400 group-hover:text-[#800000] shadow-sm transition-colors">{icon}</span>
      <span className="text-[11px] font-bold text-slate-600">{label}</span>
    </div>
    <span className="text-xs font-black text-slate-900 bg-white px-2.5 py-0.5 rounded-lg shadow-sm border border-slate-100">{value || 0}</span>
  </div>
);

export default EmployeeDetailsModal;