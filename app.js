// ------------------ انتخاب عناصر UI ------------------
const previewCanvas = document.getElementById("canvas");
const previewCtx = previewCanvas.getContext("2d");
const placeholder = document.getElementById("placeholder");

const btnCamera = document.getElementById("btnCamera");
const btnGallery = document.getElementById("btnGallery");
const btnShare = document.getElementById("btnShare");
const inputCamera = document.getElementById("inputCamera");
const inputGallery = document.getElementById("inputGallery");

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

// ------------------ رویدادهای UI ------------------
btnCamera.addEventListener("click", () => inputCamera.click());
btnGallery.addEventListener("click", () => inputGallery.click());
inputCamera.addEventListener("change", handleFileInput);
inputGallery.addEventListener("change", handleFileInput);
btnShare.addEventListener("click", handleShareOrDownload);

// ------------------ عکس از دوربین یا گالری، با تاریخ اصلی عکس ------------------
async function handleFileInput(e) {
    console.log('=== START handleFileInput ===');
    console.log('Event type:', e.type);
    console.log('Input element:', e.target.id);
    
    try {
        const file = e.target.files[0];
        
        if (!file) {
            console.log('No file selected');
            return;
        }
        
        console.log('File object:', {
            name: file.name,
            type: file.type,
            size: file.size,
            lastModified: file.lastModified,
            lastModifiedDate: file.lastModifiedDate
        });

        // بررسی نوع فایل
        const fileName = file.name.toLowerCase();
        const isImage = file.type.startsWith('image/') || 
                       fileName.endsWith('.jpg') || 
                       fileName.endsWith('.jpeg') || 
                       fileName.endsWith('.png') || 
                       fileName.endsWith('.webp') ||
                       fileName.endsWith('.gif');
        
        if (!isImage) {
            throw new Error('لطفاً فقط فایل تصویری انتخاب کنید');
        }
        
        // اگر HEIC بود، پیغام راهنما بده
        if (fileName.endsWith('.heic') || fileName.endsWith('.heif')) {
            throw new Error('فایل HEIC پشتیبانی نمی‌شود.\n\nلطفاً در تنظیمات دوربین، فرمت عکس را به JPG تغییر دهید.\n\nیا از دوربین مستقیماً عکس بگیرید.');
        }

        // بررسی حجم فایل (حداکثر 20MB)
        if (file.size > 20 * 1024 * 1024) {
            throw new Error('حجم فایل نباید بیشتر از 20 مگابایت باشد');
        }

        // نمایش Loading
        placeholder.textContent = '⏳ در حال بارگذاری...';
        placeholder.style.display = 'block';
        previewCanvas.style.display = 'none';
        btnShare.disabled = true;

        console.log('Step 1: Loading image...');
        const img = await fileToImage(file);
        console.log('Step 1 DONE: Image loaded:', img.width, 'x', img.height);

        // بررسی اندازه تصویر
        if (!img.width || !img.height) {
            throw new Error('تصویر معتبر نیست');
        }

        // نمایش پیام پردازش
        placeholder.textContent = '⏳ در حال پردازش...';

        // تلاش برای خواندن تاریخ EXIF
        console.log('Step 2: Reading EXIF...');
        let photoDate = null;
        try {
            photoDate = await getPhotoDate(file);
            console.log('Step 2 DONE: EXIF date:', photoDate);
        } catch (exifError) {
            console.warn('EXIF read failed, using fallback:', exifError);
        }
        
        // اگر EXIF موجود نبود، از lastModified استفاده کن
        if (!photoDate) {
            photoDate = new Date(file.lastModified);
            console.log('Using lastModified date:', photoDate);
        }

        console.log('Step 3: Processing image...');
        await drawAndProcessImage(img, photoDate);
        console.log('Step 3 DONE: Processing complete');

        // پاک کردن مقدار input تا بتوان چند بار پشت‌سرهم عکس گرفت
        e.target.value = "";
        
        console.log('=== END handleFileInput SUCCESS ===');
        
    } catch (error) {
        console.error('=== ERROR in handleFileInput ===');
        console.error('Error name:', error?.name);
        console.error('Error message:', error?.message);
        console.error('Error stack:', error?.stack);
        console.error('Full error object:', error);
        
        const errorMsg = error && error.message ? error.message : 'خطای ناشناخته در پردازش عکس';
        
        placeholder.textContent = '❌ خطا: ' + errorMsg;
        placeholder.style.display = 'block';
        previewCanvas.style.display = 'none';
        btnShare.disabled = true;
        
        // نمایش خطا به کاربر با جزئیات بیشتر
        let detailedMsg = 'خطا در پردازش عکس:\n\n' + errorMsg;
        
        // اطلاعات اضافی برای debugging
        if (error?.name) {
            detailedMsg += '\n\nنوع خطا: ' + error.name;
        }
        
        detailedMsg += '\n\nلطفاً عکس دیگری امتحان کنید یا از دوربین استفاده کنید.';
        
        alert(detailedMsg);
        
        // Reset input
        e.target.value = "";
        
        console.log('=== END handleFileInput ERROR ===');
    }
}

