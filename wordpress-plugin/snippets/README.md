# Lost Password OTP — Code Snippet (مستقل)

ملف: [`sokany-lost-password-otp.php`](sokany-lost-password-otp.php)

## ماذا يفعل؟

على صفحة ووكومرس **نسيت كلمة المرور** (`/my-account/lost-password/`):

1. يخفي نموذج البريد الافتراضي
2. يطلب رقم الموبايل ويرسل OTP عبر MazBot
3. إن الرقم مسجّل: إدخال الكود → تسجيل دخول WordPress
4. إن الرقم غير مسجّل: رسالة + رابط إنشاء حساب

**مستقل عن بلجن OTP** (لا يستدعي `Sokany_WhatsApp_OTP` ولا `/sokany-otp/v1/*`).  
**لا يغيّر تأكيد الأوردر** — منطق الأوردر يبقى في بلجن MazBot كما هو.

## من أين تأتي بيانات MazBot؟

1. افتراضياً يقرأ من option البلجن الموجود: `sokany_whatsapp_otp_settings`  
   (نفس API Key / البريد / كلمة المرور التي تعمل لتأكيد الأوردر)
2. يستخدم **`mazbot_template_id`** = قالب **OTP** فقط (ليس `mazbot_order_template_id`)
3. يمكن تجاوز الإعدادات من أعلى السنابت عبر `SOKANY_LOST_OTP_OVERRIDES`

## التثبيت

1. **Snippets → Add New**
2. الصق محتوى الملف **بدون** `<?php` في البداية
3. Run: **Everywhere** → Activate
4. تأكد أن **Template ID لقالب OTP** موجود في إعدادات البلجن (أو في الـ overrides)
5. اختبر: `/my-account/lost-password/`

## Endpoints الخاصة بالسنابت

```
POST /wp-json/sokany-lost-otp/v1/request
POST /wp-json/sokany-lost-otp/v1/verify
POST /wp-json/sokany-lost-otp/v1/session
```

## اختبار سريع

| الحالة | المتوقع |
|--------|---------|
| رقم مسجّل | كود واتساب → دخول → حسابي |
| رقم غير مسجّل | رسالة إنشاء حساب |
| كود خاطئ | خطأ بدون دخول |
| `mode=test` في الإعدادات | لا يرسل واتساب؛ الكود يُحفظ في option `sokany_lost_otp_last_test` |
