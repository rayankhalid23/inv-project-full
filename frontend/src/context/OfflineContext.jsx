import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { getPendingActions, migrateLegacyQueue } from '../utils/idbStorage';
import { runAutoSync } from '../utils/syncEngine';

const OfflineContext = createContext();

export const OfflineProvider = ({ children }) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState(null);
  const [isAppInstalled, setIsAppInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const applyUpdateRef = useRef(null);

  // تحديث عداد العمليات المعلقة من IndexedDB
  const refreshPendingCount = useCallback(async () => {
    try {
      const actions = await getPendingActions();
      setPendingCount(actions.length);
    } catch (e) {
      console.warn("Failed to get pending count from IDB:", e);
    }
  }, []);

  // 1. التكيف مع حالات الاتصال بالإنترنت والمزامنة التلقائية بصمت
  const handleOnline = useCallback(async () => {
    setIsOnline(true);
    toast.success('تمت إعادة الاتصال بالإنترنت! 🌐', { duration: 4000 });

    const actions = await getPendingActions();
    if (actions.length > 0) {
      setIsSyncing(true);
      const loadingToast = toast.loading(`جاري رفع ${actions.length} عملية مخزنة في IndexedDB...`);
      
      try {
        const result = await runAutoSync();
        toast.dismiss(loadingToast);

        if (result.successCount > 0) {
          toast.success(`تمت المزامنة بنجاح! تم رفع ${result.successCount} عملية للسيرفر 🚀`, { duration: 5000 });
        }
        // الجلسة منتهية: العمليات محفوظة ولم تُفقد، لكنها تحتاج تسجيل دخول لرفعها
        if (result.authRequired) {
          toast.error('انتهت صلاحية الجلسة. عملياتك محفوظة — سجّل الدخول لرفعها.', { duration: 8000 });
        }
      } catch (err) {
        toast.dismiss(loadingToast);
        console.error('Auto sync error:', err);
      } finally {
        setIsSyncing(false);
        await refreshPendingCount();
      }
    }
  }, [refreshPendingCount]);

  const handleOffline = useCallback(() => {
    setIsOnline(false);
    toast.error('انقطع الاتصال بالإنترنت! أنت تعمل الآن في وضع الأوفلاين 📡', { duration: 5000 });
  }, []);

  useEffect(() => {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // فحص بيئة التشغيل والتثبيت
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    const isStandalone = Boolean(
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone ||
      document.referrer.includes('android-app://')
    );
    setIsAppInstalled(isStandalone);

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredInstallPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsAppInstalled(true);
      setDeferredInstallPrompt(null);
      toast.success('مبارك! تم تثبيت تطبيق بيلادجيو بنجاح 🎉');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // إنقاذ أي عمليات عالقة في الطابور القديم (localStorage) لمرة واحدة،
    // ثم تحديث العدّاد حتى تظهر فوراً في شارة "بانتظار المزامنة".
    migrateLegacyQueue()
      .then((migrated) => {
        if (migrated > 0) {
          toast.success(`تم استرجاع ${migrated} عملية محفوظة سابقاً بانتظار المزامنة 📦`, { duration: 6000 });
        }
      })
      .catch((e) => console.warn('Legacy queue migration failed:', e))
      .finally(refreshPendingCount);

    // تحديث دوري لعداد IndexedDB — 15 ثانية تكفي تماماً لعدّاد مرئي،
    // بينما كان الفحص كل 3 ثوانٍ يفتح اتصالاً بقاعدة البيانات باستمرار بلا داعٍ.
    const interval = setInterval(refreshPendingCount, 15000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      clearInterval(interval);
    };
  }, [handleOnline, handleOffline, refreshPendingCount]);

  // 2. تسجيل الـ Service Worker (يُولَّد عبر Workbox) مع كشف التحديثات
  useEffect(() => {
    let cancelled = false;

    // استيراد ديناميكي حتى لا ينكسر البناء إن لم تتوفر الوحدة الافتراضية
    import('virtual:pwa-register')
      .then(({ registerSW }) => {
        if (cancelled) return;

        const updateSW = registerSW({
          immediate: true,
          onNeedRefresh() {
            // نسخة جديدة جاهزة — لا نُحدّث تلقائياً حتى لا نقاطع عملية بيع جارية
            setUpdateAvailable(true);
            applyUpdateRef.current = () => updateSW(true);
          },
          onOfflineReady() {
            console.log('[ServiceWorker] التطبيق جاهز للعمل بدون إنترنت ✅');
          },
          onRegisteredSW(swUrl) {
            console.log('[ServiceWorker] Registered:', swUrl);
          },
          onRegisterError(err) {
            console.warn('[ServiceWorker] Registration failed:', err);
          },
        });
      })
      .catch((err) => console.warn('[ServiceWorker] register module failed:', err));

    return () => { cancelled = true; };
  }, []);

  /** تطبيق التحديث الجاهز وإعادة تحميل الصفحة */
  const applyUpdate = useCallback(() => {
    if (applyUpdateRef.current) {
      applyUpdateRef.current();
      setUpdateAvailable(false);
    }
  }, []);

  // 3. دالة إطلاق تثبيت التطبيق
  const promptInstallApp = async () => {
    if (deferredInstallPrompt) {
      try {
        deferredInstallPrompt.prompt();
        const choiceResult = await deferredInstallPrompt.userChoice;
        if (choiceResult.outcome === 'accepted') {
          // نخفي الزر فورًا بدون انتظار حدث appinstalled
          setIsAppInstalled(true);
          setDeferredInstallPrompt(null);
          localStorage.setItem('pwa_installed', 'true');
        }
      } catch (err) {
        // قد يرفض المتصفح النافذة إذا استُدعيت مرتين أو كانت منتهية الصلاحية
        console.warn('Install prompt failed:', err);
        setDeferredInstallPrompt(null);
        setShowInstallModal(true);
      }
    } else {
      setShowInstallModal(true);
    }
  };

  // 4. دالة المزامنة اليدوية
  const triggerManualSync = async () => {
    if (!navigator.onLine) {
      toast.error('لا يوجد اتصال بالإنترنت حالياً للمزامنة!');
      return;
    }
    setIsSyncing(true);
    try {
      const result = await runAutoSync();

      if (result.authRequired) {
        toast.error('انتهت صلاحية الجلسة. عملياتك محفوظة — سجّل الدخول لرفعها.', { duration: 8000 });
      } else if (result.successCount > 0) {
        toast.success(`تمت المزامنة بنجاح! تم رفع ${result.successCount} عملية للسيرفر.`);
      } else if (result.failedCount > 0) {
        // لا نقول "كل شيء متزامن" بينما هناك عمليات فشلت فعلاً
        toast.error(`تعذّر رفع ${result.failedCount} عملية. ستبقى محفوظة وسيُعاد المحاولة تلقائياً.`, { duration: 6000 });
      } else {
        toast.success('جميع البيانات متزامنة مع السيرفر بالكامل.');
      }
    } catch (err) {
      console.error('Manual sync error:', err);
      toast.error('تعذّرت المزامنة. عملياتك المحفوظة لم تُفقد.');
    } finally {
      setIsSyncing(false);
      await refreshPendingCount();
    }
  };

  return (
    <OfflineContext.Provider
      value={{
        isOnline,
        isOffline: !isOnline,
        pendingCount,
        isSyncing,
        isInstallable: Boolean(deferredInstallPrompt) || !isAppInstalled,
        // true = المتصفح يدعم beforeinstallprompt → زر التثبيت الفوري بنقرة واحدة
        // false = iOS أو متصفح آخر → يجب إظهار التعليمات اليدوية
        canInstallNatively: Boolean(deferredInstallPrompt),
        isAppInstalled,
        isIOS,
        deferredInstallPrompt,
        showInstallModal,
        setShowInstallModal,
        promptInstallApp,
        triggerManualSync,
        refreshPendingCount,
        updateAvailable,
        applyUpdate,
      }}
    >
      {children}
    </OfflineContext.Provider>
  );
};

export const useOffline = () => {
  const context = useContext(OfflineContext);
  if (!context) {
    throw new Error('useOffline must be used within an OfflineProvider');
  }
  return context;
};
