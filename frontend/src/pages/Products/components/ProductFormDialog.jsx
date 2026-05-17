import React, { useState, useEffect, useRef } from 'react';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { 
  Upload, Save, X, Loader2, Image as ImageIcon, Plus, 
  Trash2, ChevronDown, AlertCircle, CheckCircle2, Eye, Edit3, 
  Tag, Box, Hash, DollarSign, Archive, Lock, ShoppingCart, QrCode, Copy, TrendingUp, Download
} from 'lucide-react';
import { toast } from 'react-hot-toast'; // أو react-toastify حسب مكتبتك
import { catalogApi as fallbackCatalogApi } from "../../../api/catalogApi";

// --- Schema & Helpers ---
const productSchema = z.object({
  id: z.number().optional(), 
  name: z.string().min(3, "الاسم قصير جداً"),
  catalog_id: z.string().min(1, "يرجى اختيار الكتالوج"),
  selling_price: z.coerce.number().min(0.01, "السعر مطلوب"),
  cost_price: z.coerce.number().optional().default(0),
  min_stock_threshold: z.coerce.number().default(5),
  description: z.string().optional().nullable(),
  variants: z.array(z.object({
    id: z.number().optional(), 
    color_name: z.string().min(1),
    color_image: z.any().optional(),
    sizes: z.array(z.object({
      id: z.number().optional(), 
      size_id: z.any(),
      size_label: z.string(),
      quantity: z.coerce.number()
    }))
  })).default([])
});

const BASE_URL = 'http://localhost:8000';
const getFullUrl = (path) => {
  if (!path) return null;
  if (path instanceof File) return URL.createObjectURL(path);
  const cleanPath = path.replace(/\\/g, '/');
  return `${BASE_URL}${cleanPath.startsWith('/') ? '' : '/'}${cleanPath}`;
};


