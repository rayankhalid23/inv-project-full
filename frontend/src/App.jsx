import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { Toaster } from 'react-hot-toast';
import MainLayout from './components/layout/MainLayout';
import ErrorBoundary from './components/common/ErrorBoundary';

/**
 * دالة تحميل كسول ذكية مع إعادة المحاولة التلقائية
 * تحمي من أخطاء ChunkLoadError أو انقطاع الاتصال المؤقت أثناء جلب الواجهات
 */
function lazyWithRetry(componentImport) {
  return lazy(async () => {
    const pageAlreadyRefreshed = JSON.parse(
      window.sessionStorage.getItem('chunk_load_retried') || 'false'
    );
    try {
      const component = await componentImport();
      window.sessionStorage.setItem('chunk_load_retried', 'false');
      return component;
    } catch (error) {
      console.warn('[PWA] فشل تحميل جزء الصفحة، جاري إعادة المحاولة:', error);
      if (!pageAlreadyRefreshed) {
        window.sessionStorage.setItem('chunk_load_retried', 'true');
        window.location.reload();
        return new Promise(() => {}); // تعليق حتى تتم إعادة التحميل
      }
      throw error;
    }
  });
}

// صفحة الدخول ولوحة التحكم تُحمّلان مباشرة لأنهما أول ما يراه المستخدم
import Dashboard from './pages/Dashboard';
import EmployeeLogin from './pages/auth/EmployeeLogin';
// يُستورد مباشرةً لأن MainLayout يستورده ثابتاً (يظل مركّباً في كل الصفحات)
import QuickScanPage from './pages/QuickScanButton';

// بقية الصفحات تُحمّل كسولاً مع حماية إعادة المحاولة للعمل أوفلاين بسلاسة
const Settings = lazyWithRetry(() => import('./pages/Settings'));
const Employees = lazyWithRetry(() => import('./pages/Employees'));
const ProductsPage = lazyWithRetry(() => import('./pages/Products/ProductsPage'));
const SalesPage = lazyWithRetry(() => import('./pages/SalesPage'));
const StockMovementsPage = lazyWithRetry(() => import('./pages/StockMovementsPage'));
const Reports = lazyWithRetry(() => import('./pages/Reports/Reports').then(m => ({ default: m.Reports })));

/** شاشة تحميل بسيطة أثناء جلب جزء الصفحة المطلوب */
const RouteFallback = () => (
  <div className="min-h-[60vh] flex items-center justify-center">
    <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-[#800000]"></div>
  </div>
);

/**
 * حارس المسارات (ProtectedRoute)
 * يضمن أن المستخدمين المسجلين فقط هم من يمكنهم الوصول للوحة التحكم
 */
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-[#800000]"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

function App() {
  return (
    <ErrorBoundary>
      {/* حاوية رسائل التنبيه الذكية (Toaster) لمنع التراكم والتكديس */}
      <Toaster 
        position="top-center" 
        reverseOrder={false} 
        limit={1}
        toastOptions={{
          style: {
            fontFamily: 'Tajawal, sans-serif',
            fontSize: '14px',
            borderRadius: '12px',
            background: '#fff',
            color: '#334155',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
          },
          duration: 2500, 
        }}
      />
      
      <Router>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            {/* 1. صفحة الدخول: مستقلة تماماً خارج الهيكل العام */}
            <Route path="/login" element={<EmployeeLogin />} />

            {/* 2. المسارات المحمية: يتم تغليفها بـ ProtectedRoute و MainLayout */}
            <Route 
              element={
                <ProtectedRoute>
                  <MainLayout />
                </ProtectedRoute>
              }
            >
              {/* جميع المسارات هنا سيتم رندرها داخل الـ <Outlet /> الموجود في MainLayout */}
              <Route index element={<Dashboard />} />
              <Route path="/products" element={<ProductsPage />} />
              <Route path="/employees" element={<Employees />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/sales" element={<SalesPage />} />
              <Route path="/stock-movements" element={<StockMovementsPage />} />
              <Route path="/quick-scan" element={<QuickScanPage />} />
              <Route path="/reports" element={<Reports />} />
            </Route>

            {/* مسار افتراضي لإعادة التوجيه في حال كتابة رابط خطأ */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </Router>
    </ErrorBoundary>
  );
}

export default App;