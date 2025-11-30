// نام کش – هر بار تغییر مهم دادی، نسخه را عوض کن
const CACHE_NAME = "persian-date-stamper-v4";

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

// ذخیره موقت share data
let sharedFormData = null;

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
    const url = new URL(event.request.url);
    
    // اگر share target است، FormData را ذخیره کن و redirect به صفحه اصلی
    if (url.pathname === '/share-target' && event.request.method === 'POST') {
        event.respondWith(
            (async () => {
                sharedFormData = await event.request.formData();
                return Response.redirect('/?share-target=true', 303);
            })()
        );
        return;
    }
    
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

// پیام از صفحه برای پاک کردن کش یا دریافت share data
self.addEventListener("message", async event => {
    if (event.data === "clear_cache_now") {
        const keys = await caches.keys();
        await Promise.all(keys.map(key => caches.delete(key)));
    } else if (event.data && event.data.type === 'get-share-data') {
        event.ports[0].postMessage({ formData: sharedFormData });
        sharedFormData = null; // پاک کردن بعد از ارسال
    }
});