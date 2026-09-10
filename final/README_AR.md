# نقل متجر SOKANY (Next.js) إلى هوستنجر — مجلد final

هذا المجلد يجهّز نسخة **بنفس الشكل الحالي** للتشغيل على هوستنجر عبر **Node.js Web App** (مش رفع HTML على `public_html` فقط).

## شرط الباقة

من hPanel لازم يظهر: **Add Website → Node.js web app**.

متاح عادة على باقات **Business** أو **Cloud**. لو باقتك Shared عادية بدون Node.js، رقِّ الباقة أولًا وإلا الموقع مش هيشتغل.

ووردبريس `https://sokany-eg.com` يفضل كما هو (المنتجات والطلبات). المتجر Next يشتغل على دومين/سب دومين منفصل ويتكلم مع Woo عبر REST.

## محتويات المجلد

| المسار | الوظيفة |
|--------|---------|
| `config.env.example` | قالب الدومين + MySQL + Woo + أدمن |
| `database/schema.sql` | جداول Prisma (مظهر/شحن/wishlist…) — **ليست** جداول ووكومرس |
| `scripts/pack.mjs` | يبني المشروع وينسخه إلى `final/app` |
| `app/` | ناتج البناء الجاهز للتشغيل (`node server.js`) |

## خطوة 1 — إعداد قاعدة البيانات على هوستنجر

1. hPanel → **Databases** → **MySQL** → أنشئ قاعدة + مستخدم.
2. افتح **phpMyAdmin** → اختر القاعدة → **Import**.
3. ارفع الملف: `final/database/schema.sql`.
4. انسخ بيانات الاتصال في الصيغة:

```text
mysql://USER:PASSWORD@localhost:3306/DATABASE_NAME
```

ملاحظة: لو الباسورد فيه رموز خاصة (`@ # %`)، لازم URL-encode في `DATABASE_URL`.

## خطوة 2 — تعبئة الإعدادات

1. انسخ `config.env.example` إلى `config.env` (أو `.env`).
2. عبّئ على الأقل:
   - `NEXTAUTH_URL` = رابط الدومين النهائي بـ `https://`
   - `DATABASE_URL`
   - `WOOCOMMERCE_*` (نفس مفاتيح REST الحالية)
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD`
   - `NEXTAUTH_SECRET` (سر عشوائي طويل)
3. بعد التعبئة ضع الملف داخل `final/app/` باسم `.env` قبل/بعد الرفع.

## خطوة 3 — بناء النسخة محليًا

من جذر المشروع على جهازك:

```bash
node final/scripts/pack.mjs
```

ينتج المجلد `final/app` وفيه `server.js` جاهز.

اختبار محلي سريع (بعد تعبئة `.env`):

```bash
cd final/app
node server.js
```

## خطوة 4 — الرفع على هوستنجر

### أ) رفع كـ Node.js Web App (المفضّل)

1. hPanel → **Websites** → **Add Website** → **Node.js web app**.
2. إمّا:
   - ربط **GitHub** بالمستودع والبناء على السيرفر، مع وضع متغيرات البيئة من `config.env` في لوحة التطبيق، **أو**
   - رفع ZIP لمحتويات المشروع / `final/app` حسب ما تسمح به الواجهة.
3. إعدادات مقترحة إن طلبت يدويًا:
   - Node: **20.x**
   - Build: `npm ci && npm run build` (لو رفعت المصدر كاملًا)
   - Start: `node server.js` أو `npm start` (للمصدر) / للمنفذ الذي تحدده هوستنجر
4. اربط الدومين أو السب دومين (مثل `shop.sokany-eg.com`).
5. في DNS أو Domains داخل hPanel وجّه السجل للدومين على تطبيق Node.

### ب) لو رفعت `final/app` جاهزًا

- أمر التشغيل: `node server.js`
- تأكد أن `.env` موجود بجانب `server.js`
- مجلدات `.next/static` و `public` لازم تكون داخل `app` (السكربت ينسخها تلقائيًا)

## خطوة 5 — اختبار القبول

- الصفحة الرئيسية تفتح بنفس شكل المتجر.
- `/admin/login` يدخل بـ `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
- المنتجات تظهر من WooCommerce.
- إن وُجد `DATABASE_URL`: حفظ إعدادات المظهر من الأدمن ينجح.

## ما لن يعمل على public_html PHP فقط

رفع محتوى `out/` أو HTML ثابت **يكسر** الأدمن، الـ API، الجلسات، والـ checkout. لا تستخدم `output: 'export'` لهذا المشروع.

## إعادة التعبئة بعد أي تعديل على الكود

```bash
node final/scripts/pack.mjs
```

ثم ارفع `final/app` من جديد أو ادفع لـ GitHub ليُبنى على هوستنجر.
