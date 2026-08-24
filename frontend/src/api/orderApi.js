import axios from 'axios';
import { API_TIMEOUT_MS } from '../utils/netErrors';

// ========= خريطة تحويل حالات الطلب من الإنجليزية إلى العربية =========
// تتوافق مع قيم الـ ENUM في قاعدة البيانات
export const STATUS_MAP = {
    'pending':        'معلق',
    'in_preparation': 'قيد التجهيز',
    'prepared':       'تم التجهيز',
    'shipped':        'تم اسناده للتوصيل',
    'delivered':      'تم التوصيل',
    'cancelled':      'ملغي',
    'returned':       'مرتجع بالكامل',
    // القيم العربية تعود كما هي (لو قادمة من الـ API مباشرة)
    'معلق':           'معلق',
    'قيد التجهيز':   'قيد التجهيز',
    'تم التجهيز':    'تم التجهيز',
    'تم اسناده للتوصيل': 'تم اسناده للتوصيل',
    'تم التوصيل':    'تم التوصيل',
    'ملغي':           'ملغي',
    'مرتجع بالكامل': 'مرتجع بالكامل',
};

export const mapStatusToArabic = (status) => {
    return STATUS_MAP[status] || status || 'غير معروف';
};

// خريطة عكسية لتحويل الحالة العربية لإنجليزية قبل الإرسال للـ API
export const STATUS_MAP_REVERSE = {
    'معلق':           'pending',
    'قيد التجهيز':   'in_preparation',
    'تم التجهيز':    'prepared',
    'تم اسناده للتوصيل': 'shipped',
    'تم التوصيل':    'delivered',
    'ملغي':           'cancelled',
    'مرتجع بالكامل': 'returned',
};

const API_BASE_URL = window.location.origin;

const api = axios.create({ baseURL: API_BASE_URL, timeout: API_TIMEOUT_MS });

// إضافة التوكن تلقائياً لكل الطلبات
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

