import React from 'react';
import { WifiOff, RefreshCw, CheckCircle2, Download } from 'lucide-react';
import { useOffline } from '../../context/OfflineContext';

export default function OfflineBanner() {
  const { isOffline, pendingCount, isSyncing, triggerManualSync, promptInstallApp, isAppInstalled } = useOffline();

  if (!isOffline && pendingCount === 0) {
    return null;
  }

  return (
    <div className="bg-[#0a1128] text-white border-b border-white/10 px-4 py-2.5 shadow-md flex flex-wrap items-center justify-between gap-3 text-xs font-sans transition-all sticky top-0 z-[60]" dir="rtl">
      <div className="flex items-center gap-2">
        {isOffline ? (
          <div className="flex items-center gap-1.5 bg-red-500/20 text-red-300 px-2.5 py-1 rounded-full border border-red-500/30 font-bold">
            <WifiOff className="w-3.5 h-3.5 animate-pulse" />
            <span>وضع الأوفلاين (بدون إنترنت)</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 bg-emerald-500/20 text-emerald-300 px-2.5 py-1 rounded-full border border-emerald-500/30 font-bold">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>متصل بالإنترنت</span>
          </div>
        )}

        <span className="text-slate-300 hidden sm:inline">
          {isOffline
            ? 'جميع البيانات التي تدخلها تُحفظ محلياً وسوف تُرفع تلقائياً عند الاتصال!'
            : `يوجد ${pendingCount} عملية مخزنة محلياً بانتظار المزامنة.`}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {pendingCount > 0 && (
          <button
            onClick={triggerManualSync}
            disabled={isSyncing || isOffline}
            className="flex items-center gap-1.5 bg-[#800000] hover:bg-[#990000] disabled:opacity-50 text-white px-3 py-1.5 rounded-xl font-bold transition-all shadow-sm active:scale-95"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'جاري المزامنة...' : `مزامنة الآن (${pendingCount})`}</span>
          </button>
        )}

        {!isAppInstalled && (
          <button
            onClick={promptInstallApp}
            className="flex items-center gap-1 bg-white/10 hover:bg-white/20 text-slate-200 px-2.5 py-1.5 rounded-xl font-bold transition-all active:scale-95"
          >
            <Download className="w-3.5 h-3.5 text-amber-400" />
            <span>تثبيت التطبيق 📲</span>
          </button>
        )}
      </div>
    </div>
  );
}
