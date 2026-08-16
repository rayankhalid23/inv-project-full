# وثيقة التسليم التقني للنظام (Technical Handover Document)
**اسم النظام:** نظام بيلاجيو لإدارة المخزون والمبيعات (Bellagio Inventory & Sales Management System)  
**الإصدار البرمجي:** 1.1.0 (PWA Production Ready)  
**نوع الوثيقة:** وثيقة تسليم تقنية شاملة وشديدة الدقة (Technical Handover)  
**التاريخ:** 2026-08-15  

---

## 1. نظرة عامة وهيكلية المشروع (Project Overview & Tech Stack)

النظام عبارة عن تطبيق ويب متقدم ومتكامل (Full-Stack PWA) مخصص لإدارة المخزون، المنتجات، المبيعات السريعة، طلبيات الشحن والتوصيل، مسح الباركود وQR، وإصدار التقارير المالية والإدارية مع دعم العمل أوفلاين والمزامنة السحابية.

### 1.1 المعمارية التقنية (Tech Stack)

#### أ. الواجهة الخلفية (Backend Architecture):
- **اللغة:** Python 3.10+
- **إطار العمل:** FastAPI (v0.136.1) مبني وفق معمارية Clean Layered Architecture (Routers, Services, CRUD, Models, Schemas, Core).
- **خادم التطبيق:** Uvicorn (v0.46.0) مع Proactor Event Loop لنظام Windows وإدارة متقدمة لـ Thread Pools عبر `anyio`.
- **محرك قاعدة البيانات وORM:** SQLAlchemy (v2.0.49) عبر بروتوكول MySQL المباشر وتنسيق الـ Locks و `with_for_update` لمنع الـ Race Conditions والـ Deadlocks.
- **المصادقة والتشفير:** JWT (JSON Web Tokens) عبر `python-jose` (v3.5.0) مع تجزئة كلمات المرور عبر `passlib` (v1.7.4) بخوارزمية bcrypt.
- **معالجة الصور والـ QR Code:** `Pillow` (v12.2.0) و `qrcode` (v8.2) لتوليد رموز الاستجابة السريعة للمنتجات والمتغيرات تلقائياً وتخزينها في مسارات ثابتة معزولة.
- **توليد ملفات الـ PDF والفواتير:** مولد فواتير وتقارير مدمج ومخصص يدعم النصوص العربية المعكوسة وتنسيقات الطباعة الحرارية والعادية.

#### ب. الواجهة الأمامية (Frontend Architecture):
- **إطار العمل الأساسي:** React 19 (v19.2.5) مع JSX.
- **أداة البناء والتجميع:** Vite (v8.0.10) مجهزة بنظام Code Splitting عبر Rollup و Chunks مستقلة للباقات الضخمة.
- **التصميم والتنسيق:** Tailwind CSS v4 مع نظام ألوان برغندي مخصص (`#800000` / `#6b1d2f`) وفئات مساعدة عبر `clsx` و `tailwind-merge`.
- **التوجيه (Routing):** React Router DOM v7 (v7.15.0).
- **التعامل مع الكاميرا والباركود:** `html5-qrcode` (v2.3.8) مدمجة مع نظام الماسح الضوئي الليزري والمسح اليدوي وصافرات التنبيه الصوتي الحية.
- **تقنية الـ PWA والأوفلاين:** `vite-plugin-pwa` (v1.3.0) مع Service Worker مخصص واستراتيجية App Shell Precaching و IndexedDB لتخزين الإجراءات المحلية والمزامنة عند عودة الاتصال.
- **الأيقونات والتنبيهات:** `lucide-react` (v1.14.0) و `react-hot-toast` (v2.6.0).

---

### 1.2 الهيكلية الشجرية للمشروع (Directory Structure)