function fileToImage(file) {
    return new Promise((resolve, reject) => {
        console.log('fileToImage started:', {
            name: file.name,
            type: file.type,
            size: file.size,
            lastModified: file.lastModified
        });

        // روش مستقیم: فقط FileReader (ساده‌ترین و قابل اطمینان‌ترین برای Samsung)
        const reader = new FileReader();
        
        reader.onload = function(e) {
            console.log('FileReader onload fired, data length:', e.target.result?.length);
            
            const img = new Image();
            
            // حذف CORS برای جلوگیری از مشکل
            // img.crossOrigin = "anonymous"; // ← این رو حذف می‌کنیم
            
            let loadTimeout = setTimeout(() => {
                console.error('Image load timeout after FileReader');
                reject(new Error('زمان بارگذاری تصویر به پایان رسید. لطفاً دوباره تلاش کنید.'));
            }, 15000); // 15 ثانیه

            img.onload = () => {
                clearTimeout(loadTimeout);
                console.log('Image loaded successfully:', img.width, 'x', img.height);
                
                if (!img.width || !img.height) {
                    reject(new Error('تصویر بارگذاری شد اما اندازه آن صفر است'));
                    return;
                }
                
                resolve(img);
            };
            
            img.onerror = (error) => {
                clearTimeout(loadTimeout);
                console.error('Image onerror fired:', error);
                console.error('Image src length:', img.src?.substring(0, 100));
                reject(new Error('خطا در نمایش تصویر. فرمت فایل پشتیبانی نمی‌شود.'));
            };
            
            // تنظیم src
            console.log('Setting image src, data URL length:', e.target.result.length);
            img.src = e.target.result;
        };
        
        reader.onerror = (error) => {
            console.error('FileReader onerror:', error);
            reject(new Error('خطا در خواندن فایل. لطفاً مجوزهای برنامه را بررسی کنید.'));
        };
        
        reader.onabort = () => {
            console.error('FileReader onabort');
            reject(new Error('خواندن فایل لغو شد'));
        };
        
        try {
            console.log('Starting FileReader.readAsDataURL');
            reader.readAsDataURL(file);
        } catch (error) {
            console.error('FileReader.readAsDataURL exception:', error);
            reject(new Error('نمی‌توان فایل را خواند: ' + error.message));
        }
    });
}

