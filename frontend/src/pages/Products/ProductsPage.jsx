import React, { useState, useEffect, useCallback } from 'react';
import CatalogsPage from "./components/CatalogsPage";
import CatalogProductsView from "./components/CatalogProductsView";
import { catalogApi } from "../../api/catalogApi";
import ProductFormDialog from './components/ProductFormDialog';
import { Search, SlidersHorizontal, X } from 'lucide-react';

const ProductsPage = () => {
  const [view, setView] = useState('catalogs');
  const [selectedCatalog, setSelectedCatalog] = useState(null);
  const [catalogs, setCatalogs] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // --- [حالات البحث والفلترة] ---
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredProductIds, setFilteredProductIds] = useState([]);
  
  // --- [حالات التحكم في النافذة والمنتج] ---
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [currentProduct, setCurrentProduct] = useState(null);
  // --- [نظام الصلاحيات الذكي] role_id: 1=مسؤول, 2=مدير, 3=موظف ---
  const storedUser = localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')) : null;
  const roleId = Number(storedUser?.role_id ?? localStorage.getItem('role_id') ?? 3);

  // الصلاحية فقط للمسؤول (1) والمدير (2) — الموظف (3) يشوف المنتجات فقط
  const canManage = roleId === 1 || roleId === 2;

  // 1. الدالة الأساسية لجلب البيانات من الباك آند
  const fetchCatalogs = useCallback(async (status = 'all') => {
    setLoading(true);
    try {
      const data = await catalogApi.fetchCatalogs(status);
      setCatalogs([...data]); 
    } catch (err) {
      console.error("حدث خطأ أثناء جلب الكتالوجات:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // 2. الجلب عند تحميل الصفحة
  useEffect(() => {
    fetchCatalogs('all');
  }, [fetchCatalogs]);

  // 3. دالة الفلترة العميقة بناءً على الاسم، الكود، اللون، أو المقاس
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredProductIds([]);
      return;
    }

    const query = searchQuery.toLowerCase().trim();
    const matchedIds = [];

    catalogs.forEach((catalog) => {
      const products = catalog.products || [];
      
      products.forEach((product) => {
        const matchName = product.name?.toLowerCase().includes(query);
        const matchCode = product.code?.toLowerCase().includes(query);
        
        let matchVariant = false;
        if (product.colors && Array.isArray(product.colors)) {
          product.colors.forEach((color) => {
            if (color.color_name?.toLowerCase().includes(query)) {
              matchVariant = true;
            }
            if (color.variants && Array.isArray(color.variants)) {
              color.variants.forEach((sizeOpt) => {
                if (sizeOpt.size_name?.toLowerCase().includes(query)) {
                  matchVariant = true;
                }
              });
            }
          });
        }

        if (matchName || matchCode || matchVariant) {
          if (!matchedIds.includes(product.id)) {
            matchedIds.push(product.id);
          }
        }
      });
    });

    setFilteredProductIds(matchedIds);
  }, [searchQuery, catalogs]);

  const handleAddProduct = () => {
    if (!canManage) return;
    setCurrentProduct(null); 
    setIsDialogOpen(true);
  };

  const handleEditProduct = (product) => {
    if (!canManage) return;
    setCurrentProduct(product);
    setIsDialogOpen(true);
  };

  const handleSaveSuccess = () => {
    fetchCatalogs('all'); 
    setIsDialogOpen(false); 
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4 lg:p-8 font-arabic" dir="rtl">
      
      {view === 'catalogs' ? (
        <>
          <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="text-right">
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">إدارة المنتجات</h1>
              <p className="text-slate-500 font-bold mt-1">قم بتنظيم منتجاتك في أقسام احترافية</p>
            </div>
          </div>

          <CatalogsPage 
            catalogs={catalogs} 
            loading={loading} 
            canManage={canManage}
            onRefresh={() => fetchCatalogs('all')} 
            onSelect={(cat) => { setSelectedCatalog(cat); setView('products'); }}
            onAddProduct={handleAddProduct}
            onFilteredProductIdsChange={setFilteredProductIds}
            filteredProductIds={filteredProductIds}
            isSearching={searchQuery.trim().length > 0}
          />
        </>
      ) : (
        <CatalogProductsView 
          catalog={selectedCatalog} 
          canManage={canManage}
          onBack={() => { setView('catalogs'); setSelectedCatalog(null); }} 
          onEditProduct={canManage ? handleEditProduct : undefined}
          onAddProduct={canManage ? handleAddProduct : undefined}
          onDownloadQR={async (p) => {
            try {
              await catalogApi.downloadProductQRs(p.id);
            } catch (err) {
              console.error(err);
            }
          }}
        />
      )}

{canManage && isDialogOpen && (
        <ProductFormDialog 
          open={isDialogOpen} 
          onOpenChange={setIsDialogOpen} 
          productToEdit={currentProduct} 
          onSaveSuccess={handleSaveSuccess} 
        />
      )}
    </div>
  );
};

export default ProductsPage;