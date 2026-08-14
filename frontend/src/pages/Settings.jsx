import React, { useState, useEffect, useCallback } from 'react';
import { 
  User, LogOut, Save, RefreshCw, 
  Phone, Lock, ShieldCheck, XCircle
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { updateProfile } from '../api/userApi';
import { orderApi } from '../api/orderApi';
import { toast } from 'react-hot-toast';
import { Trash2, Database, AlertTriangle } from 'lucide-react';


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

  // --- تنظيف الطلبات المكتملة (للأدمن فقط) ---
  const isAdmin = Number(user?.role_id) === 1;
  const [purgeInfo, setPurgeInfo] = useState(null);      // نتيجة المعاينة
  const [purgeOpen, setPurgeOpen] = useState(false);     // نافذة التأكيد
  const [purgeLoading, setPurgeLoading] = useState(false);

  const openPurgeDialog = async () => {
    setPurgeLoading(true);
    try {
      const info = await orderApi.previewCompletedPurge();
      setPurgeInfo(info);
      setPurgeOpen(true);
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'تعذّر جلب البيانات');
    } finally {
      setPurgeLoading(false);
    }
  };

  const confirmPurge = async () => {
    setPurgeLoading(true);
    const id = toast.loading('جاري حذف الطلبات المكتملة...');
    try {
      const res = await orderApi.purgeCompletedOrders();
      toast.success(res.message || 'تم التنظيف بنجاح', { id, duration: 6000 });
      setPurgeOpen(false);
      setPurgeInfo(null);
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'فشل الحذف', { id });
    } finally {
      setPurgeLoading(false);
    }
  };

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

      {/* بطاقة تنظيف البيانات — تظهر للأدمن فقط */}
      {isAdmin && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 lg:p-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
            <div className="flex items-start gap-4">
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 shrink-0">
                <Database className="w-7 h-7 text-slate-500" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-black text-slate-900">تنظيف الطلبات المكتملة</h3>
                <p className="text-xs text-slate-500 font-medium leading-relaxed max-w-xl">
                  حذف نهائي للطلبات التي <strong className="text-slate-700">تم إسنادها للتوصيل</strong> وحركات
                  المخزون الخاصة بها، لتخفيف قاعدة البيانات من سجلات لم تعد بحاجة إليها.
                  <br />
                  <span className="text-emerald-600 font-bold">
                    لا يؤثر على المنتجات ولا الموظفين ولا كميات المخزون ولا التقارير.
                  </span>
                </p>
              </div>
            </div>

            <button
              onClick={openPurgeDialog}
              disabled={purgeLoading}
              className="w-full md:w-auto flex items-center justify-center gap-2.5 bg-white border-2 border-red-200 text-red-600 hover:bg-red-600 hover:text-white hover:border-red-600 px-6 py-3.5 rounded-2xl font-bold transition-all active:scale-95 shrink-0 disabled:opacity-50"
            >
              {purgeLoading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
              <span>تنظيف الطلبات المكتملة</span>
            </button>
          </div>
        </div>
      )}

      {/* نافذة التأكيد مع عرض ما سيُحذف بالضبط قبل التنفيذ */}
      {purgeOpen && purgeInfo && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" dir="rtl">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => !purgeLoading && setPurgeOpen(false)} />
          <div className="relative bg-white rounded-[2rem] p-6 shadow-2xl max-w-md w-full border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="w-14 h-14 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={28} />
            </div>
            <h3 className="text-lg font-black text-slate-900 text-center mb-1">تأكيد الحذف النهائي</h3>
            <p className="text-xs text-slate-500 text-center mb-5">هذا الإجراء لا يمكن التراجع عنه</p>

            {purgeInfo.orders === 0 ? (
              <p className="text-sm text-center text-slate-600 font-bold py-4">
                لا توجد طلبات مكتملة للحذف حالياً ✅
              </p>
            ) : (
              <>
                <div className="bg-slate-50 rounded-2xl p-4 space-y-2.5 mb-5 border border-slate-100">
                  {[
                    ['طلبات مكتملة', purgeInfo.orders],
                    ['عناصر داخل الطلبات', purgeInfo.items],
                    ['حركات مخزون مرتبطة', purgeInfo.movements],
                  ].map(([label, val]) => (
                    <div key={label} className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-medium">{label}</span>
                      <span className="font-mono font-black text-slate-800" dir="ltr">{val}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-200">
                    <span className="text-slate-500 font-medium">إجمالي قيمتها</span>
                    <span className="font-mono font-black text-[#800000]" dir="ltr">{purgeInfo.total_value}</span>
                  </div>
                </div>

                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 mb-5">
                  <p className="text-[11px] text-emerald-800 font-medium leading-relaxed">
                    ✓ المنتجات وكميات المخزون تبقى كما هي<br />
                    ✓ بيانات الموظفين والتقارير لا تتأثر<br />
                    ✓ الطلبات المعلقة وقيد التجهيز والمجهّزة لا تُحذف
                  </p>
                </div>
              </>
            )}

            <div className="flex gap-3">
              {purgeInfo.orders > 0 && (
                <button
                  onClick={confirmPurge}
                  disabled={purgeLoading}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-2xl text-xs font-black transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {purgeLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  نعم، احذف نهائياً
                </button>
              )}
              <button
                onClick={() => setPurgeOpen(false)}
                disabled={purgeLoading}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 py-3 rounded-2xl text-xs font-black border border-slate-200 transition-colors disabled:opacity-50"
              >
                {purgeInfo.orders > 0 ? 'إلغاء' : 'إغلاق'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;