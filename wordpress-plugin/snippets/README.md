# WordPress Code Snippets (Woo only)

ملفات جاهزة للصق داخل بلجن **Code Snippets** على `sokany-eg.com` فقط.  
**لا تلمس موقع Next.js.**

---

## 1) Cart + Checkout Style v1.2 (الحالي — استبدل به v1.1)

ملف: [`sokany-cart-checkout-style-v1.2.php`](sokany-cart-checkout-style-v1.2.php)

### ماذا يفعل؟

- عرض **80% من عرض الشاشة** على الديسكتوب (`80vw`)
- السلة: منتجات + إجمالي **جنب بعض** (موبايل يبقى تحت بعض)
- التشيك أوت: بيانات الدفع + أوردرك **جنب بعض** وبعرض أوسع
- إخفاء حقل **البلد** (مصر افتراضياً)
- نص القوائم المنسدلة **أسود** على الخلفية الخضراء/الليمون
- رسالة Woo الحمراء → أخضر داكن
- حفظ بيانات العميل في `localStorage`

### استبدال v1.1 / v1.0

1. Snippets → عطّل أو احذف `SOKANY Cart Checkout Style` و `v1.1`
2. Add New → Title: `SOKANY Cart Checkout Style v1.2`
3. الصق محتوى `sokany-cart-checkout-style-v1.2.php` **بدون** `<?php`
4. Run: **Only run on site front-end**
5. Save & Activate
6. امسح كاش LiteSpeed/Cloudflare
7. اختبر `/cart/` و `/checkout/` على ديسكتوب عريض

### اختبار سريع

| الحالة | المتوقع |
|--------|---------|
| سلة ديسكتوب | عرض ~80% + إجمالي جنب المنتجات |
| سلة موبايل | عمودي (تحت بعض) |
| دفع ديسكتوب | نموذجان جنب بعض بعرض أوسع؛ بدون بلد |
| اختيار محافظة | كلام أسود واضح على خلفية خضراء |

---

## 1b) إصدارات قديمة (لا تستخدمها)

- [`sokany-cart-checkout-style-v1.1.php`](sokany-cart-checkout-style-v1.1.php) — استُبدل بـ v1.2
- [`sokany-cart-checkout-style.php`](sokany-cart-checkout-style.php) — v1.0 قديم

---

## 2) Lost Password OTP (احتياطي)

> **المفضّل الآن:** ارفع البلجن الصغير `dist/sokany-lost-password-otp.zip` بدل Code Snippets.

ملف السنابت (احتياطي): [`sokany-lost-password-otp.php`](sokany-lost-password-otp.php)
