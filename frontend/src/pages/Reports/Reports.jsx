import React, { useState } from 'react';
import { BarChart2, Package, Users, FileDown } from 'lucide-react';
import ProductsReport from './ProductsReport';
import EmployeesReport from './EmployeesReport';
import TimeFilter from '../../components/TimeFilter'; // المسار صحيح وممتاز
import { catalogApi } from '../../api/catalogApi';

export function Reports() {
  const [activeTab, setActiveTab] = useState('products');
  const [period, setPeriod] = useState('7d'); // الـ State الموحدة للوقت
  const [pdfLoading, setPdfLoading] = useState(false);

  const handleExportPdf = async () => {
    try {
      setPdfLoading(true);
      await catalogApi.exportComprehensiveReportPdf(period);
    } catch (error) {
      console.error("Comprehensive PDF Export error:", error);
      alert("حدث خطأ أثناء تصدير ملف PDF للتقرير الشامل.");
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/30 pb-12" dir="rtl">
      <div className="space-y-6">
        
        {/* 1. هيدر الصفحة الرئيسي الموحد للتطبيق */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
          <div className="space-y-1 text-right">
            <h1 className="text-2xl font-black tracking-tight text-slate-900">التقارير التحليلية والرقابة</h1>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={handleExportPdf}
              disabled={pdfLoading}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-[#800000] hover:bg-[#521624] rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileDown className="h-4 w-4" />
              <span>{pdfLoading ? 'جاري تصدير PDF...' : 'تصدير التقرير الشامل PDF'}</span>
            </button>
          </div>
        </div>

        {/* 2. أزرار التبويبات التنقلية (مكانها الصحيح في الأعلى) */}
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

        {/* 3. الفلتر الزمني الموحد (يظهر مباشرة تحت التبويبات وفوق الإحصائيات) */}
        <TimeFilter period={period} setPeriod={setPeriod} />

        {/* 4. عرض محتوى القسم النشط (نظيف وممرر له الـ period) */}
        <div className="animate-fade-in duration-200">
          {activeTab === 'products' ? (
            <ProductsReport period={period} />
          ) : (
            <EmployeesReport period={period} />
          )}
        </div>

      </div>
    </div>
  );
}