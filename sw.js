const CACHE_NAME = "persian-date-stamper-v1";
const APP_PATH = "/PersianDateStamperPWA"; // اسم ریپازیتوری

const ASSETS = [
    `${APP_PATH}/`,
    `${APP_PATH}/index.html`,
    `${APP_PATH}/style.css`,
    `${APP_PATH}/app.js`,
    `${APP_PATH}/manifest.json`,
    `${APP_PATH}/assets/icon-192.png`,
    `${APP_PATH}/assets/icon-512.png`,
    `${APP_PATH}/assets/fonts/vazir.ttf`
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
});

self.addEventListener("fetch", event => {
    event.respondWith(
        caches.match(event.request).then(resp => resp || fetch(event.request))
    );
});