// خواندن تاریخ اصلی عکس از EXIF
async function getPhotoDate(file) {
    return new Promise((resolve) => {
        try {
            const reader = new FileReader();
            
            reader.onload = function(e) {
                try {
                    const view = new DataView(e.target.result);
                    
                    // بررسی JPEG Marker
                    if (view.getUint16(0, false) !== 0xFFD8) {
                        console.log('Not a JPEG file');
                        resolve(null);
                        return;
                    }
                    
                    let offset = 2;
                    const length = view.byteLength;
                    
                    while (offset < length) {
                        if (view.getUint16(offset + 2, false) <= 8) {
                            resolve(null);
                            return;
                        }
                        
                        const marker = view.getUint16(offset, false);
                        offset += 2;
                        
                        // APP1 Marker (EXIF)
                        if (marker === 0xFFE1) {
                            const exifDate = parseEXIFDate(view, offset);
                            if (exifDate) {
                                console.log('Found EXIF date:', exifDate);
                                resolve(exifDate);
                                return;
                            }
                        }
                        
                        offset += view.getUint16(offset, false);
                    }
                    
                    console.log('No EXIF date found');
                    resolve(null);
                } catch (error) {
                    console.error('Error reading EXIF:', error);
                    resolve(null);
                }
            };
            
            reader.onerror = (error) => {
                console.error('FileReader error:', error);
                resolve(null);
            };
            
            // خواندن اول 64KB (یا کل فایل اگر کوچکتر باشد)
            const blob = file.slice(0, Math.min(64 * 1024, file.size));
            reader.readAsArrayBuffer(blob);
            
        } catch (error) {
            console.error('Error in getPhotoDate:', error);
            resolve(null);
        }
    });
}

// تجزیه تاریخ از EXIF
function parseEXIFDate(view, offset) {
    try {
        // پیدا کردن DateTimeOriginal tag (0x9003)
        const littleEndian = view.getUint16(offset + 10, false) === 0x4949;
        const ifdOffset = view.getUint32(offset + 14, littleEndian) + offset + 10;
        const tags = view.getUint16(ifdOffset, littleEndian);
        
        for (let i = 0; i < tags; i++) {
            const tagOffset = ifdOffset + 2 + (i * 12);
            const tag = view.getUint16(tagOffset, littleEndian);
            
            // DateTimeOriginal (0x9003) یا DateTime (0x0132)
            if (tag === 0x9003 || tag === 0x0132) {
                const dataOffset = view.getUint32(tagOffset + 8, littleEndian) + offset + 10;
                let dateStr = '';
                
                for (let j = 0; j < 19; j++) {
                    const char = view.getUint8(dataOffset + j);
                    if (char === 0) break;
                    dateStr += String.fromCharCode(char);
                }
                
                // تبدیل "2023:11:30 14:25:30" به Date object
                if (dateStr.length === 19) {
                    const parts = dateStr.split(' ');
                    const datePart = parts[0].replace(/:/g, '-');
                    const timePart = parts[1];
                    return new Date(`${datePart}T${timePart}`);
                }
            }
        }
        
        return null;
    } catch (error) {
        return null;
    }
}

