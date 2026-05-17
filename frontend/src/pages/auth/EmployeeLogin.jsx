import React, { useState, useEffect } from 'react';
import { 
  Shield, Phone, Lock, Eye, EyeOff, 
  ArrowRight, RefreshCw, CheckCircle, AlertCircle 
} from 'lucide-react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext'; 

const EmployeeLogin = () => {
  const navigate = useNavigate();
  const { login } = useAuth(); 

  // --- States ---
  const [step, setStep] = useState('LOGIN'); 
  const [loading, setLoading] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({ phone: '', pin: '' });

  // --- Validation ---
  const validatePhone = (phone) => /^09\d{8}$/.test(phone);
  const validatePin = (pin) => /^\d{6,20}$/.test(pin);

  // --- Handlers ---
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    const cleanValue = value.replace(/\D/g, ''); 
    setFormData(prev => ({ ...prev, [name]: cleanValue }));
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (!validatePhone(formData.phone)) {
        throw new Error('يرجى إدخال رقم هاتف صحيح يبدأ بـ 09 (10 أرقام)');
      }
      if (formData.pin.length < 4) {
        throw new Error('الرقم السري قصير جداً');
      }

      const loginData = new URLSearchParams();
      loginData.append('username', formData.phone); 
      loginData.append('password', formData.pin);

      const response = await axios.post('http://127.0.0.1:8000/auth/login', loginData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      const { access_token, user } = response.data;

      if (access_token && user) {
        login(user, access_token);
        setStep('SUCCESS');
      } else {
        throw new Error("لم يتم استلام بيانات المستخدم من السيرفر");
      }
      
    } catch (err) {
      const serverMessage = err.response?.data?.detail || err.message || "فشل الاتصال بالسيرفر";
      setError(serverMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (step === 'SUCCESS') {
      const timer = setTimeout(() => {
        navigate('/'); 
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [step, navigate]);

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-4 bg-[#2c333f] bg-gradient-to-br from-[#384252] via-[#2c333f] to-[#1e2530] text-white font-sans" dir="rtl">
      
      {/* Decorative Background Elements */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-400/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-slate-300/10 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="w-full max-w-md z-10">
        {/* Branding */}
        <div className="flex flex-col items-center mb-8">
          <div className="p-3 rounded-2xl shadow-2xl mb-4 bg-[#800000] border border-white/10 ring-4 ring-black/10">
            <Shield className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-black tracking-widest text-white drop-shadow-md">BELLAGIO</h1>
          <p className="text-slate-300 mt-2 text-sm font-bold opacity-90 uppercase tracking-tighter">نظام إدارة الموظفين والمخازن</p>
        </div>

        {/* Login Card */}
        <div className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-8 shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden relative">
          
          {step === 'LOGIN' ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="text-center mb-6">
                <h2 className="text-xl font-extrabold text-white">تسجيل الدخول</h2>
                <p className="text-xs text-slate-400 mt-1 font-medium">أدخل بياناتك للوصول للوحة التحكم</p>
              </div>

              {/* Error Box */}
              {error && (
                <div className="bg-red-500/10 border border-red-500/50 p-4 rounded-2xl flex items-center gap-3 text-red-200 text-sm animate-in fade-in zoom-in duration-300">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                  <span className="font-bold">{error}</span>
                </div>
              )}

              {/* Inputs */}
              <div className="space-y-4">
                <div className="relative group">
                  <Phone className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 group-focus-within:text-[#a00000] transition-colors" />
                  <input
                    type="text"
                    name="phone"
                    dir="ltr"
                    placeholder="رقم الهاتف"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pr-12 pl-4 focus:ring-2 focus:ring-[#800000] focus:bg-white/10 outline-none transition-all font-bold placeholder:font-normal placeholder:text-slate-500 text-white text-right"
                    value={formData.phone}
                    onChange={handleInputChange}
                    maxLength={10}
                    disabled={loading}
                  />
                </div>

                <div className="relative group">
                  <Lock className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 group-focus-within:text-[#a00000] transition-colors" />
                  <input
                    type={showPin ? "text" : "password"}
                    name="pin"
                    dir="ltr"
                    placeholder="كلمة المرور"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pr-12 pl-12 focus:ring-2 focus:ring-[#800000] focus:bg-white/10 outline-none transition-all font-bold placeholder:font-normal placeholder:text-slate-500 text-white text-right"
                    value={formData.pin}
                    onChange={handleInputChange}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors p-1"
                  >
                    {showPin ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {/* Action Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#800000] hover:bg-[#a00000] py-4 rounded-2xl font-black text-lg flex items-center justify-center gap-3 shadow-xl shadow-[#800000]/20 transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <RefreshCw className="h-5 w-5 animate-spin" />
                    <span>جاري التحقق...</span>
                  </>
                ) : (
                  <>
                    <span>دخول للنظام</span>
                    <ArrowRight className="h-5 w-5" /> 
                  </>
                )}
              </button>
            </form>
          ) : (
            /* Success Screen */
            <div className="py-10 flex flex-col items-center text-center animate-in zoom-in duration-500">
              <div className="w-24 h-24 bg-emerald-500/20 rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(16,185,129,0.3)]">
                <CheckCircle className="h-14 w-14 text-emerald-400" />
              </div>
              <h2 className="text-2xl font-black text-emerald-400 mb-2">تم تسجيل الدخول</h2>
              <p className="text-slate-200 font-bold">أهلاً بك مجدداً في بيلادجيو</p>
              <div className="mt-6 flex gap-2">
                 <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                 <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                 <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce"></div>
              </div>
            </div>
          )}
        </div>

        <p className="mt-12 text-center text-[10px] text-slate-500 font-black uppercase tracking-[0.3em] opacity-40">
          &copy; 2026 BELLAGIO MANAGEMENT SYSTEM
        </p>
      </div>
    </div>
  );
};

export default EmployeeLogin;