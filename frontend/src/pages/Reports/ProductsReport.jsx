import React, { useMemo } from 'react';
import { Package, AlertTriangle, ShieldCheck, ArrowDownUp } from 'lucide-react';
import { KpiCard, ReportCard, SectionHeader, DataTable, ColorDot, RankBadge } from './ReportShared';

// محاكاة بيانات قاعدة بيانات المنتجات والمتغيرات لعام 2026
const MOCK_PRODUCTS_DATA = [
  { id: 1, name: "قميص كلاسيك برعندي", sku: "BLG-SH-BUR", color: "برعندي", size: "XL", stock: 3, minLimit: 15, soldQty: 240, wastedQty: 2 },
  { id: 2, name: "بنطال جينز رمادي فاخر", sku: "BLG-JN-GRY", color: "رمادي", size: "34", stock: 0, minLimit: 10, soldQty: 185, wastedQty: 0 },
  { id: 3, name: "حذاء رياضي خفيف", sku: "BLG-SHW-GRY", color: "رمادي", size: "42", stock: 45, minLimit: 8, soldQty: 90, wastedQty: 5 }
];

export default function ProductsReport() {
  const stats = useMemo(() => {
    let totalStock = 0;
    let outOfStock = 0;
    let lowStock = 0;
    
    MOCK_PRODUCTS_DATA.forEach(p => {
      totalStock += p.stock;
      if (p.stock === 0) outOfStock++;
      else if (p.stock <= p.minLimit) lowStock++;
    });

    const topSelling = [...MOCK_PRODUCTS_DATA].sort((a, b) => b.soldQty - a.soldQty);
    const criticalStock = MOCK_PRODUCTS_DATA.filter(p => p.stock <= p.minLimit);

    return { totalStock, outOfStock, lowStock, topSelling, criticalStock };
  }, []);

  return (
    <div className="space-y-6">
      {/* KPIs Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="إجمالي قطع المخزون" value={stats.totalStock} icon={Package} type="blue" subtext="قطع متاحة بالرفوف" />
        <KpiCard title="منتجات نفدت تماماً" value={stats.outOfStock} icon={AlertTriangle} type="red" subtext="تتطلب توريد فوري" />
        <KpiCard title="منتجات قاربت على النفاد" value={stats.lowStock} icon={ArrowDownUp} type="orange" subtext="تحت حد الأمان اللوجيستي" />
        <KpiCard title="سلامة الجرد العام" value="98.2%" icon={ShieldCheck} type="green" subtext="مطابقة دفتري وفعلي" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* أفضل المنتجات مبيعاً */}
        <ReportCard>
          <SectionHeader title="أفضل 3 منتجات مبيعاً" sub="ترتيب المنتجات الأعلى حركة وسحباً من الرفوف" />
          <DataTable headers={["الترتيب", "المنتج", "اللون", "الكمية المباعة"]}>
            {stats.topSelling.map((prod, idx) => (
              <tr key={prod.id} className="hover:bg-slate-50/50">
                <td className="px-4 py-3 font-bold"><RankBadge rank={idx + 1} /></td>
                <td className="px-4 py-3 font-bold text-slate-900">{prod.name}<span className="block text-[10px] text-slate-400 font-mono font-medium">{prod.sku}</span></td>
                <td className="px-4 py-3"><ColorDot colorName={prod.color} /></td>
                <td className="px-4 py-3 font-mono text-emerald-600 font-bold">{prod.soldQty} قطعة</td>
              </tr>
            ))}
          </DataTable>
        </ReportCard>

        {/* الحالات الحرجة للمخزون */}
        <ReportCard>
          <SectionHeader title="مستويات المخزون الحرجة" sub="مراقبة حية للمنتجات التي وصلت لحد الأمان أو الصفر" />
          {stats.criticalStock.length === 0 ? (
            <p className="text-center text-xs text-slate-400 py-8">جميع المنتجات بمستوى جيد ومستقر</p>
          ) : (
            <DataTable headers={["المنتج / SKU", "المخزون الحالي", "مستوى الأمان", "مؤشر النفاذ"]}>
              {stats.criticalStock.map(prod => {
                const percentage = Math.min((prod.stock / prod.minLimit) * 100, 100);
                return (
                  <tr key={prod.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-bold text-slate-900">{prod.name}<span className="block text-[10px] text-slate-400 font-mono">{prod.sku}</span></td>
                    <td className="px-4 py-3 font-mono font-bold text-slate-700">{prod.stock}</td>
                    <td className="px-4 py-3 font-mono text-slate-400">{prod.minLimit}</td>
                    <td className="px-4 py-3 w-1/3">
                      <div className="space-y-1">
                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${prod.stock === 0 ? 'bg-red-500' : 'bg-orange-500'}`} style={{ width: `${prod.stock === 0 ? 100 : percentage}%` }} />
                        </div>
                        <span className={`text-[9px] font-bold ${prod.stock === 0 ? 'text-red-600' : 'text-orange-600'}`}>
                          {prod.stock === 0 ? 'نفد تماماً (0%)' : `متبقي ${Math.round(percentage)}%`}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </DataTable>
          )}
        </ReportCard>
      </div>
    </div>
  );
}