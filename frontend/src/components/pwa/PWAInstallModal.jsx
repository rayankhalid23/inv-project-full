import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, X, Download, Share, PlusSquare, Monitor, Smartphone, Zap, WifiOff, MoreVertical, Menu } from 'lucide-react';
import { useOffline } from '../../context/OfflineContext';

export default function PWAInstallModal() {
  const { showInstallModal, setShowInstallModal, promptInstallApp, isIOS, isAppInstalled, deferredInstallPrompt } = useOffline();

  if (!showInstallModal) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 font-sans select-none bg-slate-950/70 backdrop-blur-md" dir="rtl">
        <div className="absolute inset-0" onClick={() => setShowInstallModal(false)} />

        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative bg-[#0a1128] border border-white/15 w-full max-w-md rounded-3xl p-6 shadow-[0_25px_60px_rgba(0,0,0,0.6)] z-10 text-white overflow-hidden text-right max-h-[90vh] overflow-y-auto"
        >
          {/* خلفية زخرفية مثل صفحة الدخول */}
          <div className="absolute top-0 right-0 w-48 h-48 bg-[#800000]/25 rounded-full blur-[70px] pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-600/15 rounded-full blur-[70px] pointer-events-none" />

          {/* زر الإغلاق */}
          <button
            onClick={() => setShowInstallModal(false)}
            className="absolute top-4 left-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-slate-300 transition-all z-20"
          >
            <X className="w-5 h-5 stroke-[2.5]" />
          </button>

          {/* هيدر التطبيق وشعاره من صفحة تسجيل الدخول */}
          <div className="flex flex-col items-center text-center mb-6 pt-2 relative z-10">
            <div className="p-3.5 rounded-2xl shadow-xl mb-3 bg-[#800000] border border-white/20 ring-4 ring-black/20">
              <Shield className="h-9 w-9 text-white" />
            </div>
            <h2 className="text-2xl font-black tracking-widest text-white">BELLAGIO</h2>
            <p className="text-slate-300 text-xs font-bold mt-1 opacity-90">تثبيت تطبيق بيلادجيو على جهازك</p>
          </div>

          {/* مميزات تثبيت التطبيق */}
          <div className="grid grid-cols-3 gap-2 mb-6 text-center">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-2.5 flex flex-col items-center justify-center">
              <Zap className="w-5 h-5 text-amber-400 mb-1" />
              <span className="text-[10px] font-bold text-slate-200">سرعة فائقة</span>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-2.5 flex flex-col items-center justify-center">
              <WifiOff className="w-5 h-5 text-emerald-400 mb-1" />
              <span className="text-[10px] font-bold text-slate-200">عمل بدون إنترنت</span>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-2.5 flex flex-col items-center justify-center">
              <Smartphone className="w-5 h-5 text-sky-400 mb-1" />
              <span className="text-[10px] font-bold text-slate-200">أيقونة رئيسية</span>
            </div>
          </div>

          {/* خيار 1: زر التثبيت الناتيف إذا كان متاحاً تلقائياً بالمتصفح */}
          {deferredInstallPrompt && (
            <button
              onClick={() => {
                promptInstallApp();
                setShowInstallModal(false);
              }}
              className="w-full mb-6 py-3.5 px-4 bg-gradient-to-r from-[#800000] to-[#b30000] hover:from-[#990000] hover:to-[#cc0000] text-white font-bold text-sm rounded-2xl shadow-lg shadow-[#800000]/40 flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              <Download className="w-5 h-5 stroke-[2.5]" />
              <span>تثبيت التطبيق بنقرة واحدة 📲</span>
            </button>
          )}

          {/* خيار 2: التوجيهات حسب نوع الجهاز والحيود للمتصفح */}
          {isIOS ? (
            /* تعليمات هواتف آيفون وإيباد Safari */
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3 mb-6">
              <p className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                <Smartphone className="w-4 h-4" /> طريقة التثبيت على الآيفون (Safari):
              </p>
              <div className="space-y-2.5 text-xs text-slate-200 pr-1">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs shrink-0">1</div>
                  <span>اضغط على زر <strong>المشاركة (Share <Share className="w-3.5 h-3.5 inline mx-0.5" />)</strong> أسفل شاشة Safari</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs shrink-0">2</div>
                  <span>اختر <strong>إضافة إلى الشاشة الرئيسية (Add to Home Screen <PlusSquare className="w-3.5 h-3.5 inline mx-0.5" />)</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs shrink-0">3</div>
                  <span>اضغط على <strong>إضافة (Add)</strong> وسيظهر كـ تطبيق أصلي بشاشتك الرئيسية!</span>
                </div>
              </div>
            </div>
          ) : (
            /* تعليمات أندرويد وجميع الهواتف الأخرى والكمبيوتر */
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3 mb-6">
              <p className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                <Smartphone className="w-4 h-4" /> طريقة التثبيت على الأندرويد ومتصفح الجوال:
              </p>
              <div className="space-y-2.5 text-xs text-slate-200 pr-1">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs shrink-0">1</div>
                  <span>اضغط على <strong>قائمة المتصفح (⋮ أو <MoreVertical className="w-3.5 h-3.5 inline mx-0.5" />)</strong> أعلى أو أسفل الشاشة</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs shrink-0">2</div>
                  <span>اختر <strong>تثبيت التطبيق (Install App)</strong> أو <strong>الإضافة للشاشة الرئيسية</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs shrink-0">3</div>
                  <span>سيتم إضافة أيقونة الدرع <strong>BELLAGIO</strong> لتطبيقك فوراً!</span>
                </div>
              </div>
            </div>
          )}

          {/* أزرار الإغلاق */}
          <div className="space-y-2">
            <button
              onClick={() => setShowInstallModal(false)}
              className="w-full py-3 px-4 bg-white/10 hover:bg-white/15 text-slate-300 font-bold text-xs rounded-2xl transition-all"
            >
              فهمت، حسناً
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
