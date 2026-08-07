import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getPendingActions } from '../utils/idbStorage';
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

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    setIsAppInstalled(Boolean(isStandalone));

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredInstallPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    window.addEventListener('appinstalled', () => {
      setIsAppInstalled(true);
      setDeferredInstallPrompt(null);
      toast.success('مبارك! تم تثبيت تطبيق بيلادجيو بنجاح 🎉');
    });

    refreshPendingCount();

    // تحديث دوري لعداد IndexedDB
    const interval = setInterval(refreshPendingCount, 3000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      clearInterval(interval);
    };
  }, [handleOnline, handleOffline, refreshPendingCount]);

  // 2. تسجيل الـ Service Worker لضمان استقرار العمل الأوفلاين
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV !== 'development') {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => {
          console.log('[ServiceWorker] Registered successfully:', reg.scope);
        })
        .catch((err) => {
          console.warn('[ServiceWorker] Registration failed:', err);
        });
    }
  }, []);

  // 3. دالة إطلاق تثبيت التطبيق
  const promptInstallApp = async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const choiceResult = await deferredInstallPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setDeferredInstallPrompt(null);
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
    const result = await runAutoSync();
    setIsSyncing(false);
    await refreshPendingCount();
    if (result.successCount > 0) {
      toast.success(`تمت المزامنة بنجاح! تم رفع ${result.successCount} عملية للسيرفر.`);
    } else {
      toast.success('جميع البيانات متزامنة مع السيرفر بالكامل.');
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
        isAppInstalled,
        isIOS,
        deferredInstallPrompt,
        showInstallModal,
        setShowInstallModal,
        promptInstallApp,
        triggerManualSync,
        refreshPendingCount,
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
