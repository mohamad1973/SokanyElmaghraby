# Lost Password OTP

## الطريقة الموصى بها: بلجن OTP v1.3.3+

ارفع `dist/sokany-whatsapp-otp.zip` من لوحة ووردبريس:

**Plugins → Add New → Upload Plugin → Choose File → Replace current with uploaded**

بعد التفعيل تظهر واجهة الموبايل تلقائياً على `/my-account/lost-password/` (الإعداد مفعّل افتراضياً).

**عطّل** أي سنابت Code Snippets قديم لـ lost-password إن وُجد (لا تحاول تعديله إذا ظهر 403).

---

## سنابت مستقل (احتياطي فقط)

ملف: [`sokany-lost-password-otp.php`](sokany-lost-password-otp.php)

استخدمه فقط إذا لم تستطع رفع البلجن. يحتاج Run **Everywhere**. إذا Code Snippets يرفض الحفظ بـ 403، استخدم البلجن أعلاه.
