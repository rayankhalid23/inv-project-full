import React, { useState } from "react";
import { Link, useLocation, useNavigate, Outlet } from "react-router-dom";
import { 
  LayoutDashboard, Package, Users, ShoppingBag, 
  BarChart2, Settings, LogOut, Menu, X, Plus, History,
  ScanLine, Download
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useAuth } from "../../context/AuthContext"; 
import { useOffline } from "../../context/OfflineContext";
import QuickScanPage from "../../pages/QuickScanButton";
import OfflineBanner from "../pwa/OfflineBanner";
import PWAInstallModal from "../pwa/PWAInstallModal";


const sidebarItems = [
  { icon: LayoutDashboard, label: "الرئيسية", path: "/" },
  { icon: Package, label: "المنتجات", path: "/products" },
  { icon: History, label: "حركات المخزون", path: "/stock-movements" },
  { icon: ShoppingBag, label: "المبيعات", path: "/sales" },
  { icon: Users, label: "الموظفين", path: "/employees", roles: [1, 2] }, 
  { icon: BarChart2, label: "التقارير", path: "/reports", roles: [1] },
  { icon: Settings, label: "الإعدادات", path: "/settings" },
];


const MainLayout = ({ children }) => {
    const { user, logout } = useAuth();
    const { promptInstallApp, isAppInstalled } = useOffline();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();
  
    const displayName = user?.name || "جارِ التحميل...";
    const displayRole = user?.role || "موظف";
    const roleId = user?.role_id; 
    
    const firstLetter = displayName.charAt(0).toUpperCase();
    const [isScanSheetOpen, setIsScanSheetOpen] = useState(false);

    const filteredSidebarItems = sidebarItems.filter(item => {
      if (!item.roles) return true;
      return item.roles.includes(Number(roleId));
    });

  const NavItem = ({ item, isMobile = false }) => {
    const isActive = location.pathname === item.path;
    return (
      <Link
        to={item.path}
        onClick={() => isMobile && setMobileMenuOpen(false)}
        className={cn(
          "flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all duration-200",
          isActive 
            ? "bg-[#800000] text-white shadow-md shadow-maroon/20" 
            : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
        )}
      >
        <item.icon className={cn("w-5 h-5", isActive ? "text-white" : "text-slate-400")} />
        <span>{item.label}</span>
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-arabic" dir="rtl">
      
      {/* 0 — شريط التنبيه عند الأوفلاين والمزامنة */}
      <OfflineBanner />

      {/* 1 — الهيدر العلوي */}
      <header className="bg-white/90 backdrop-blur-md border-b border-slate-100 sticky top-0 z-50 px-4 md:px-6 h-18 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <button onClick={() => setMobileMenuOpen(true)} className="lg:hidden p-2.5 hover:bg-slate-100 rounded-xl text-slate-600 transition-colors">
            <Menu className="w-6 h-6" />
          </button>
          
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#800000] rounded-xl flex items-center justify-center text-white shadow-lg shadow-maroon/10">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <div className="flex flex-col justify-center border-r pr-3 border-slate-100">
              <span className="font-black text-sm text-slate-900 leading-none mb-1">BELLAGIO</span>
              <span className="text-[11px] font-bold text-[#800000] truncate max-w-[100px]">نظام الإدارة</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* زر التثبيت السريع في الهيدر */}
          {!isAppInstalled && (
            <button
              onClick={promptInstallApp}
              className="flex items-center gap-2 bg-[#800000]/10 hover:bg-[#800000] text-[#800000] hover:text-white px-3 py-2 rounded-xl text-xs font-bold transition-all border border-[#800000]/20 active:scale-95 shadow-sm"
              title="تثبيت تطبيق بيلادجيو كـ تطبيق على جهازك"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">تثبيت التطبيق 📲</span>
            </button>
          )}

          <button 
            onClick={() => navigate('/settings')} 
            className="flex items-center gap-3 p-1 rounded-full hover:bg-slate-50 transition-all group border border-transparent hover:border-slate-100"
          >
            <div className="hidden sm:flex flex-col items-end text-right ml-1">
              <span className="text-xs font-black text-slate-900 leading-tight">{displayName}</span>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{displayRole}</span>
            </div>
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#800000] to-[#5a0000] flex items-center justify-center font-black text-white text-sm border-2 border-white shadow-sm transition-transform group-hover:scale-105">
                {firstLetter}
              </div>
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full"></span>
            </div>
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* 2 — السايدبار (Desktop) */}
        <aside className="hidden lg:flex flex-col w-72 border-l border-slate-100 bg-white p-6 gap-2 overflow-y-auto">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400 font-black px-4 mb-4 opacity-70">قائمة التحكم</p>
          <nav className="space-y-1.5 flex-1">
            {filteredSidebarItems.map((item) => (
              <NavItem key={item.path} item={item} />
            ))}
          </nav>

          {/* زر تثبيت التطبيق في السايدبار إذا لم يكن مجمّعاً كـ PWA */}
          {!isAppInstalled && (
            <div className="mt-2 pt-3 border-t border-slate-100">
              <button
                onClick={promptInstallApp}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-[#800000] hover:text-white transition-all shadow-sm active:scale-95"
              >
                <Download className="w-4 h-4 text-amber-500" />
                <span>تحميل التطبيق على الجهاز</span>
              </button>
            </div>
          )}

          {/* زر المسح السريع في السايدبار */}
          <div className="mt-2 pt-2 border-t border-slate-100">
            <button
              onClick={() => setIsScanSheetOpen(true)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold text-white bg-[#800000] hover:bg-[#660000] transition-all shadow-md shadow-[#800000]/20 active:scale-95"
            >
              <ScanLine className="w-5 h-5" />
              <span>مسح سريع (تالف / راجع / بيع)</span>
            </button>
          </div>

          <div className="mt-2 pt-4 border-t border-slate-50">
              <button onClick={logout} className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold text-red-500 hover:bg-red-50 transition-colors">
                <LogOut className="w-5 h-5" />
                <span>تسجيل الخروج</span>
              </button>
          </div>
        </aside>


        {/* 3 — المحتوى الرئيسي */}
        <main className="flex-1 w-full p-4 lg:p-10 bg-[#F8FAFC] overflow-y-auto pb-32 lg:pb-10">
          <div className="max-w-[1600px] mx-auto">
              <Outlet />
              {children}
          </div>
        </main>
      </div>

      {/* 4 — شريط الموبايل السفلي */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-slate-100 z-30 h-20 flex items-center justify-around px-2 shadow-[0_-5px_20px_rgba(0,0,0,0.03)]">
        <div className="flex w-1/3 justify-around items-center">
          <Link to="/" className={cn("flex flex-col items-center gap-1", location.pathname === "/" ? "text-[#800000]" : "text-slate-400")}>
            <LayoutDashboard className="w-5.5 h-5.5" />
            <span className="text-[9px] font-black">الرئيسية</span>
          </Link>
          <Link to="/products" className={cn("flex flex-col items-center gap-1", location.pathname === "/products" ? "text-[#800000]" : "text-slate-400")}>
            <Package className="w-5.5 h-5.5" />
            <span className="text-[9px] font-black">المخزون</span>
          </Link>
        </div>

        {/* زر المسح السريع المركزي — موجود أصلاً */}
        <div className="flex items-center justify-center w-1/5">
          <button type="button" onClick={() => setIsScanSheetOpen(true)} className="relative group">
            <div className="absolute inset-0 bg-[#800000]/15 rounded-full blur-lg group-hover:bg-[#800000]/25 transition-all duration-500"></div>
            <div className="relative bg-[#800000] text-white w-12 h-12 rounded-full shadow-md flex items-center justify-center transition-all duration-300 active:scale-90 hover:-translate-y-1">
              <Plus className="w-6 h-6 stroke-[3px]" />
            </div>
          </button>
        </div>

        <div className="flex w-1/3 justify-around items-center">
          <Link to="/sales" className={cn("flex flex-col items-center gap-1", location.pathname === "/sales" ? "text-[#800000]" : "text-slate-400")}>
            <ShoppingBag className="w-5.5 h-5.5" />
            <span className="text-[9px] font-black">المبيعات</span>
          </Link>
          
          {(roleId === 1 || roleId === 2) ? (
            <Link to="/employees" className={cn("flex flex-col items-center gap-1", location.pathname === "/employees" ? "text-[#800000]" : "text-slate-400")}>
              <Users className="w-5.5 h-5.5" />
              <span className="text-[9px] font-black">الموظفين</span>
            </Link>
          ) : (
            <Link to="/settings" className={cn("flex flex-col items-center gap-1", location.pathname === "/settings" ? "text-[#800000]" : "text-slate-400")}>
              <Settings className="w-5.5 h-5.5" />
              <span className="text-[9px] font-black">الإعدادات</span>
            </Link>
          )}
        </div>
      </nav>
      
      {/* موبايل سايدبار */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[70] lg:hidden animate-in fade-in duration-300">
          <div onClick={() => setMobileMenuOpen(false)} className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" />
          <aside className="absolute right-0 top-0 bottom-0 w-72 bg-white p-8 flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between mb-8">
              <span className="font-black text-xl text-slate-900">بيلادجيو</span>
              <button onClick={() => setMobileMenuOpen(false)} className="p-2 bg-slate-50 rounded-xl transition-colors">
                <X className="w-6 h-6 text-slate-500" />
              </button>
            </div>
            <nav className="flex flex-col gap-2 flex-1">
              {filteredSidebarItems.map((item) => (
                <NavItem key={item.path} item={item} isMobile />
              ))}
            </nav>

            {/* زر المسح والتثبيت في الـ Mobile Menu */}
            <div className="pt-4 border-t border-slate-100 mt-4 space-y-2">
              {!isAppInstalled && (
                <button
                  onClick={() => { setMobileMenuOpen(false); promptInstallApp(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-bold text-slate-800 bg-slate-100 hover:bg-[#800000] hover:text-white transition-all active:scale-95 shadow-sm"
                >
                  <Download className="w-4 h-4 text-amber-500" />
                  <span>تثبيت تطبيق بيلادجيو 📲</span>
                </button>
              )}

              <button
                onClick={() => { setMobileMenuOpen(false); setIsScanSheetOpen(true); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold text-white bg-[#800000] hover:bg-[#660000] transition-all active:scale-95"
              >
                <ScanLine className="w-5 h-5" />
                <span>مسح سريع (تالف / راجع / بيع)</span>
              </button>

              <button onClick={logout} className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold text-red-500 hover:bg-red-50 transition-colors">
                <LogOut className="w-5 h-5" />
                <span>تسجيل الخروج</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      <QuickScanPage isOpen={isScanSheetOpen} onClose={() => setIsScanSheetOpen(false)} />
      <PWAInstallModal />
      
    </div>
  );
};

export default MainLayout;