```text
inv-project-full/
├── app/
│   ├── core/                  # التهيئة الأساسية، الأمان، قواعد البيانات، ومعالجة الوسائط
│   │   ├── config.py          # قراءة إعدادات البيئة
│   │   ├── database.py        # جلسات SQLAlchemy ومجمع الاتصالات (Connection Pool)
│   │   ├── deps.py            # حاقنات الاعتمادية (Dependencies) والتحقق من التوكن
│   │   ├── media.py           # معالجة وحفظ الصور وتوليد روابطها الثابتة
│   │   ├── security.py        # دوال تشفير وفك تشفير الـ Hash وتوليد الـ Tokens
│   │   ├── utils.py           # دوال مساعدة موحدة
│   │   └── websocket_manager.py # مدير قنوات الاتصال الحي (WebSockets)
│   ├── models/                # نماذج الجداول (SQLAlchemy Declarative Models)
│   │   ├── base.py            # الأساس المشترك لكافة الجداول
│   │   ├── inventory.py       # جداول المنتجات، الأصناف، الألوان، والمقاسات
│   │   ├── inventory_movement_model.py # جداول حركات المخزون، التوالف، والتنبيهات
│   │   ├── order.py           # جداول الطلبيات، بنود الطلب، وسجل الحركات
│   │   ├── role.py            # جدول الأدوار والصلاحيات
│   │   └── user.py            # جدول المستخدمين والموظفين
│   ├── routers/               # مسارات الـ API (Controllers)
│   │   ├── __init__.py        # تجميع وحماية المسارات وتطبيق التبعيات
│   │   ├── auth.py            # تسجيل الدخول وتجديد الجلسات
│   │   ├── catalogs.py        # تصنيفات المنتجات (Categories)
│   │   ├── colors.py          # ألوان المنتجات وإدارتها
│   │   ├── inventory_movement_router.py # حركات المخزون، التوريد، التوالف، والـ QR
│   │   ├── order_router.py    # إنشاء ومتابعة الطلبات والشحن وبوالص التوصيل
│   │   ├── products.py        # المنتجات الرئيسية وعمليات الـ CRUD
│   │   ├── Reporting.py       # التقارير والإحصائيات والملخصات المالية
│   │   ├── sizes.py           # مقاسات المنتجات
│   │   ├── users.py           # إدارة حسابات الموظفين والصلاحيات
│   │   └── variants.py        # متغيرات المنتجات (SKU / Barcode / Stock)
│   ├── schemas/               # هياكل التحقق من البيانات (Pydantic Models)
│   └── services/              # طبقة المنطق البرمجي (Business Logic Layer)
│       ├── audit_service.py   # تسجيل سجلات الرقابة والتدقيق الأمني
│       ├── darb_assabil_service.py # خدمة التكامل والربط مع شركة درب السبيل
│       ├── inventory_movement_service.py # إدارة التوريد والصرف ومسح الـ QR
│       ├── order_service.py   # معالجة الطلبات، البيع السريع، والفواتير
│       ├── pdf_generator.py   # توليد فواتير المبيعات بصيغة PDF
│       ├── qr_service.py      # توليد وتخزين رموز الـ QR Code
│       ├── reports_pdf_generator.py # توليد تقارير الجرد والحركات PDF
│       └── time_helper.py     # معالجة التوقيت والتواريخ النسبية
├── frontend/                  # تطبيق الواجهة الأمامية (React + Vite PWA)
│   ├── src/
│   │   ├── api/               # وحدات استدعاء الـ API (axios clients)
│   │   ├── components/        # المكونات العامة، منتقي المنتجات، وماسح الكاميرا
│   │   ├── context/           # سياق المصادقة والـ Offline Store
│   │   └── pages/             # الصفحات الرئيسية (Sales, Products, Reports, Settings...)
│   ├── dist/                  # حزمة الإنتاج الجاهزة ومخازن الـ Service Worker
│   └── package.json           # مكتبات الواجهة الأمامية وإعدادات Vite
├── static/                    # الملفات الثابتة والصور المرفوعة ورموز الـ QR
├── main.py                    # نقطة الدخول الرئيسية للخادم (FastAPI Application Entry)
├── requirements.txt           # مكتبات بايثون المطلوبة للتشغيل
├── run-project.py             # سكربت الإطلاق التلقائي الموحد (Backend + Frontend)
└── .env                       # ملف متغيرات البيئة
```

---

## 2. متغيرات البيئة وإعدادات التشغيل (Environment Setup & .env)

يتم ضبط المتغيرات داخل ملف `.env` في المجلد الجذري للمشروع. يوضح الجدول التالي أسماء كافة المتغيرات ووظيفة كل منها دون كشف أي بيانات حساسة:

