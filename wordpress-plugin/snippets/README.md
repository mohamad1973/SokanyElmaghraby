# Lost Password OTP — Code Snippet

ملف: [`sokany-lost-password-otp.php`](sokany-lost-password-otp.php)

## ماذا يفعل؟

على صفحة ووكومرس **نسيت كلمة المرور** (`/my-account/lost-password/`):

1. يخفي نموذج البريد / اسم المستخدم الافتراضي
2. يظهر حقل رقم الموبايل + إرسال كود واتساب
3. إن الرقم مسجّل: إدخال الكود → تسجيل دخول إلى الحساب
4. إن الرقم غير مسجّل: رسالة + رابط إنشاء حساب / الاشتراك

مستقل عن Next.js. يعتمد على بلجن **SOKANY WhatsApp OTP v1.3.2+** (endpoint `/lost-password-session` + بحث رقم محسّن).

## التثبيت

1. ارفع/حدّث بلجن OTP إلى **1.3.2** على ووردبريس وفعّله.
2. افتح **Snippets → Add New** (بلجن Code Snippets).
3. الصق محتوى `sokany-lost-password-otp.php` **بدون** سطر `<?php` في البداية — Code Snippets يضيفه تلقائياً، ولصقه يسبب خطأ syntax.
4. العنوان مثلاً: `SOKANY Lost Password OTP`
5. Run snippet: **Everywhere**
6. Activate.

## اختبار

| الحالة | المتوقع |
|--------|---------|
| رقم مسجّل في `billing_phone` / `phone` / `mobile` | كود واتساب → دخول → حسابي |
| رقم غير مسجّل | رسالة إنشاء حساب + رابط |
| كود خاطئ | رسالة خطأ بدون دخول |
| بلجن OTP غير مفعّل | رسالة تحذير أعلى الصفحة |

## ملاحظات

- لا يحتاج تفعيل «OTP في My Account» من إعدادات البلجن.
- قالب MazBot للـ OTP يجب أن يكون مضبوطاً كالمعتاد.