// ------------------ پردازش تصویر (فول‌سایز + preview) ------------------
async function drawAndProcessImage(img, date) {
    try {
        console.log('drawAndProcessImage started');
        
        // محدودیت اندازه تصویر (برای جلوگیری از مشکل حافظه در موبایل)
        const MAX_DIMENSION = 4096; // حداکثر 4096 پیکسل
        let targetWidth = img.width;
        let targetHeight = img.height;
        
        if (img.width > MAX_DIMENSION || img.height > MAX_DIMENSION) {
            const scale = Math.min(MAX_DIMENSION / img.width, MAX_DIMENSION / img.height);
            targetWidth = Math.floor(img.width * scale);
            targetHeight = Math.floor(img.height * scale);
            console.log('Resizing image from', img.width, 'x', img.height, 'to', targetWidth, 'x', targetHeight);
        }
        
        // ۱) canvas واقعی فول‌سایز
        realCanvas = document.createElement("canvas");
        realCanvas.width = targetWidth;
        realCanvas.height = targetHeight;
        realCtx = realCanvas.getContext("2d", { 
            willReadFrequently: true,
            alpha: false 
        });

        if (!realCtx) {
            throw new Error('نمی‌توان Canvas ایجاد کرد. لطفاً مرورگر را ببندید و دوباره باز کنید.');
        }

        // رسم تصویر اصلی در سایز واقعی (یا ریسایز شده)
        realCtx.drawImage(img, 0, 0, targetWidth, targetHeight);
        console.log('Image drawn to canvas');

        // ۲) اعمال فیلترها روی فول‌سایز
        try {
            enhanceImage(realCtx, realCanvas.width, realCanvas.height);
            console.log('Filters applied');
        } catch (filterError) {
            console.warn('Filter error (skipping):', filterError);
            // اگر فیلتر خطا داد، ادامه بده بدون فیلتر
        }

        // ۳) محاسبه تاریخ و متن
        const persianDate = gregorianToPersian(date);
        const hour = date.getHours();
        const minute = date.getMinutes();
        const timeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

        const weekdayFa = persianWeekDays[date.getDay()];
        const dateText = `${persianDate.year}/${persianDate.month}/${persianDate.day}`;
        const fullText = `${weekdayFa}  ${dateText}  ${timeStr}`;
        const fullTextFarsi = convertToFarsiDigits(fullText);
        console.log('Date text:', fullTextFarsi);

        // ۴) افزودن استمپ روی فول‌سایز
        await addTextToCanvas(realCtx, realCanvas, fullTextFarsi);
        console.log('Text added to canvas');

        // ۵) ساخت preview برای نمایش در صفحه
        const container = previewCanvas.parentElement;
        const containerWidth = container.clientWidth || 400;
        const containerHeight = container.clientHeight || 400;

        const scaleW = containerWidth / realCanvas.width;
        const scaleH = containerHeight / realCanvas.height;
        const scale = Math.min(scaleW, scaleH, 1); // حداکثر 1 (بدون بزرگنمایی)

        previewCanvas.width = Math.floor(realCanvas.width * scale);
        previewCanvas.height = Math.floor(realCanvas.height * scale);

        placeholder.style.display = "none";
        previewCanvas.style.display = "block";

        previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        previewCtx.drawImage(realCanvas, 0, 0, previewCanvas.width, previewCanvas.height);
        console.log('Preview rendered');

        currentImageCanvas = realCanvas; // خروجی فول‌رزولوشن
        btnShare.disabled = false;
        
    } catch (error) {
        console.error('Error in drawAndProcessImage:', error);
        const errorMsg = error && error.message ? error.message : 'خطا در رندر کردن تصویر';
        throw new Error(errorMsg);
    }
}

/* ------------------ منطق تاریخ فارسی ------------------ */

const persianWeekDays = [
    "یکشنبه","دوشنبه","سه‌شنبه","چهارشنبه","پنج‌شنبه","جمعه","شنبه"
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
    try {
        applyDehaze(ctx, width, height, dehazeStrength);
    } catch (e) {
        console.warn('Dehaze filter failed:', e);
    }

    if (clarityStrength > 0) {
        try {
            applyClarity(ctx, width, height, clarityStrength);
        } catch (e) {
            console.warn('Clarity filter failed:', e);
        }
    }

    if (saturationBoost !== 1.0) {
        try {
            applySaturation(ctx, width, height, saturationBoost);
        } catch (e) {
            console.warn('Saturation filter failed:', e);
        }
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

        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({
                    files: [file],
                    title: "Persian Date Photo",
                    text: ""
                });

                // عملیات موفق → کش را پاک کن
                clearCacheNow();

            } catch (e) {
                // اگر share شکست خورد، دانلود محلی
                downloadBlob(blob, "persian-date-photo.jpg");
                clearCacheNow();
            }
        } else {
            // share در دسترس نیست → دانلود
            downloadBlob(blob, "persian-date-photo.jpg");
            clearCacheNow();
        }
    }, "image/jpeg", 0.9);
}

// اشتراک‌گذاری مستقیم به واتس‌آپ
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
