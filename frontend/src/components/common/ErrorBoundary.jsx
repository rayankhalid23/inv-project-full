import React from 'react';
import { AlertTriangle, RefreshCw, WifiOff, Home } from 'lucide-react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] تم التقاط خطأ في الواجهة:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      const isOffline = !navigator.onLine;

      return (
        <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4 font-sans select-none" dir="rtl">
          <div className="bg-white border border-slate-200 rounded-3xl p-8 max-w-md w-full text-center shadow-xl space-y-5">
            <div className="w-16 h-16 bg-[#800000]/10 text-[#800000] rounded-2xl flex items-center justify-center mx-auto shadow-inner">
              {isOffline ? (
                <WifiOff className="w-8 h-8 animate-pulse" />
              ) : (
                <AlertTriangle className="w-8 h-8" />
              )}
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-black text-slate-900">
                {isOffline ? 'تعذّر فتح هذه الواجهة بدون إنترنت' : 'حدث خطأ غير متوقع'}
              </h2>
              <p className="text-xs text-slate-500 font-bold leading-relaxed">
                {isOffline
                  ? 'إذا كانت هذه أول مرة تفتح فيها هذه الشاشة، فقد تحتاج اتصالاً لمرة واحدة لتخزينها محلياً. بقية الواجهات المحفوظة تعمل بالكامل.'
                  : 'حدث خطأ مؤقت في تحميل الواجهة. يمكنك إعادة المحاولة الآن.'}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
              <button
                onClick={this.handleReload}
                className="flex-1 flex items-center justify-center gap-2 bg-[#800000] hover:bg-[#660000] text-white py-3 px-4 rounded-xl font-black text-xs transition-all active:scale-95 shadow-md shadow-[#800000]/20"
              >
                <RefreshCw className="w-4 h-4" />
                <span>إعادة المحاولة</span>
              </button>

              <button
                onClick={this.handleGoHome}
                className="flex-1 flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 px-4 rounded-xl font-black text-xs transition-all active:scale-95"
              >
                <Home className="w-4 h-4" />
                <span>الرئيسية</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
