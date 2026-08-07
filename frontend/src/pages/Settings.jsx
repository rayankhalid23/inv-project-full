import React, { useState, useEffect, useCallback } from 'react';
import { 
  User, LogOut, Save, RefreshCw, 
  Phone, Lock, ShieldCheck, XCircle, Download, Smartphone, Shield, Zap
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useOffline } from '../context/OfflineContext';
import { useNavigate } from 'react-router-dom';
import { updateProfile } from '../api/userApi';
import { toast } from 'react-hot-toast';


const Settings = () => {
  const { logout, user, updateUserData } = useAuth();
  const navigate = useNavigate();
  
  const [isSaving, setIsSaving] = useState(false);
  
  const [profileData, setProfileData] = useState({
    name: '',
    phone: '',
    password: '',
    confirmPassword: ''
  });

  const [errors, setErrors] = useState({
    name: false,
    phone: false,
    password: false,
    confirmPassword: false
  });

  const resetToOriginal = useCallback(() => {
    if (user) {
      setProfileData({
        name: user.name || '',
        phone: user.phone || '',
        password: '',
        confirmPassword: ''
      });
      setErrors({ name: false, phone: false, password: false, confirmPassword: false });
    }
  }, [user]);

  useEffect(() => {
    resetToOriginal();
  }, [resetToOriginal]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setProfileData(prev => ({ ...prev, [name]: value }));
    
    // إزالة التنبيه الأحمر بمجرد أن يبدأ المستخدم في التعديل لتصحيح الخطأ
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: false }));
    }
  };

  const validateForm = () => {
    const cleanErrors = { name: false, phone: false, password: false, confirmPassword: false };

    // 1. فحص حقل الاسم (أولوية قصوى - تلوين أحمر فوري عند الخطأ المحلي)
    if (!profileData.name.trim() || profileData.name.trim().length < 3) {
      toast.error("خطأ: يرجى إدخال الاسم بالكامل (3 أحرف على الأقل)");
      setErrors({ ...cleanErrors, name: true });
      return false; 
    }

    // 2. فحص حقل الهاتف
    const phoneRegex = /^09\d{8}$/; 
    if (!phoneRegex.test(profileData.phone)) {
      toast.error("خطأ: يجب أن يتكون الهاتف من 10 أرقام ويبدأ بـ 09");
      setErrors({ ...cleanErrors, phone: true });
      return false; 
    }

    // 3. فحص كلمات المرور
    if (profileData.password || profileData.confirmPassword) {
      if (profileData.password.length < 6) {
        toast.error("خطأ: كلمة المرور قصيرة جداً (6 خانات على الأقل)");
        setErrors({ ...cleanErrors, password: true });
        return false;
      }
      if (profileData.password !== profileData.confirmPassword) {
        toast.error("خطأ: كلمات المرور غير متطابقة");
        setErrors({ ...cleanErrors, confirmPassword: true });
        return false;
      }
    }

    return true; 
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    const toastId = toast.loading("جاري حفظ التعديلات...");
    setIsSaving(true);

    try {
      const payload = {
        name: profileData.name,
        phone: profileData.phone,
      };

      if (profileData.password.trim() !== '') {
        payload.password = profileData.password;
      }

      const response = await updateProfile(user.id, payload);

      if (response.status === "success") {
        updateUserData(response.data);
        toast.success("تم تحديث بياناتك بنجاح", { id: toastId });
        setProfileData(prev => ({ ...prev, password: '', confirmPassword: '' }));
      }
    } catch (error) {
      const errorMessage = error.response?.data?.detail || "";
      
      // التعديل الجوهري هنا: منطق أكثر مرونة ليشمل رسالة "محجوز لموظف آخر"
      // قمنا بتوسيع الشروط لتشمل كلمات مثل "محجوز" و "الاسم" لضمان تلوين الحقل بالأحمر
      const nameIsTaken = errorMessage.includes("name") || 
                         errorMessage.includes("already exists") ||
                         errorMessage.includes("الاسم") ||
                         errorMessage.includes("محجوز") || // هذه الكلمة تم إضافتها لتتوافق مع صورتك
                         errorMessage.includes("مستخدم");

      if (nameIsTaken) {
        // تلوين حقل الاسم بالأحمر
        setErrors(prev => ({ ...prev, name: true }));
        // نعرض رسالة السيرفر الأصلية (التي في الصورة) لأنها واضحة
        toast.error(errorMessage, { id: toastId });
      } else {
        toast.error(errorMessage || "فشل تحديث البيانات", { id: toastId });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const getInputClass = (fieldName) => {
    const baseClass = "w-full border rounded-2xl p-4 text-sm focus:ring-2 outline-none transition-all duration-300 ";
    const errorClass = errors[fieldName] 
      ? "border-red-500 bg-red-50 focus:ring-red-100 shadow-[0_0_0_1px_rgba(239,68,68,0.2)]" 
      : "border-slate-200 bg-slate-50 focus:bg-white focus:ring-[#800000]/10 focus:border-[#800000]";
    return baseClass + errorClass;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500" dir="rtl">
      
      {/* Header */}
      <div className="flex justify-between items-center bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">إعدادات الحساب</h1>
          <p className="text-sm text-slate-500 font-medium">إدارة بيانات ملفك الشخصي</p>
        </div>
        <button
          onClick={() => { logout(); navigate('/login'); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-red-600 hover:bg-red-50 transition-all border border-transparent hover:border-red-100"
        >
          <LogOut className="h-4 w-4" />
          خروج
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 lg:p-10 space-y-8">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-6">
            
            {/* حقل الاسم - سيتلون بالأحمر الآن في جميع حالات الخطأ */}
            <div className="space-y-2">
              <label className="text-[13px] font-bold text-slate-600 px-1">الاسم بالكامل</label>
              <div className="relative">
                <User className={`absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors ${errors.name ? 'text-red-500' : 'text-slate-400'}`} />
                <input 
                  type="text" 
                  name="name"
                  value={profileData.name}
                  onChange={handleInputChange}
                  className={getInputClass('name')} 
                  placeholder="أدخل اسمك بالكامل"
                />
              </div>
            </div>

            {/* حقل الهاتف */}
            <div className="space-y-2">
              <label className="text-[13px] font-bold text-slate-600 px-1">رقم الهاتف</label>
              <div className="relative">
                <Phone className={`absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors ${errors.phone ? 'text-red-500' : 'text-slate-400'}`} />
                <input 
                  type="text" 
                  name="phone"
                  maxLength={10}
                  value={profileData.phone}
                  onChange={handleInputChange}
                  className={getInputClass('phone')} 
                  placeholder="09XXXXXXXX"
                />
              </div>
            </div>

            {/* كلمة المرور */}
            <div className="space-y-2">
              <label className="text-[13px] font-bold text-slate-600 px-1">كلمة المرور الجديدة</label>
              <div className="relative">
                <Lock className={`absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors ${errors.password ? 'text-red-500' : 'text-slate-400'}`} />
                <input 
                  type="password" 
                  name="password"
                  placeholder="********"
                  value={profileData.password}
                  onChange={handleInputChange}
                  className={getInputClass('password')} 
                />
              </div>
            </div>

            {/* تأكيد كلمة المرور */}
            <div className="space-y-2">
              <label className="text-[13px] font-bold text-slate-600 px-1">تأكيد كلمة المرور</label>
              <div className="relative">
                <ShieldCheck className={`absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors ${errors.confirmPassword ? 'text-red-500' : 'text-slate-400'}`} />
                <input 
                  type="password" 
                  name="confirmPassword"
                  placeholder="********"
                  value={profileData.confirmPassword}
                  onChange={handleInputChange}
                  className={getInputClass('confirmPassword')} 
                />
              </div>
            </div>
          </div>

          <div className="pt-8 flex flex-col md:flex-row gap-4 border-t border-slate-50">
            <button 
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 flex items-center justify-center gap-3 bg-[#800000] text-white px-12 py-4 rounded-2xl font-bold hover:shadow-xl hover:shadow-[#800000]/20 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {isSaving ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
              {isSaving ? 'جاري المزامنة...' : 'تحديث البيانات'}
            </button>
            
            <button 
              onClick={resetToOriginal}
              className="flex items-center justify-center gap-2 bg-slate-100 text-slate-600 px-8 py-4 rounded-2xl font-bold hover:bg-slate-200 transition-all border border-slate-200"
            >
              <XCircle className="h-5 w-5" />
              إلغاء وإعادة تعيين
            </button>
          </div>

        </div>
      </div>

      {/* بطاقة تثبيت وتنزيل التطبيق */}
      <div className="bg-[#0a1128] rounded-3xl border border-white/10 p-6 lg:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-64 h-64 bg-[#800000]/20 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-4">
            <div className="p-3.5 rounded-2xl bg-[#800000] border border-white/20 shadow-lg shrink-0">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xl font-black tracking-wide text-white">تطبيق BELLAGIO على جهازك</h3>
              <p className="text-xs text-slate-300 font-medium leading-relaxed max-w-lg">
                قم بتنزيل التطبيق كـ تطبيق آيفون أو أندرويد أو كمبيوتر للعمل بدون إنترنت وحفظ البيانات محلياً مع المزامنة التلقائية فور توفر النت!
              </p>
            </div>
          </div>

          <button
            onClick={promptInstallApp}
            className="w-full md:w-auto flex items-center justify-center gap-2.5 bg-gradient-to-r from-[#800000] to-[#b30000] hover:from-[#990000] hover:to-[#cc0000] text-white px-6 py-3.5 rounded-2xl font-bold shadow-lg shadow-[#800000]/40 transition-all active:scale-95 shrink-0"
          >
            <Download className="w-5 h-5" />
            <span>تنزيل وتثبيت التطبيق 📲</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Settings;