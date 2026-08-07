const CACHE_NAME = 'bellagio-static-v1';
const API_CACHE_NAME = 'bellagio-api-v1';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.png',
  '/favicon.svg',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/apple-touch-icon.png',
  '/maskable-icon-512x512.png'
];


// 1. تثبيت Service Worker وتحميل الأصول الأساسية
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching offline pages & assets');
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// 2. تفعيل وتصفية الكاش القديم
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. اعتراض الطلبات وتوفير تجربة أوفلاين كاملة
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // إهمال الطلبات غير الشائعة أو المسارات التي لا تدعم الكاش (مثل طلبات WebSocket أو Chrome extensions)
  if (request.method !== 'GET' || !url.protocol.startsWith('http')) {
    return;
  }

  // أ) تنقل الصفحات (HTML Navigation) -> Network first, fallback to cached /index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => {
        return caches.match('/index.html') || caches.match(request);
      })
    );
    return;
  }

  // ب) أصول الـ API (GET Requests) -> Network First with API Cache Fallback
  const isApiRequest = url.pathname.startsWith('/products') ||
                       url.pathname.startsWith('/orders') ||
                       url.pathname.startsWith('/catalogs') ||
                       url.pathname.startsWith('/users') ||
                       url.pathname.startsWith('/sizes') ||
                       url.pathname.startsWith('/colors') ||
                       url.pathname.startsWith('/variants') ||
                       url.pathname.startsWith('/inventory') ||
                       url.pathname.startsWith('/analytics');

  if (isApiRequest) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // حفظ نسخة من الاستجابة في كاش الـ API إذا كانت ناجحة
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(API_CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // عند انقطاع النت، إرجاع النتيجة من كاش الـ API المحفوظ مسبقاً!
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // إرجاع JSON فارغ مناسب في حال لم تكن البيانات مكيشة
            return new Response(JSON.stringify({ status: 'offline', message: 'أنت تعمل الآن بدون إنترنت', data: [] }), {
              headers: { 'Content-Type': 'application/json' }
            });
          });
        })
    );
    return;
  }

  // ج) الملفات الثابتة (JS, CSS, SVGs, Fonts, Images) -> Stale-While-Revalidate / Cache First
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // تحديث الكاش في الخلفية لضمان تحسين الأداء
        fetch(request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse));
          }
        }).catch(() => {/* تجاهل خطأ التحديث في الأوفلاين */});
        return cachedResponse;
      }

      return fetch(request).then((networkResponse) => {
        if (networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        }
        return networkResponse;
      });
    })
  );
});
