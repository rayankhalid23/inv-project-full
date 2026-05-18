import React, { useMemo } from 'react';
import { Users, ShieldAlert, Activity, CheckCircle2 } from 'lucide-react';
import { KpiCard, ReportCard, SectionHeader, DataTable } from './ReportShared';

const MOCK_EMPLOYEE_LOGS = [
  { id: 101, name: "أحمد المولد", role: "أمين مخزن", action: "توريد مخزني", target: "قميص كلاسيك", qty: 50, time: "2026-05-17 08:30" },
  { id: 102, name: "سلطان العتيبي", role: "موظف مبيعات", action: "مسح بيع باركود", target: "بنطال جينز", qty: 2, time: "2026-05-17 09:15" },
  { id: 103, name: "سارة الشمري", role: "مشرف جرد", action: "تعديل جرد يدوي", target: "حذاء رياضي", qty: 5, time: "2026-05-16 14:45" }
];

export default function EmployeesReport() {
  const employeePerformance = useMemo(() => {
    // حساب العمليات الإجمالية المنفذة لكل موظف لبيان الكفاءة
    return [
      { name: "أحمد المولد", role: "أمين مخزن", totalOps: 142, successRate: "99.1%" },
      { name: "سلطان العتيبي", role: "موظف مبيعات", totalOps: 389, successRate: "100%" },
      { name: "سارة الشمري", role: "مشرف جرد", totalOps: 64, successRate: "95.8%" }
    ];
  }, []);

  return (
    <div className="space-y-6">
      {/* KPIs Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="الموظفين النشطين" value="3 موظفين" icon={Users} type="purple" subtext="متصلين بالنظام الآن" />
        <KpiCard title="إجمالي العمليات المنفذة" value="595 عملية" icon={Activity} type="blue" subtext="خلال الدورة الحالية لعام 2026" />
        <KpiCard title="متوسط دقة التجهيز" value="98.3%" icon={CheckCircle2} type="green" subtext="أقل نسبة خطأ في المسح" />
        <KpiCard title="تعديلات يدوية حرجة" value="12 تعديل" icon={ShieldAlert} type="orange" subtext="تتطلب مراجعة الإدارة" />
      </div>

      {/* تفاصيل أداء الموظفين الحية */}
      <ReportCard>
        <SectionHeader title="كفاءة الكوادر البشرية والإنتاجية" sub="تتبع حجم العمليات ونسب النجاح التشغيلية لكل حساب موظف" />
        <DataTable headers={["اسم الموظف", "الدور الوظيفي", "إجمالي العمليات المنجزة", "نسبة دقة العمليات الصافية"]}>
          {employeePerformance.map((emp, i) => (
            <tr key={i} className="hover:bg-slate-50/50">
              <td className="px-4 py-3 font-bold text-slate-900">{emp.name}</td>
              <td className="px-4 py-3 text-slate-500 font-medium">{emp.role}</td>
              <td className="px-4 py-3 font-mono font-bold text-slate-700">{emp.totalOps} عملية</td>
              <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100 font-bold">{emp.successRate}</span></td>
            </tr>
          ))}
        </DataTable>
      </ReportCard>

      {/* سجل تفاصيل العمليات الدقيقة (Audit Trail) */}
      <ReportCard>
        <SectionHeader title="سجل تفاصيل العمليات الشامل" sub="مراقبة حية وفورية تمنع أي تلاعب أو تداخل في الصلاحيات" />
        <DataTable headers={["الموظف", "نوع العملية", "الكيان المتأثر", "الكمية", "الوقت والتاريخ من الخادم"]}>
          {MOCK_EMPLOYEE_LOGS.map(log => (
            <tr key={log.id} className="hover:bg-slate-50/50 text-slate-600">
              <td className="px-4 py-3 font-bold text-slate-900">{log.name}<span className="block text-[10px] text-slate-400 font-medium">{log.role}</span></td>
              <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${log.action.includes('بيع') ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>{log.action}</span></td>
              <td className="px-4 py-3 font-semibold text-slate-700">{log.target}</td>
              <td className="px-4 py-3 font-mono font-bold">{log.qty} قطعة</td>
              <td className="px-4 py-3 font-mono text-slate-400">{log.time}</td>
            </tr>
          ))}
        </DataTable>
      </ReportCard>
    </div>
  );
}
