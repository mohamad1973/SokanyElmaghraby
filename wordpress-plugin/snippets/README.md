# WordPress Code Snippets (Woo only)

ملفات جاهزة للصق داخل بلجن **Code Snippets** على `sokany-eg.com` فقط.  
**لا تلمس موقع Next.js.**

---

## 1) Cart + Checkout Style + حفظ بيانات العميل

ملف: [`sokany-cart-checkout-style.php`](sokany-cart-checkout-style.php)

### ماذا يفعل؟

- يغيّر شريط رسالة WooCommerce الأحمر (مثل «تم إضافة…») إلى **أخضر داكن** مناسب لهوية الموقع
- ينسّق صفحة **السلة** بشكل أقرب لـ Next (كروت + ملخص أنظف)
- ينسّق صفحة **التشيك أوت** (حقول + ملخص + زر إتمام)
- يحفظ بيانات العميل في `localStorage` ويعيد تعبئتها تلقائياً في الزيارة التالية

### التثبيت

1. ووردبريس → **Snippets → Add New**
2. Title: `SOKANY Cart Checkout Style`
3. الصق محتوى الملف **بدون** سطر `<?php`
4. Run: **Only run on site front-end**
5. Save & Activate
6. امسح كاش LiteSpeed/Cloudflare إن وُجد
7. اختبر `/cart/` و `/checkout/`

### اختبار سريع

| الحالة | المتوقع |
|--------|---------|
| إضافة منتج للسلة | رسالة خضراء داكنة بدل الحمراء |
| صفحة السلة | شكل كروت أوضح + زر ليموني |
| صفحة الدفع | حقول مرتبة + ملخص أوضح |
| أدخل بيانات ثم Refresh | البيانات ترجع تلقائياً |

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
