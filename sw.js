/* Service worker: اپ بعد از اولین بازدید بدون اینترنت هم باز می‌شود */
const CACHE = 'arman-proto-v2';
const PRECACHE = ["./", "admin-certificates.html", "admin-coupons.html", "admin-courses.html", "admin-orders.html", "admin-qa.html", "admin-settings.html", "admin-students.html", "admin.html", "app-admin-courses.html", "app-admin-more.html", "app-admin-students.html", "app-admin.html", "app-checkout.html", "app-course.html", "app-home.html", "app-learning.html", "app-player.html", "app-profile.html", "checkout.html", "course.html", "dashboard.html", "index.html", "player.html", "manifest.webmanifest", "assets/dc-lite.js", "assets/proto.css", "assets/fonts.css", "assets/fonts/Vazirmatn-Variable.woff2", "assets/icons/favicon.svg", "assets/icons/icon-192.png", "assets/icons/icon-512.png", "assets/icons/icon-maskable-512.png", "assets/icons/apple-touch-icon.png"];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // صفحه‌ها: اول شبکه (تا تغییرات دیده شوند)، در نبود اینترنت از کش
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then((hit) => hit || caches.match('app-home.html')))
    );
    return;
  }
  // فایل‌ها: اول کش
  event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
    return res;
  })));
});
