// Офлайн: сначала сеть (чтобы обновления приходили сразу), без сети — из кэша.
const CACHE = 'bodyos-v3';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/ui/app.js', 'js/ui/dom.js', 'js/ui/barcode.js',
  'js/ui/views/onboarding.js', 'js/ui/views/today.js', 'js/ui/views/checkin.js', 'js/ui/views/food.js',
  'js/ui/views/train.js', 'js/ui/views/week.js', 'js/ui/views/labs.js', 'js/ui/views/more.js',
  'js/ui/views/batch.js', 'js/ui/views/data.js',
  'js/app/services.js', 'js/data/db.js', 'js/data/foodseed.js', 'js/llm/llm.js',
  'js/core/util.js', 'js/core/constants.js', 'js/core/safety.js', 'js/core/trend.js', 'js/core/nutrition.js',
  'js/core/calibration.js', 'js/core/goals.js', 'js/core/coach.js', 'js/core/stack.js', 'js/core/foods.js',
  'js/core/pool.js', 'js/core/exercises.js', 'js/core/training.js', 'js/core/shopping.js',
  'js/core/fooddb.js', 'js/core/legacy_foods.js',
  'data/foods_seed.json', 'data/aliases.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // API и штрих-коды — мимо кэша
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))),
  );
});
