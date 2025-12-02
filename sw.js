// نام کش – هر بار تغییر مهم دادی، نسخه را عوض کن
const CACHE_NAME = "persian-date-stamper-v24";

// فایل‌هایی که باید کش شوند
const ASSETS = [
    "./",
    "./index.html",
    "./style.css",
    "./app.js",
    "./manifest.json",
    "./assets/icon-192.png",
    "./assets/icon-512.png",
    "./assets/fonts/vazir.ttf"
];

// نصب Service Worker و کش اولیه
self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

// فعال‌سازی – پاک‌کردن کش‌های قدیمی
self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

// هندل fetch (network first, cache fallback)
self.addEventListener("fetch", event => {
    event.respondWith(
        fetch(event.request)
            .then(resp => {
                // فقط GETهای موفق را کش کن
                if (
                    event.request.method === "GET" &&
                    resp &&
                    resp.status === 200 &&
                    resp.type === "basic"
                ) {
                    const clone = resp.clone();
                    caches.open(CACHE_NAME).then(cache =>
                        cache.put(event.request, clone)
                    );
                }
                return resp;
            })
            .catch(() => caches.match(event.request))
    );
});

// پیام از صفحه برای پاک کردن کش
self.addEventListener("message", async event => {
    if (event.data === "clear_cache_now") {
        const keys = await caches.keys();
        await Promise.all(keys.map(key => caches.delete(key)));
    }
});
