import React, { useState } from 'react';
import { BarChart2, Package, Users } from 'lucide-react';
import ProductsReport from './ProductsReport';
import EmployeesReport from './EmployeesReport';

export function Reports() {
  const [activeTab, setActiveTab] = useState('products');

  return (
    <div className="min-h-screen bg-slate-50/30 pb-12" dir="rtl">
      <div className="space-y-6">
        
        {/* هيدر الصفحة الرئيسي الموحد للتطبيق */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
          <div className="space-y-1 text-right">
            <h1 className="text-2xl font-black tracking-tight text-slate-900">التقارير التحليلية والرقابة</h1>

          </div>
        </div>

        {/* أزرار التبويبات التنقلية المصممة يدوياً واحترافياً لتجنب مشاكل المكتبات الخارجية */}
        <div className="flex items-center gap-1.5 border-b border-slate-200 pb-px">
          <button
            onClick={() => setActiveTab('products')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all ${
              activeTab === 'products'
                ? 'border-[#6b1d2f] text-[#6b1d2f] bg-white rounded-t-xl'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <Package className="h-4 w-4" />
            <span>تقارير المنتجات والمخزون</span>
          </button>
          
          <button
            onClick={() => setActiveTab('employees')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all ${
              activeTab === 'employees'
                ? 'border-[#6b1d2f] text-[#6b1d2f] bg-white rounded-t-xl'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <Users className="h-4 w-4" />
            <span>تقارير وتدقيق الموظفين</span>
          </button>
        </div>

        {/* عرض محتوى القسم النشط والتبديل الحي بينهما بسلاسة */}
        <div className="animate-fade-in duration-200">
          {activeTab === 'products' ? <ProductsReport /> : <EmployeesReport />}
        </div>

      </div>
    </div>
  );
}