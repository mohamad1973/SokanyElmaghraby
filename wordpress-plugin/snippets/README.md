# Lost Password OTP — Code Snippet (متوافق مع بلجن 1.2.3)

> **المفضّل الآن:** ارفع البلجن الصغير `dist/sokany-lost-password-otp.zip` بدل Code Snippets (الحفظ كان يفشل بـ 403 على السيرفر).

ملف السنابت (احتياطي): [`sokany-lost-password-otp.php`](sokany-lost-password-otp.php)

## ماذا يفعل؟

على `/my-account/lost-password/`:

1. يخفي فورم الإيميل
2. يطلب الموبايل ويرسل OTP عبر واتساب (بلجن `/request`)
3. يتحقق من الكود (`/verify`)
4. يفتح جلسة ووردبريس عبر **admin-ajax** بعد التحقق بـ `/login`  
   (بدون `/lost-password-session` — غير موجود في 1.2.3)

## التثبيت (سنابت — احتياطي فقط)

1. تأكد أن بلجن **SOKANY WhatsApp OTP 1.2.3** مفعّل
2. Code Snippets → Add New
3. الصق الملف **بدون** `<?php`
4. Run: **Everywhere** → Activate
5. عطّل أي سنابت lost-password قديم متعارض

## اختبار

| الحالة | المتوقع |
|--------|---------|
| رقم مسجّل | كود واتساب → دخول حسابي |
| رقم غير مسجّل | رسالة إنشاء حساب |
| بلجن غير مفعّل | رسالة تحذير |