// --- Main Dialog Component ---
const ProductFormDialog = ({ open, onOpenChange, productToEdit, onSaveSuccess, initialMode , showToast, catalogApi, getFullUrl }) => {
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloadingQr, setIsDownloadingQr] = useState(null); 
  const [isViewMode, setIsViewMode] = useState(initialMode === 'view');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: 'error' });
  const [selectedFile, setSelectedFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [dbSizes, setDbSizes] = useState([]);
  const [dbCatalogs, setDbCatalogs] = useState([]);
  const [viewData, setViewData] = useState(null);
  const [showSizeInput, setShowSizeInput] = useState(false); 

  // 🛠️ حزام أمان محلي لمعالجة مسارات الصور في حال عدم تمريرها من الأب
const safeGetFullUrl = (path) => {
  if (!path) return 'https://placehold.co/400?text=No+Image'; // صورة احتياطية
  if (path instanceof File) return URL.createObjectURL(path); // إذا كانت ملف مرفوع محلياً
  if (path.startsWith('http://') || path.startsWith('https://')) return path; // إذا كان رابط كامل
  
  // إذا كان مسار نسبي قادم من الباك إند (قم بتغيير المنفذ 8000 حسب مشروعك)
  const baseUrl = 'http://localhost:8000';
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`.replace(/\\/g, '/'); // تحويل أي مائل خلفي مسبب للمشاكل في ويندوز
};
  // حزام أمان للتنبيهات المحلية الخاصة بالنافذة المنبثقة
const [localToastState, setLocalToastState] = useState({ show: false, message: '', type: 'success' });

  // حزام أمان ذكي وموحد لاستدعاء الـ API والـ Toast والروابط بأمان
  const activeApi = catalogApi || fallbackCatalogApi;
  const triggerToast = (msg, type = "success") => {
    // تحديث الـ State المحلي أولاً لكي يقرأه السطر 334 المسبب للخطأ ويظهر في واجهة النافذة فوراً
    setLocalToastState({ show: true, message: msg, type });
    
    // إخفاء التنبيه المحلي تلقائياً بعد 3 ثوانٍ لمنع تعليق الواجهة
    setTimeout(() => {
      setLocalToastState({ show: false, message: '', type: 'success' });
    }, 3000);

    // حزام الأمان القديم الخاص بك لتبليغ الأب أو المكتبة الخارجية
    if (typeof showToast === "function") {
      showToast(msg, type);
    } else if (typeof toast !== "undefined" && toast[type]) {
      toast[type](msg);
    }
  };
  

  // ✅ تم إضافة setError هنا لربط أخطاء السيرفر بالحقول مباشرة
const { register, control, handleSubmit, reset, setValue, watch, setError, formState: { errors } } = useForm({
  resolver: zodResolver(productSchema),
  defaultValues: { variants: [], min_stock_threshold: 5 }
});

  const { fields: colorFields, append: appendColor, remove: removeColor } = useFieldArray({ control, name: "variants" });
  const selectedCatalogId = watch("catalog_id");
const currentSelectedCatalog = dbCatalogs?.find(c => String(c.id) === String(selectedCatalogId));

 

const handleDownloadQR = async (variantId) => {
  setIsDownloadingQr(variantId);
  try {
    // ✅ استخدام التنبيه المحمي لمنع الانهيار
    if (typeof triggerToast === "function") {
      triggerToast("جاري تحضير وتحميل ملصق الـ QR...", "success");
    }
    
    // ✅ الحل السحري للخطأ الثاني: استخدام activeApi لحماية الطلب في حال غياب الـ Prop الأساسي
    const apiToUse = catalogApi || activeApi;
    
    if (!apiToUse || typeof apiToUse.exportVariantQR !== "function") {
      throw new Error("API لملفات الـ QR غير متاح أو لم يتم تمريره بشكل صحيح");
    }

    const blob = await apiToUse.exportVariantQR(variantId);
    
    // معالجة الـ Blob للتأكد من سلامة ملف الـ PDF
    const fileBlob = blob instanceof Blob ? blob : new Blob([blob], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(fileBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `qr_variant_${variantId}.pdf`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    
    // ✅ استخدام التنبيه المحمي عند النجاح
    if (typeof triggerToast === "function") {
      triggerToast("تم تحميل ملصق الـ QR بنجاح", "success");
    }
  } catch (e) {
    console.error("QR Download Error:", e);
    // ✅ حزام أمان نهائي للتنبيه في حال الفشل
    if (typeof triggerToast === "function") {
      triggerToast("فشل تحميل الـ QR: تأكد من ربط الـ API بشكل صحيح", "error");
    } else {
      alert("فشل تحميل الـ QR: " + e.message);
    }
  } finally {
    setIsDownloadingQr(null);
  }
};

  const handleAddNewSizeToDB = async (sizeName) => {
    if (!sizeName.trim()) return;
    try {
      // الربط بالدالة الجديدة وتمرير الاسم مباشرة كمُعامل
      await catalogApi.createSize(sizeName); 
      showToast("تم إضافة المقاس الجديد لقاعدة البيانات بنجاح", "success");
      
      // 2. إعادة جلب المقاسات المحدثة لكي تظهر في القائمة فوراً
      const updatedSizes = await catalogApi.getSizeNames();
      setDbSizes(updatedSizes);
    } catch (e) {
      showToast("فشل إضافة المقاس الجديد، قد يكون مكرراً");
    }
  };

  useEffect(() => {
    if (open) {
      const loadData = async () => {
        setLoading(true);
        try {
          const [sizes, catalogs] = await Promise.all([
            activeApi.getSizeNames(), 
            activeApi.fetchCatalogs('active')
          ]);
          setDbSizes(sizes);
          setDbCatalogs(Array.isArray(catalogs) ? catalogs : (catalogs.results || []));

          if (productToEdit) {
            try {
              const data = await activeApi.getProductForEdit(productToEdit.id);
              setViewData(data);
              
              reset({
                id: data.id,
                name: data.name,
                catalog_id: String(data.catalog_id),
                selling_price: data.selling_price,
                cost_price: data.cost_price,
                min_stock_threshold: data.min_stock_threshold !== undefined ? data.min_stock_threshold : (data.min_stock !== undefined ? data.min_stock : 5),
                description: data.description,
                variants: data.colors?.map(c => ({
                  id: c.id, 
                  color_name: c.color_name,
                  color_image: c.color_image,
                  sizes: c.variants?.map(v => ({ 
                    id: v.id, 
                    size_id: v.size_id, 
                    size_label: v.size_name, 
                    quantity: v.quantity_available 
                  })) || []
                })) || []
              });
              
              if (typeof getFullUrl === "function") setImagePreview(getFullUrl(data.main_image));
              setIsViewMode(initialMode === 'view');
            } catch (error) {
              console.error("Error loading product for edit:", error);
            }
          } else {
            reset({ name: "", variants: [], min_stock_threshold: 5, description: "" });
            setImagePreview(null);
            setIsViewMode(false);
          }
        } catch (e) { 
          triggerToast("خطأ في تحميل البيانات", "error"); 
        } finally { 
          setLoading(false); 
        }
      };
      loadData();
    }
  }, [open, productToEdit, initialMode]); // إزالة الـ watch والـ reset لقطع الـ Loop نهائياً


  const onActualSubmit = async (data) => {
    setIsSaving(true);
    
    // 🛡️ حزام أمان داخلي فوري ومباشر يمنع الـ undefined نهائياً
    const apiToUse = catalogApi || fallbackCatalogApi;
    
    if (!apiToUse) {
      console.error("🚨 خطأ كارثي: لم يتم العثور على ملف الـ API (catalogApi) نهائياً!");
      triggerToast("فشل الاتصال بالسيرفر: ملف الـ API غير معرف", "error");
      setIsSaving(false);
      return;
    }
  
    try {
      if (data.id) {
        // --- أولاً: حالة التعديل الشامل ---
        const formData = new FormData();
        if (selectedFile) formData.append('image_file', selectedFile); 
  
        // نقرأ القيمة الطازجة مباشرة باستخدام watch لضمان التقاط التعديل الحالي من الواجهة
const freshMinStock = watch("min_stock_threshold") || 5;

Object.keys(data).forEach(key => {
  if (key !== 'variants' && key !== 'image_file' && key !== 'min_stock_threshold') {
    formData.append(key, data[key]);
  }
});

// نرسلها صراحة من المتغير الطازج لمنع أي كاش أو قيمة قديمة
formData.append('min_stock_threshold', String(freshMinStock));
formData.append('variants', JSON.stringify(data.variants));
  
        // 1. استدعاء الدالة من المتغير المحمي داخلياً apiToUse بدلاً من activeApi
        await apiToUse.updateProduct(data.id, formData);

// 2. المزامنة العميقة فوراً للألوان والمقاسات الفردية بالسيرفر لمنع أي تضارب بالمخزون
if (data.variants && data.variants.length > 0) {
  for (const variant of data.variants) {
    
    // 1️⃣ السطر الجديد: استخراج المعرف الصحيح للون (تجنباً للـ NaN)
    const rawColorId = variant.color_id || variant.color?.id || variant.id;
    const parsedColorId = parseInt(rawColorId, 10);

    // أ) تحديث بيانات اللون وصورته فورا إذا كان مسجلاً بالسيرفر ولديه معرف صالح
    if (rawColorId && !isNaN(parsedColorId)) {
      const actualFile = variant.color_image instanceof File ? variant.color_image : null;
      
      // 2️⃣ السطر الجديد: استدعاء التحديث والتقاط النتيجة مع حزام الأمان
      const colorResponse = await apiToUse.updateColor(parsedColorId, variant.color_name, actualFile);
      
      // إذا كان الباك إند يرجع رسالة خطأ صريحة في الـ data نقوم برميها يدوياً لتلتقطها الـ catch بالأسفل
      if (colorResponse && colorResponse.status === "error") {
        throw new Error(colorResponse.message || "فشل تحديث بيانات اللون");
      }
      
      // ب) تحديث كميات المقاسات التابعة لهذا اللون فوراً عبر دالة الـ Patch الجزئية لتعمل بالمخزون حالاً
      if (variant.sizes && variant.sizes.length > 0) {
        for (const sizeItem of variant.sizes) {
          if (sizeItem.id) { 
            const variantResponse = await apiToUse.updateVariantPartial(
              parseInt(sizeItem.id, 10), 
              Number(sizeItem.quantity || 0), 
              parseInt(freshMinStock, 10)
            );
            
            if (variantResponse && variantResponse.status === "error") {
              throw new Error(variantResponse.message || "فشل تحديث كمية المقاس");
            }
          }
        }
      }
    }
  }
}

      } else {
        // --- ثانياً: حالة إنشاء منتج جديد ---
        const productFormData = new FormData();
        if (selectedFile) {
          productFormData.append('image_file', selectedFile);
        }

        productFormData.append('name', data.name);
        productFormData.append('catalog_id', String(data.catalog_id));
        productFormData.append('selling_price', String(data.selling_price));
        productFormData.append('cost_price', String(data.cost_price || 0.0));
        productFormData.append('min_stock_threshold', String(data.min_stock_threshold || 5));
        
        if (data.description) {
          productFormData.append('description', data.description);
        }

        const productResponse = await catalogApi.createProduct(productFormData);
        const createdProductId = productResponse?.data?.id || productResponse?.id;

        if (!createdProductId) {
          throw new Error("فشل استخراج معرف المنتج المستلم من السيرفر");
        }

        if (data.variants && data.variants.length > 0) {
          for (const variant of data.variants) {
            const colorFormData = new FormData();
            colorFormData.append('product_id', String(createdProductId)); 
            colorFormData.append('color_name', variant.color_name);

            const actualColorFile = variant.color_image?.file || (Array.isArray(variant.color_image) ? variant.color_image[0] : variant.color_image);

if (actualColorFile) {
  colorFormData.append('image_file', actualColorFile); 
}

            const colorResponse = await catalogApi.addColor(colorFormData);
            const createdColorId = colorResponse?.data?.id || colorResponse?.id;

            if (createdColorId && variant.sizes && variant.sizes.length > 0) {
              const variantsArray = variant.sizes.map(s => ({
                size_id: Number(s.size_id), 
                qty: Number(s.quantity || 0),                   // 👈 تحويل الاسم لـ qty ليطابق السيرفر
                min_stock: Number(data.min_stock_threshold || 5) // 👈 تمرير حد الأمان المطلوب إجبارياً
              }));

              await catalogApi.createBatchVariants(createdColorId, variantsArray);
            }
          }
        }
      }

      alert("تم حفظ المنتج مع الصورة بنجاح وتحديث المخزون!");
      onSaveSuccess();
      onOpenChange(false);
    } catch (e) { 
      console.error("❌ خطأ تفصيلي من السيرفر:", e);
      
      let finalMessage = "حدث خطأ غير متوقع أثناء الحفظ";

      // قراءة استجابة السيرفر المخصصة التي أرسلتها في الباك إند
      if (e.response && e.response.data) {
        const errorData = e.response.data;

     // 1. إذا كان الخطأ نصاً مباشراً قادماً من الـ detail (مثل: "هذا الاسم موجود مسبقاً")
     if (typeof errorData.detail === "string") {
      finalMessage = errorData.detail;
      
      // أ) إذا كان الخطأ متعلقاً باسم المنتج، نربطه بالحقل
      if (finalMessage.includes("الاسم موجود مسبقاً") || finalMessage.includes("اسم المنتج")) {
        setError("name", { type: "server", message: finalMessage });
      }
      // ب) إذا كان الخطأ متعلقاً بالوان المنتج
      else if (finalMessage.includes("اللون") || finalMessage.includes("color")) {
        if (typeof showToast === "function") showToast(finalMessage, "error");
      }
      // ج) إذا كان الخطأ متعلقاً بالمقاسات أو الـ Batch Variants
      else if (finalMessage.includes("المقاس") || finalMessage.includes("الكمية") || finalMessage.includes("variant")) {
        if (typeof showToast === "function") showToast(finalMessage, "error");
      }
    } 
    // 2. إذا كان الخطأ مصفوفة Validation تلقائية من FastAPI Pydantic
    else if (Array.isArray(errorData.detail)) {
      const firstErr = errorData.detail[0];
      const fieldName = firstErr?.loc?.[firstErr.loc.length - 1] || "البيانات";
      finalMessage = `خطأ في المدخلات [${fieldName}]: ${firstErr?.msg}`;
      
      // ربط الأخطاء بكل الحقول تلقائياً لتظهر تحت الخانات
      errorData.detail.forEach(err => {
        const fName = err.loc[err.loc.length - 1];
        setError(fName, { type: "server", message: err.msg });
      });
    }
    // 3. أي صيغة أخرى احتياطية من الباك إند
    else if (errorData.message) {
      finalMessage = errorData.message;
    }
  } 
  // 4. إذا لم يكن هناك استجابة من السيرفر (خطأ شبكة مثلاً)
  else if (e.message) {
    finalMessage = e.message;
  }
      // إرسال الرسالة إلى الـ Toast الموجود في أعلى الملف الرئيسي ProductsPage
      alert("🚨 تنبيه من النظام: " + finalMessage);

    } finally { 
      setIsSaving(false); 
    }
  };
  // تأثير لمنع التمرير في الخلفية عند فتح النافذة المنبثقة
// تأثير لمنع التمرير في الخلفية عند فتح النافذة المنبثقة
useEffect(() => {
  if (open) {
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = 'unset';
  }
  // تنظيف التأثير عند تفكيك المكون (Unmount)
  return () => {
    document.body.style.overflow = 'unset';
  };
}, [open]);

if (!open) return null;

// 👇 هنا قمنا بفتح الـ return الكلية للمكون لكي يقرأ المتصفح تصميم الـ JSX الموجود أسفل هذا السطر فوراً


  
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center font-arabic" dir="rtl">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => onOpenChange(false)} />

      {localToastState?.show && (
  <div className={`fixed top-10 left-1/2 -translate-x-1/2 z-[110] px-6 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-in slide-in-from-top-5 ${localToastState.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'} text-white text-xs font-bold`}>
     {localToastState.type === 'success' ? <CheckCircle2 size={16}/> : <AlertCircle size={16}/>}
     {localToastState.message}
  </div>
)}

<div className={`relative bg-white rounded-[1.8rem] shadow-2xl transition-all duration-300 overflow-hidden ${isViewMode ? 'w-[95%] max-w-4xl h-[80vh]' : 'w-full max-w-sm h-auto max-h-[80vh] flex flex-col'}`}>
        
        {/* Header */}
        <div className="p-5 border-b border-slate-50 flex justify-between items-center bg-white sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#800000]/10 rounded-2xl flex items-center justify-center text-[#800000]">
              {isViewMode ? <Eye size={20}/> : <Edit3 size={20}/>}
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-800">{isViewMode ? "استعراض تفصيلي" : (productToEdit ? "تعديل المنتج" : "منتج جديد")}</h2>
              {isViewMode && <span className="text-[10px] text-slate-400 font-bold">{viewData?.code}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {productToEdit && (
               <button onClick={() => setIsViewMode(!isViewMode)} className="px-4 py-2 rounded-xl text-[10px] font-black border border-slate-100 hover:bg-slate-50 transition-colors flex items-center gap-2">
                 {isViewMode ? <><Edit3 size={14}/> تعديل المنتج</> : <><Eye size={14}/> وضع العرض</>}
               </button>
            )}
            <button onClick={() => onOpenChange(false)} className="p-2 hover:bg-slate-50 rounded-full text-slate-400"><X size={20} /></button>
          </div>
        </div>

        {loading ? (
          <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-[#800000]" /></div>
        ) : isViewMode && viewData ? (
          <div className="p-8 overflow-y-auto h-[calc(85vh-80px)] custom-scrollbar bg-white">
  
             <div className="flex flex-col md:flex-row-reverse gap-8 items-start">
               
               <div className="w-32 h-32 md:w-40 md:h-40 bg-slate-50 rounded-[2.5rem] border-2 border-slate-100 p-2 shrink-0 shadow-sm relative group overflow-hidden">
               <img 
  src={safeGetFullUrl(viewData.main_image)} 
  className="w-full h-full object-contain mix-blend-multiply group-hover:scale-110 transition-transform duration-500" 
  alt={viewData.name} 
/>
                 <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
               </div>

               <div className="flex-1 space-y-4 text-right w-full">
                 <div>
                   <h1 className="text-3xl font-black text-slate-900 tracking-tight">{viewData.name}</h1>
                 </div>

                 <div className="flex flex-wrap items-center gap-3">
                   <span className="bg-[#800000]/5 text-[#800000] text-[10px] px-3 py-1 rounded-full font-black border border-[#800000]/10">
                     الكتالوج: {viewData.catalog_name}
                   </span>
                   
                   <button 
                     onClick={() => {
                      navigator.clipboard.writeText(viewData.code);
showToast("تم نسخ الكود", "success");
                     }}
                     className="group flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-500 text-[10px] px-3 py-1 rounded-full font-bold transition-all active:scale-95"
                   >
                     <Copy size={12} className="group-hover:text-[#800000]" />
                     <span>كود المنتج: {viewData.code}</span>
                   </button>
                 </div>

                 <p className="text-sm text-slate-400 mt-2 leading-relaxed max-w-2xl">
                   {viewData.description || "لا يوجد وصف تفصيلي لهذا المنتج حالياً."}
                 </p>
           
                 <div className="grid grid-cols-3 gap-3 max-w-md">
                   <div className="bg-emerald-50/50 p-3 rounded-2xl border border-emerald-100/50">
                     <p className="text-[9px] font-black text-emerald-600 mb-1">المتوفر</p>
                     <p className="text-xl font-black text-slate-800">{viewData.total_available}</p>
                   </div>
                   <div className="bg-amber-50/50 p-3 rounded-2xl border border-amber-100/50">
                     <p className="text-[9px] font-black text-amber-600 mb-1">المحجوز</p>
                     <p className="text-xl font-black text-slate-800">{viewData.total_reserved}</p>
                   </div>
                   <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/50">
                     <p className="text-[9px] font-black text-slate-500 mb-1">المباع</p>
                     <p className="text-xl font-black text-slate-800">{viewData.total_sold}</p>
                   </div>
                 </div>
               </div>
             </div>
           
             <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
               <div className="bg-[#800000] p-6 rounded-[2.5rem] text-white flex justify-between items-center shadow-lg shadow-[#800000]/20">
                 <div>
                   <span className="text-[10px] font-bold opacity-80 block mb-1">سعر البيع النهائي</span>
                   <span className="text-2xl font-black">{viewData.selling_price} <small className="text-xs">د.ل</small></span>
                 </div>
                 <DollarSign size={32} className="opacity-20" />
               </div>
               
               <div className="bg-slate-900 p-6 rounded-[2.5rem] text-white flex justify-between items-center shadow-lg shadow-slate-900/20">
                 <div>
                   <span className="text-[10px] font-bold opacity-80 block mb-1">تكلفة الشراء (الوحدة)</span>
                   <span className="text-2xl font-black">{viewData.cost_price} <small className="text-xs">د.ل</small></span>
                 </div>
                 <TrendingUp size={32} className="opacity-20" />
               </div>
             </div>
           
             <div className="mt-4 flex items-center gap-3 bg-amber-50 p-4 rounded-2xl border border-amber-100">
               <AlertCircle size={18} className="text-amber-600" />
               <span className="text-xs font-bold text-amber-800">سيقوم النظام بتنبيهك عندما يصل المخزون إلى {viewData.min_stock_threshold} قطع أو أقل.</span>
             </div>
           
             <div className="mt-12">
               <div className="flex items-center gap-4 mb-8">
                 <h3 className="text-sm font-black text-slate-800 whitespace-nowrap">تفاصيل الألوان والمقاسات</h3>
                 <div className="h-[1px] w-full bg-gradient-to-l from-slate-100 to-transparent"></div>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
  {viewData.colors?.map((color) => (
    <div 
      key={color.id} 
      className="group bg-white border border-slate-100 rounded-[2rem] p-5 flex flex-col hover:border-[#800000]/20 hover:shadow-xl hover:shadow-slate-200/50 transition-all duration-300"
    >
      <div className="flex items-center justify-between gap-4 pb-4">
        <div className="w-14 h-14 rounded-xl bg-slate-50 border border-slate-100 overflow-hidden shrink-0 shadow-inner">
        <img 
  src={safeGetFullUrl(color.color_image)} 
  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
  alt={color.color_name} 
  onError={(e) => { e.target.src = 'https://placehold.co/100?text=No+Image'; }} 
/>
        </div>
        
        <div className="min-w-0 flex-1">
          <h4 className="text-base font-black text-slate-800 truncate mb-1" title={color.color_name}>
            {color.color_name}
          </h4>
          <span className="text-[10px] bg-slate-100 px-2.5 py-0.5 rounded-md text-slate-500 font-bold uppercase tracking-tighter">
            REF: {color.id}
          </span>
        </div>
      </div>

      <div className="border-t border-slate-100 w-full mb-4" />

      <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
        {color.variants?.map((v) => (
          <div 
            key={v.id} 
            className="flex items-center justify-between bg-slate-50/80 p-3 rounded-xl border border-white hover:bg-white hover:border-slate-100 transition-all group/v gap-4"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <span className={`w-2 h-2 rounded-full shrink-0 ${v.quantity_available > 0 ? 'bg-emerald-500' : 'bg-rose-400'}`} />
              <span className="min-w-[4.5rem] px-2.5 py-1 flex items-center justify-center bg-white rounded-lg text-[12px] font-black text-[#800000] border border-slate-200 shadow-sm text-center whitespace-nowrap shrink-0">
                {v.size_name}
              </span>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[11px] font-medium text-slate-400 whitespace-nowrap">الكمية:</span>
                <span className="text-[13px] font-black text-slate-700 truncate">
                  {v.quantity_available} <span className="text-[11px] font-normal text-slate-500">قطعة</span>
                </span>
              </div>
            </div>
            
            <button 
              type="button"
              disabled={isDownloadingQr === v.id}
              onClick={() => handleDownloadQR(v.id)}
              className="flex items-center gap-2 bg-white px-2.5 py-1.5 rounded-xl border border-slate-100 shadow-sm opacity-70 group-hover/v:opacity-100 transition-all hover:bg-[#800000] hover:text-white hover:border-[#800000] disabled:opacity-30 shrink-0"
            >
              {isDownloadingQr === v.id ? <Loader2 size={14} className="animate-spin" /> : <QrCode size={14} />}
              <span className="text-[10px] font-mono font-bold uppercase tracking-tighter">{v.id}</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  ))}
</div>
             </div>
           </div>
        ) : (
          <form onSubmit={handleSubmit(onActualSubmit)} className="p-6 overflow-y-auto h-[calc(90vh-100px)] custom-scrollbar space-y-4">
  {/* تحميل الصورة الرئيسية */}
  <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-3xl border border-dashed border-slate-200">
    <div className="w-16 h-16 bg-white rounded-2xl border flex items-center justify-center overflow-hidden">
      {imagePreview ? <img src={imagePreview} className="w-full h-full object-cover" alt="" /> : <ImageIcon className="text-slate-200" />}
    </div>
    <label className="text-[10px] font-black text-[#800000] bg-white px-4 py-2 rounded-xl shadow-sm border cursor-pointer hover:bg-slate-50 transition-colors">
    تحميل الصورة الرئيسية للمنتج
    
    {/*  التعديل الصحيح: تم إغلاق التاج وإضافة حدث التغيير لقراءة الصورة */}
    <input 
      type="file" 
      accept="image/*" 
      hidden 
      onChange={(e) => {
        const file = e.target.files?.[0];
        if(file) {
          setSelectedFile(file);
          setImagePreview(URL.createObjectURL(file));
        }
      }} 
    />
  </label>
  </div>

  <div className="space-y-3">
    {/* حقل اسم المنتج المتطور */}
    <div className="grid grid-cols-1 gap-3">
      <div className="space-y-1">
        <label className="text-[10px] font-bold text-slate-600 mr-2">اسم المنتج <span className="text-red-500">*</span></label>
        <input 
          {...register("name", { required: "حقل اسم المنتج مطلوب ولا يمكن تركه فارغاً" })} 
          placeholder="اسم المنتج" 
          className={`w-full p-3 rounded-2xl border text-xs font-bold outline-none transition-all duration-200 ${
            errors.name 
              ? "border-red-500 bg-red-50/30 focus:border-red-500 focus:ring-1 focus:ring-red-200" 
              : "border-slate-100 bg-slate-50 focus:border-[#800000]"
          }`} 
        />
        {errors.name && (
          <p className="text-red-600 text-[10px] font-bold mt-1 mr-2 flex items-center gap-1 animate-pulse">
            ⚠️ {errors.name.message}
          </p>
        )}
      </div>
    </div>
    
    {/* حقل قائمة الكاتالوج الاحترافية المصححة مع فحص الأخطاء والتلوين */}
    <div className="space-y-1 relative">
      <label className="text-[10px] font-bold text-slate-600 mr-2">الكتالوج القسم الرئيسي <span className="text-red-500">*</span></label>
      
      <details className="w-full group">
        <summary 
          className={`w-full p-3 pr-4 pl-10 rounded-2xl border text-xs font-bold text-slate-700 list-none cursor-pointer flex items-center justify-between hover:bg-slate-100/70 transition-all select-none relative focus:outline-none ${
            errors.catalog_id 
              ? "border-red-500 bg-red-50/30 focus:border-red-500" 
              : "border-slate-100 bg-slate-50 focus:border-[#800000]"
          }`}
        >
          <span className={`text-right ${currentSelectedCatalog ? "text-slate-800 font-black" : "text-slate-400"}`}>
            {currentSelectedCatalog ? currentSelectedCatalog.name : "غير محدد"}
          </span>
          <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none">
            <ChevronDown size={14} className="text-slate-500 transition-transform duration-200 group-open:rotate-180" />
          </div>
        </summary>
        
        <div className="absolute top-full left-0 right-0 mt-1 w-full bg-white border border-slate-100 rounded-3xl shadow-xl z-50 overflow-hidden animate-in slide-in-from-top-2 duration-150">
          <ul className="p-1.5 space-y-1 max-h-[174px] overflow-y-auto overflow-x-hidden custom-select-scroll">
            <li>
              <button
                type="button"
                className={`w-full text-right px-4 py-2.5 text-xs font-bold transition-colors rounded-2xl ${
                  !selectedCatalogId ? "bg-amber-50 text-[#800000]" : "text-slate-500 hover:bg-slate-50"
                }`}
                onClick={(e) => {
                  setValue("catalog_id", "", { shouldValidate: true });
                  e.currentTarget.closest('details').removeAttribute('open');
                }}
              >
                غير محدد
              </button>
            </li>
            
            {dbCatalogs.map((c) => {
              const isSelected = String(c.id) === String(selectedCatalogId);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`w-full text-right px-4 py-2.5 text-xs font-bold transition-colors rounded-2xl flex items-center justify-between ${
                      isSelected ? "bg-red-50 text-[#800000] font-black" : "text-slate-600 hover:bg-slate-50"
                    }`}
                    onClick={(e) => {
                      setValue("catalog_id", String(c.id), { shouldValidate: true });
                      e.currentTarget.closest('details').removeAttribute('open');
                    }}
                  >
                    <span>{c.name}</span>
                    {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-[#800000]" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </details>

      {/* الحقل المخفي لربط البيانات بـ react-hook-form مع قواعد التحقق الفوري */}
      <input 
        type="hidden" 
        {...register("catalog_id", { required: "يرجى اختيار الكتالوج المناسب للمنتج" })} 
      />

      {errors.catalog_id && (
        <p className="text-red-600 text-[10px] font-bold mt-1 mr-2 flex items-center gap-1 animate-pulse">
          ⚠️ {errors.catalog_id.message}
        </p>
      )}
    </div>

    {/* حقل الوصف الإضافي للمنتج */}
    <div className="space-y-1">
      <label className="text-[10px] font-bold text-slate-600 mr-2">الوصف التفصيلي للمنتج</label>
      <textarea rows={2} placeholder="اكتب تفاصيل المنتجة ..." {...register("description")} className="w-full p-3 rounded-2xl border border-slate-100 bg-slate-50 text-xs font-bold outline-none focus:border-[#800000] resize-none" />
    </div>
  </div>
    
  {/* قسم أسعار المنتجات والحد الأدنى */}
  <div className="grid grid-cols-3 gap-5">
    {/* سعر البيع الإجباري مع التحقق الاحترافي */}
    <div className="space-y-1">
      <label className="text-[10px] font-bold text-slate-600 text-center block">سعر البيع <span className="text-red-500">*</span></label>
      <input 
        type="number" 
        step="0.01" 
        placeholder="0 د.ل" 
        {...register("selling_price", { 
          required: "مطلوب",
          min: { value: 0.01, message: "يجب أن يكون أكبر من 0" }
        })} 
        className={`w-full p-5 rounded-2xl border text-center text-xs font-bold outline-none transition-all duration-200 ${
          errors.selling_price 
            ? "border-red-500 bg-red-50/30 focus:border-red-500 focus:ring-1 focus:ring-red-200" 
            : "border-slate-100 bg-slate-50 focus:border-[#800000]"
        }`} 
      />
      {errors.selling_price && (
        <p className="text-red-600 text-[9px] font-bold mt-1 text-center animate-pulse">
          ⚠️ {errors.selling_price.message}
        </p>
      )}
    </div>

    {/* تكلفة الشراء */}
    <div className="space-y-1">
      <label className="text-[10px] font-bold text-slate-600 text-center block">تكلفة الشراء</label>
      <input type="number" step="0.01" placeholder="0 د.ل" {...register("cost_price")} className="w-full p-5 rounded-2xl border border-slate-100 bg-slate-50 text-center text-xs font-bold outline-none focus:border-[#800000]" />
    </div>

    {/* الحد الأدنى للتنبيه */}
    <div className="space-y-1">
      <label className="text-[10px] font-bold text-slate-600 text-center block">الحد الأدنى للتنبيه</label>
      <input 
  type="number" 
  placeholder="5 قطع" 
  {...register("min_stock_threshold", { valueAsNumber: true })} 
  className="w-full p-5 rounded-2xl border border-slate-100 bg-slate-50 text-center text-xs font-bold outline-none focus:border-[#800000]" 
/>
    </div>
  </div>


             {/* خط فاصل احترافي مريح للعين يفصل البيانات المضافة الأساسية */}
             <div className="relative py-3">
               <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-300"></div></div>
               <div className="relative flex justify-center text-[10px] font-black uppercase"><span className="bg-white px-3 text-slate-600">إدارة المقاسات والألوان للمنتج</span></div>
             </div>

             <div className="pt-2">
                {/* حقل إضافة لون جديد مع الزر باللون البرغندي العتيق */}
                <div className="flex items-center gap-2 mb-1">
                   <input 
                    id="newColor" 
                    className="flex-1 p-3 rounded-2xl border border-slate-100 bg-slate-50 text-xs font-bold outline-none focus:border-[#800000]" 
                    placeholder="اكتب اسم اللون هنا... (مثال: برغندي)" 
                    onKeyDown={(e) => {
                      if(e.key === 'Enter') {
                        e.preventDefault();
                        if(e.target.value) { appendColor({ color_name: e.target.value, sizes: [] }); e.target.value = ""; }
                      }
                    }}
                   />
                   <button 
                     type="button" 
                     onClick={() => {
                       const inp = document.getElementById('newColor');
                       if(inp.value) { appendColor({ color_name: inp.value, sizes: [] }); inp.value = ""; }
                     }} 
                     className="bg-[#800000] hover:bg-[#660000] text-white p-3 rounded-2xl transition-colors shadow-sm"
                   >
                     <Plus size={18}/>
                   </button>
                </div>

                {/* نص تفاعلي لفتح حقل إنشاء مقاس جديد في قاعدة البيانات */}
<div className="px-2 mb-3">
  <button 
    type="button" 
    onClick={() => setShowSizeInput(!showSizeInput)}
    className="text-[11px] font-black text-[#800000] hover:underline flex items-center gap-1 transition-all"
  >
    <Plus size={12}/> اضغط هنا لإنشاء مقاس جديد غير موجود 
  </button>

  {showSizeInput && (
    <div className="mt-2 p-2 bg-slate-50 border border-slate-100 rounded-2xl animate-in fade-in duration-200 flex items-center gap-2">
      <input 
        id="dbNewSizeName"
        type="text"
        placeholder="مثال : سنة  " 
        className="flex-1 p-2 rounded-xl border border-slate-200 bg-white text-xs font-bold outline-none focus:border-[#800000]"
        onKeyDown={(e) => {
          if(e.key === 'Enter') {
            e.preventDefault();
            handleAddNewSizeToDB(e.target.value);
            e.target.value = "";
            setShowSizeInput(false);
          }
        }}
      />
      <button
        type="button"
        onClick={() => {
          const inp = document.getElementById('dbNewSizeName');
          if(inp && inp.value) {
            handleAddNewSizeToDB(inp.value);
            inp.value = "";
            setShowSizeInput(false);
          }
        }}
        className="bg-[#800000] text-white px-3 py-2 rounded-xl text-[10px] font-black hover:bg-[#660000] transition-colors"
      >
        حفظ بالمشروع
      </button>
    </div>
  )}
</div>

                {/* قائمة عرض بطاقات الألوان المحسنة كلياً مرنة وعصرية */}
         {/* قائمة عرض بطاقات الألوان المحسنة كلياً مرنة وعصرية */}
<div className="space-y-2 mt-2">
  {colorFields.map((field, index) => (
    <VariantCard
      key={field.id}
      control={control}
      register={register}
      setValue={setValue}
      watch={watch} // 👈 هذا السطر يضمن توصيل دالة المراقبة للكارت
      colorIndex={index}
      colorItem={field}
      removeColor={removeColor}
      dbSizes={dbSizes}
      errors={errors}
      showToast={showToast}
      catalogApi={activeApi}
    />
  ))}
</div>
             </div>

             <div className="relative bg-white pt-2 pb-1 flex gap-2 w-full">
                <button type="submit" disabled={isSaving} className="flex-1 bg-[#800000] hover:bg-[#660000] text-white p-4 rounded-[1.5rem] font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#800000]/20 transition-all">
                   {isSaving ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>}
                   {productToEdit ? "حفظ التغييرات" : "إضافة المنتج "}
                </button>
             </div>
          </form>
        )}
      </div>
    </div>
  );
};


const VariantCard = ({ control, register, setValue, watch, colorIndex, colorItem, removeColor, dbSizes = [], errors, showToast, catalogApi, getFullUrl }) => {
  const fileInputRef = useRef(null);
  
  // حزام أمان ذكي وموحد لاستدعاء الـ API والـ Toast
  const activeApi = catalogApi;
  const triggerToast = typeof showToast === "function" ? showToast : (msg) => alert(msg);
  
  // دالة احتياطية لقراءة مسار الصور بشكل سليم داخل الكارت
  const safeGetFullUrl = typeof getFullUrl === "function" ? getFullUrl : (path) => {
    if (!path) return "";
    if (path instanceof File) return URL.createObjectURL(path);
    return `http://localhost:8000${path.startsWith('/') ? '' : '/'}${path.replace(/\\/g, '/')}`;
  };
  // State للتحكم في إخفاء وإظهار المقاسات لكل لون بشكل مستقل
  const [isCollapsed, setIsCollapsed] = useState(false);
  
  const { fields: sizeFields, append: appendSize, remove: removeSize } = useFieldArray({
    control, name: `variants.${colorIndex}.sizes`
  });

  const watchedColorImage = useWatch({
    control,
    name: `variants.${colorIndex}.color_image`,
    
  });

  return (
    <div className="border border-slate-200/60 rounded-[1.2rem] p-3 bg-white mb-2 shadow-sm transition-all duration-300 relative group">
      
      {/* زر حذف اللون بالكامل في الزاوية العليا اليسرى (أقصى اليسار) */}
      <button 
        type="button" 
        onClick={() => removeColor(colorIndex)} 
        className="absolute top-2 left-2 p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all z-10"
        title="حذف هذا اللون بالكامل"
      >
        <X size={14} strokeWidth={3} />
      </button>

      {/* الرأس: معلومات اللون والتحكم */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-50 pl-6">
        
        {/* معلومات اللون + زر الإخفاء والإظهار */}
        <div className="flex items-center gap-2">
          {/* زر السهم لإخفاء وإظهار المقاسات */}
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 text-slate-400 hover:text-[#800000] hover:bg-slate-50 rounded-lg transition-colors"
            title={isCollapsed ? "إظهار المقاسات" : "إخفاء المقاسات"}
          >
            <ChevronDown 
              size={14} 
              className={`transform transition-transform duration-300 ${isCollapsed ? 'rotate-180' : 'rotate-0'}`} 
            />
          </button>

          {/* صورة اللون */}
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="w-9 h-9 rounded-lg border-2 border-dashed border-slate-200 overflow-hidden bg-slate-50 flex items-center justify-center cursor-pointer hover:border-[#800000] transition-colors relative group/img shrink-0"
            title="انقر لرفع صورة هذا اللون"
          >
            {/* صورة اللون مع المعاينة الفورية الذكية */}
            {(watchedColorImage || colorItem?.color_image) ? (
              <img 
                src={
                  (watchedColorImage || colorItem?.color_image) instanceof File 
                  ? URL.createObjectURL(watchedColorImage || colorItem?.color_image)
                  : safeGetFullUrl(watchedColorImage || colorItem?.color_image)
                } 
                className="w-full h-full object-cover" 
                alt="color" 
              />
            ) : (
              <Upload size={12} className="text-slate-400 group-hover/img:text-[#800000] transition-colors"/>
            )}
<input 
type="file" 
ref={fileInputRef} 
className="hidden" 
accept="image/*" 
onChange={(e) => {
  const file = e.target.files?.[0];
  
  if (!file) return;

  // 1️⃣ تحديث الملف داخل نظام الـ Form لتلتقطه دالة الحفظ النهائي عند الضغط على الزر
  setValue(`variants.${colorIndex}.color_image`, file, { 
    shouldValidate: true, 
    shouldDirty: true 
  });

  // 2️⃣ إنشاء رابط معاينة وهمي (Blob) وتخزينه في الـ Form لعرض الصورة فوراً في الواجهة أمام المستخدم كمعاينة
  const previewUrl = URL.createObjectURL(file);
  setValue(`variants.${colorIndex}.preview_url`, previewUrl);

  // 3️⃣ كتم أي رسائل تأكيد مزعجة؛ فالعملية الآن محلية بالكامل وآمنة 🚀
}} 
/>
          </div>
          
          <div className="flex flex-col gap-0.5">
          <input
  type="text"
  {...register(`variants.${colorIndex}.color_name`)}
  className="text-[11px] font-black text-slate-700 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-[#800000] focus:bg-slate-50 px-1 py-0.5 rounded outline-none transition-all w-32"
  placeholder="اسم اللون"
  // 🚀 تم إزالة حدث الـ onBlur والاتصال المباشر بالسيرفر نهائياً ليعمل الزر الرئيسي فقط
/>
<span className="text-[8px] text-slate-400 font-bold px-1">انقر لتعديل الاسم أو الصورة</span>
</div>
        </div>

        {/* قائمة المقاسات المخصصة الدائرية - تفتح لأسفل دائماً */}
<div className="pr-7 w-full flex justify-start relative">
<details className="w-full max-w-[150px] group">
  <summary className="w-full p-2 pr-4 pl-8 rounded-full border border-slate-200 bg-slate-50 text-[10px] font-black text-[#800000] list-none cursor-pointer flex items-center justify-between hover:bg-slate-100 hover:border-[#800000]/30 transition-all select-none relative">
    <span>+ إضافة مقاس للون</span>
    <ChevronDown size={10} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#800000] transition-transform duration-200 group-open:rotate-180" />
  </summary>
  
  {/* القائمة المنسدلة لأسفل بقوة الـ z-index والحواف الدائرية المحمية */}
  <div className="absolute top-full right-7 mt-1 w-full max-w-[150px] bg-white border border-slate-150 rounded-2xl shadow-xl z-50 max-h-[140px] overflow-y-auto custom-scrollbar animate-in slide-in-from-top-2 duration-150">
    {dbSizes.map(s => (
      <button
        key={s.id}
        type="button"
        className="w-full text-right px-4 py-2 text-[10px] font-bold text-slate-600 hover:bg-[#800000]/5 hover:text-[#800000] block transition-colors first:rounded-t-2xl last:rounded-b-2xl"
        onClick={(e) => {
          const currentSizes = sizeFields || [];
          if(!currentSizes.some(size => String(size.size_id) === String(s.id))) {
            appendSize({ size_id: s.id, size_label: s.name, quantity: 0 });
            setIsCollapsed(false);
          } else {
            triggerToast("المقاس مضاف مسبقاً لهذا اللون", "error");
          }
          // إغلاق القائمة بعد الاختيار تلقائياً
          e.currentTarget.closest('details').removeAttribute('open');
        }}
      >
        {s.name}
      </button>
    ))}
  </div>
</details>
</div>
      </div>

      {/* شبكة عرض المقاسات - تختفي وتظهر بناءً على حالة الـ collapse والـ animation */}
      <div className={`transition-all duration-300 overflow-hidden ${isCollapsed ? 'max-h-0 opacity-0 mt-0' : 'max-h-[500px] opacity-100 mt-1'}`}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {sizeFields.map((s, si) => (
            <div key={s.id} className="bg-slate-50/80 p-1 px-2 rounded-lg border border-slate-100 relative group/size flex flex-col items-center justify-center transition-all focus-within:border-[#800000]/30 focus-within:bg-white">
              <span className="block text-[8px] font-black text-slate-400 uppercase mb-0.5">{s.size_label}</span>
              <div className="flex items-center justify-center gap-1 w-full">
                <input 
                  type="number" 
                  min="0"
                  placeholder="0"
                  {...register(`variants.${colorIndex}.sizes.${si}.quantity`)} 
                  className="w-full bg-transparent text-center text-[11px] font-black outline-none text-slate-800" 
                />
                <span className="text-[8px] font-bold text-slate-400 shrink-0">قطعة</span>
              </div>
              
              {/* زر حذف المقاس (X الدائري الصغير يظهر عند الهوفر فوق المربع) */}
              <button 
                type="button" 
                onClick={() => removeSize(si)} 
                className="absolute -top-1 -right-1 hidden group-hover/size:flex items-center justify-center w-4 h-4 bg-white shadow-sm rounded-full text-red-500 border border-slate-100 hover:bg-red-50 transition-colors"
              >
                <X size={8} strokeWidth={3}/>
              </button>
            </div>
          ))}
          {sizeFields.length === 0 && (
            <div className="col-span-full py-1 text-center text-[9px] font-medium text-slate-400 italic">
              اختر مقاساً من القائمة أعلاه لتحديده لهذا اللون.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


export default ProductFormDialog;