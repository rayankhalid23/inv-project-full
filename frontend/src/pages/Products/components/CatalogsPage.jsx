import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  LayoutGrid, MoreVertical, Loader2, Plus, Search, 
  FileDown, Edit2, Power, X, CheckCircle2, AlertCircle,
  ChevronLeft, Calendar, FolderOpen, QrCode, SlidersHorizontal, ChevronDown
} from 'lucide-react';
import { catalogApi } from "../../../api/catalogApi";
import ProductCard from "./ProductCard"; 
import { saveOfflineAction } from "../../../utils/idbStorage";
import { isNetworkError } from "../../../utils/netErrors"; 

// حجم صفحة نتائج البحث/الفلترة — يطابق الحد الافتراضي في /products/dashboard
const SEARCH_PAGE_SIZE = 20;



const CatalogsPage = ({ 
  catalogs = [], 
  loading, 
  onRefresh, 
  onSelect, 
  onAddProduct, 
  onFilteredProductIdsChange, 
  isSearching,
  onEditProduct, 
  canManage: passedCanManage,
  onDownloadQR, ...props
}) => {

  // 🛡️ [حزام الأمان الذكي والنهائي المعتمد على role_id]
  const canManage = useMemo(() => {
    // إذا تم تمرير الصلاحية بوضوح عبر الـ Props نستخدمها مباشرة
    if (passedCanManage !== undefined) return passedCanManage;
    
    try {
      // 1. محاولة جلب كائن المستخدم بالكامل من localStorage
      const storedUser = localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')) : null;
      
      // 2. استخراج الـ role_id من كائن المستخدم أو من التخزين المباشر كخطة بديلة
      const roleId = storedUser?.role_id ?? localStorage.getItem('role_id');
      
      // 3. التحقق الصارم: إذا كان الـ role_id موجوداً ويساوي 3، فهو موظف (لا يملك صلاحية الإدارة)
      if (roleId !== undefined && roleId !== null) {
        return Number(roleId) !== 3; // سيرجع true للمسؤول (أي رقم غير 3)، و false للموظف (رقم 3)
      }
    } catch (e) {
      console.error("Error reading role_id from localStorage", e);
    }
    
    // افتراضياً في حال عدم وجود البيانات، نغلق الصلاحيات كإجراء أمان
    return false;
  }, [passedCanManage]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [selectedSizeFilter, setSelectedSizeFilter] = useState('');
  const [selectedSizeId, setSelectedSizeId] = useState(null);
  
  // حالات جديدة لإدارة جلب المنتجات من الباك إند مباشرة أثناء البحث
  const [searchedProducts, setSearchedProducts] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  // التحميل التدريجي لنتائج البحث/الفلترة: بدونه كان الطلب يجلب أول 20 منتجاً
  // فقط (الحد الافتراضي في getProductsDashboard) مرتّبة بالأحدث، فتظهر آخر
  // المنتجات وحدها ويستحيل الوصول للأقدم مهما نزل المستخدم بالصفحة.
  const [searchLoadingMore, setSearchLoadingMore] = useState(false);
  const [searchHasMore, setSearchHasMore] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('add');
  const [selectedCatalog, setSelectedCatalog] = useState(null);
  const [catalogName, setCatalogName] = useState('');
  
  const [filterData, setFilterData] = useState({ sizes: [], catalogs: [] });
  const [pdfFilters, setPdfFilters] = useState({ size_name: '', catalog_id: '' });

  const [actionLoading, setActionLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [errors, setErrors] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [activeMenu, setActiveMenu] = useState(null);

  const [isCatDropdownOpen, setIsCatDropdownOpen] = useState(false);
  const [isSizeDropdownOpen, setIsSizeDropdownOpen] = useState(false);
  const [isMainSizeDropdownOpen, setIsMainSizeDropdownOpen] = useState(false);
  
  const dropdownRef = useRef(null);
  const mainSizeDropdownRef = useRef(null);

  useEffect(() => {
    if (isPdfModalOpen || isModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isPdfModalOpen, isModalOpen]);

  // جلب قائمة المقاسات المتاحة فور تحميل الصفحة لتهيئة فلتر المقاسات الرئيسي
  useEffect(() => {
    const fetchInitialSizes = async () => {
      try {
        const sizes = await catalogApi.getSizeNames();
        setFilterData(prev => ({
          ...prev,
          sizes: Array.isArray(sizes) ? sizes : []
        }));
      } catch (err) {
        console.error("Error fetching initial sizes:", err);
      }
    };
    fetchInitialSizes();
  }, []);

  // نحتفظ بأعلام التحميل في refs حتى لا تدخل ضمن اعتماديات مراقب التمرير،
  // فيُعاد بناؤه مع كل تغيّر حالة ويفقد إحداثيات الصفحة الحالية (نفس العلة
  // التي عولجت في CatalogProductsView).
  const searchLoadingRef = useRef(searchLoading);
  const searchLoadingMoreRef = useRef(searchLoadingMore);
  const searchHasMoreRef = useRef(searchHasMore);
  const searchedCountRef = useRef(0);
  useEffect(() => { searchLoadingRef.current = searchLoading; }, [searchLoading]);
  useEffect(() => { searchLoadingMoreRef.current = searchLoadingMore; }, [searchLoadingMore]);
  useEffect(() => { searchHasMoreRef.current = searchHasMore; }, [searchHasMore]);
  useEffect(() => { searchedCountRef.current = searchedProducts.length; }, [searchedProducts.length]);

  const extractProductList = (data) => {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.products)) return data.products;
    if (data && Array.isArray(data.results)) return data.results;
    return [];
  };

  // الاتصال المباشر بالباك إند للبحث الشامل عن المنتجات فوراً عند الكتابة أو تغيير الفلتر
  const fetchSearchPage = useCallback(async (offset, isReset) => {
    if (isReset) setSearchLoading(true); else setSearchLoadingMore(true);
    try {
      // جلب المنتجات مباشرة من السيرفر بناءً على نص البحث وفلتر المقاس بدقة
      const params = { offset, limit: SEARCH_PAGE_SIZE };
      if (searchTerm.trim()) params.search = searchTerm.trim();
      if (selectedSizeId) params.size_id = selectedSizeId;
      if (selectedSizeFilter) params.size_name = selectedSizeFilter;

      const data = await catalogApi.getProductsDashboard(params);
      const list = extractProductList(data);
      setSearchedProducts(prev => (isReset ? list : [...prev, ...list]));
      setSearchHasMore(list.length === SEARCH_PAGE_SIZE);
    } catch (err) {
      console.error("Error global searching products:", err);
      if (isReset) setSearchedProducts([]);
      setSearchHasMore(false);
    } finally {
      if (isReset) setSearchLoading(false); else setSearchLoadingMore(false);
    }
  }, [searchTerm, selectedSizeFilter, selectedSizeId]);

  useEffect(() => {
    if (!searchTerm.trim() && !selectedSizeFilter) {
      setSearchedProducts([]);
      setSearchHasMore(true);
      return undefined;
    }
    const delayDebounceFn = setTimeout(() => {
      setSearchHasMore(true);
      fetchSearchPage(0, true);
    }, 400); // تأخير بسيط 400ms لحماية السيرفر من كثرة الطلبات أثناء الكتابة السريعة

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm, selectedSizeFilter, selectedSizeId, fetchSearchPage]);

  // مرجع لآخر بطاقة في نتائج البحث: ظهورها في الشاشة يجلب الصفحة التالية،
  // فتُحمَّل المنتجات الأقدم تلقائياً بدل التوقف عند أول 20 نتيجة.
  const searchObserverRef = useRef();
  const lastSearchedProductRef = useCallback((node) => {
    if (searchObserverRef.current) searchObserverRef.current.disconnect();
    if (!node) return;
    searchObserverRef.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting
        && searchHasMoreRef.current
        && !searchLoadingRef.current
        && !searchLoadingMoreRef.current) {
        fetchSearchPage(searchedCountRef.current, false);
      }
    });
    searchObserverRef.current.observe(node);
  }, [fetchSearchPage]);

  const filteredCatalogs = useMemo(() => {
    return catalogs.filter(catalog => {
      const isStatusMatch = 
        statusFilter === 'all' || 
        (statusFilter === 'active' && (catalog.is_active || catalog.status === 'نشط')) ||
        (statusFilter === 'inactive' && (!catalog.is_active && catalog.status !== 'نشط'));
      const matchesSearch = !searchTerm.trim() || catalog.name?.toLowerCase().includes(searchTerm.toLowerCase());
      return isStatusMatch && matchesSearch;
    });
  }, [catalogs, statusFilter, searchTerm]);

  const filteredProductIds = useMemo(() => {
    const ids = [];
    filteredCatalogs.forEach(catalog => {
      if (Array.isArray(catalog.products)) {
        catalog.products.forEach(product => {
          const matchesProductSearch = 
            !searchTerm.trim() ||
            product.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (product.code && product.code.toLowerCase().includes(searchTerm.toLowerCase()));
          
          // التحقق الدقيق من مطابقة المقاس المختار داخل شجرة المنتج والألوان والمتغيرات
          let matchesSize = !selectedSizeFilter;
          if (selectedSizeFilter) {
            if (product.colors && Array.isArray(product.colors)) {
              matchesSize = product.colors.some(color => 
                color.variants && Array.isArray(color.variants) && color.variants.some(v => 
                  v.size_name === selectedSizeFilter || 
                  (selectedSizeId && String(v.size_id) === String(selectedSizeId)) ||
                  (v.size && v.size.name === selectedSizeFilter)
                )
              );
            } else if (Array.isArray(product.sizes)) {
              matchesSize = product.sizes.some(s => 
                s.name === selectedSizeFilter || 
                (selectedSizeId && String(s.id) === String(selectedSizeId))
              );
            } else if (product.size_name) {
              matchesSize = product.size_name === selectedSizeFilter;
            }
          }

          if (matchesProductSearch && matchesSize) {
            ids.push(product.id);
          }
        });
      }
    });
    return ids;
  }, [filteredCatalogs, searchTerm, selectedSizeFilter, selectedSizeId]);

  useEffect(() => {
    if (typeof onFilteredProductIdsChange === 'function') {
      onFilteredProductIdsChange(filteredProductIds);
    }
  }, [filteredProductIds, onFilteredProductIdsChange]);

  useEffect(() => {
    if (typeof onRefresh === 'function') onRefresh(statusFilter);
  }, [statusFilter]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsCatDropdownOpen(false);
        setIsSizeDropdownOpen(false);
      }
      if (mainSizeDropdownRef.current && !mainSizeDropdownRef.current.contains(event.target)) {
        setIsMainSizeDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const openPdfModal = async () => {
    setErrors(null);
    setSuccessMsg('');
    setIsPdfModalOpen(true);
    setPdfLoading(true);
    try {
      const [sizes, catNames] = await Promise.all([
        catalogApi.getSizeNames(),
        catalogApi.getCatalogNames()
      ]);

      const formattedCatalogs = Array.isArray(catNames) ? catNames.map((item, index) => {
        if (typeof item === 'string') return { id: item, name: item }; 
        return { 
            id: item.id || item._id || index, 
            name: item.name || item.title || item.catalog_name || "بدون اسم" 
        };
      }) : [];
      
      setFilterData({
        sizes: Array.isArray(sizes) ? sizes : [], 
        catalogs: formattedCatalogs
      });
    } catch (err) {
      setErrors({ pdf: "فشل تحميل بيانات الفلاتر من السيرفر" });
    } finally {
      setPdfLoading(false);
    }
  };

  const handleExportPdf = async (e) => {
    e.preventDefault();
    setPdfLoading(true);
    setErrors(null);
    setSuccessMsg('');
    try {
      const cleanFilters = {};
      if (pdfFilters.size_name) cleanFilters.size_name = pdfFilters.size_name;
      if (pdfFilters.catalog_id) cleanFilters.catalog_id = pdfFilters.catalog_id;

      await catalogApi.exportProductsPdf(cleanFilters);
      setSuccessMsg("تم تجهيز ملف PDF بنجاح");
      setTimeout(() => { setIsPdfModalOpen(false); }, 1000); 
    } catch (err) {
      setErrors({ pdf: err.response?.data?.detail || "لا توجد منتجات تطابق هذه الفلاتر حالياً" });
    } finally {
      setPdfLoading(false);
    }
  };

  const handleExportAllQRs = async () => {
    setPdfLoading(true);
    setErrors(null);
    setSuccessMsg('');
    try {
      await catalogApi.exportAllActiveQRs();
      setSuccessMsg("تم تصدير أكواد QR بنجاح");
    } catch (err) {
      setErrors({ general: "فشل تصدير أكواد QR" });
    } finally {
      setPdfLoading(false);
    }
  };

  const resetModal = () => {
    setCatalogName('');
    setErrors(null);
    setActionLoading(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setErrors(null);
    if (!catalogName.trim()) {
      setErrors({ name: ["يرجى إدخال اسم الكتالوج"] });
      return;
    }
    setActionLoading(true);

    const isAdd = modalMode === 'add';
    const trimmedName = catalogName.trim();

    if (!navigator.onLine) {
      const type = isAdd ? 'CREATE_CATALOG' : 'UPDATE_CATALOG';
      const payload = isAdd ? { name: trimmedName } : { id: selectedCatalog.id, name: trimmedName };
      const desc = isAdd ? `إضافة كتالوج: ${trimmedName}` : `تعديل كتالوج: ${trimmedName}`;
      await saveOfflineAction(type, payload, desc);
      setSuccessMsg(isAdd ? "أوفلاين: تم حفظ الكتالوج محلياً! سيُرفع عند الاتصال 📡" : "أوفلاين: تم حفظ التعديل محلياً! سيُرفع عند الاتصال 📡");
      onRefresh(statusFilter);
      setTimeout(() => { setIsModalOpen(false); resetModal(); }, 1000);
      setActionLoading(false);
      return;
    }

    try {
      if (isAdd) {
        await catalogApi.createCatalog(trimmedName);
        setSuccessMsg("تمت الإضافة بنجاح!");
      } else {
        await catalogApi.updateCatalog(selectedCatalog.id, trimmedName);
        setSuccessMsg("تم التحديث بنجاح!");
      }
      onRefresh(statusFilter);
      setTimeout(() => { setIsModalOpen(false); resetModal(); }, 1000);
      setTimeout(() => { setSuccessMsg(''); }, 3000);
    } catch (error) {
      if (isNetworkError(error)) {
        const type = isAdd ? 'CREATE_CATALOG' : 'UPDATE_CATALOG';
        const payload = isAdd ? { name: trimmedName } : { id: selectedCatalog.id, name: trimmedName };
        const desc = isAdd ? `إضافة كتالوج: ${trimmedName}` : `تعديل كتالوج: ${trimmedName}`;
        await saveOfflineAction(type, payload, desc);
        setSuccessMsg("انقطع الاتصال: تم الحفظ محلياً وسيُزامن تلقائياً 📡");
        onRefresh(statusFilter);
        setTimeout(() => { setIsModalOpen(false); resetModal(); }, 1000);
        return;
      }
      if (error.response?.status === 422) setErrors(error.response.data.errors);
      else if (error.response?.status === 409) setErrors({ name: ["هذا الاسم موجود بالفعل"] });
      else setErrors({ general: "حدث خطأ غير متوقع في النظام" });
    } finally { setActionLoading(false); }
  };

  const handleToggleStatus = async (catalog) => {
    setActiveMenu(null);
    if (!navigator.onLine) {
      await saveOfflineAction(
        'TOGGLE_CATALOG_STATUS',
        { id: catalog.id },
        `تغيير حالة كتالوج: ${catalog.name}`
      );
      setSuccessMsg("أوفلاين: تم حفظ تغيير الحالة محلياً! سيُزامن عند الاتصال 📡");
      onRefresh(statusFilter);
      return;
    }
    try {
      await catalogApi.toggleCatalogStatus(catalog.id);
      onRefresh(statusFilter);
    } catch (err) {
      if (isNetworkError(err)) {
        await saveOfflineAction(
          'TOGGLE_CATALOG_STATUS',
          { id: catalog.id },
          `تغيير حالة كتالوج: ${catalog.name}`
        );
        setSuccessMsg("انقطع الاتصال: تم الحفظ محلياً وسيُزامن تلقائياً 📡");
        onRefresh(statusFilter);
      } else {
        setErrors({ general: "فشل تغيير حالة الكتالوج" });
      }
    }
  };
  // تأثير ذكي لمراقبة رسالة النجاح وتدميرها تلقائياً بعد 3 ثوانٍ مهما حدث
useEffect(() => {
  if (successMsg) {
    // 1. إنشاء مؤقت زمني لتفريغ الرسالة
    const timer = setTimeout(() => {
      setSuccessMsg('');
    }, 3000); // تختفي بعد 3 ثوانٍ

    // 2. تنظيف المؤقت (Cleanup Function) إذا تغيرت الرسالة أو أقفل المكون لمنع تسريب الذاكرة
    return () => clearTimeout(timer);
  }
}, [successMsg]);

  return (
    <div className="w-full animate-in fade-in duration-500 font-arabic text-right" dir="rtl">
      {successMsg && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[9999] bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 text-[11px] font-bold animate-in slide-in-from-top duration-300 pointer-events-none border border-emerald-500/20">
          <CheckCircle2 size={14} strokeWidth={3} className="shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      
      {/* شريط البحث والفلترة العلوي - تجاوب ديناميكي كامل حسب حجم الشاشة */}
      <div className="w-full mb-6 flex flex-col gap-3 sm:gap-4 md:gap-5">
        
        {/* السطر الأول: حقل البحث وزر الفلترة - يتمدد ويكبر حجمه مع الشاشات الكبيرة */}
        <div className="flex items-center gap-2 sm:gap-3 w-full relative" ref={mainSizeDropdownRef}>
          
          {/* حقل البحث المتجاوب */}
          <div className="relative flex-1 group">
            <Search 
              className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#800000] transition-colors" 
              size={15} // حجم افتراضي للشاشات الصغيرة
              // الكلاسات أدناه تكبر حجم الأيقونة في الشاشات المتوسطة والكبيرة عبر الـ CSS التلقائي إذا لزم الأمر، ولكن سنترك التحكم عبر الأبعاد لتظل متناسقة
            />
            <input 
              type="text"
              placeholder="   بحث سريع اسم المنتج او كود المنتج..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pr-9 sm:pr-11 pl-4 py-2 sm:py-2.5 md:py-3 bg-white border border-slate-100 rounded-xl sm:rounded-2xl focus:border-[#80000030] shadow-sm outline-none text-xs sm:text-sm font-bold transition-all text-slate-700 placeholder-slate-400"
            />
          </div>

          {/* زر الفلترة الصغير والمودرن - يتضخم حجمه هندسياً مع كبر الشاشة */}
          <div 
            onClick={() => setIsMainSizeDropdownOpen(!isMainSizeDropdownOpen)}
            className={`flex items-center justify-center shrink-0 rounded-xl sm:rounded-2xl border cursor-pointer hover:bg-slate-50 transition-all shadow-sm
              h-8 w-8       /* شاشات الموبايل */
              sm:h-10 sm:w-10 /* الشاشات المتوسطة */
              md:h-11 md:w-11 /* الشاشات الكبيرة */
              ${selectedSizeFilter ? 'border-[#80000030] bg-[#80000005] text-[#800000]' : 'border-slate-100 bg-white text-slate-500'}`}
            title={selectedSizeFilter || "تصفية بالمقاس"}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-4.5 md:h-4.5" strokeWidth={2.5} />
          </div>

          {/* القائمة المنسدلة للمقاسات - تتكيف أيضاً مع الحجم الجديد */}
          {isMainSizeDropdownOpen && (
            <div className="absolute top-full left-0 mt-2 w-48 sm:w-56 bg-white border border-slate-100 rounded-xl sm:rounded-2xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="max-h-[220px] overflow-y-auto custom-scrollbar font-bold text-xs sm:text-sm">
                <div 
                  onClick={() => { 
                    setSelectedSizeFilter(''); 
                    setSelectedSizeId(null); 
                    setIsMainSizeDropdownOpen(false); 
                  }}
                  className="px-4 py-2.5 sm:py-3 hover:bg-slate-50 cursor-pointer border-b border-slate-50 text-slate-400"
                >
                  كل المقاسات
                </div>
                {filterData.sizes.map((size, index) => (
                  <div 
                    key={size.id || index}
                    onClick={() => { 
                      setSelectedSizeFilter(size.name); 
                      setSelectedSizeId(size.id); 
                      setIsMainSizeDropdownOpen(false); 
                    }}
                    className={`px-4 py-2.5 sm:py-3 hover:bg-[#80000008] hover:text-[#800000] cursor-pointer border-b border-slate-50 last:border-0 ${selectedSizeFilter === size.name ? 'bg-[#80000005] text-[#800000]' : 'text-slate-600'}`}
                  >
                    {size.name}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* شارة توضيح الفلتر النشط للمقاس مع إمكانية الإلغاء السريع */}
        {selectedSizeFilter && (
          <div className="flex items-center gap-1.5 bg-[#800000]/10 text-[#800000] px-3 py-1 rounded-xl text-xs font-black self-start animate-in fade-in duration-150">
            <span>تصفية بالمقاس: {selectedSizeFilter}</span>
            <button
              type="button"
              onClick={() => { setSelectedSizeFilter(''); setSelectedSizeId(null); }}
              className="p-0.5 hover:bg-[#800000]/20 rounded-full transition-colors cursor-pointer mr-1"
              title="إلغاء فلتر المقاس"
            >
              <X size={12} strokeWidth={3} />
            </button>
          </div>
        )}

        {/* السطر الثاني: أزرار تصفية الحالة على اليمين، وأزرار التصدير على اليسار - تكبر وتتوسع الفراغات بمرونة */}
        <div className="flex flex-row items-center justify-between gap-3 w-full">
          
          {/* اليمين: أزرار تصفية الحالة البيضاء - خطوط وحشوات مرنة */}
          <div className="flex bg-white p-1 rounded-xl sm:rounded-2xl border border-slate-100 shadow-sm shrink-0">
            <div className="flex items-center gap-1">
              {['all', 'active', 'inactive'].map((f) => (
                <button 
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={`rounded-lg sm:rounded-xl font-bold transition-all 
                    px-2.5 py-1 text-[10px] min-w-[50px]       /* شاشات الموبايل */
                    sm:px-4 sm:py-1.5 sm:text-xs sm:min-w-[65px] /* الشاشات المتوسطة */
                    md:px-5 md:py-2 md:text-sm md:min-w-[75px]   /* الشاشات الكبيرة */
                    ${statusFilter === f ? 'bg-[#800000] text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {f === 'all' ? 'الكل' : f === 'active' ? 'نشط' : 'ملغى'}
                </button>
              ))}
            </div>
          </div>

          {/* اليسار: أزرار التصدير (PDF / QR) - تتضخم الحشوات والخطوط تدريجياً لسهولة التفاعل على الشاشات الكبيرة */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button 
              onClick={openPdfModal} 
              className="flex items-center justify-center bg-white border border-slate-100 text-slate-700 rounded-xl sm:rounded-2xl font-bold transition-all shadow-sm whitespace-nowrap hover:bg-slate-50
                gap-1.5 h-8 px-3 text-[11px]        /* شاشات الموبايل (تم تكبيرها قليلاً) */
                sm:gap-2 sm:h-10 sm:px-5 sm:text-xs   /* الشاشات المتوسطة */
                md:gap-2.5 md:h-12 md:px-6 md:text-sm /* الشاشات الكبيرة (أصبحت ممتلئة وبارزة) */"
            >
              <FileDown className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 text-red-600" /> تصدير PDF
            </button>
            
            <button 
              onClick={handleExportAllQRs} 
              disabled={pdfLoading} 
              className="flex items-center justify-center bg-white border border-slate-100 text-slate-700 rounded-xl sm:rounded-2xl font-bold transition-all shadow-sm whitespace-nowrap disabled:opacity-50
                gap-1 h-7 px-2.5 text-[10px]       /* شاشات الموبايل */
                sm:gap-1.5 sm:h-9 sm:px-4 sm:text-xs /* الشاشات المتوسطة */
                md:gap-2 md:h-11 md:px-5 md:text-sm  /* الشاشات الكبيرة */
                hover:bg-slate-50"
            >
              {pdfLoading ? (
                <Loader2 className="animate-spin w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4" />
              ) : (
                <QrCode className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 text-blue-600" />
              )} 
              تصدير QR
            </button>
          </div>

        </div>

      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 px-2">
        <div>
          <h2 className="text-lg font-black text-slate-800">
            {(searchTerm.trim() || selectedSizeFilter) ? "نتائج البحث الفوري والفلترة" : "الكتالوجات المتاحة"}
          </h2>
          <p className="text-xs text-slate-400 font-bold">
            العدد: {(searchTerm.trim() || selectedSizeFilter) ? searchedProducts.length : filteredCatalogs.length}
          </p>
        </div>
        
        <div className="flex items-center gap-3 self-end sm:self-auto">
          {/* زر إضافة منتج - حجم متوسط */}
          {canManage && (
          <button 
            onClick={onAddProduct} 
            className="flex items-center justify-center bg-white border border-slate-200 text-slate-700 rounded-xl font-bold shadow-sm transition-all active:scale-95 hover:bg-slate-50 whitespace-nowrap
              gap-1.5 h-8 px-3 text-[11px]        /* شاشات الموبايل (أكبر قليلاً) */
              sm:gap-2 sm:h-9.5 sm:px-4 sm:text-xs   /* الشاشات المتوسطة */
              md:gap-2 md:h-11 md:px-5 md:text-xs    /* الشاشات الكبيرة (متناسق ومريح جداً) */"
          >
            <Plus size={14} strokeWidth={3} className="text-[#800000] sm:w-4 sm:h-4" /> إضافة منتج
          </button>
          )}

          {/* زر إضافة كتالوج - حجم متوسط */}
          {canManage && (
          <button 
            onClick={() => { setModalMode('add'); resetModal(); setIsModalOpen(true); }} 
            className="flex items-center justify-center bg-[#800000] text-white rounded-xl font-bold shadow-md transition-all active:scale-95 hover:bg-[#600000] whitespace-nowrap
              gap-1.5 h-8 px-3 text-[11px]        /* شاشات الموبايل */
              sm:gap-2 sm:h-9.5 sm:px-4 sm:text-xs   /* الشاشات المتوسطة */
              md:gap-2 md:h-11 md:px-5 md:text-xs    /* الشاشات الكبيرة */"
          >
            <Plus size={14} strokeWidth={3} className="sm:w-4 sm:h-4" /> إضافة كتالوج
          </button>
          )}
        </div>
      </div>
      
      {/* العرض الشرطي المدعوم بالـ API الفوري */}
      {(searchTerm.trim() || selectedSizeFilter) ? (
        searchLoading ? (
          <div className="flex justify-center items-center py-20 w-full">
            <Loader2 className="animate-spin text-[#800000]" size={30} />
          </div>
        ) : searchedProducts.length > 0 ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-in fade-in duration-200">
              {searchedProducts.map((product, index) => (
                <div
                  key={product.id}
                  ref={index === searchedProducts.length - 1 ? lastSearchedProductRef : undefined}
                >
                  <ProductCard 
                    product={product}
                    canManage={canManage}
                    onEdit={canManage ? onEditProduct : undefined}
                    onDownloadQR={onDownloadQR}
                    onDelete={canManage ? () => onRefresh(statusFilter) : undefined}
                    onEditSuccess={() => onRefresh(statusFilter)}
                  />
                </div>
              ))}
            </div>

            {searchLoadingMore && (
              <div className="flex justify-center items-center py-8 w-full">
                <Loader2 className="animate-spin text-[#800000]" size={24} />
              </div>
            )}
            {!searchHasMore && searchedProducts.length > SEARCH_PAGE_SIZE && (
              <p className="text-center text-[11px] font-bold text-slate-300 py-6">
                لا مزيد من المنتجات
              </p>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-slate-300">
            <AlertCircle size={40} strokeWidth={1} />
            <p className="mt-4 font-bold text-sm">لا توجد منتجات تطابق عمليه الفلتره</p>
          </div>
        )
      ) : (
        /* عرض الكتالوجات الافتراضية - إجبار النظام على عرض قطعتين (2) في كل سطر حتى في الموبايل */
        <div className="grid grid-cols-2 gap-3 sm:gap-5 md:gap-6">
          {filteredCatalogs.map((catalog) => (
            <div 
              key={catalog.id} 
              onClick={() => onSelect(catalog)} 
              className="group bg-white border border-slate-100 rounded-2xl sm:rounded-[2rem] p-3.5 sm:p-6 transition-all cursor-pointer relative shadow-sm hover:border-[#800000]/30 flex flex-col justify-between min-h-[125px] sm:min-h-[160px]"
            >
              {/* الجزء العلوي للبطاقة: الأيقونة والقائمة المنسدلة - أحجام متجاوبة */}
              <div className="flex justify-between items-start mb-2 sm:mb-4">
                <div className="w-8 h-8 sm:w-12 sm:h-12 flex items-center justify-center rounded-xl sm:rounded-2xl bg-slate-50 text-[#800000] group-hover:bg-[#800000] group-hover:text-white transition-all">
                  <FolderOpen className="w-4 h-4 sm:w-[22px] sm:h-[22px]" />
                </div>
                {canManage && (
                <div className="relative">
                  <button onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu === catalog.id ? null : catalog.id); }} className="p-1 sm:p-2 text-slate-400 hover:text-[#800000]">
                    <MoreVertical className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                  {activeMenu === catalog.id && (
                    <div className="absolute left-0 top-full mt-1 sm:mt-2 w-40 sm:w-48 bg-white border border-slate-100 rounded-xl sm:rounded-2xl shadow-xl z-50 animate-in zoom-in-95">
                      <button onClick={(e) => { e.stopPropagation(); setSelectedCatalog(catalog); setCatalogName(catalog.name); setModalMode('edit'); setIsModalOpen(true); setActiveMenu(null); }} className="w-full flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-slate-600 hover:bg-slate-50 rounded-t-xl sm:rounded-t-2xl">
                        <Edit2 size={14} className="text-blue-500 sm:w-4 sm:h-4" /> تعديل الاسم
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleToggleStatus(catalog); }} className="w-full flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-slate-600 hover:bg-slate-50 rounded-b-xl sm:rounded-b-2xl border-t border-slate-50">
                        <Power size={14} className={catalog.is_active ? "text-red-500" : "text-emerald-500" } />
                        {catalog.is_active ? 'الغاء التنشيط' : 'تنشيط'}
                      </button>
                    </div>
                  )}
                </div>
                )}
              </div>

              {/* اسم الكتالوج - حجم خط مرن ومحمي من النزول لسطر جديد لعدم تخريب التصميم */}
              <h3 className="font-black text-slate-800 text-xs sm:text-base md:text-lg mb-1 sm:mb-2 truncate" title={catalog.name}>
                {catalog.name}
              </h3>
              
              {/* الجزء السفلي للبطاقة: الحالة وسهم الانتقال */}
              <div className="flex items-center justify-between mt-auto pt-2 sm:pt-4 border-t border-slate-50">
                <span className={`font-bold rounded-md sm:rounded-lg
                  text-[9px] px-1.5 py-0.5         /* شاشات الموبايل الصغيرة */
                  sm:text-[10px] sm:px-2.5 sm:py-1 /* الشاشات الكبيرة */
                  ${catalog.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                  {catalog.is_active ? 'نشط' : 'ملغى'}
                </span>
                <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-300 group-hover:text-[#800000] transition-colors" />
              </div>
            </div>
          ))}
        </div>
      )}

      {isPdfModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl overflow-hidden border border-white/20 animate-in zoom-in-95 duration-300">
            <div className="flex justify-between items-center px-8 py-6 bg-slate-50/50 border-b">
              <h2 className="text-lg font-black text-slate-800">تصدير ملف PDF</h2>
              <button onClick={() => setIsPdfModalOpen(false)} className="p-2 hover:bg-white rounded-full text-slate-400 transition-colors">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleExportPdf} className="p-8 space-y-6" ref={dropdownRef}>
              <div className="space-y-5">
                <div className="space-y-2 relative">
                  <label className="flex items-center gap-2 text-xs font-black text-slate-500 mr-1">
                    <LayoutGrid size={14} className="text-[#800000]" /> فلترة حسب المقاس
                  </label>
                  <div 
                    onClick={() => { setIsSizeDropdownOpen(!isSizeDropdownOpen); setIsCatDropdownOpen(false); }}
                    className="w-full px-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl flex justify-between items-center cursor-pointer hover:bg-white transition-all"
                  >
                    <span className="font-bold text-sm text-slate-700">
                      {pdfFilters.size_name || "جميع المقاسات"}
                    </span>
                    <ChevronDown size={18} className={`text-slate-400 transition-transform ${isSizeDropdownOpen ? 'rotate-180' : ''}`} />
                  </div>
                  
                  {isSizeDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-xl z-[110] overflow-hidden animate-in fade-in slide-in-from-top-2">
                      <div className="max-h-[200px] overflow-y-auto custom-scrollbar font-bold text-sm">
                        <div 
                          onClick={() => { setPdfFilters({...pdfFilters, size_name: ''}); setIsSizeDropdownOpen(false); }}
                          className="px-5 py-3 hover:bg-slate-50 cursor-pointer border-b border-slate-50 text-slate-400"
                        >
                          جميع المقاسات
                        </div>
                        {filterData.sizes.map(size => (
                          <div 
                            key={size.id}
                            onClick={() => { setPdfFilters({...pdfFilters, size_name: size.name}); setIsSizeDropdownOpen(false); }}
                            className="px-5 py-3 hover:bg-[#80000008] hover:text-[#800000] cursor-pointer border-b border-slate-50 last:border-0"
                          >
                            {size.name}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2 relative">
                  <label className="flex items-center gap-2 text-xs font-black text-slate-500 mr-1">
                    <FolderOpen size={14} className="text-[#800000]" /> اختيار كتالوج محدد
                  </label>
                  <div 
                    onClick={() => { setIsCatDropdownOpen(!isCatDropdownOpen); setIsSizeDropdownOpen(false); }}
                    className="w-full px-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl flex justify-between items-center cursor-pointer hover:bg-white transition-all"
                  >
                    <span className="font-bold text-sm text-slate-700 truncate ml-2">
                      {filterData.catalogs.find(c => c.id == pdfFilters.catalog_id)?.name || "جميع الكتالوجات"}
                    </span>
                    <ChevronDown size={18} className={`text-slate-400 transition-transform ${isCatDropdownOpen ? 'rotate-180' : ''}`} />
                  </div>
                  
                  {isCatDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-xl z-[110] overflow-hidden animate-in fade-in slide-in-from-top-2">
                      <div className="max-h-[200px] overflow-y-auto custom-scrollbar font-bold text-sm">
                        <div 
                          onClick={() => { setPdfFilters({...pdfFilters, catalog_id: ''}); setIsCatDropdownOpen(false); }}
                          className="px-5 py-3 hover:bg-slate-50 cursor-pointer border-b border-slate-50 text-slate-400"
                        >
                          جميع الكتالوجات
                        </div>
                        {filterData.catalogs.map(cat => (
                          <div 
                            key={cat.id}
                            onClick={() => { setPdfFilters({...pdfFilters, catalog_id: cat.id}); setIsCatDropdownOpen(false); }}
                            className="px-5 py-3 hover:bg-[#80000008] hover:text-[#800000] cursor-pointer border-b border-slate-50 last:border-0"
                          >
                            {cat.name}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-2">
                {errors?.pdf && (
                  <div className="mb-4 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 text-xs font-bold animate-in fade-in">
                    <AlertCircle size={16} className="shrink-0" />
                    <span>{errors.pdf}</span>
                  </div>
                )}

                <button 
                  type="submit" 
                  disabled={pdfLoading}
                  className="w-full py-4 bg-[#800000] hover:bg-[#600000] text-white font-bold text-sm rounded-2xl shadow-lg shadow-[#800000]/10 transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {pdfLoading ? <Loader2 size={18} className="animate-spin" /> : <FileDown size={18} />}تحميل PDF 
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-50 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center px-8 py-6 bg-slate-50/50 border-b border-slate-100">
              <h2 className="text-lg font-black text-slate-800">
                {modalMode === 'add' ? 'إضافة كتالوج جديد' : 'تعديل اسم الكتالوج'}
              </h2>
              <button onClick={() => { setIsModalOpen(false); resetModal(); }} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-500 mr-1">اسم الكتالوج </label>
                <input 
                  type="text"
                  value={catalogName}
                  onChange={(e) => setCatalogName(e.target.value)}
                  placeholder="مثال: ملابس البنات ..."
                  className={`w-full px-5 py-4 bg-slate-50 border ${errors?.name ? 'border-red-300 focus:border-red-500' : 'border-slate-100 focus:border-[#80000050]'} rounded-2xl outline-none text-sm font-bold transition-all focus:bg-white`}
                />
                {errors?.name && <p className="text-red-500 text-[11px] font-bold mr-1">{errors.name[0]}</p>}
              </div>

              {errors?.general && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 text-xs font-bold">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{errors.general}</span>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button 
                  type="submit" 
                  disabled={actionLoading}
                  className="flex-1 py-4 bg-[#800000] hover:bg-[#600000] text-white font-bold text-sm rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {actionLoading && <Loader2 size={16} className="animate-spin" />}
                  {modalMode === 'add' ? 'حفظ البيانات' : 'تحديث الاسم'}
                </button>
                <button 
                  type="button" 
                  onClick={() => { setIsModalOpen(false); resetModal(); }}
                  className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-sm rounded-2xl transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CatalogsPage;