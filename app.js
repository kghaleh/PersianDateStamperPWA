// ------------------ انتخاب عناصر UI ------------------
const previewCanvas = document.getElementById("canvas");
const previewCtx = previewCanvas.getContext("2d");
const placeholder = document.getElementById("placeholder");

const btnCamera = document.getElementById("btnCamera");
const btnShare = document.getElementById("btnShare");
const inputCamera = document.getElementById("inputCamera");

// canvas واقعی (فول‌سایز) برای پردازش و خروجی
let realCanvas = null;
let realCtx = null;

// این همیشه به canvas فول‌سایز اشاره می‌کند
let currentImageCanvas = null;

// ------------------ Service Worker ------------------
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("sw.js").catch(console.error);
    });
}

// ------------------ Handle Share Target (دریافت عکس از گالری) ------------------
window.addEventListener("load", async () => {
    const url = new URL(window.location.href);
    
    // اگر از طریق share target باز شده
    if (url.pathname === '/share-target' || url.searchParams.has('share-target')) {
        try {
            const formData = await getFormData();
            if (formData && formData.has('image')) {
                const imageFile = formData.get('image');
                if (imageFile && imageFile.size > 0) {
                    const img = await fileToImage(imageFile);
                    const now = new Date();
                    await drawAndProcessImage(img, now);
                    
                    // پاک کردن URL برای جلوگیری از پردازش مجدد
                    window.history.replaceState({}, document.title, '/');
                }
            }
        } catch (e) {
            console.error("Error handling shared image:", e);
        }
    }
});

// دریافت FormData از Service Worker
async function getFormData() {
    return new Promise((resolve) => {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            const messageChannel = new MessageChannel();
            
            messageChannel.port1.onmessage = (event) => {
                if (event.data && event.data.formData) {
                    resolve(event.data.formData);
                } else {
                    resolve(null);
                }
            };
            
            navigator.serviceWorker.controller.postMessage(
                { type: 'get-share-data' },
                [messageChannel.port2]
            );
            
            // timeout برای جلوگیری از انتظار بی‌نهایت
            setTimeout(() => resolve(null), 3000);
        } else {
            resolve(null);
        }
    });
}

// ------------------ رویدادهای UI ------------------
btnCamera.addEventListener("click", () => inputCamera.click());
inputCamera.addEventListener("change", handleFileInput);
btnShare.addEventListener("click", handleShareOrDownload);

// ------------------ فقط عکس از دوربین، با تاریخ همین لحظه ------------------
async function handleFileInput(e) {
    const file = e.target.files[0];
    if (!file) return;

    const img = await fileToImage(file);

    // تاریخ همین لحظه (سیستم)
    const now = new Date();
    await drawAndProcessImage(img, now);

    // پاک کردن مقدار input تا بتوان چند بار پشت‌سرهم عکس گرفت
    e.target.value = "";
}

function fileToImage(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };
        img.onerror = reject;
        img.src = url;
    });
}

// ------------------ پردازش تصویر (فول‌سایز + preview) ------------------
async function drawAndProcessImage(img, date) {
    // ۱) canvas واقعی فول‌سایز
    realCanvas = document.createElement("canvas");
    realCanvas.width = img.width;
    realCanvas.height = img.height;
    realCtx = realCanvas.getContext("2d");

    // رسم تصویر اصلی در سایز واقعی
    realCtx.drawImage(img, 0, 0, img.width, img.height);

    // ۲) اعمال فیلترها روی فول‌سایز
    enhanceImage(realCtx, realCanvas.width, realCanvas.height);

    // ۳) محاسبه تاریخ و متن
    const persianDate = gregorianToPersian(date);
    const hour = date.getHours();
    const minute = date.getMinutes();
    const timeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

    const weekdayFa = persianWeekDays[date.getDay()];
    const dateText = `${persianDate.year}/${persianDate.month}/${persianDate.day}`;
    const fullText = `${weekdayFa}  ${dateText}  ${timeStr}`;
    const fullTextFarsi = convertToFarsiDigits(fullText);

    // ۴) افزودن استمپ روی فول‌سایز
    await addTextToCanvas(realCtx, realCanvas, fullTextFarsi);

    // ۵) ساخت preview برای نمایش در صفحه
    const container = previewCanvas.parentElement;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight || 400;

    const scaleW = containerWidth / realCanvas.width;
    const scaleH = containerHeight / realCanvas.height;
    const scale = Math.min(scaleW, scaleH, 1); // حداکثر 1 (بدون بزرگنمایی)

    previewCanvas.width = realCanvas.width * scale;
    previewCanvas.height = realCanvas.height * scale;

    placeholder.style.display = "none";
    previewCanvas.style.display = "block";

    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    previewCtx.drawImage(realCanvas, 0, 0, previewCanvas.width, previewCanvas.height);

    currentImageCanvas = realCanvas; // خروجی فول‌رزولوشن
    btnShare.disabled = false;
}

