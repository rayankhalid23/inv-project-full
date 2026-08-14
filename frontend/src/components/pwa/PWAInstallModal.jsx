import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, X, Download, Share, PlusSquare,
  Monitor, Smartphone, Zap, WifiOff, MoreVertical,
  ArrowUpFromLine, AlertCircle
} from 'lucide-react';
import { useOffline } from '../../context/OfflineContext';

/* ─── كشف الجهاز ─── */
function detectDevice() {
  const ua = navigator.userAgent.toLowerCase();
  const isIOS   = /iphone|ipad|ipod/.test(ua);
  const isAndroid = /android/.test(ua);

  if (isIOS) {
    // هواتف وأجهزة Apple — Safari هو الوحيد الذي يدعم التثبيت
    const isSafari = /safari/.test(ua) && !/crios|fxios|opios|mercury/.test(ua);
    return isSafari ? 'ios-safari' : 'ios-wrong-browser';
  }
  if (isAndroid) return 'android';
  // كمبيوتر
  const isFirefox = /firefox/.test(ua);
  if (isFirefox) return 'desktop-firefox';
  return 'desktop-chrome'; // Chrome / Edge / Brave / Opera
}

/* ─── خطوة مرقّمة ─── */
function Step({ n, children }) {
  return (
    <div className="flex items-start gap-3">
      <span className="shrink-0 w-6 h-6 rounded-lg bg-white/15 text-white/90 text-xs font-black flex items-center justify-center mt-0.5">
        {n}
      </span>
      <p className="text-sm text-white/80 leading-relaxed">{children}</p>
    </div>
  );
}

