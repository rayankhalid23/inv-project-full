import React, { useState, useEffect } from 'react';
import {
  X, UserPlus, Phone, Lock, Shield,
  Loader2, CheckCircle2, Pencil, AlertCircle
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { createEmployeeApi, updateEmployeeApi } from '../api/userApi';
import { saveOfflineAction } from '../utils/idbStorage';
import { isNetworkError } from '../utils/netErrors';

const PHONE_REGEX = /^09[0-9]{8}$/;

const AddEmployeeModal = ({ isOpen, onClose, onRefresh, initialData = null }) => {
  // 1. تحديد وضعية المودال (تعديل أم إضافة)
  const isEditMode = !!initialData;
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    password: '',
    role_id: '3'
  });

  // جلب بيانات المستخدم المسجل + تعبئة البيانات في حال التعديل
  useEffect(() => {
    // جلب بيانات المستخدم الحالي للصلاحيات
    const user = JSON.parse(localStorage.getItem('user'));
    setCurrentUser(user);

    if (isEditMode && initialData) {
      setFormData({
        name: initialData.name || '',
        phone: initialData.phone || '',
        password: '',
        role_id: initialData.role_id?.toString() || '3'
      });
    } else {
      setFormData({ name: '', phone: '', password: '', role_id: '3' });
    }
    setFieldErrors({});
  }, [isOpen, initialData, isEditMode]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // إزالة خطأ الحقل عند الكتابة فيه
    if (fieldErrors[name]) setFieldErrors(prev => ({ ...prev, [name]: '' }));
  };

  const validate = () => {
    const errors = {};
    if (!formData.name.trim() || formData.name.trim().length < 2)
      errors.name = "الاسم يجب أن يكون حرفين على الأقل";
    if (!PHONE_REGEX.test(formData.phone))
      errors.phone = "رقم الهاتف يجب أن يبدأ بـ 09 ويتكون من 10 أرقام";
    if (!isEditMode && !formData.password)
      errors.password = "كلمة المرور مطلوبة للموظف الجديد";
    if (formData.password && formData.password.length < 6)
      errors.password = "كلمة المرور يجب أن تكون 6 أحرف على الأقل";
    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      toast.error(Object.values(errors)[0], { duration: 3500 });
      return;
    }

    setLoading(true);

    if (!navigator.onLine) {
      const type = isEditMode ? 'UPDATE_EMPLOYEE' : 'CREATE_EMPLOYEE';
      const payload = isEditMode
        ? { id: initialData.id, data: { ...formData, role_id: parseInt(formData.role_id) } }
        : { ...formData, role_id: parseInt(formData.role_id) };
      const desc = isEditMode ? `تعديل الموظف: ${formData.name}` : `إضافة موظف جديد: ${formData.name}`;
      await saveOfflineAction(type, payload, desc);
      toast.success(
        isEditMode
          ? `أوفلاين: تم حفظ تعديل ${formData.name} محلياً! سيُرفع عند الاتصال 📡`
          : `أوفلاين: تم حفظ الموظف ${formData.name} محلياً! سيُرفع عند الاتصال 📡`
      );
      onRefresh();
      onClose();
      setLoading(false);
      return;
    }

    try {
      if (isEditMode) {
        await updateEmployeeApi(initialData.id, formData);
        toast.success(`✅ تم تحديث بيانات ${formData.name} بنجاح`);
      } else {
        await createEmployeeApi(formData);
        toast.success(`✅ تم إضافة الموظف ${formData.name} بنجاح`);
      }
      onRefresh();
      onClose();
    } catch (error) {
      if (isNetworkError(error)) {
        const type = isEditMode ? 'UPDATE_EMPLOYEE' : 'CREATE_EMPLOYEE';
        const payload = isEditMode
          ? { id: initialData.id, data: { ...formData, role_id: parseInt(formData.role_id) } }
          : { ...formData, role_id: parseInt(formData.role_id) };
        const desc = isEditMode ? `تعديل الموظف: ${formData.name}` : `إضافة موظف جديد: ${formData.name}`;
        await saveOfflineAction(type, payload, desc);
        toast.success("انقطع الاتصال: تم الحفظ محلياً وسيُزامن تلقائياً 📡");
        onRefresh();
        onClose();
        return;
      }
      console.error("Employee form error:", error);
      const backendDetail = error.response?.data?.detail;
      let errorMsg = "حدث خطأ غير متوقع";
      if (backendDetail) {
        errorMsg = typeof backendDetail === 'string'
          ? backendDetail
          : Array.isArray(backendDetail)
            ? backendDetail[0]?.msg || "بيانات غير صالحة"
            : errorMsg;
      } else if (error.response?.status === 409) {
        errorMsg = "رقم الهاتف مسجل مسبقاً، جرب رقماً آخر";
        setFieldErrors(prev => ({ ...prev, phone: errorMsg }));
      } else if (!error.response) {
        errorMsg = "لا يمكن الاتصال بالسيرفر";
      }
      toast.error(errorMsg, { duration: 4000 });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-300 font-arabic" dir="rtl">
        
        {/* Header - يتغير لونه وعنوانه بناءً على الوضعية */}
        <div className={`relative p-6 ${isEditMode ? 'bg-amber-600' : 'bg-[#800000]'} text-white transition-colors duration-500`}>
          <button onClick={onClose} className="absolute left-6 top-6 p-2 hover:bg-white/10 rounded-full transition-colors">
            <X className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-4">
            <div className="bg-white/20 p-3 rounded-2xl">
              {isEditMode ? <Pencil className="h-6 w-6 text-white" /> : <UserPlus className="h-6 w-6 text-white" />}
            </div>
            <div>
              <h2 className="text-xl font-black">
                {isEditMode ? "تعديل بيانات الموظف" : "إضافة موظف جديد"}
              </h2>
              <p className="text-white/70 text-xs mt-1 font-bold">
                {isEditMode ? `أنت تقوم بتعديل بيانات: ${initialData.name}` : "أدخل بيانات الموظف بدقة لمنحه صلاحية الوصول"}
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          
          {/* Name Field */}
          <div className="space-y-2">
            <label className="text-sm font-black text-slate-700 mr-2">اسم الموظف</label>
            <div className="relative group">
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#800000] transition-colors">
                <UserPlus className="h-4 w-4" />
              </div>
              <input
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="الاسم الكامل"
                className={`w-full h-12 pr-11 pl-4 bg-slate-50 border-2 rounded-2xl text-sm font-bold focus:bg-white outline-none transition-all ${fieldErrors.name ? 'border-red-400 bg-red-50/30' : 'border-transparent focus:border-[#800000]/10'}`}
              />
            </div>
            {fieldErrors.name && (
              <p className="flex items-center gap-1 text-[11px] font-bold text-red-500 mr-2">
                <AlertCircle className="h-3 w-3" /> {fieldErrors.name}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Phone Field */}
            <div className="space-y-2">
              <label className="text-sm font-black text-slate-700 mr-2">رقم الهاتف</label>
              <div className="relative group">
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#800000] transition-colors">
                  <Phone className="h-4 w-4" />
                </div>
                <input
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="09XXXXXXXX"
                  maxLength={10}
                  className={`w-full h-12 pr-11 pl-4 bg-slate-50 border-2 rounded-2xl text-sm font-bold focus:bg-white outline-none transition-all shadow-inner ${fieldErrors.phone ? 'border-red-400 bg-red-50/30' : 'border-transparent focus:border-[#800000]/10'}`}
                />
              </div>
              {fieldErrors.phone && (
                <p className="flex items-center gap-1 text-[11px] font-bold text-red-500 mr-2">
                  <AlertCircle className="h-3 w-3" /> {fieldErrors.phone}
                </p>
              )}
            </div>

            {/* Role Selection */}
            <div className="space-y-2">
              <label className="text-sm font-black text-slate-700 mr-2">الرتبة الوظيفية</label>
              <div className="relative group">
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#800000] transition-colors">
                  <Shield className="h-4 w-4" />
                </div>
                <select
                  name="role_id"
                  value={formData.role_id}
                  onChange={handleChange}
                  className="w-full h-12 pr-11 pl-4 bg-slate-50 border-2 border-transparent rounded-2xl text-sm font-bold focus:bg-white focus:border-[#800000]/10 outline-none transition-all appearance-none cursor-pointer"
                >
                  <option value="3">موظف</option>
                  {currentUser?.role_id === 1 && (
                    <>
                      <option value="2">مدير</option>
                      <option value="1">مسؤول</option>
                    </>
                  )}
                </select>
              </div>
            </div>
          </div>

          {/* Password Field */}
          <div className="space-y-2">
            <label className="text-sm font-black text-slate-700 mr-2">
              كلمة المرور{' '}
              {isEditMode && <span className="text-[10px] text-amber-600">(اتركها فارغة لعدم التغيير)</span>}
            </label>
            <div className="relative group">
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#800000] transition-colors">
                <Lock className="h-4 w-4" />
              </div>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="••••••••"
                className={`w-full h-12 pr-11 pl-4 bg-slate-50 border-2 rounded-2xl text-sm font-bold focus:bg-white outline-none transition-all shadow-inner ${fieldErrors.password ? 'border-red-400 bg-red-50/30' : 'border-transparent focus:border-[#800000]/10'}`}
              />
            </div>
            {fieldErrors.password && (
              <p className="flex items-center gap-1 text-[11px] font-bold text-red-500 mr-2">
                <AlertCircle className="h-3 w-3" /> {fieldErrors.password}
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 h-12 rounded-2xl font-black text-slate-500 hover:bg-slate-100 transition-colors">
              إلغاء
            </button>
            <button 
              type="submit" 
              disabled={loading} 
              className={`flex-[2] h-12 ${isEditMode ? 'bg-amber-600 shadow-amber-600/30' : 'bg-[#800000] shadow-[#800000]/30'} text-white rounded-2xl font-black shadow-lg hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2`}
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="h-5 w-5" /> 
                  {isEditMode ? "حفظ التعديلات" : "حفظ الموظف"}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddEmployeeModal;