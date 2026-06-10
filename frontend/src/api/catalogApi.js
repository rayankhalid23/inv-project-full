import axios from 'axios';

// 1. إعداد القاعدة الأساسية للطلب لضمان عدم تكرار العناوين
const API_BASE_URL = 'http://localhost:8000'; // تأكد من أن هذا هو رابط السيرفر لديك

const api = axios.create({
    baseURL: API_BASE_URL,
});

// 2. "Interceptor" لإضافة التوكن تلقائياً لكل الطلبات بدل تكرار الكود
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export const catalogApi = {
    // --- قسم إدارة الكتالوجات (CRUD) ---
    
    // جلب الكتالوجات مع الفلترة بالحالة
     // الدالة المحدثة لتتطابق تماماً مع منطق الباك اند لديك
    fetchCatalogs: async (status) => {
    // إعداد البارامترات بناءً على ما يتوقعه الباك اند (نشط، غير نشط، أو الكل)
      const params = {};
    
      if (status === 'active') {
          params.status = 'نشط';
      } else if (status === 'inactive') {
          params.status = 'غير نشط';
      } else {
          params.status = 'الكل'; // القيمة الافتراضية في الباك اند
      }

      const response = await api.get('/catalogs/catalogs/', { params });
      return response.data;
    },

    // إضافة كتالوج جديد
    createCatalog: async (name) => {
        const response = await api.post('/catalogs/catalogs/', { name });
        return response.data;
    },

    // تعديل كتالوج
    updateCatalog: async (id, name) => {
        const response = await api.put(`/catalogs/catalogs/${id}`, { name });
        return response.data;
    },

    // تغيير حالة الكتالوج (نشط/معطل)
    toggleCatalogStatus: async (id) => {
        const response = await api.patch(`/catalogs/catalogs/${id}/toggle`, {});
        return response.data;
    },

    // --- قسم الفلترة والداشبورد ---

    // جلب منتجات لوحة التحكم (Infinite Scroll)
    getProductsDashboard: async (filters = {}) => {
        try {
            const response = await api.get('/products/products/dashboard', {
                params: {
                    offset: filters.offset || 0,
                    limit: filters.limit || 20,
                    search: filters.search || undefined,
                    catalog_id: filters.catalog_id || undefined,
                    size_id: filters.size_id || undefined,
                    out_of_stock: filters.out_of_stock || false,
                    low_stock: filters.low_stock || false,
                },
            });
            return response.data;
        } catch (error) {
            console.error("Error fetching dashboard products:", error);
            throw error;
        }
    },

    // جلب أسماء الكتالوجات النشطة فقط (للفلترة السريعة)
    getCatalogNames: async () => {
        try {
            const response = await api.get('/catalogs/catalogs/names-only');
            return response.data;
        } catch (error) {
            console.error("Error fetching catalog names:", error);
            return [];
        }
    },

    // جلب أسماء ومعرفات المقاسات
    getSizeNames: async () => {
        try {
            const response = await api.get('/sizes/sizes/');
            return response.data;
        } catch (error) {
            console.error("Error fetching size names:", error);
            throw error;
        }
    },

    // جلب تفاصيل المنتج العميقة (الألوان والمقاسات)
    getProductDetails: async (productId) => {
        const response = await api.get(`/products/${productId}/details`);
        return response.data;
    },

    // تصدير الكتالوج PDF
    exportCatalogPdf: async (params) => {
        const response = await api.get('/products/export-pdf', {
            params,
            responseType: 'blob', // ضروري جداً للملفات
        });
        return response.data;
    },

    // --- قسم إضافة المنتجات المتسلسل ---

    // 1. إنشاء المنتج الرئيسي (FormData)
    createProduct: async (formData) => {
        const response = await api.post('/products/products/', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return response.data; // يعيد بيانات المنتج ومعرفه ID
    },

    // 2. إضافة لون للمنتج (FormData)
    addColor: async (formData) => {
        const response = await api.post('/colors/colors/', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return response.data; // يعيد بيانات اللون ومعرفه ID
    },

    // 3. إضافة المقاسات والكميات بالجملة (Batch)
    // نلاحظ هنا نمرر الـ product_color_id في الرابط كما يطلب الباك اند لديك
    createBatchVariants: async (colorId, variantsArray) => {
        const response = await api.post(`/variants/batch-create`, variantsArray, {
            params: { product_color_id: colorId }
        });
        return response.data;
    },
    // إضافة مقاس جديد للنظام
    // تستخدم في حال أراد المستخدم إضافة مقاس غير موجود في القائمة
    createSize: async (name, sortOrder = null) => {
        try {
            const response = await api.post('/sizes/sizes/', null, {
                params: {
                    name: name,
                    sort_order: sortOrder
                }
            });
            return response.data; // يعيد كائن المقاس الجديد {id, name, sort_order}
        } catch (error) {
            console.error("Error creating size:", error);
            throw error;
        }
    },


    // 1. تحديث بيانات المنتج الأساسية (الاسم، السعر، التكلفة، الصورة الرئيسية)
  // تستخدم FormData لأن الباك إند يستقبل Form Fields وصورة
  updateProduct: async (productId, formData) => {
    // نمرر الـ formData الجاهز مباشرة من النموذج لأنه يحتوي على الـ variants والصور مسبقاً
    const response = await api.put(`/products/products/${productId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  },
  
  async updateColor(colorId, colorName, colorImage) {
    // 💡 تحويل قسري صريح إلى رقم صحيح (int) لتلبية شرط FastAPI
    const intColorId = parseInt(colorId, 10);
  
    // 🛑 حزام أمان: منع إرسال الطلب نهائياً إذا كانت القيمة NaN لحماية السيرفر من خطأ 422
    if (isNaN(intColorId)) {
      console.error("🚨 تم حظر الطلب: colorId يحمل قيمة غير صالحة (NaN)");
      return null;
    }
  
    const formData = new FormData();
    formData.append('color_name', colorName || '');
    
    if (colorImage instanceof File) {
      formData.append('image_file', colorImage);
    }
  
    const response = await api.put(`/colors/colors/${intColorId}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },


  updateVariantPartial: async (variantId, qty, minStock) => {
    const intVariantId = parseInt(variantId, 10);
    
    // 🛑 حزام أمان لمنع إرسال طلب تالف إذا كان الـ ID غير صالح
    if (isNaN(intVariantId)) {
      console.error("🚨 خطأ: variantId غير صالح (NaN)");
      return null;
    }
  
    // بناء الـ Payload النظيف والمطابق لجدول product_variants
    const dataPayload = {
      quantity_available: Number(qty || 0),
      min_stock_threshold: parseInt(minStock || 5, 10)
    };
  
    const response = await api.patch(`/variants/${intVariantId}`, dataPayload);
    return response.data;
  },

  getProductForEdit: async (productId) => {
    try {
        // نستخدم المسار الذي أنشأناه في الـ Router
        const response = await api.get(`/products/products/${productId}/details`);
        return response.data; 
        /* البيانات ستصل بنفس هيكلية الإضافة:
           { name, selling_price, colors: [{ color_name, variants: [...] }] }
        */
    } catch (error) {
        console.error("Error fetching edit data:", error);
        throw error;
    }
},

exportVariantQR: async (variantId) => {
    const response = await api.get(`/products/products/variant/${variantId}`, {
      responseType: 'blob', // مهم جداً لاستقبال ملفات PDF
    });
    return response.data;
  },

  downloadProductQRs: async (productId) => {
    try {
      // تأكد من استخدام اسم المتغير الصحيح هنا (api أو axios)
      const response = await api.get(`/products/products/product/${productId}`, {
        responseType: 'blob', 
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `product_${productId}_qrs.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url); // تنظيف الذاكرة
    } catch (error) {
      console.error("Error downloading QR:", error);
      throw error;
    }
  },

  // أضف هذه الدالة داخل ملف catalogApi.js
exportAllActiveQRs: async () => {
    try {
        const response = await api.get('/products/products/all', {
            responseType: 'blob', // مهم جداً للتعامل مع ملفات PDF
        });
        
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'all_active_qrs.pdf');
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
    } catch (error) {
        console.error("Error exporting all QRs:", error);
        throw error;
    }
},

// catalogApi.js

exportProductsPdf: async (filters) => {
    try {
        // تنظيف الفلاتر: إزالة أي قيمة فارغة أو null
        const cleanFilters = Object.fromEntries(
            Object.entries(filters).filter(([_, v]) => v !== '' && v !== null && v !== undefined)
        );

        const response = await api.get('/products/products/export-pdf', {
            params: cleanFilters, // نرسل فقط القيم المملوءة
            responseType: 'blob',
        });
        
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `Catalog_${new Date().getTime()}.pdf`);
        document.body.appendChild(link);
        link.click();
        link.remove();
    } catch (error) {
        console.error("PDF Export failed:", error);
        throw error;
    }
},
// حذف المنتج نهائياً (شامل الألوان والمقاسات والمخزن)
    // تقابل @router.delete("/product/{product_id}")
    deleteFullProduct: async (productId) => {
        try {
            const response = await api.delete(`variants/product/${productId}`);
            return response.data; // يعيد رسالة النجاح من الباك اند
        } catch (error) {
            console.error("Error deleting full product:", error);
            throw error;
        }    
    },


// جلب متغيرات المنتجات والمخزون بنظام الفلترة الشامل والذكي
getFilteredVariants: async (filters = {}) => {
    try {
        // معالجة ذكية لفلتر الكتالوج (إذا كان 'all' أو غير محدد، لا يتم إرساله ليعود الكل افتراضياً)
        const catalogIdParam = (filters.catalogId && filters.catalogId !== 'all') 
            ? Number(filters.catalogId) 
            : undefined;

        const response = await api.get('/variants/filter', {
            params: {
                search: filters.search?.trim() || undefined,
                catalog_id: catalogIdParam,
                size_id: filters.sizeId || undefined,
                low_stock_only: filters.lowStockOnly || false,
                page: filters.page || 1,
                page_size: filters.pageSize || 20,
            },
        });
        return response.data;
    } catch (error) {
        console.error("Error in getFilteredVariants API:", error.response?.data || error.message);
        throw error.response?.data?.detail || "حدث خطأ أثناء تصفية بيانات المخزون.";
    }
}, 

/**
     * الدالة الأولى: حذف "مجموعة" كاملة (اللون وجميع مقاساته المرتبطة به)
     * @param {number} colorId - الرقم التعريفي للون المراد حذفه
     * @returns {Promise<object>} - رسالة النجاح من السيرفر
     */
deleteColorGroup: async (colorId) => {
    try {
        // يتطابق المسار تماماً مع: @router.delete("/color/{color_id}")
        const response = await api.delete(`/variants/color/${colorId}`);
        return response.data;
    } catch (error) {
        console.error(`Error deleting color group with ID ${colorId}:`, error);
        // نقوم بتمرير الخطأ كما هو لكي يتم التقاطه في الـ UI (عرض رسالة صمام الأمان للمستخدم في حال وجود طلبات معلقة)
        throw error;
    }
},

/**
 * الدالة الثانية: حذف "ارتباط واحد" (مقاس محدد للون محدد)
 * @param {number} variantId - الرقم التعريفي للمقاس المراد حذفه
 * @returns {Promise<object>} - رسالة النجاح من السيرفر
 */
deleteSingleVariant: async (variantId) => {
    try {
      const intVariantId = parseInt(variantId, 10);
      if (isNaN(intVariantId)) {
        console.error("🚨 رفض طلب الحذف: variantId غير صالح");
        return null;
      }
      
      // 🚀 تم تعديل المسار ليطابق تماماً /variants/{variant_id} الظاهر في الصورة
      const response = await api.delete(`/variants/${intVariantId}`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting single variant with ID ${variantId}:`, error);
      throw error;
    }
  },
  // --- قسم عمليات الجرد السريع والمسح (رواجع / تالف) ---
/**
     * إرسال رمز الـ QR لتسجيل عملية مرتجع للمخزن (قطعة واحدة تلقائياً)
     * يتوافق تماماً مع standalone_return_logic في الباك إند
     * @param {string} qrCode - الرمز الممسوح ضوئياً
     * @param {string} note - الملاحظة أو سبب المرتجع
     */
processScanReturn: async (qrCode, note = "مرتجع") => {
    try {
        // الباك إند يتوقع qr_code و note كـ Query Parameters في الرابط
        const response = await api.post('/orders/return-item-by-qr', null, {
            params: { 
                qr_code: qrCode,
                note: note
            }
        });
        return response.data; // يعيد {"status": "success", "new_qty": ...}
    } catch (error) {
        console.error("Error in processScanReturn API:", error.response?.data || error.message);
        throw error.response?.data?.detail || "حدث خطأ أثناء تسجيل المرتجع.";
    }
},

/**
 * إرسال رمز الـ QR لتسجيل عملية إتلاف من المخزن (قطعة واحدة تلقائياً)
 * يتوافق تماماً مع process_damage_logic في الباك إند
 * @param {string} qrCode - الرمز الممسوح ضوئياً
 * @param {string} note - سبب الإتلاف
 */
processScanDamage: async (qrCode, note = "تالف") => {
    try {
        // الباك إند يتوقع qr_code و note كـ Query Parameters في الرابط
        const response = await api.post('/orders/mark-as-damaged', null, {
            params: { 
                qr_code: qrCode,
                note: note
            }
        });
        return response.data; // يعيد {"status": "success", "new_qty": ...}
    } catch (error) {
        console.error("Error in processScanDamage API:", error.response?.data || error.message);
        throw error.response?.data?.detail || "حدث خطأ أثناء تسجيل التالف.";
    }
},
getInventoryStats: async (period = '7d') => {
    try {
        const response = await api.get('/orders/inventory-stats/test', { params: { period } });
        // الدالة تعيد { status: "success", data: { ... } }
        // سنعيد فقط البيانات المطلوبة لتسهيل استخدامها في الفرونت
        return response.data.data; 
    } catch (error) {
        console.error("Error fetching stats:", error);
        throw error;
    }
},

/**
 * جلب جميع المنتجات النشطة مع كامل شجرة المتغيرات والإجماليات المخزنة.
 * يتوافق تماماً مع دالة الباك إند: get_products_with_variants_logic
 * @returns {Promise<Object>} يحتوي على قائمة المنتجات وإجمالي العدد الإيجابي
 */
getAllProductsWithVariants: async  (period = 'all') => {
    try {
        const response = await api.get('/orders/all-with-variants', { params: { period } });
        // الدالة تعيد في الباك إند: { success: true, total_active_products: X, products: [...] }
        // نتحقق من نجاح العملية أولاً تماشياً مع تركيبة الرد
        if (response.data && response.data.success) {
            return response.data; // نعيد الرد كاملاً ليتم الاستفادة من المنتجات والعدد الإجمالي
        }
        throw new Error(response.data?.message || "فشلت عملية جلب المنتجات");
    } catch (error) {
        console.error("Error in getAllProductsWithVariants API:", error.response?.data || error.message);
        throw error.response?.data?.detail || "حدث خطأ أثناء تحميل بيانات المنتجات والمخزون.";
    }
},

/**
 * جلب تقارير أداء المخزون المتقدمة (أفضل وأقل 5 متغيرات مبيعاً، وتالفاً، ورواجع).
 * يتوافق تماماً مع دالة الباك إند: get_top_and_bottom_inventory_report_logic
 * @returns {Promise<Object>} مصفوفات مصنفة وجاهزة لعرض الرسوم البيانية والجداول الإحصائية
 */
getInventoryTopBottomReports: async (period = '7d') => {
    try {
        const response = await api.get('/orders/inventory-analytics/top-bottom', { params: { period } });
        // الدالة تعيد في الباك إند: { success: true, data: { top_5_selling: [...], ... } }
        if (response.data && response.data.success) {
            return response.data.data; // نعيد حقل data مباشرة لتبسيط الاستهلاك في مكونات التقارير والـ Charts
        }
        throw new Error(response.data?.message || "فشلت عملية جلب التقارير التحليلية");
    } catch (error) {
        console.error("Error in getInventoryTopBottomReports API:", error.response?.data || error.message);
        throw error.response?.data?.detail || "حدث خطأ أثناء تحميل التقارير التحليلية للمخزون.";
    }
},

exportComprehensiveReportPdf: async (period = '7d') => {
    try {
        const response = await api.get('/analytics/reports/export-pdf', {
            params: { period },
            responseType: 'blob',
        });
        
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `Bellagio_Comprehensive_Report_${period}_${new Date().toISOString().slice(0,10)}.pdf`);
        document.body.appendChild(link);
        link.click();
        link.remove();
    } catch (error) {
        console.error("Comprehensive PDF Export failed:", error);
        throw error;
    }
},

/**
 * جلب سجل حركات المخزن المتقدم (Inventory Ledger) مع دعم الفلترة الشاملة والصفحات.
 * يتوافق تماماً مع دالة الباك إند: read_inventory_ledger
 * * @param {Object} params - فلاتر البحث الاختيارية والصفحات
 * @param {number} [params.skip=0] - عدد السجلات المراد تخطيها
 * @param {number} [params.limit=20] - عدد السجلات في الصفحة الواحدة
 * @param {number} [params.user_id] - تصفية حسب الموظف الذي قام بالحركة
 * @param {number} [params.product_id] - تصفية حسب المنتج الأب
 * @param {number} [params.variant_id] - تصفية حسب المتغير الدقيق
 * @param {string} [params.movement_type] - نوع الحركة (in, out, damage, adjustment)
 * @param {number} [params.order_id] - تصفية بحسب رقم الطلب المرتبط
 * @param {string} [params.time_preset] - اختصارات زمنية (today, week, month)
 * @param {string} [params.start_date] - تاريخ البداية (ISO String)
 * @param {string} [params.end_date] - تاريخ النهاية (ISO String)
 * @returns {Promise<{total: number, items: Array}>} يعيد إجمالي عدد السجلات مع مصفوفة الحركات الحالية
 */
getInventoryLedger: async (params = {}) => {
    try {
        // تعيين قيم افتراضية للـ Pagination في حال لم يتم تمريرها من الواجهة
        const queryParams = { skip: 0, limit: 20, ...params };
        
        const response = await api.get('/inventory/ledger', { params: queryParams });
        const responseData = response.data;

        // السيناريو الأول: إذا كان الباك إند يرسل مصفوفة مباشرة (الوضع الحالي الفعلي)
        if (Array.isArray(responseData)) {
            return {
                items: responseData,
                total: responseData.length // نعتمد على طول المصفوفة كعدد إجمالي مؤقت
            };
        }
        
        // السيناريو الثاني: إذا كان الباك إند يعيد كائن مغلف بالكامل يحتوي على total و items
        if (responseData && typeof responseData.total !== 'undefined') {
            return {
                items: responseData.items || [],
                total: responseData.total
            }; 
        }
        
        throw new Error("تنسيق رد البيانات من الخادم غير متوافق مع نظام الصفحات.");
    } catch (error) {
        console.error("Error in getInventoryLedger API:", error.response?.data || error.message);
        // تمرير تفاصيل الخطأ القادمة من FastAPI مباشرة للواجهة لعرضها في نوتيفيكيشن
        throw error.response?.data?.detail || "حدث خطأ غير متوقع أثناء تحميل سجل الحركات المخزنية.";
    }
},

clearReturns: async (variantId = null) => {
    try {
        const response = await api.post('/inventory/clear-returns', null, {
            params: variantId ? { variant_id: variantId } : {}
        });
        return response.data;
    } catch (error) {
        console.error("Error in clearReturns API:", error);
        throw error.response?.data?.detail || "حدث خطأ أثناء تصفير الرواجع.";
    }
},

clearDamages: async (variantId = null) => {
    try {
        const response = await api.post('/inventory/clear-damages', null, {
            params: variantId ? { variant_id: variantId } : {}
        });
        return response.data;
    } catch (error) {
        console.error("Error in clearDamages API:", error);
        throw error.response?.data?.detail || "حدث خطأ أثناء تصفير التوالف.";
    }
},

deleteMovement: async (movementId) => {
    try {
        const response = await api.delete(`/inventory/movement/${movementId}`);
        return response.data;
    } catch (error) {
        console.error("Error in deleteMovement API:", error);
        throw error.response?.data?.detail || "حدث خطأ أثناء حذف الحركة.";
    }
},
};