/* ------------------ منطق تاریخ فارسی ------------------ */

const persianWeekDays = [
    "یکشنبه","دوشنبه","سه\u200cشنبه","چهارشنبه","پنج\u200cشنبه","جمعه","شنبه"
];

function convertToFarsiDigits(text) {
    const farsiDigits = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
    return text.replace(/\d/g, d => farsiDigits[parseInt(d, 10)]);
}

function gregorianToPersian(date) {
    let gYear = date.getFullYear();
    const gMonth = date.getMonth() + 1;
    const gDay = date.getDate();

    const g_d_m = [0,31,59,90,120,151,181,212,243,273,304,334];

    let jy;
    let jm;
    let jd;

    if (gYear > 1600) {
        jy = 979;
        gYear -= 1600;
    } else {
        jy = 0;
        gYear -= 621;
    }

    const gy2 = (gMonth > 2) ? gYear + 1 : gYear;
    let days = 365 * gYear
        + Math.floor((gy2 + 3) / 4)
        - Math.floor((gy2 + 99) / 100)
        + Math.floor((gy2 + 399) / 400)
        - 80
        + gDay
        + g_d_m[gMonth - 1];

    jy += 33 * Math.floor(days / 12053);
    days %= 12053;
    jy += 4 * Math.floor(days / 1461);
    days %= 1461;

    if (days > 365) {
        jy += Math.floor((days - 1) / 365);
        days = (days - 1) % 365;
    }

    if (days < 186) {
        jm = 1 + Math.floor(days / 31);
        jd = 1 + (days % 31);
    } else {
        jm = 7 + Math.floor((days - 186) / 30);
        jd = 1 + ((days - 186) % 30);
    }

    return { year: jy, month: jm, day: jd };
}

/* ------------------ فیلترها: Dehaze + Clarity + Saturation ------------------ */

function enhanceImage(ctx, width, height, dehazeStrength = 0.18, clarityStrength = 0.3, saturationBoost = 1.03) {
    applyDehaze(ctx, width, height, dehazeStrength);

    if (clarityStrength > 0) {
        applyClarity(ctx, width, height, clarityStrength);
    }

    if (saturationBoost !== 1.0) {
        applySaturation(ctx, width, height, saturationBoost);
    }
}

function applyDehaze(ctx, width, height, strength) {
    const contrast = 1.0 + strength;
    const translate = (-0.5 * contrast + 0.5) * 255.0;

    const imgData = ctx.getImageData(0, 0, width, height);
    const d = imgData.data;

    for (let i = 0; i < d.length; i += 4) {
        d[i]   = clamp(contrast * d[i]   + translate);
        d[i+1] = clamp(contrast * d[i+1] + translate);
        d[i+2] = clamp(contrast * d[i+2] + translate);
    }

    ctx.putImageData(imgData, 0, 0);
}

function applyClarity(ctx, width, height, strength) {
    const original = ctx.getImageData(0, 0, width, height);

    const offCanvas = document.createElement("canvas");
    offCanvas.width = width;
    offCanvas.height = height;
    const offCtx = offCanvas.getContext("2d");

    offCtx.filter = "blur(2px)";
    offCtx.drawImage(ctx.canvas, 0, 0, width, height);
    const blurred = offCtx.getImageData(0, 0, width, height);

    const dOrig = original.data;
    const dBlur = blurred.data;

    for (let i = 0; i < dOrig.length; i += 4) {
        const r = dOrig[i];
        const g = dOrig[i+1];
        const b = dOrig[i+2];

        const rBlur = dBlur[i];
        const gBlur = dBlur[i+1];
        const bBlur = dBlur[i+2];

        const rSharp = clamp(r + strength * (r - rBlur));
        const gSharp = clamp(g + strength * (g - gBlur));
        const bSharp = clamp(b + strength * (b - bBlur));

        dOrig[i]   = rSharp;
        dOrig[i+1] = gSharp;
        dOrig[i+2] = bSharp;
    }

    ctx.putImageData(original, 0, 0);
}

function applySaturation(ctx, width, height, sat) {
    const imgData = ctx.getImageData(0, 0, width, height);
    const d = imgData.data;

    const rw = 0.3086, gw = 0.6094, bw = 0.0820;

    for (let i = 0; i < d.length; i += 4) {
        const r = d[i];
        const g = d[i+1];
        const b = d[i+2];

        const gray = rw*r + gw*g + bw*b;

        d[i]   = clamp(gray + sat * (r - gray));
        d[i+1] = clamp(gray + sat * (g - gray));
        d[i+2] = clamp(gray + sat * (b - gray));
    }

    ctx.putImageData(imgData, 0, 0);
}

