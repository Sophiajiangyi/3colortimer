// sw.js — 离线缓存 + 版本更新提示。缓存名带版本号，改版本号即可让浏览器发现更新。
const CACHE_VERSION = 'v4';
const CACHE_NAME = `time-control-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './js/config.js',
  './js/db.js',
  './js/settings.js',
  './js/timer.js',
  './js/day.js',
  './js/stats.js',
  './js/charts.js',
  './js/backup.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  // 逐个用 {cache:'reload'} 拉取，绕过 GitHub Pages 的 10 分钟 HTTP 缓存，
  // 避免刚部署完就把旧字节写进 Cache Storage。
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        PRECACHE_URLS.map((url) =>
          fetch(url, { cache: 'reload' }).then((res) => cache.put(url, res))
        )
      )
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// cache-first，网络成功则回填缓存；离线时直接用缓存
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
