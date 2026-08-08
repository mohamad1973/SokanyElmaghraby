# WordPress Code Snippets (Woo only)

ملفات جاهزة للصق داخل بلجن **Code Snippets**.  
**لا تلمس موقع Next.js.**

---

## 0) SOKANY Contact Form v1.1.2 (`sokany-eg.com`) — الحالي

ملف: [`sokany-contact-form-v1.1.2.php`](sokany-contact-form-v1.1.2.php)

### ماذا يفعل؟

- يظهر فورم Next بشكل مضمون (لا يخفي CF7 إلا بعد ظهور الفورم الجديد)
- استبدال PHP لـ Contact Form 7 + حقن احتياطي في صفحة `/contact-us/`
- **إرسال افتراضي عبر** `https://sokany-storefront.vercel.app/api/contact` — **بدون** كلمة مرور SMTP في السنابت
- احتياطي اختياري: SMTP محلي عبر `SOKANY_SMTP_PASS` في `wp-config.php`
- يصلح خطأ «لم يتم ضبط كلمة مرور SMTP» في v1.1 / v1.1.1

### التثبيت (مهم)

1. عطّل **كل** من: Contact Form v1.0 و v1.1 و v1.1.1
2. Snippets → Add New → Title: `SOKANY Contact Form v1.1.2`
3. الصق الملف **بدون** `<?php`
4. Run: **Run everywhere**
5. Save & Activate
6. امسح الكاش وافتح `/contact-us/`
7. أرسل رسالة تجريبية

> لا حاجة لملء كلمة مرور في السنابت. تأكد أن `SMTP_*` مضبوطة على Vercel لفورم المتجر.

### احتياطي SMTP محلي (اختياري)

في `wp-config.php` قبل `That's all, stop editing!`:

```php
define('SOKANY_SMTP_PASS', 'كلمة_مرور_بريد_info_من_Hostinger');
```

---

## 1) CMaster Mobile Overflow Fix v1.0 (`cmaster-eg.com`)

### لو تستخدم HFCM (Header Footer Code Manager) — الموصى به عندك

ملف: [`cmaster-mobile-overflow-fix-v1.0-hfcm.html`](cmaster-mobile-overflow-fix-v1.0-hfcm.html)

1. احذف أي لصق PHP قديم من HFCM
2. HFCM → Add New
3. Snippet Type: **HTML**
4. Location: **Header**
5. Site Display: **Site Wide**
6. الصق محتوى ملف `-hfcm.html` كاملًا (style + script) **بدون أي PHP**
7. Active → Save → امسح الكاش واختبر الموبايل

### لو تستخدم بلجن Code Snippets (PHP)

ملف: [`cmaster-mobile-overflow-fix-v1.0.php`](cmaster-mobile-overflow-fix-v1.0.php)

1. Title: `CMaster Mobile Overflow Fix v1.0`
2. الصق الملف **بدون** `<?php`
3. Run: **Only run on site front-end**
4. Activate → امسح الكاش

> خطأ HFCM الأحمر يظهر لأنك لصقت PHP داخل HFCM. HFCM يقبل HTML/CSS/JS فقط.

---

## 2) Product Compare v1.1.3 (الحالي — الصق هذا)

ملف: [`sokany-product-compare-v1.1.3.php`](sokany-product-compare-v1.1.3.php)

### ماذا يفعل؟

- ديسكتوب: أيقونة مقارنة **ظاهرة دائمًا** فوق منطقة السوشيال الجانبية (ثابتة، بدون الاعتماد على selectors ضعيفة)
- موبايل: بجوار سوشيال الفوتر، ولو الفوتر مش موجود تظهر ثابتة أسفل الشاشة
- CSS/JS يُطبعان مباشرة في `wp_head` / `wp_footer` (أضمن من enqueue الفارغ)
- مزامنة زر المقارنة الأصلي للثيم + صفحة `/compare-products/`
- بدون زر إضافي داخل كارت المنتج

### التثبيت (مهم)

1. عطّل **كل** سنابتات المقارنة القديمة (v1.0 → v1.1.2)
2. Snippets → Add New (أو استبدل محتوى السنابت الحالي بالكامل)
3. Title: `SOKANY Product Compare v1.1.3`
4. الصق محتوى الملف **بدون** سطر `<?php`
5. Run: **Only run on site front-end**
6. Save & Activate
7. Settings → Permalinks → Save مرة واحدة
8. امسح كاش LiteSpeed/Cloudflare ثم Ctrl+F5

> هذا كود ووردبريس فقط — لا يحتاج Vercel.

---

## 3) Cart + Checkout Style v1.3 (الحالي)

ملف: [`sokany-cart-checkout-style-v1.3.php`](sokany-cart-checkout-style-v1.3.php)

### ماذا يفعل؟

- كل ميزات v1.2 (عرض 80vw + عمودين + إخفاء البلد + Select2 أسود + حفظ بيانات)
- جدول منتجات **أوردرك** يملأ عرض الصندوق بالكامل
- ترجمة: `Cash on delivery` → **الدفع عند الاستلام**
- ترجمة الشروط → **أوافق على الشروط والأحكام**
- إخفاء جملة دعوة مراجعة الطلب

### استبدال v1.2 / الأقدم

1. Snippets → عطّل أو احذف v1.2 (وأي أقدم)
2. Add New → Title: `SOKANY Cart Checkout Style v1.3`
3. الصق محتوى `sokany-cart-checkout-style-v1.3.php` **بدون** `<?php`
4. Run: **Only run on site front-end**
5. Save & Activate
6. امسح كاش LiteSpeed/Cloudflare
7. اختبر `/checkout/`

---

## 4) Lost Password OTP (احتياطي)

> **المفضّل الآن:** ارفع البلجن الصغير `dist/sokany-lost-password-otp.zip` بدل Code Snippets.

ملف السنابت (احتياطي): [`sokany-lost-password-otp.php`](sokany-lost-password-otp.php)