| اسم المتغير (Variable Name) | نوع القيمة | الوظيفة البرمجية والهدف |
| :--- | :--- | :--- |
| `DATABASE_URL` | URI String | رابط الاتصال بقاعدة بيانات MySQL (يتضمن المستخدم، كلمة المرور، المضيف، واسم القاعدة). |
| `SECRET_KEY` | String (Cryptographic) | المفتاح السري المستخدم في توقيع وفك تشفير رموز الـ JWT لمصادقة المستخدمين. |
| `ALGORITHM` | String (مثال: `HS256`) | خوارزمية التشفير الرياضية المستخدمة في توقيع الـ JWT. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Integer (بالدقائق) | مدة صلاحية جلسة تسجيل الدخول قبل انتهاء صلاحية التوكن. |
| `DARB_ASSABIL_BASE_URL` | URL String | عنوان خادم الـ API لشركة الشحن "درب السبيل" (الافتراضي: `https://v2.sabil.ly`). |
| `DARB_ASSABIL_API_KEY` | JWT Token String | مفتاح المصادقة وتفويض العمليات مع تطبيق وخدمات شركة درب السبيل. |
| `DARB_ASSABIL_ACCOUNT_ID` | Hex ID String | معرّف الحساب المعتمد للمتجر لدى شركة الشحن لإسناد الشحنات والباقات. |
| `SYNC_WORKER_THREADS` | Integer (اختياري) | عدد الخيوط التزامنية لمعالجة الطلبات بالتوازي في خادم FastAPI. |

---

## 3. مخطط قاعدة البيانات والجداول (Database Schema & Models)

تم تصميم قاعدة البيانات وفق أعلى معايير العلاقات (Relational Integrity) مع تطبيق الفهارس (Indexes) والحذف المرن (Soft Delete) لمنع فقدان البيانات.

### 3.1 جدول المستخدمين والأدوار (`users`, `roles`)
- **`users`**: الحسابات وبيانات الدخول (`id`, `username`, `password_hash`, `full_name`, `role_id`, `is_active`, `created_at`, `updated_at`).
- **`roles`**: الصلاحيات والأدوار (`id`, `name`, `permissions` كحقل JSON يحدد صلاحيات كل شاشة).

### 3.2 جداول الكتالوج والمخزون (`products`, `product_colors`, `product_variants`, `categories`, `sizes`)
- **`categories`**: تصنيفات المنتجات الرئيسية (`id`, `name`, `description`).
- **`sizes`**: المقاسات المعيارية للأصناف (`id`, `name`, `description`).
- **`products`**: المنتج الرئيسي (`id`, `name`, `description`, `sku`, `category_id`, `base_price`, `selling_price`, `total_quantity`, `total_reserved`, `total_sold`, `image_url`, `is_active`, `deleted_at`).
- **`product_colors`**: ألوان المنتج والصور المخصصة لكل لون (`id`, `product_id`, `color_name`, `color_code`, `image_url`).
- **`product_variants`**: الصنف المخزني الفرعي (SKU الحقيقي) (`id`, `color_id`, `size_id`, `sku`, `barcode`, `qr_code`, `qr_code_path`, `quantity_available`, `quantity_reserved`, `total_sold`, `price`, `deleted_at`).

### 3.3 جداول الطلبيات والمبيعات (`orders`, `order_items`, `order_actions`)
- **`orders`**: الطلب الرئيسي (`id`, `customer_name`, `customer_phones` كـ JSON, `address`, `social_media_source`, `notes`, `total_price`, `status`, `created_by`, `inventory_employee_id`, `delivery_info`, `shipping_provider`, `tracking_number`, `shipment_id`, `created_at`, `updated_at`, `deleted_at`).
  - **حالات الطلب المعيارية (`status`):**
    1. `pending` (معلق)
    2. `in_preparation` (قيد التجهيز)
    3. `prepared` (تم التجهيز)
    4. `shipped` (تم اسناده للتوصيل)
    5. `delivered` (تم التوصيل)
    6. `cancelled` (ملغي)
    7. `returned` (مرتجع)
- **`order_items`**: عناصر وبنود الطلب (`id`, `order_id`, `product_id`, `variant_id`, `quantity`, `picked_quantity`, `price_at_order`, `deleted_at`).
- **`order_actions`**: السجل الزمني لحركات وتعديلات الطلب (`id`, `order_id`, `user_id`, `action_type`, `details` كـ JSON, `created_at`).

### 3.4 جداول حركات المخزون والتدقيق (`inventory_movements`, `audit_logs`, `stock_alerts`)
- **`inventory_movements`**: سجل حركات الدخول والخروج والتسوية (`id`, `variant_id`, `product_id`, `user_id`, `movement_type`, `quantity_change`, `quantity_before`, `quantity_after`, `notes`, `order_id`, `created_at`).
- **`audit_logs`**: سجل التدقيق الأمني لعمليات النظام (`id`, `user_id`, `action_target`, `target_id`, `action_type`, `details`, `created_at`).
- **`stock_alerts`**: تنبيهات انخفاض ونفاد المخزون (`id`, `variant_id`, `alert_type`, `threshold`, `current_quantity`, `is_resolved`, `created_at`).

