# Lost Password OTP — Code Snippet (مستقل)

ملف: [`sokany-lost-password-otp.php`](sokany-lost-password-otp.php)

## ماذا يفعل؟

على صفحة ووكومرس **نسيت كلمة المرور** (`/my-account/lost-password/`):

1. يخفي نموذج البريد الافتراضي
2. يطلب رقم الموبايل ويرسل OTP عبر MazBot
3. إن الرقم مسجّل: إدخال الكود → تسجيل دخول WordPress
4. إن الرقم غير مسجّل: رسالة + رابط إنشاء حساب

**مستقل عن بلجن OTP** (لا يستدعي `Sokany_WhatsApp_OTP`).  
**لا يغيّر تأكيد الأوردر.**

## لماذا كانت تظهر «لم يتم العثور على مسار...»؟

هذه رسالة `rest_no_route`. غالباً لأن السنابت القديم كان يستدعي  
`/wp-json/sokany-otp/v1/lost-password-session` وهو غير موجود على السيرفر،  
أو لأن REST الخاص بالسنابت لم يُسجَّل. النسخة الحالية تستخدم **admin-ajax** أولاً.

## التثبيت (مهم)

1. عطّل أي سنابت قديم لـ lost-password OTP
2. **Snippets → Add New** — الصق الملف **بدون** `<?php`
3. Run snippet: **Everywhere** (ليس Front-end only)
4. Activate → Save
5. اختياري: Settings → Permalinks → Save
6. اختبر `/my-account/lost-password/`

## Ajax actions

```
admin-ajax.php?action=sokany_lost_otp_request
admin-ajax.php?action=sokany_lost_otp_verify
admin-ajax.php?action=sokany_lost_otp_session
```

(REST احتياطي ما زال مسجّلاً تحت `sokany-lost-otp/v1` لكن الواجهة لا تعتمد عليه.)

## MazBot

- يقرأ `sokany_whatsapp_otp_settings` (نفس بيانات تأكيد الأوردر)
- يستخدم **`mazbot_template_id`** = قالب OTP فقط (ليس قالب الأوردر)
- يمكن التجاوز من `SOKANY_LOST_OTP_OVERRIDES` أعلى السنابت

## اختبار

| الحالة | المتوقع |
|--------|---------|
| رقم مسجّل | كود واتساب → دخول |
| رقم غير مسجّل | رسالة إنشاء حساب |
| سنابت غير مفعّل / Front-end only | رسالة عربية توضّح تفعيل Everywhere |
