import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Toaster } from 'react-hot-toast'; 
import MainLayout from './components/layout/MainLayout';
import Dashboard from './pages/Dashboard';
import EmployeeLogin from './pages/auth/EmployeeLogin';
import Settings from './pages/Settings';
import Employees from './pages/Employees';
import ProductsPage from "./pages/Products/ProductsPage";
import SalesPage from "./pages/SalesPage";
import StockMovementsPage from "./pages/StockMovementsPage";
import { Reports } from './pages/Reports/Reports';
// أضف هذا السطر في أعلى الملف تحت الاستيرادات مباشرة
import QuickScanPage from './pages/QuickScanButton';


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
    <AuthProvider>
      {/* حاوية رسائل التنبيه الذكية (Toaster) لمنع التراكم والتكديس */}
      <Toaster 
        position="top-center" 
        reverseOrder={false} 
        limit={1} // 🔥 يمنع ظهور أكثر من إشعار في نفس الوقت، الإشعار الجديد يطرد القديم فورًا
        toastOptions={{
          style: {
            fontFamily: 'Tajawal, sans-serif',
            fontSize: '14px',
            borderRadius: '12px',
            background: '#fff',
            color: '#334155',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
          },
          // تأثير حركة سلس ومدروس عند خروج ودخول الإشعار المتتالي
          duration: 2500, 
        }}
      />
      
      <Router>
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
      </Router>
    </AuthProvider>
  );
}

export default App;