---

## 4. مسارات الـ API والصلاحيات (API Endpoints & Auth Rules)

جميع مسارات الـ API مسجلة تحت البادئة `/api` ومحمية بواسطة التوكن `Bearer Token` ما عدا مسارات الدخول والفحص الصحي.

### 4.1 مسارات المصادقة والمستخدمين (`/api/auth`, `/api/users`)
- `POST /api/auth/login`: تسجيل الدخول وإرجاع الـ JWT وبيانات المستخدم.
- `GET /api/users`: عرض قائمة الموظفين والمستخدمين.
- `POST /api/users`: إنشاء حساب موظف جديد وتحديد دوره.
- `PUT /api/users/{id}`: تعديل بيانات وصلاحيات الموظف.
- `DELETE /api/users/{id}`: تعطيل أو حذف حساب المستخدم.

### 4.2 مسارات الكتالوج والمنتجات (`/api/products`, `/api/variants`, `/api/catalogs`, `/api/colors`, `/api/sizes`)
- `GET /api/products`: عرض المنتجات مع التصفح والبحث والفلترة.
- `POST /api/products`: إضافة منتج رئيسي وتوليد الألوان والمقاسات والمتغيرات تلقائياً.
- `GET /api/products/{id}`: جلب التفاصيل الشاملة للمنتج بجميع ألوانه ومقاساته.
- `PUT /api/products/{id}`: تعديل بيانات وأسعار وتفاصيل المنتج.
- `DELETE /api/products/{id}`: الحذف المرن للمنتج ومتغيراته المرتبطة.
- `GET /api/variants/{id}/qr`: توليد وتحميل رمز الاستجابة السريعة (QR) للصنف.
- `GET /api/catalogs`, `/api/colors`, `/api/sizes`: إدارة التصنيفات والألوان والمقاسات.

### 4.3 مسارات الطلبيات والمبيعات (`/api/orders`)
- `GET /api/orders`: جلب قائمة الطلبات مع الفلترة حسب الحالة، الموظف، والبحث السريع.
- `POST /api/orders`: إنشاء طلب مبيعات جديد مع حجز الكميات فورياً في المخزن.
- `POST /api/orders/quick-sale`: إتمام عملية بيع مباشر فوري وسحب الكميات وتوليد الفاتورة.
- `GET /api/orders/{id}`: جلب التفاصيل الكاملة للطلب وسجل الحركات ونسب التجهيز.
- `POST /api/orders/{id}/scan`: مسح صنف بالـ QR أو المسح اليدوي وتحديث كميات التجهيز وحالة الطلب.
- `POST /api/orders/{id}/assign-delivery`: إسناد سائق توصيل محلي وتحديث الحالة إلى `تم اسناده للتوصيل`.
- `POST /api/orders/{id}/darb-assabil-shipment`: إرسال الشحنة لـ API درب السبيل وتوليد البوليصة وتحديث الحالة إلى `تم اسناده للتوصيل`.
- `GET /api/orders/darb-assabil/services`: جلب باقات الشحن لشركة درب السبيل.
- `GET /api/orders/darb-assabil/cities-areas`: جلب قائمة المدن والمناطق الليبية المدعومة.
- `GET /api/orders/{id}/invoice`: توليد وتحميل فاتورة الطلب بصيغة PDF.
- `DELETE /api/orders/{id}`: إلغاء الطلب وتحرير الكميات المحجوزة وإرجاعها للمخزن فوراً.

### 4.4 مسارات المخزون والتقارير (`/api/inventory`, `/api/analytics`)
- `GET /api/inventory/movements`: عرض سجل الحركات المخزنية والتوريدات.
- `POST /api/inventory/scan-entry`: توريد كميات للمخزن عبر مسح الـ QR.
- `POST /api/inventory/scan-damage`: تسجيل إتلاف صنف عبر مسح الـ QR.
- `POST /api/inventory/scan-return`: تسجيل إرجاع بضاعة للمخزن عبر مسح الـ QR.
- `GET /api/analytics/dashboard-stats`: إحصائيات المخزن والمبيعات ولوحة المعلومات الحية.
- `GET /api/analytics/reports/pdf`: تصدير تقارير الجرد والمبيعات كملفات PDF رسمية.

