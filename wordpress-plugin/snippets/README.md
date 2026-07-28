# WordPress Code Snippets (Woo only)

ملفات جاهزة للصق داخل بلجن **Code Snippets** على `sokany-eg.com` فقط.  
**لا تلمس موقع Next.js.**

---

## 1) Product Compare v1.0 (جديد)

ملف: [`sokany-product-compare-v1.0.php`](sokany-product-compare-v1.0.php)

### ماذا يفعل؟

- أيقونة مقارنة عائمة أعلى الصفحة مع عداد
- زر "إضافة إلى المقارنة" على كروت/صفحات المنتج
- صفحة مقارنة على `/compare-products/`
- مقارنة المواصفات جنبًا إلى جنب (حتى 4 منتجات)
- حفظ قائمة المقارنة في `localStorage`

### التثبيت

1. Snippets → Add New
2. Title: `SOKANY Product Compare v1.0`
3. الصق الملف **بدون** `<?php`
4. Run: **Only run on site front-end**
5. Save & Activate
6. Settings → Permalinks → Save مرة واحدة
7. امسح الكاش واختبر المقارنة

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
