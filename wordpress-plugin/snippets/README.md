# WordPress Code Snippets (Woo only)

ملفات جاهزة للصق داخل بلجن **Code Snippets** على `sokany-eg.com` فقط.  
**لا تلمس موقع Next.js.**

---

## 1) Cart + Checkout Style v1.1 (الحالي — استبدل به v1.0)

ملف: [`sokany-cart-checkout-style-v1.1.php`](sokany-cart-checkout-style-v1.1.php)

### ماذا يفعل؟

- عرض أوسع للسلة والتشيك أوت (`~1240px` / `~1280px`)
- السلة: **إجمالي سلة المشتريات** جنب مربع المنتجات (شمال في RTL)
- التشيك أوت: عمودا **بيانات الدفع** و**أوردرك** أعرض ومتجاوران
- إخفاء حقل **البلد** (مصر افتراضياً في الطلب)
- نص القوائم المنسدلة **أسود** على الخلفية الخضراء/الليمون (Select2)
- رسالة Woo الحمراء → أخضر داكن
- حفظ بيانات العميل في `localStorage`

### استبدال v1.0

1. Snippets → عطّل أو احذف `SOKANY Cart Checkout Style` (الملف القديم)
2. Add New → Title: `SOKANY Cart Checkout Style v1.1`
3. الصق محتوى `sokany-cart-checkout-style-v1.1.php` **بدون** `<?php`
4. Run: **Only run on site front-end**
5. Save & Activate
6. امسح كاش LiteSpeed/Cloudflare
7. اختبر `/cart/` و `/checkout/`

### اختبار سريع

| الحالة | المتوقع |
|--------|---------|
| صفحة السلة ديسكتوب | منتجات + إجمالي جنب بعض، عرض أوسع |
| صفحة الدفع | نموذجان أعرض جنب بعض؛ بدون حقل بلد |
| اختيار محافظة | كلام أسود واضح على خلفية خضراء |
| Refresh بعد إدخال بيانات | البيانات ترجع تلقائياً |

---

## 1b) Cart + Checkout Style v1.0 (قديم — لا تستخدمه)

ملف قديم: [`sokany-cart-checkout-style.php`](sokany-cart-checkout-style.php)  
استُبدل بـ **v1.1** أعلاه.

---

## 2) Lost Password OTP (احتياطي)

> **المفضّل الآن:** ارفع البلجن الصغير `dist/sokany-lost-password-otp.zip` بدل Code Snippets (الحفظ كان يفشل بـ 403 على السيرفر).

ملف السنابت (احتياطي): [`sokany-lost-password-otp.php`](sokany-lost-password-otp.php)

### ماذا يفعل؟

على `/my-account/lost-password/`:

1. يخفي فورم الإيميل
2. يطلب الموبايل ويرسل OTP عبر واتساب (بلجن `/request`)
3. يتحقق من الكود (`/verify`)
4. يفتح جلسة ووردبريس عبر **admin-ajax** بعد التحقق بـ `/login`  
   (بدون `/lost-password-session` — غير موجود في 1.2.3)

### التثبيت (سنابت — احتياطي فقط)

1. تأكد أن بلجن **SOKANY WhatsApp OTP 1.2.4** مفعّل
2. Code Snippets → Add New
3. الصق الملف **بدون** `<?php`
4. Run: **Everywhere** → Activate
5. عطّل أي سنابت lost-password قديم متعارض
