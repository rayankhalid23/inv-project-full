import React, { useState } from 'react';
import { Phone, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';

export default function App() {
  const [showPassword, setShowPassword] = useState(false);

  // --- دوال الألوان للتصميم الفخم ---
  const colors = {
    bgStart: '#0f172a',    // أزرق ليلي غامق جداً
    bgEnd: '#020617',      // أسود تقريباً
    gold: '#D4AF37',       // لون ذهبي كلاسيكي للشعار واللمسات
    phoneBg: '#111827',    // خلفية الهاتف الداخلية
    inputBg: '#1f2937',    // خلفية الحقول
  };

  return (
    // الخلفية الكبيرة: تدرج أنيق جداً من الأزرق الليلي إلى الأسود
    <div style={{
      backgroundImage: `radial-gradient(circle at center, ${colors.bgStart} 0%, ${colors.bgEnd} 100%)`,
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      fontFamily: 'sans-serif',
      direction: 'rtl'
    }}>

      {/* حاوية الهاتف الذكي - أكثر أناقة مع ظل ناعم */}
      <div style={{
        width: '100%',
        maxWidth: '380px',
        height: '780px',
        backgroundColor: colors.phoneBg,
        borderRadius: '50px',
        border: '10px solid #1E293B',
        boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7)',
        display: 'flex',
        flexDirection: 'column',
        padding: '30px',
        position: 'relative',
        overflow: 'hidden'
      }}>
        
        {/* تصميم شعار متجر "بيلاجيو" الاحترافي (الذهبي الخطي) */}
        <div className="flex flex-col items-center mt-12 mb-12 text-center">
          {/* إطار الشعار البيضاوي الفخم */}
          <div style={{
            width: '100px',
            height: '100px',
            border: `1.5px solid ${colors.gold}`,
            borderRadius: '50%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '15px',
            boxShadow: `0 0 15px rgba(212, 175, 55, 0.1)`, // وهج ذهبي خفيف
            position: 'relative'
          }}>
            {/* أيقونة القبة/البناء داخل الشعار (خطوط ذهبية) */}
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M20 5V35" stroke={colors.gold} strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M10 15C10 9.47715 14.4772 5 20 5C25.5228 5 30 9.47715 30 15V35H10V15Z" stroke={colors.gold} strokeWidth="1.5"/>
              <path d="M10 22H30" stroke={colors.gold} strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M10 28H30" stroke={colors.gold} strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="20" cy="5" r="1.5" fill={colors.gold}/>
            </svg>
          </div>
          {/* اسم المتجر */}
          <h1 className="text-4xl font-light text-white tracking-widest" style={{fontFamily: 'serif'}}>بيلاجيو</h1>
          <p className="text-[10px] tracking-[0.4em] uppercase" style={{color: colors.gold}}>BELLAGIO</p>
        </div>

        {/* نموذج تسجيل الدخول - تم تحسين الألوان لتقليل التباين */}
        <div className="flex-1 space-y-6">
          <div className="text-center mb-8">
            <h2 className="text-xl font-bold text-white/90">تسجيل الدخول</h2>
            <p className="text-xs text-white/50 mt-1">نظام إدارة مخزن بيلاجيو</p>
          </div>

          {/* حقل الهاتف */}
          <div className="space-y-2">
            <label className="text-xs text-white/60 mr-2">رقم الهاتف</label>
            <div className="relative group">
              <input 
                type="tel" 
                placeholder="09xxxxxxxx" 
                className="w-full h-14 bg-gray-800/50 border border-gray-700/50 rounded-2xl pr-12 pl-4 text-white text-left outline-none focus:border-[#D4AF37] transition-all"
                dir="ltr"
                style={{backgroundColor: colors.inputBg, borderColor: '#374151'}}
              />
              <Phone className="absolute right-4 top-4 text-white/30 group-focus-within:text-[#D4AF37]" size={20} />
            </div>
          </div>

          {/* حقل كلمة المرور */}
          <div className="space-y-2">
            <label className="text-xs text-white/60 mr-2">الرقم السري</label>
            <div className="relative group">
              <input 
                type={showPassword ? "text" : "password"} 
                placeholder="••••••" 
                className="w-full h-14 bg-gray-800/50 border border-gray-700/50 rounded-2xl pr-12 pl-12 text-white text-left outline-none focus:border-[#D4AF37] transition-all"
                dir="ltr"
                style={{backgroundColor: colors.inputBg, borderColor: '#374151'}}
              />
              <Lock className="absolute right-4 top-4 text-white/30 group-focus-within:text-[#D4AF37]" size={20} />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-4 top-4 text-white/30 hover:text-white"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          {/* الزر الرئيسي - تدرج أزرق داكن فخم */}
          <button className="w-full h-14 bg-gradient-to-r from-blue-700 to-indigo-800 text-white rounded-2xl font-bold flex items-center justify-center gap-3 shadow-lg shadow-blue-500/10 active:scale-95 transition-transform mt-10 hover:from-blue-800 hover:to-indigo-900">
            <span>دخول للنظام</span>
            <ArrowRight size={22} className="mt-0.5"/>
          </button>
        </div>

        {/* خط أسفل الهاتف المحاكي (تزيين) */}
        <div className="w-28 h-1.5 bg-white/10 rounded-full mx-auto mt-4 mb-2"></div>
      </div>
    </div>
  );
}