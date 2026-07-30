# WordPress Code Snippets (Woo only)

ملفات جاهزة للصق داخل بلجن **Code Snippets**.  
**لا تلمس موقع Next.js.**

---

## 0) CMaster Mobile Overflow Fix v1.0 (`cmaster-eg.com`)

ملف: [`cmaster-mobile-overflow-fix-v1.0.php`](cmaster-mobile-overflow-fix-v1.0.php)

### ماذا يفعل؟

- يمنع السكرول الأفقي (يمين/شمال) على الموبايل
- يقفل عرض الصفحة على `100%` تحت `900px`
- يضبط الصور/الجداول/Elementor والعناصر العريضة الشائعة
- يصحح `viewport` إن كان ناقصًا

### التثبيت

1. على `cmaster-eg.com` → Snippets → Add New
2. Title: `CMaster Mobile Overflow Fix v1.0`
3. الصق الملف **بدون** `<?php`
4. Run: **Only run on site front-end**
5. Save & Activate
6. امسح الكاش واختبر على الموبايل

---

## 1) Product Compare v1.1.3 (الحالي — الصق هذا)

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

## 2) Cart + Checkout Style v1.3 (الحالي)

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

## 3) Lost Password OTP (احتياطي)

> **المفضّل الآن:** ارفع البلجن الصغير `dist/sokany-lost-password-otp.zip` بدل Code Snippets.

ملف السنابت (احتياطي): [`sokany-lost-password-otp.php`](sokany-lost-password-otp.php)