function clamp(v) {
    return v < 0 ? 0 : (v > 255 ? 255 : v);
}

/* ------------------ متن و فونت روی عکس (فول‌سایز) ------------------ */

async function loadVazirFont() {
    if (loadVazirFont.loaded) return;
    const font = new FontFace("Vazir", "url(assets/fonts/vazir.ttf)");
    await font.load();
    document.fonts.add(font);
    loadVazirFont.loaded = true;
}

async function addTextToCanvas(ctx, canvas, text) {
    await loadVazirFont();

    const w = canvas.width;
    const h = canvas.height;
    const minDimension = Math.min(w, h);

    const fontSize = Math.min(Math.max(minDimension * 0.04, 40), 120);

    const isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;

    ctx.save();

    ctx.font = `${fontSize}px Vazir`;
    ctx.textAlign = "center";
    ctx.textBaseline = isFirefox ? "alphabetic" : "middle";

    ctx.fillStyle = "#FFFFFF";
    ctx.shadowColor = "black";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    const textHeight = fontSize;
    const padding = fontSize * 0.25;

    const centerX = w / 2;
    const boxBottom = h - padding;
    const boxTop = boxBottom - textHeight - padding * 2;

    const textY = isFirefox
        ? boxBottom - padding - textHeight * 0.25
        : (boxTop + boxBottom) / 2;

    const rectLeft  = centerX - textWidth / 2 - padding;
    const rectRight = centerX + textWidth / 2 + padding;
    const rectTop   = boxTop;
    const rectBottom= boxBottom;
    const cornerRadius = fontSize * 0.5;

    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(0,0,0,0.43)";
    roundRect(ctx, rectLeft, rectTop, rectRight-rectLeft, rectBottom-rectTop, cornerRadius);
    ctx.fill();

    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.stroke();

    ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = "white";
    ctx.fillText(text, centerX, textY);

    ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x+radius, y);
    ctx.lineTo(x+w-radius, y);
    ctx.quadraticCurveTo(x+w, y, x+w, y+radius);
    ctx.lineTo(x+w, y+h-radius);
    ctx.quadraticCurveTo(x+w, y+h, x+w-radius, y+h);
    ctx.lineTo(x+radius, y+h);
    ctx.quadraticCurveTo(x, y+h, x, y+h-radius);
    ctx.lineTo(x, y+radius);
    ctx.quadraticCurveTo(x, y, x+radius, y);
    ctx.closePath();
}

/* ------------------ پاک‌سازی کش بعد از Share/Download ------------------ */

async function handleShareOrDownload() {
    if (!currentImageCanvas) return;

    currentImageCanvas.toBlob(async blob => {
        if (!blob) return;

        const file = new File([blob], "persian-date-photo.jpg", { type: "image/jpeg" });

        // اولویت ۱: Web Share API (برای iOS و Android)
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({
                    files: [file],
                    title: "Persian Date Photo",
                    text: ""
                });
                clearCacheNow();
                return;
            } catch (e) {
                console.log("Share failed, trying save to gallery:", e);
            }
        }

        // اولویت ۲: File System Access API برای ذخیره در گالری (Android Chrome)
        if (window.showSaveFilePicker) {
            try {
                const suggestedName = `persian-date-${Date.now()}.jpg`;
                const handle = await window.showSaveFilePicker({
                    suggestedName: suggestedName,
                    types: [{
                        description: 'JPEG Image',
                        accept: { 'image/jpeg': ['.jpg', '.jpeg'] }
                    }]
                });
                
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();
                
                clearCacheNow();
                alert("✓ تصویر با موفقیت ذخیره شد");
                return;
            } catch (e) {
                if (e.name !== 'AbortError') {
                    console.log("Save picker failed:", e);
                }
            }
        }

        // اولویت ۳: دانلود مستقیم (fallback)
        downloadBlob(blob, `persian-date-${Date.now()}.jpg`);
        clearCacheNow();
        
        // راهنمایی برای کاربر Android
        if (/android/i.test(navigator.userAgent)) {
            setTimeout(() => {
                alert("💡 برای ذخیره در گالری:\n۱. فایل دانلود شد\n۲. از منوی دانلودها تصویر را باز کنید\n۳. گزینه 'Save to Gallery' را انتخاب کنید");
            }, 500);
        }
    }, "image/jpeg", 0.9);
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function clearCacheNow() {
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage("clear_cache_now");
    }
}