---

## 5. الوحدات الوظيفية المكتملة (Implemented Business Modules)

### 5.1 دورة حياة الطلبات والتجهيز (Order Picking & Lifecycle Workflow)
- **إنشاء الطلب:** اعتماد بيانات الشحن الليبية الموحدة (المدينة، المنطقة، العنوان التفصيلي، باقة الخدمة، جهة دفع الشحن، ونوع التوصيل: رجالي 👨 / نسائي 👩).
- **حجز المخزون:** خصم الكميات من `quantity_available` وإضافتها إلى `quantity_reserved` فور إنشاء الطلب لمنع البيع الزائد.
- **التجهيز الذكي:** ماسح كاميرا مدمج (`html5-qrcode`) مع دعم أجهزة قراءة الباركود اليدوية (Scanner Guns) والمسح اليدوي المباشر، مع صافرات صوتية للتنبيه (Audio Beeps) وشريط تقدم حي باللون البرغندي.
- **اكتمال التجهيز:** عند اكتمال مسح كافة القطع المطلوبة، تتحول الحالة تلقائياً إلى `تم التجهيز`، وتنتقل الكميات المحجوزة إلى `total_sold`.
- **إسناد التوصيل المزدوج:**
  1. **توصيل خاص / محلي:** كتابة اسم السائق وتحديث الحالة فوراً إلى `تم اسناده للتوصيل`.
  2. **شركة درب السبيل:** إرسال بيانات الشحنة للـ API وتوليد كود التتبع وتحديث الحالة إلى `تم اسناده للتوصيل`.

### 5.2 نظام البيع المباشر السريع (Quick POS Sale)
- نافذة مبيعات سريعة تدعم البحث الفوري عن الأصناف، واختيار الألوان والمقاسات، وطباعة الفاتورة الفورية دون المرور بمراحل التجهيز الطويلة.

### 5.3 نظام إدارة المنتجات والمتغيرات متعددة الأبعاد (Variants Engine)
- إنشاء المنتجات وتوليد كافة التركيبات المحتملة (الألوان × المقاسات) تلقائياً، مع تخصيص صور لكل لون وتوليد باركودات ورموز QR مخصصة وقابلة للطباعة لكل مقاس ولون.

### 5.4 نظام الـ PWA والعمل أوفلاين (Offline-First Architecture)
- تخزين كامل أصول الواجهة في الـ `CacheStorage` لتعمل حتى عند انقطاع الإنترنت بالكامل.
- تخزين الطلبات المنشأة أوفلاين في الـ `IndexedDB` ومزامنتها تلقائياً مع السيرفر فور استعادة الاتصال.

---

## 6. أوامر التشغيل والرفع للإنتاج (Deployment & Build Commands)

### 6.1 تثبيت الاعتماديات (Prerequisites & Installation)

#### أ. إعداد البيئة الخلفية (Backend Setup):
```bash
# 1. إنشاء وتفعيل البيئة الافتراضية
python -m venv venv
# لنظام ويندوز:
.\venv\Scripts\activate
# لنظام لينكس/ماك:
source venv/bin/activate

# 2. تثبيت المكتبات المطلوبة
pip install -r requirements.txt
```

#### ب. إعداد البيئة الأمامية (Frontend Setup):
```bash
cd frontend
npm install
```

---

### 6.2 أوامر التشغيل في بيئة التطوير (Development Mode)

- **تشغيل المشروع كاملاً بأمر واحد موحد (Recommended):**
```bash
python run-project.py
```
- **أو تشغيل السيرفرات بشكل منفصل:**
```bash
# تشغيل خادم الباك إند:
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# تشغيل خادم الواجهة الأمامية:
cd frontend
npm run dev
```

---

### 6.3 أوامر البناء والتشغيل للإنتاج (Production Build & Deployment)

```bash
# 1. بناء حزمة الواجهة الأمامية والـ PWA:
cd frontend
npm run build

# 2. تشغيل السيرفر الموحد للإنتاج (يخدم الواجهة والـ API معاً):
cd ..
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
```

> **ملاحظة إنتاجية:** يقوم تطبيق FastAPI في ملف `main.py` بتقديم كافة ملفات الواجهة المبنية داخل `frontend/dist` وملفات الـ PWA (`sw.js`, `manifest.json`) وتوجيه مسارات الـ SPA تلقائياً دون الحاجة إلى خادم ويب منفصل.

---
**نهاية وثيقة التسليم التقني (End of Technical Handover Document)**
