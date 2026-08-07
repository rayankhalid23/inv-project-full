import React, { useState } from 'react';
import { MoreVertical, Package, Copy, Check, Download, Edit2, Trash2, Tag, Eye, Loader2, AlertCircle } from 'lucide-react';
import ProductFormDialog from "./ProductFormDialog";
import { catalogApi } from "../../../api/catalogApi"; 

const ProductCard = ({ product, onEdit, onDelete, onDownloadQR, onEditSuccess, canManage: passedCanManage }) => {
  const [copied, setCopied] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false); 
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null); 
  const [successMessage, setSuccessMessage] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false); // حالة رسالة التأكيد المخصصة
  
  // حزام الأمان: إذا مرر canManage من الأب نستخدمه، وإلا نقرأ role_id من localStorage
  const isManager = passedCanManage !== undefined
    ? passedCanManage
    : Number(JSON.parse(localStorage.getItem('user') || '{}')?.role_id ?? localStorage.getItem('role_id') ?? 3) !== 3;
  const BASE_URL = 'http://127.0.0.1:8000';

  // دالة مساعدة سريعة لتركيب الرابط وكسر كاش المتصفح فوراً عند الحفظ
  const getCleanUrl = (urlPath) => {
    if (!urlPath) return null;
    if (urlPath.startsWith('http://') || urlPath.startsWith('https://')) return `${urlPath}?t=${new Date().getTime()}`;
    const cleanedPath = urlPath.startsWith('/') ? urlPath : `/${urlPath}`;
    return `${BASE_URL}${cleanedPath.replace(/\\/g, '/')}?t=${new Date().getTime()}`;
  };

  const imageUrl = getCleanUrl(product.main_image);

  const handleCopy = (e, text) => {
    e.stopPropagation(); 
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadQR = async (e) => {
    e.stopPropagation();
    setShowMenu(false);
    try {
        if (onDownloadQR) {
            onDownloadQR(product);
        } else {
            const response = await catalogApi.getProductQR(product.id);
            const blob = new Blob([response.data], { type: 'image/png' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `QR-${product.code}.png`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        }
    } catch (error) {
        setErrorMessage("فشل تحميل رمز QR الخاص بالمنتج");
        setTimeout(() => setErrorMessage(null), 4000);
    }
  };

  const processDelete = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setShowConfirm(false); // إخفاء نافذة التأكيد فور البدء

    try {
      setIsDeleting(true);
      
      // 1. طلب الحذف من السيرفر
      await catalogApi.deleteFullProduct(product.id);
      
      setSuccessMessage(`تم حذف "${product.name}" بنجاح`);
      if (onDelete) {
        onDelete(product.id); 
      }
      
      // 2. إخفاء مؤشر التحميل فوراً لتجنب الحالة اللانهائية
      setIsDeleting(false);
      setTimeout(() => setSuccessMessage(null), 3000);

    } catch (error) {
      setIsDeleting(false); 
      const msg = error.response?.data?.detail || "عذراً، فشل حذف المنتج من النظام";
      setErrorMessage(msg);
      setTimeout(() => setErrorMessage(null), 4500);
    }
  };

  return (
    <>
      {/* 🟢 رسالة النجاح الحديثة (Toast) */}
      {successMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[10005] bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 text-[11px] font-bold animate-in slide-in-from-top duration-300 pointer-events-none border border-emerald-500/20 font-arabic">
          <Check size={14} strokeWidth={3} className="shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* 🔴 رسالة الخطأ العائمة (Toast) */}
      {errorMessage && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] w-full max-w-md px-4 animate-in fade-in slide-in-from-top-5 duration-300" dir="rtl">
          <div className="bg-white/95 backdrop-blur-md border-r-4 border-red-500 shadow-2xl border border-slate-100 p-4 rounded-2xl flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center text-red-500 shrink-0">
              <AlertCircle size={20} />
            </div>
            <div className="flex-1 text-right">
              <h4 className="text-xs font-black text-slate-800 font-arabic">تنبيــه فني</h4>
              <p className="text-[11px] font-bold text-slate-500 font-arabic">{errorMessage}</p>
            </div>
          </div>
        </div>
      )}
      


      {/* 🛠 نافذة التأكيد المخصصة */}
      {showConfirm && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowConfirm(false)} />
          <div className="relative bg-white rounded-[2rem] p-6 w-full max-w-sm shadow-2xl animate-in zoom-in duration-200 text-center font-arabic">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Trash2 size={32} />
            </div>
            <h3 className="text-lg font-black text-slate-800 mb-2">تأكيد الحذف</h3>
            <p className="text-sm text-slate-500 mb-6 font-bold">هل أنت متأكد من حذف "{product.name}"؟ لا يمكن التراجع عن هذه الخطوة.</p>
            <div className="flex gap-3">
              <button onClick={processDelete} className="flex-1 bg-red-500 hover:bg-red-600 text-white py-3 rounded-xl font-bold transition-colors">حذف الآن</button>
              <button onClick={() => setShowConfirm(false)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 py-3 rounded-xl font-bold transition-colors">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      <div 
        onClick={() => !isDeleting && setIsDetailsOpen(true)} 
        className={`group relative bg-white rounded-[2rem] border border-slate-100 p-5 shadow-sm hover:shadow-xl hover:border-[#800000]/10 transition-all duration-300 font-arabic cursor-pointer ${isDeleting ? 'opacity-50 pointer-events-none' : ''}`} 
        dir="rtl"
      >
        {isDeleting && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/40 rounded-[2rem] backdrop-blur-[1px]">
            <Loader2 className="w-8 h-8 text-[#800000] animate-spin" />
          </div>
        )}

        <div className="flex items-start gap-4">
          <div className="relative flex-shrink-0">
            {product.main_image ? (
              <img 
                src={imageUrl} 
                alt={product.name} 
                className="w-20 h-20 md:w-24 md:h-24 rounded-[1.5rem] object-cover border border-slate-50 shadow-inner"
              />
            ) : (
              <div className="w-20 h-20 md:w-24 md:h-24 bg-slate-50 rounded-[1.5rem] flex flex-col items-center justify-center text-slate-300 border border-dashed border-slate-200">
                <Package size={28} strokeWidth={1.5} />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 flex flex-col pt-1">
            <h3 className="font-black text-slate-800 text-base leading-tight truncate mb-2 group-hover:text-[#800000] transition-colors">
              {product.name}
            </h3>
            
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex items-center gap-1 px-1.5 py-0.5 bg-slate-50 rounded-lg border border-slate-100 text-slate-500 min-w-0 max-w-full shrink-0">
                <Tag size={10} className="text-[#800000] shrink-0" />
                <span className="text-[9px] sm:text-[10px] md:text-xs font-mono font-bold tracking-tight whitespace-nowrap break-all">
                  {product.code}
                </span>
              </div>
              <button onClick={(e) => handleCopy(e, product.code)} className="p-1.5 hover:bg-slate-100 rounded-md transition-colors">
                {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} className="text-slate-300" />}
              </button>
            </div>
          </div>

          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowMenu(!showMenu)} className="p-2 hover:bg-slate-50 rounded-xl text-slate-400 hover:text-slate-600 transition-all">
              <MoreVertical size={20} />
            </button>

            {showMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)}></div>
                <div className="absolute left-0 top-12 w-48 bg-white border border-slate-100 rounded-2xl shadow-2xl z-20 py-2 animate-in zoom-in duration-150">
                  <button onClick={() => { setIsDetailsOpen(true); setShowMenu(false); }} className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors">
                      عرض التفاصيل <Eye size={14} className="text-blue-500" />
                  </button>
                  
                  <button onClick={handleDownloadQR} className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors">
                      تحميل رمز QR <Download size={14} className="text-[#800000]" />
                  </button>
                  {isManager && (
                  <button onClick={() => { onEdit(product); setShowMenu(false); }} className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors">
                      تعديل <Edit2 size={14} className="text-amber-500" />
                  </button>
                  )}
                  <div className="h-px bg-slate-50 mx-2 my-1" />
                  {isManager && (
                  <button onClick={() => { setShowConfirm(true); setShowMenu(false); }} className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-bold text-red-500 hover:bg-red-50 transition-colors">
                      حذف نهائي <Trash2 size={14} />
                  </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-10">
          <div className="flex flex-col items-center p-2 rounded-2xl bg-blue-50/30 border border-blue-100/10">
            <span className="text-[9px] font-bold text-blue-400 mb-1">متوفر</span>
            <span className="text-blue-700 text-sm font-black">{product.total_available || 0}</span>
          </div>
          <div className="flex flex-col items-center p-2 rounded-2xl bg-amber-50/30 border border-amber-100/10">
            <span className="text-[9px] font-bold text-amber-400 mb-1">محجوز</span>
            <span className="text-amber-700 text-sm font-black">{product.total_reserved || 0}</span>
          </div>
          <div className="flex flex-col items-center p-2 rounded-2xl bg-emerald-50/30 border border-emerald-100/10">
            <span className="text-[9px] font-bold text-emerald-400 mb-1">مباع</span>
            <span className="text-emerald-700 text-sm font-black">{product.total_sold || 0}</span>
          </div>
        </div>
      </div>

      <ProductFormDialog 
        open={isDetailsOpen} 
        onOpenChange={setIsDetailsOpen} 
        productToEdit={product}
        initialMode="view"
        onSaveSuccess={() => {
          setIsDetailsOpen(false);
          if (onEditSuccess) onEditSuccess();
        }}
      />
    </>
  );
};

export default ProductCard;