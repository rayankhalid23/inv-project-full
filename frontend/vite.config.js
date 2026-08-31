import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // كاميرا الـ QR (getUserMedia) يرفضها المتصفح على أي origin مو "آمن" —
    // و"آمن" يعني https:// أو localhost تحديداً. لما نفتح التطبيق من الهاتف
    // عبر عنوان الشبكة المحلية (http://192.168.x.x:5173) هذا مو localhost
    // ولا https، فـ navigator.mediaDevices ما يكون موجود إطلاقاً والكاميرا
    // تفشل بصمت. هذا الـ plugin يفعّل HTTPS (بشهادة ذاتية) على سيرفر
    // التطوير فقط، فتفتح الكاميرا من أي جهاز على نفس الشبكة (بعد قبول
    // تحذير الشهادة غير الموثوقة مرة واحدة في متصفح الهاتف).
    basicSsl(),
    VitePWA({
      // نعرض للمستخدم زر "تحديث" بدل إعادة التحميل المفاجئة أثناء العمل
      registerType: 'prompt',
      // نبقي على manifest.json الموجود في public/ بدل توليد واحد جديد
      manifest: false,
      injectRegister: null, // التسجيل يتم يدوياً داخل OfflineContext
      workbox: {
        // يشمل ملفات JS/CSS المُولّدة بأسمائها المُجزّأة (hashed)
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff,woff2}'],
        navigateFallback: '/index.html',
        // لا نُرجع index.html للملفات المرفوعة ومسارات التوثيق أو API الصريحة
        navigateFallbackDenylist: [
          /^\/api\//,
          /^\/static\//,
          /^\/docs/,
          /^\/redoc/,
          /^\/openapi\.json/,
        ],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false, // ننتظر موافقة المستخدم عبر زر التحديث
        runtimeCaching: [
          {
            // بيانات الـ API: الشبكة أولاً مع مهلة قصيرة ثم الكاش.
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
        enabled: true,
        type: 'module',
        suppressWarnings: true,
        navigateFallback: '/index.html',
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
