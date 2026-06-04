import React from 'react';
import { Calendar } from 'lucide-react';

export default function TimeFilter({ period, setPeriod }) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white border border-slate-200/60 p-3 rounded-2xl shadow-xs mb-6">
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-slate-400" />
        <span className="text-xs font-bold text-slate-600">الفترة الزمنية للتحليل:</span>
      </div>
      <div className="flex items-center gap-1 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
        {[
          { id: '7d', label: '7 أيام' },
          { id: '1m', label: 'شهر' },
          { id: '3m', label: '3 أشهر' },
          { id: '6m', label: '6 أشهر' },
        ].map(p => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
              period === p.id 
                ? 'bg-[#800000] text-white shadow-sm' // تم تعديل اللون ليتماشى مع البرغندي (MAROON)
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}