/* ─── المكوّن الرئيسي ─── */
export default function PWAInstallModal() {
  const {
    showInstallModal,
    setShowInstallModal,
    promptInstallApp,
    deferredInstallPrompt,
  } = useOffline();

  const device = useMemo(() => detectDevice(), []);

  if (!showInstallModal) return null;

  /* ─── محتوى التعليمات حسب الجهاز ─── */
  const content = {

    /* ━━ iOS Safari ━━ */
    'ios-safari': {
      icon: <ArrowUpFromLine className="w-7 h-7 text-white" />,
      iconBg: 'bg-blue-600',
      badge: 'آيفون / آيباد',
      badgeColor: 'bg-blue-500/20 text-blue-300',
      title: 'ثبّت التطبيق عبر Safari',
      steps: [
        <>اضغط زر <strong className="text-white">المشاركة <Share className="w-3.5 h-3.5 inline mb-0.5" /></strong> أسفل أو أعلى الشاشة</>,
        <>اختر <strong className="text-white">«إضافة إلى الشاشة الرئيسية» <PlusSquare className="w-3.5 h-3.5 inline mb-0.5" /></strong></>,
        <>اضغط <strong className="text-white">«إضافة»</strong> — يُثبَّت التطبيق الكامل فورًا! 🎉</>,
      ],
    },

    /* ━━ iOS متصفح آخر ━━ */
    'ios-wrong-browser': {
      icon: <AlertCircle className="w-7 h-7 text-white" />,
      iconBg: 'bg-amber-600',
      badge: 'آيفون / آيباد',
      badgeColor: 'bg-amber-500/20 text-amber-300',
      title: 'افتح التطبيق في Safari',
      steps: [
        <>انسخ رابط الصفحة من شريط العنوان</>,
        <>افتح تطبيق <strong className="text-white">Safari</strong> وألصق الرابط فيه</>,
        <>اتبع خطوات التثبيت من Safari مباشرةً</>,
      ],
    },

    /* ━━ أندرويد (Chrome / Edge / Samsung) ━━ */
    'android': {
      icon: <Smartphone className="w-7 h-7 text-white" />,
      iconBg: 'bg-emerald-600',
      badge: 'أندرويد',
      badgeColor: 'bg-emerald-500/20 text-emerald-300',
      title: 'تثبيت التطبيق على أندرويد',
      steps: [
        <>اضغط على <strong className="text-white">⋮ قائمة المتصفح <MoreVertical className="w-3.5 h-3.5 inline mb-0.5" /></strong> أعلى الشاشة</>,
        <>اختر <strong className="text-white">«تثبيت التطبيق»</strong> أو <strong className="text-white">«إضافة للشاشة الرئيسية»</strong></>,
        <>اضغط <strong className="text-white">«تثبيت»</strong> — يُحمَّل التطبيق كاملًا بكل الواجهات! 🎉</>,
      ],
    },

    /* ━━ كمبيوتر Chrome / Edge / Brave ━━ */
    'desktop-chrome': {
      icon: <Monitor className="w-7 h-7 text-white" />,
      iconBg: 'bg-sky-600',
      badge: 'كمبيوتر',
      badgeColor: 'bg-sky-500/20 text-sky-300',
      title: 'تثبيت التطبيق على الكمبيوتر',
      steps: [
        <>ابحث عن أيقونة <strong className="text-white">التثبيت <Download className="w-3.5 h-3.5 inline mb-0.5" /></strong> في يمين شريط العنوان</>,
        <>أو افتح <strong className="text-white">⋮ قائمة المتصفح</strong> ثم اختر <strong className="text-white">«تثبيت BELLAGIO»</strong></>,
        <>اضغط <strong className="text-white">«تثبيت»</strong> — يفتح كتطبيق مستقل بكل الواجهات بدون نت! 🎉</>,
      ],
    },

    /* ━━ Firefox (لا يدعم PWA) ━━ */
    'desktop-firefox': {
      icon: <AlertCircle className="w-7 h-7 text-white" />,
      iconBg: 'bg-orange-600',
      badge: 'Firefox',
      badgeColor: 'bg-orange-500/20 text-orange-300',
      title: 'استخدم Chrome أو Edge',
      steps: [
        <>افتح نفس الرابط في متصفح <strong className="text-white">Google Chrome</strong> أو <strong className="text-white">Microsoft Edge</strong></>,
        <>ابحث عن أيقونة التثبيت في شريط العنوان</>,
        <>اضغط «تثبيت» — يُحمَّل التطبيق الكامل بكل الواجهات! 🎉</>,
      ],
    },
  };

  const c = content[device];

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-[99999] flex items-end sm:items-center justify-center sm:p-4 font-sans select-none"
        dir="rtl"
      >
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-slate-950/70 backdrop-blur-md"
          onClick={() => setShowInstallModal(false)}
        />

        {/* البطاقة */}
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          className="relative w-full sm:max-w-sm bg-[#0d1635] border border-white/10 sm:rounded-3xl rounded-t-3xl p-6 shadow-[0_-20px_60px_rgba(0,0,0,0.5)] z-10 overflow-hidden"
        >
          {/* ديكور */}
          <div className="absolute top-0 right-0 w-52 h-52 bg-[#800000]/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-40 h-40 bg-blue-700/10 rounded-full blur-3xl pointer-events-none" />

          {/* زر إغلاق */}
          <button
            onClick={() => setShowInstallModal(false)}
            className="absolute top-4 left-4 p-1.5 bg-white/10 hover:bg-white/20 rounded-full text-white/60 transition-all z-20"
          >
            <X className="w-4 h-4" />
          </button>

          {/* هيدر */}
          <div className="flex items-center gap-4 mb-6 relative z-10">
            <div className={`p-3 rounded-2xl ${c.iconBg} shadow-lg shrink-0`}>
              {c.icon}
            </div>
            <div>
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${c.badgeColor} mb-1 inline-block`}>
                {c.badge}
              </span>
              <h2 className="text-base font-black text-white leading-tight">{c.title}</h2>
            </div>
          </div>

          {/* مزايا مختصرة */}
          <div className="flex gap-2 mb-6">
            {[
              { icon: <Zap className="w-3.5 h-3.5 text-amber-400" />, label: 'سريع' },
              { icon: <WifiOff className="w-3.5 h-3.5 text-emerald-400" />, label: 'بلا إنترنت' },
              { icon: <Shield className="w-3.5 h-3.5 text-sky-400" />, label: 'كل الواجهات' },
            ].map(({ icon, label }) => (
              <div key={label} className="flex-1 bg-white/5 border border-white/10 rounded-xl py-2 flex flex-col items-center gap-1">
                {icon}
                <span className="text-[9px] text-white/60 font-bold">{label}</span>
              </div>
            ))}
          </div>

          {/* الخطوات */}
          <div className="space-y-3.5 mb-6 relative z-10">
            {c.steps.map((step, i) => (
              <Step key={i} n={i + 1}>{step}</Step>
            ))}
          </div>

          {/* زر التثبيت الفوري — يظهر فقط إذا كان المتصفح يدعمه مباشرةً */}
          {deferredInstallPrompt && (
            <button
              onClick={() => {
                promptInstallApp();
                setShowInstallModal(false);
              }}
              className="w-full mb-3 py-4 bg-gradient-to-l from-[#800000] to-[#b30000] hover:from-[#990000] hover:to-[#cc0000] text-white font-black text-sm rounded-2xl shadow-lg shadow-[#800000]/40 flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              <Download className="w-5 h-5 stroke-[2.5]" />
              تثبيت التطبيق الآن — نقرة واحدة 📲
            </button>
          )}

          <button
            onClick={() => setShowInstallModal(false)}
            className="w-full py-3 bg-white/8 hover:bg-white/12 text-white/50 font-bold text-xs rounded-2xl transition-all"
          >
            إغلاق
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
