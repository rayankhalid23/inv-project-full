import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { VitePWA } from 'vite-plugin-pwa'

// المسارات التي يخدمها الـ API في الخلفية (FastAPI)
const API_PREFIXES = [
  '/auth', '/users', '/catalogs', '/sizes', '/colors',
  '/products', '/variants', '/inventory', '/orders', '/analytics',
]

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    basicSsl(),
    VitePWA({
      // نعرض للمستخدم زر "تحديث" بدل إعادة التحميل المفاجئة أثناء العمل
      registerType: 'prompt',
      // نبقي على manifest.json الموجود في public/ بدل توليد واحد جديد
      manifest: false,
      injectRegister: null, // التسجيل يتم يدوياً داخل OfflineContext
      workbox: {
        // يشمل ملفات JS/CSS المُولّدة بأسمائها المُجزّأة (hashed) — وهو ما كان
        // مستحيلاً مع قائمة precache مكتوبة يدوياً، فكان أول فتح بدون نت قد يفشل.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff,woff2}'],
        navigateFallback: '/index.html',
        // لا نُرجع index.html لمسارات الـ API أو الملفات المرفوعة
        navigateFallbackDenylist: [
          /^\/api\//,
          /^\/static\//,
          new RegExp(`^(${API_PREFIXES.join('|')})/`),
        ],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false, // ننتظر موافقة المستخدم عبر زر التحديث
        runtimeCaching: [
          {
            // بيانات الـ API: الشبكة أولاً مع مهلة قصيرة ثم الكاش.
            // networkTimeoutSeconds هو ما يمنع تعليق الشاشة على شبكة ضعيفة.
            //
            // مهم: هذه الدالة تُحوَّل إلى نص وتُحقن داخل ملف الـ Service Worker،
            // لذا يجب ألا تشير إلى أي متغير خارجي (closure) وإلا رمت
            // ReferenceError داخل الـ SW ولم تعمل القاعدة إطلاقاً.
            urlPattern: ({ url, request }) =>
              request.method === 'GET' &&
              /^\/(auth|users|catalogs|sizes|colors|products|variants|inventory|orders|analytics)(\/|$)/.test(url.pathname),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'bellagio-api',
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 200,        // سقف يمنع تضخم الكاش بلا حدود
                maxAgeSeconds: 60 * 60 * 24 * 7,
                purgeOnQuotaError: true,
              },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // صور المنتجات ورموز QR المرفوعة: أسماؤها UUID ثابتة فلا تتغير
            urlPattern: ({ url }) => url.pathname.startsWith('/static/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'bellagio-uploads',
              expiration: {
                maxEntries: 400,
                maxAgeSeconds: 60 * 60 * 24 * 30,
                purgeOnQuotaError: true,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false, // لا نُفعّل الـ SW أثناء التطوير حتى لا يُخفي التعديلات
      },
    }),
  ],
  build: {
    // تقسيم المكتبات الكبيرة لملفات مستقلة: تحميل أول أسرع، وعند أي تحديث
    // لا يُعاد تنزيل إلا الجزء الذي تغيّر فعلاً بدل الحزمة كاملة.
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // ملاحظة: recharts و html5-qrcode و sweetalert2 مذكورة في package.json
            // لكنها غير مستوردة في أي ملف، لذا لا مجموعات لها هنا.
            { name: 'react-vendor', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
            { name: 'motion', test: /node_modules[\\/](framer-motion|motion-dom|motion-utils)[\\/]/ },
            { name: 'forms', test: /node_modules[\\/](react-hook-form|@hookform|zod)[\\/]/ },
            { name: 'ui-vendor', test: /node_modules[\\/](@radix-ui|lucide-react)[\\/]/ },
          ],
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/auth': 'http://localhost:8000',
      '/users': 'http://localhost:8000',
      '/catalogs': 'http://localhost:8000',
      '/sizes': 'http://localhost:8000',
      '/colors': 'http://localhost:8000',
      '/products': 'http://localhost:8000',
      '/variants': 'http://localhost:8000',
      '/inventory': 'http://localhost:8000',
      '/orders': 'http://localhost:8000',
      '/analytics': 'http://localhost:8000',
      '/static': 'http://localhost:8000',
    }
  }
})
