import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowRight, Plus, Search, FileDown, Loader2, AlertCircle } from 'lucide-react';
import ProductCard from './ProductCard';
import { catalogApi } from "../../../api/catalogApi";

const PAGE_SIZE = 20;

const CatalogProductsView = ({ catalog, canManage, onBack, onEditProduct, onAddProduct, onDownloadQR, refreshTrigger, ...props }) => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const observerRef = useRef();
  // نحتفظ بأحدث قيم الحالة في refs بدل الاعتماد عليها كـ dependencies مباشرة:
  // كانت useCallback تُعاد بناؤها مع كل تغيّر (loading/loadingMore/hasMore/products.length)،
  // فيعيد React ربط الـ ref بعنصر آخر الصنف حتى لو لم يتغيّر العنصر نفسه، فيُغلق المراقب
  // القديم أثناء التحميل (loadingMore=true يمنع الـ disconnect) ويبقى معلّقاً على إغلاق
  // بإحداثيات قديمة (offset قديم) — فتتكرر نفس الصفحة ولا تُحمَّل بقية المنتجات إطلاقاً.
  const loadingRef = useRef(loading);
  const loadingMoreRef = useRef(loadingMore);
  const hasMoreRef = useRef(hasMore);
  const productsLenRef = useRef(products.length);
  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => { loadingMoreRef.current = loadingMore; }, [loadingMore]);
  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);
  useEffect(() => { productsLenRef.current = products.length; }, [products.length]);

  const extractList = (data) => {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.products)) return data.products;
    if (data && Array.isArray(data.results)) return data.results;
    return [];
  };

  const fetchProducts = useCallback(async (offset, isReset) => {
    if (!catalog || !catalog.id) return;
    if (isReset) setLoading(true); else setLoadingMore(true);
    try {
      const data = await catalogApi.getProductsDashboard({
        catalog_id: catalog.id,
        offset,
        limit: PAGE_SIZE,
      });
      const list = extractList(data);
      setProducts(prev => isReset ? list : [...prev, ...list]);
      setHasMore(list.length === PAGE_SIZE);
    } catch (err) {
      console.error("Error fetching products:", err);
      if (isReset) setProducts([]);
    } finally {
      if (isReset) setLoading(false); else setLoadingMore(false);
    }
  }, [catalog?.id]);

  // مرجع لآخر عنصر منتج في القائمة — عند ظهوره في الشاشة (مهم جداً على الهاتف
  // حيث الشاشة صغيرة ولا تتسع لكل المنتجات) نجلب الصفحة التالية تلقائياً
  const lastProductRef = useCallback(node => {
    if (observerRef.current) observerRef.current.disconnect();
    if (!node) return;
    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMoreRef.current && !loadingRef.current && !loadingMoreRef.current) {
        fetchProducts(productsLenRef.current, false);
      }
    });
    observerRef.current.observe(node);
  }, [fetchProducts]);

  useEffect(() => {
    setHasMore(true);
    fetchProducts(0, true);
  }, [catalog?.id, refreshTrigger, fetchProducts]);

  return (
    <div className="animate-in slide-in-from-left duration-300">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2.5 bg-white border rounded-xl text-slate-600 hover:bg-slate-50 shadow-sm transition-all">
              <ArrowRight className="w-5 h-5" />
            </button>
            <div className="text-right">
              <h1 className="text-xl font-black text-slate-900">{catalog?.name || ' الكتالوج'}</h1>
              <p className="text-slate-400 text-[10px] font-bold">إدارة المنتجات في هذا القسم</p>
            </div>
          </div>
          {/* زر إضافة منتج — مخصص للمسؤول والمدير فقط */}
          {canManage && onAddProduct && (
            <button
              onClick={onAddProduct}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#800000] text-white rounded-xl font-bold text-xs shadow-md hover:bg-[#600000] transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" /> إضافة منتج
            </button>
          )}
        </div>
        {/* حقل البحث داخل الكتالوج */}
        <div className="relative group max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#800000] transition-colors w-4 h-4" />
          <input
            type="text"
            placeholder="بحث داخل الكتالوج..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pr-9 pl-4 py-2.5 bg-white border border-slate-100 rounded-2xl focus:border-[#80000030] shadow-sm outline-none text-xs font-bold transition-all text-slate-700 placeholder-slate-400"
          />
        </div>
      </div>

      {/* قائمة المنتجات */}
      {(() => {
        if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>;
        const filtered = products.filter(p => p && p.name && p.name.toLowerCase().includes(searchTerm.toLowerCase()));
        if (filtered.length === 0) return (
          <div className="flex flex-col items-center py-20 text-slate-300">
            <AlertCircle size={40} strokeWidth={1} />
            <p className="mt-4 font-bold text-sm">{searchTerm ? 'لا توجد منتجات تطابق البحث' : 'لا توجد منتجات'}</p>
          </div>
        );
        // مرجع التحميل التلقائي عند الوصول لآخر منتج يُفعّل فقط أثناء التصفح
        // الطبيعي (بدون بحث)، لأن البحث الآن نصفي محلي على ما تم تحميله فقط
        const isBrowsing = !searchTerm.trim();
        return (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map((p, idx) => {
                const isLast = isBrowsing && idx === filtered.length - 1;
                return (
                  <div key={p.id} ref={isLast ? lastProductRef : null}>
                    <ProductCard
                      product={p}
                      canManage={canManage}
                      onEdit={canManage ? onEditProduct : undefined}
                      onDownloadQR={onDownloadQR}
                    />
                  </div>
                );
              })}
            </div>
            {loadingMore && (
              <div className="flex justify-center py-6">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
              </div>
            )}
            {!hasMore && isBrowsing && filtered.length > 0 && (
              <p className="text-center text-slate-300 text-[11px] font-bold py-6">تم عرض كل المنتجات ({filtered.length})</p>
            )}
          </>
        );
      })()}
    </div>
  );
};

export default CatalogProductsView;