export const orderApi = {

    /**
     * جلب قائمة الطلبات مع دعم الفلترة والبحث والصفحات
     * يتوافق مع: GET /orders/
     * @param {object} params - { skip, limit, status, search }
     */
    getOrders: async (params = {}) => {
        try {
            const response = await api.get('/orders/', {
                params: {
                    skip: params.skip || 0,
                    limit: params.limit || 50,
                    status: params.status || undefined,
                    search: params.search || undefined,
                },
            });
            // الـ Backend يرجع order_id بدلاً من id، لذا نُعيد تعيينها
            const data = Array.isArray(response.data) ? response.data : [];
            return data.map(order => ({
                ...order,
                id: order.id ?? order.order_id, // دعم كلا التنسيقين
                // تعيين الحالات العربية بناءً على الحالات الإنجليزية من DB
                status: mapStatusToArabic(order.status),
            }));
        } catch (error) {
            console.error('Error fetching orders:', error.response?.data || error.message);
            throw error.response?.data?.detail || 'حدث خطأ أثناء جلب الطلبات.';
        }
    },

    /**
     * إنشاء طلب مبيعات جديد
     * يتوافق مع: POST /orders/create
     * @param {object} orderData - { customer_name, customer_phones, address, social_media_source?, notes?, items: [{variant_id, quantity}], shipping_provider?, darb_service_id?, darb_city?, darb_area?, darb_payment_by?, delivery_gender? }
     */
    createOrder: async (orderData) => {
        try {
            // تحويل customer_phones إلى مصفوفة إذا كانت نصاً
            const phones = Array.isArray(orderData.customer_phones)
                ? orderData.customer_phones
                : [orderData.customer_phones];

            const payload = {
                customer_name: orderData.customer_name,
                customer_phones: phones,
                address: orderData.address,
                social_media_source: orderData.social_media_source || null,
                notes: orderData.notes || null,
                items: orderData.items, // [{variant_id: int, quantity: int}]
                shipping_provider: orderData.shipping_provider || 'custom',
                darb_service_id: orderData.darb_service_id || null,
                darb_city: orderData.darb_city || null,
                darb_area: orderData.darb_area || null,
                darb_payment_by: orderData.darb_payment_by || 'receiver',
                delivery_gender: orderData.delivery_gender || 'رجالي',
            };

            const response = await api.post('/orders/create', payload);
            const d = response.data;
            return { ...d, status: mapStatusToArabic(d.status) };
        } catch (error) {
            console.error('Error creating order:', error.response?.data || error.message);
            throw error.response?.data?.detail || 'حدث خطأ أثناء إنشاء الطلب.';
        }
    },

    /**
     * إنشاء طلب بيع سريع مباشر (Prepared وتحويل فوري للمخزون)
     * يتوافق مع: POST /orders/quick-sale
     * @param {object} saleData - { customer_name, items: [{variant_id, quantity}] }
     */
    quickSale: async (saleData) => {
        try {
            const payload = {
                customer_name: saleData.customer_name,
                customer_phone: saleData.customer_phone || null,
                items: saleData.items,
            };
            const response = await api.post('/orders/quick-sale', payload);
            return response.data;
        } catch (error) {
            console.error('Error executing quick sale:', error.response?.data || error.message);
            throw error.response?.data?.detail || 'حدث خطأ أثناء تنفيذ البيع السريع.';
        }
    },



    /**
     * جلب تفاصيل طلب كاملة (العميل + المنتجات + الموظفون + التقدم)
     * يتوافق مع: GET /orders/{order_id}/details
     * @param {number} orderId
     */
    getOrderDetails: async (orderId) => {
        try {
            const response = await api.get(`/orders/${orderId}/details`);
            const d = response.data;

            // تسوية هيكل البيانات من الباك اند إلى هيكل موحد تتوقعه الواجهة
            // get_order_full_details_logic يرجع بنية متداخلة:
            // { order_id, status, time_ago, customer:{...}, personnel:{...}, items:[...], summary:{...} }
            const isNested = d && d.customer && d.summary;
            if (isNested) {
                return {
                    id:             d.order_id,
                    status:         mapStatusToArabic(d.status),
                    time_ago:       d.time_ago || '',
                    // بيانات العميل (مسطّحة)
                    customer_name:  d.customer?.name,
                    customer_phones: Array.isArray(d.customer?.phones)
                        ? d.customer.phones
                        : d.customer?.phones ? [d.customer.phones] : [],
                    address:        d.customer?.address,
                    social_media_source: d.customer?.source,
                    notes:          d.customer?.notes,
                    // الموظفون
                    created_by_name:          d.personnel?.created_by,
                    inventory_employee_name:   d.personnel?.inventory_employee,
                    delivery_man_name:         d.personnel?.delivery_man,
                    // بيانات الشحن والتتبع
                    shipping_provider: d.shipping_provider || d.shipping?.provider || 'custom',
                    tracking_number:   d.tracking_number || d.shipping?.tracking_number || null,
                    shipment_id:       d.shipment_id || d.shipping?.shipment_id || null,
                    delivery_info:     d.delivery_info || d.shipping?.delivery_info || null,
                    actions:           d.actions || [],
                    // ملخص الأرقام
                    total_price:            d.summary?.total_price,
                    total_ordered_qty:       d.summary?.total_ordered_qty,
                    total_picked_qty:        d.summary?.total_picked_qty,
                    progress_percentage:     d.summary?.overall_progress_percentage,
                    // المنتجات — تسوية حقول items من الباك اند
                    items: (d.items || []).map((item, idx) => ({
                        id:             item.id ?? idx,
                        product_name:   item.product_name,
                        quantity:       item.quantity,
                        picked_quantity: item.picked_quantity ?? 0,
                        price_at_order: item.price,
                        image_url:      item.image,
                        color_name:     item.color_name,
                        size:           item.size,
                        variant_id:     item.variant_id,
                    })),
                };
            }

            // إذا كان الهيكل مسطّحاً (OrderFullDetailResponse) ← تحويل الحالة فقط
            return {
                ...d,
                id:     d.id ?? d.order_id,
                status: mapStatusToArabic(d.status),
                shipping_provider: d.shipping_provider || 'custom',
                tracking_number: d.tracking_number || null,
                shipment_id: d.shipment_id || null,
                delivery_info: d.delivery_info || null,
                actions: d.actions || [],
            };
        } catch (error) {
            console.error(`Error fetching order ${orderId} details:`, error.response?.data || error.message);
            throw error.response?.data?.detail || 'حدث خطأ أثناء جلب تفاصيل الطلب.';
        }
    },

    /**
     * تعديل بيانات طلب موجود (الحالة، بيانات العميل، الشحن، إلخ)
     * يتوافق مع: PUT /orders/{order_id}/update
     * @param {number} orderId
     * @param {object} updateData - الحقول المراد تعديلها فقط
     */
    updateOrder: async (orderId, updateData) => {
        try {
            const response = await api.put(`/orders/${orderId}/update`, updateData);
            const d = response.data;
            return { ...d, status: mapStatusToArabic(d.status) };
        } catch (error) {
            console.error(`Error updating order ${orderId}:`, error.response?.data || error.message);
            throw error.response?.data?.detail || 'حدث خطأ أثناء تعديل الطلب.';
        }
    },

    /**
     * حذف طلب وإعادة الكميات المحجوزة للمخزون
     * يتوافق مع: DELETE /orders/{order_id}/delete
     * @param {number} orderId
     */
    deleteOrder: async (orderId) => {
        try {
            const response = await api.delete(`/orders/${orderId}/delete`);
            return response.data;
        } catch (error) {
            console.error(`Error deleting order ${orderId}:`, error.response?.data || error.message);
            throw error.response?.data?.detail || 'حدث خطأ أثناء حذف الطلب.';
        }
    },

    /**
     * مسح كود QR لتجهيز عنصر في طلب معين
     * يتوافق مع: POST /orders/{order_id}/scan
     * @param {number} orderId
     * @param {string} qrCode - الكود الممسوح ضوئياً
     */
    scanOrderItem: async (orderId, qrCode) => {
        try {
            const response = await api.post(`/orders/${orderId}/scan`, { qr_code: qrCode });
            return response.data;
        } catch (error) {
            console.error('Error scanning QR:', error.response?.data || error.message);
            throw error.response?.data?.detail || 'حدث خطأ أثناء مسح الكود.';
        }
    },

    /**
     * مسح يدوي للعنصر باستخدام variant_id
     */
    scanOrderItemManual: async (orderId, variantId) => {
        try {
            const response = await api.post(`/orders/${orderId}/scan`, { variant_id: variantId });
            return response.data;
        } catch (error) {
            console.error('Error manual scanning:', error.response?.data || error.message);
            throw error.response?.data?.detail || 'حدث خطأ أثناء المسح اليدوي.';
        }
    },

    /**
     * إسناد بيانات التوصيل لطلب (اسم الناقل + نوع التوصيل)
     * يتوافق مع: POST /orders/{order_id}/assign-delivery
     * @param {number} orderId
     * @param {string} deliveryName - اسم المندوب أو شركة الشحن
     * @param {string} deliveryType - نوع التوصيل
     */
    assignDelivery: async (orderId, deliveryName, deliveryType) => {
        try {
            const response = await api.post(`/orders/${orderId}/assign-delivery`, {
                delivery_name: deliveryName,
                delivery_type: deliveryType,
            });
            const d = response.data;
            return { ...d, status: mapStatusToArabic(d.status) };
        } catch (error) {
            console.error('Error assigning delivery:', error.response?.data || error.message);
            throw error.response?.data?.detail || 'حدث خطأ أثناء إسناد بيانات التوصيل.';
        }
    },

    /**
     * تحديث حالة الطلب (تم التوصيل / مرتجع بالكامل)
     * يعتمد على: PUT /orders/{order_id}/update مع تغيير الحقل status
     * @param {number} orderId
     * @param {string} newStatus - الحالة الجديدة
     */
    updateOrderStatus: async (orderId, newStatus) => {
        try {
            // تحويل الحالة العربية إلى إنجليزية قبل الإرسال للـ DB
            const dbStatus = STATUS_MAP_REVERSE[newStatus] || newStatus;
            const response = await api.put(`/orders/${orderId}/update`, { status: dbStatus });
            return response.data;
        } catch (error) {
            console.error('Error updating order status:', error.response?.data || error.message);
            throw error.response?.data?.detail || 'حدث خطأ أثناء تحديث الحالة.';
        }
    },

    /**
     * جلب إحصائيات المخزون للوحة المبيعات
     * يتوافق مع: GET /orders/inventory-stats/test
     * @param {string} period - الفترة الزمنية (7d, 30d, all)
     */
    getInventoryStats: async (period = 'all') => {
        try {
            const response = await api.get('/orders/inventory-stats/test', { params: { period } });
            // إذا كان الباك اند يعيد الكائن مغلفاً بـ data نأخذه، وإلا نأخذ response.data مباشرة
            return response.data?.data || response.data || null;
        } catch (error) {
            console.error('Error fetching inventory stats:', error.response?.data || error.message);
            return null;
        }
    },

    /**
     * جلب جميع المنتجات النشطة مع المتغيرات للاختيار منها عند إنشاء الطلب
     * يتوافق مع: GET /orders/all-with-variants
     */
    getAllProductsWithVariants: async () => {
        try {
            const response = await api.get('/orders/all-with-variants');
            if (!response.data?.success) return [];

            const raw = response.data.products || [];

            // الباك اند يرجع variants مسطّحة لكل منتج:
            // { product_id, product_name, variants: [{variant_id, color_name, color_image, size_name, quantity_available...}] }
            // نحولها إلى بنية colors > variants لتناسب مكوّن ProductSelector
            return raw.map(p => {
                // تجميع المتغيرات حسب اللون
                const colorMap = {};
                (p.variants || []).forEach(v => {
                    const key = v.color_name || 'غير محدد';
                    if (!colorMap[key]) {
                        colorMap[key] = {
                            id:          key,
                            color_name:  key,
                            color_image: v.color_image,
                            variants:    [],
                        };
                    }
                    // الكود المعروض: الصيغة القصيرة 00075-1-1 فقط. لا نعرض مسار
                    // صورة الـ QR كأنه كود (كان يظهر /static/uploads/qrcodes/...).
                    const displaySku = v.variant_sku
                        || (v.sku && !/[\\/]|\.(png|jpe?g|webp)$/i.test(v.sku) ? v.sku : '');
                    colorMap[key].variants.push({
                        id:                 v.variant_id,
                        size_name:          v.size_name,
                        sku:                displaySku,
                        qr_code:            v.qr_code,
                        quantity_available: v.quantity_available ?? 0,
                        quantity_reserved:  v.quantity_reserved  ?? 0,
                    });
                });

                return {
                    id:     p.product_id,
                    name:   p.product_name,
                    code:   p.product_code || '',
                    image:  p.main_image,
                    price:  p.prices?.selling_price,
                    colors: Object.values(colorMap),
                };
            });
        } catch (error) {
            console.error('Error fetching products with variants:', error.response?.data || error.message);
            return [];
        }
    },

    /**
     * تحميل فاتورة الطلب كـ PDF
     * يتوافق مع: GET /orders/orders/{order_id}/invoice
     * @param {number} orderId
     */
    downloadOrderInvoice: async (orderId) => {
        try {
            // المسار الصحيح من order_router.py: GET /orders/orders/{order_id}/invoice
            const response = await api.get(`/orders/orders/${orderId}/invoice`, {
                responseType: 'blob',
            });
            const contentType = response.headers['content-type'] || 'application/pdf';
            const blob = new Blob([response.data], { type: contentType });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `invoice_${orderId}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error downloading invoice:', error.response?.data || error.message);
            throw error.response?.data?.detail || 'حدث خطأ أثناء تحميل الفاتورة.';
        }
    },

    /**
     * معاينة الطلبات المكتملة القابلة للحذف (للأدمن فقط) — لا تحذف شيئاً.
     */
    previewCompletedPurge: async () => {
        try {
            const response = await api.get('/orders/completed/purge-preview');
            return response.data;
        } catch (error) {
            console.error('Error previewing purge:', error.response?.data || error.message);
            throw error.response?.data?.detail || 'تعذّر جلب عدد الطلبات المكتملة.';
        }
    },

    /**
     * حذف نهائي للطلبات المكتملة وحركات مخزونها (للأدمن فقط).
     * لا يمس المنتجات ولا الموظفين ولا كميات المخزون.
     */
    purgeCompletedOrders: async () => {
        try {
            const response = await api.delete('/orders/completed/purge');
            return response.data;
        } catch (error) {
            console.error('Error purging completed orders:', error.response?.data || error.message);
            throw error.response?.data?.detail || 'تعذّر حذف الطلبات المكتملة.';
        }
    },

    // ==================== دوال الربط مع شركة درب السبيل ==================== //

    /**
     * جلب قائمة باقات الخدمة المتاحة من شركة درب السبيل
     */
    getDarbServices: async () => {
        try {
            const response = await api.get('/orders/shipping/darb-assabil/services');
            return Array.isArray(response.data) ? response.data : [];
        } catch (error) {
            console.error('Error fetching Darb Assabil services:', error.response?.data || error.message);
            return [
                { id: '67f19a776dabff22987169e9', name: 'توصيل عادي (Standard)', description: 'توصيل خلال 24-48 ساعة' },
                { id: '67f19a776dabff22987169e9', name: 'توصيل سريع (Express)', description: 'توصيل في نفس اليوم' },
                { id: '67f19a776dabff22987169e9', name: 'شحن بين المدن (Intercity)', description: 'شحن لجميع المدن' },
            ];
        }
    },

    /**
     * جلب قائمة المدن من شركة درب السبيل
     */
    getDarbCities: async () => {
        try {
            const response = await api.get('/orders/shipping/darb-assabil/cities');
            return Array.isArray(response.data) ? response.data : [];
        } catch (error) {
            console.error('Error fetching Darb Assabil cities:', error.response?.data || error.message);
            return [];
        }
    },

    /**
     * جلب قائمة المناطق لمدينة محددة من شركة درب السبيل
     */
    getDarbAreas: async (city) => {
        try {
            const response = await api.get('/orders/shipping/darb-assabil/areas', { params: { city } });
            return Array.isArray(response.data) ? response.data : [];
        } catch (error) {
            console.error('Error fetching Darb Assabil areas:', error.response?.data || error.message);
            return [];
        }
    },

    /**
     * جلب قائمة المدن والمناطق المدعومة من شركة درب السبيل
     */
    getDarbCitiesAndAreas: async () => {
        try {
            const response = await api.get('/orders/shipping/darb-assabil/cities-areas');
            return response.data || {};
        } catch (error) {
            console.error('Error fetching Darb Assabil cities and areas:', error.response?.data || error.message);
            return {
                "طرابلس": ["سوق الجمعة", "تاجوراء", "جنزور", "حي الأندلس", "بن عاشور", "عين زارة", "السراج", "غوط الشعال", "أبو سليم", "صلاح الدين"],
                "بنغازي": ["الفويهات", "الكيش", "الصابري", "سيدي حسين", "الحدائق", "الماجوري", "الليثي", "طابلينو", "الهواري"],
                "مصراتة": ["وسط المدينة", "قصر أحمد", "السكت", "الزروق", "الغيران", "طمينة", "يدر", "المحجوب"],
                "الزاوية": ["وسط المدينة", "الزاوية الجنوبية", "الزاوية الغربية", "جوددائم", "الحرشة"],
                "زليتن": ["وسط المدينة", "البازة", "الجمعة", "المنارة", "الساحل"],
                "الخمس": ["وسط المدينة", "سوق الخميس", "كعبار", "سيلين", "لبدة"],
            };
        }
    },

    /**
     * إنشاء أو إعادة إرسال بوليصة الشحن لشركة درب السبيل لطلب محدد
     * @param {number} orderId
     * @param {object} shipmentData - { service, city, area, address, paymentBy, notes }
     */
    createDarbShipment: async (orderId, shipmentData) => {
        try {
            const response = await api.post(`/orders/${orderId}/shipping/darb-assabil/create-shipment`, shipmentData);
            return response.data;
        } catch (error) {
            console.error('Error creating Darb Assabil shipment:', error.response?.data || error.message);
            throw error.response?.data?.detail || 'تعذّر إرسال الشحنة لشركة درب السبيل.';
        }
    },
};
