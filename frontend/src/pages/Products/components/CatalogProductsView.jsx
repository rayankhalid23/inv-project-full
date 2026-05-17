import React, { useState, useEffect } from 'react';
import { ArrowRight, Plus, Search, FileDown, Loader2, AlertCircle } from 'lucide-react';
import ProductCard from './ProductCard';
import { catalogApi } from "../../../api/catalogApi";

const CatalogProductsView = ({ catalog, onBack , onEditProduct, onAddProduct, onDownloadQR, refreshTrigger }) => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchProducts = async () => {
      if (!catalog || !catalog.id) return;
      setLoading(true);
      try {
        const data = await catalogApi.getProductsDashboard({ catalog_id: catalog.id });

        if (Array.isArray(data)) {
          setProducts(data);
        } else if (data && data.products) {
          setProducts(data.products);
        } else if (data && data.results) {
          setProducts(data.results);
        } else {
          setProducts([]); 
        }

      } catch (err) { 
        console.error("Error fetching products:", err);
        setProducts([]); 
      } finally { 
        setLoading(false); 
      }
    };
    fetchProducts();
  }, [catalog?.id, refreshTrigger]);

  return (
    <div className="animate-in slide-in-from-left duration-300">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2.5 bg-white border rounded-xl text-slate-600 hover:bg-slate-50 shadow-sm transition-all">
            <ArrowRight className="w-5 h-5" />
          </button>
          <div className="text-right">
            <h1 className="text-xl font-black text-slate-900">{catalog?.name || ' الكتالوج'}</h1>
            <p className="text-slate-400 text-[10px] font-bold">إدارة المنتجات في هذا القسم</p>
          </div>
        </div>
      </div>

      {/* قائمة المنتجات */}
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
      ) : products.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {products
            .filter(p => p && p.name && p.name.toLowerCase().includes(searchTerm.toLowerCase()))
            .map(p => (
              <ProductCard 
                key={p.id} 
                product={p} 
                onEdit={onEditProduct}
                onDownloadQR={onDownloadQR} 
              />
            ))
          }
        </div>
      ) : (
        <div className="flex flex-col items-center py-20 text-slate-300">
            <AlertCircle size={40} strokeWidth={1} />
            <p className="mt-4 font-bold text-sm">لا توجد منتجات</p>
        </div>
      )}
    </div>
  );
};

export default CatalogProductsView;