<div dir="rtl">

# دليل SOKANY Storefront الشامل

**مشروع:** sokany-storefront — متجر إلكتروني عربي RTL لـ SOKANY مصر  
**آخر تحديث:** يوليو 2026  
**الإصدار التقني:** Next.js 16 + React 19 + TypeScript + Tailwind CSS 4 + Prisma + WooCommerce

---

## كيف تقرأ هذا الدليل

- **النسخة الموصى بها (HTML — RTL جاهز):** افتح `docs/SOKANY_HANDBOOK_AR.html` في المتصفح، أو من الديسكتوب: `C:\Users\mm\Desktop\SOKANY_STOREFRONT_دليل.html`
- **نسخة Markdown:** `docs/SOKANY_HANDBOOK_AR.md`
- **إعادة توليد HTML بعد تعديل Markdown:** `node scripts/handbook-to-html.mjs`

---

## فهرس المحتويات

1. [نظرة عامة وروابط الإنتاج](#1-نظرة-عامة-وروابط-الإنتاج)
2. [البنية المعمارية](#2-البنية-المعمارية)
3. [هيكل المجلدات](#3-هيكل-المجلدات)
4. [بناء الموقع من الصفر](#4-بناء-الموقع-من-الصفر)
5. [فهرس المسارات السريع](#5-فهرس-المسارات-السريع)
6. [دليل الميزات التفصيلي](#6-دليل-الميزات-التفصيلي)
7. [فهرس التعديل السريع — أين أجد الكود؟](#7-فهرس-التعديل-السريع)
8. [متغيرات البيئة — مرجع كامل](#8-متغيرات-البيئة)
9. [إعدادات المظهر من الداشبورد](#9-إعدادات-المظهر-من-الداشبورد)
10. [قاعدة البيانات Prisma](#10-قاعدة-البيانات-prisma)
11. [بلجنات ووردبريس](#11-بلجنات-ووردبريس)
12. [سجل التعديلات](#12-سجل-التعديلات)
13. [حالة الميزات](#13-حالة-الميزات)
14. [دليل للمساعدين](#14-دليل-للمساعدين)

---

## 1. نظرة عامة وروابط الإنتاج

| الخدمة | الرابط / المسار |
|--------|-----------------|
| المتجر (إنتاج Vercel) | https://sokany-storefront.vercel.app |
| ووردبريس / WooCommerce | https://sokany-eg.com |
| GitHub | `mohamad1973/SokanyElmaghraby` — فرع `master` |
| مشروع Vercel | `tooliano-store/sokany-storefront` |
| مجلد المشروع المحلي | `C:\Users\mm\SokanyElmaghraby\sokany-storefront` |

**ما يفعله المشروع:**
- واجهة متجر عربية RTL للعملاء (منتجات، بحث، مقارنة، مفضلة، حساب، OTP).
- لوحة تحكم أدمن لتخصيص المظهر والبانرات والتنقل والطلبات.
- نظام شحن وتوزيع مع Bosta وتطبيق سائق PWA.
- اتصال بـ WooCommerce REST API كمصدر للمنتجات والطلبات.
- بلجن ووردبريس لإرسال OTP عبر واتساب.

---

## 2. البنية المعمارية

```
المتصفح (عميل / أدمن / سائق)
    │
    ▼
Next.js App Router
    ├── src/app/          ← صفحات + API Routes
    ├── src/components/   ← مكوّنات React
    └── src/lib/          ← منطق الأعمال
            │
            ├── WooCommerce REST API  (منتجات، طلبات، عملاء)
            ├── بلجن SOKANY WhatsApp OTP  (ووردبريس REST)
            └── Prisma / MySQL  (إعدادات المظهر، شحن، توزيع، wishlist)
```

**طبقات الحماية:**
- `middleware.ts` — يحمي `/admin/*` و `/driver/*` و APIs الخاصة بهما عبر NextAuth JWT.
- جلسة العميل — cookie موقّعة في `src/lib/customer-account.ts` باستخدام `NEXTAUTH_SECRET`.

---

## 3. هيكل المجلدات

| المجلد | الوظيفة |
|--------|---------|
| `src/app/` | كل صفحات المتجر والأدمن والسائق + API Routes |
| `src/components/` | مكوّنات UI مشتركة (هيدر، فوتر، منتج، OTP، إلخ) |
| `src/lib/` | منطق الأعمال (WooCommerce، OTP، شحن، مظهر، إلخ) |
| `prisma/` | مخطط قاعدة البيانات + seed + migrations |
| `wordpress-plugin/` | بلجنات ووردبريس (OTP، headless settings) |
| `dist/` | ملفات ZIP جاهزة للرفع (مثل OTP plugin) |
| `scripts/` | سكربتات البناء (`prepare-db.mjs`) |
| `docs/` | هذا الدليل |
| `.cursor/` | دليل Cursor + قواعد الوكيل |

---

## 4. بناء الموقع من الصفر

### 4.1 المتطلبات

| المتطلب | الإصدار / الملاحظة |
|---------|-------------------|
| Node.js | 20 أو أحدث |
| npm | يأتي مع Node |
| Git | لاستنساخ المشروع |
| حساب Vercel | للنشر |
| MySQL | اختياري محلياً؛ مطلوب للشحن/التوزيع/إعدادات المظهر المحفوظة |
| ووردبريس | sokany-eg.com مع WooCommerce + JWT + بلجن OTP |

### 4.2 استنساخ المشروع وتثبيت الحزم

```bash
git clone https://github.com/mohamad1973/SokanyElmaghraby.git
cd SokanyElmaghraby
npm install
```

> `npm install` يشغّل `postinstall` → `prisma generate` تلقائياً.

### 4.3 إعداد متغيرات البيئة

أنشئ ملف `.env.local` في جذر المشروع (لا يُرفع إلى GitHub):

```env
# === ووردبريس / WooCommerce ===
WOOCOMMERCE_STORE_URL=https://sokany-eg.com
WOOCOMMERCE_CONSUMER_KEY=ck_xxxxxxxx
WOOCOMMERCE_CONSUMER_SECRET=cs_xxxxxxxx
WOOCOMMERCE_WEBHOOK_SECRET=سر_ويب_هوك_الطلبات

# === جلسات NextAuth (أدمن + سائق + توقيع عميل) ===
NEXTAUTH_SECRET=ضع_هنا_سراً_عشوائياً_طويلاً_32_حرفاً_على_الأقل
NEXTAUTH_URL=http://localhost:3000

# === دخول الأدمن ===
ADMIN_EMAIL=admin@sokany-eg.com
ADMIN_PASSWORD=كلمة_مرور_قوية

# === قاعدة البيانات MySQL (اختياري محلياً) ===
DATABASE_URL=mysql://user:password@host:3306/database

# === شحن Bosta ===
BOSTA_API_KEY=
BOSTA_BASE_URL=https://app.bosta.co
BOSTA_WEBHOOK_SECRET=

# === واتساب إشعارات الطلبات (للأدمن) ===
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ADMIN_RECIPIENT=201000260262
WHATSAPP_ORDER_TEMPLATE_NAME=

# === خرائط Google (تحسين مسار السائق) ===
GOOGLE_MAPS_API_KEY=

# === Fawry (غير مفعّل بعد — placeholder) ===
FAWRY_MERCHANT_CODE=
FAWRY_SECURITY_KEY=
```

**أين تحصل على المفاتيح:**
- WooCommerce keys: ووردبريس → WooCommerce → Settings → Advanced → REST API.
- `NEXTAUTH_SECRET`: أي مولّد أسرار عشوائية (32+ حرف).
- Vercel: Project → Settings → Environment Variables (نفس القيم للإنتاج مع `NEXTAUTH_URL=https://sokany-storefront.vercel.app`).

### 4.4 قاعدة البيانات

```bash
# مزامنة المخطط مع MySQL
npm run db:push

# بذر المناطق الافتراضية للتوصيل
npm run db:seed
```

**بديل عبر المتصفح:** بعد النشر، افتح `/admin/dispatch/setup` لتهيئة جداول الشحن.

> أثناء `npm run build` يُشغَّل `scripts/prepare-db.mjs` الذي يحاول `db push` + `seed` إذا وُجد `DATABASE_URL`؛ وإلا يتخطى بأمان.

### 4.5 التطوير المحلي

```bash
npm run dev
```

افتح: http://localhost:3000

| الصفحة | الرابط المحلي |
|--------|---------------|
| المتجر | http://localhost:3000 |
| دخول أدمن | http://localhost:3000/admin/login |
| دخول سائق | http://localhost:3000/driver/login |

### 4.6 البناء للإنتاج

```bash
npm run build
```

الأمر يشغّل: `node scripts/prepare-db.mjs` ثم `next build`.

للتشغيل بعد البناء محلياً:

```bash
npm start
```

### 4.7 النشر على Vercel

```bash
git add .
git commit -m "وصف التعديل"
git push origin master
npx vercel --prod --yes
```

**رابط الإنتاج:** https://sokany-storefront.vercel.app

### 4.8 تثبيت بلجن OTP على ووردبريس

1. ارفع `dist/sokany-whatsapp-otp.zip` من لوحة ووردبريس → Plugins → Add New → Upload.
2. **مهم:** يجب أن يكون الملف الرئيسي داخل المجلد مباشرة:
   `wp-content/plugins/sokany-whatsapp-otp/sokany-whatsapp-otp.php`
3. إذا فشل التفعيل بـ «Plugin file does not exist»:
   - ارفع المجلد يدوياً عبر FTP إلى `wp-content/plugins/sokany-whatsapp-otp/`
4. فعّل البلجن → Settings → **SOKANY WhatsApp OTP** → فعّل **Test Mode**.

### 4.9 اختبار OTP

1. ووردبريس: Settings → SOKANY WhatsApp OTP → Test Mode ON → اطلب كود من المتجر → اقرأ الكود من صفحة الإعدادات.
2. المتجر: `/account/login` → «نسيت كلمة المرور؟» → أدخل موبايل 11 رقم → شاشة OTP منفصلة (6 أرقام).
3. Postman مباشرة على ووردبريس:
   ```
   POST https://sokany-eg.com/wp-json/sokany-otp/v1/request
   Body: {"phone":"01000260262","purpose":"login"}
   ```
   بدون Authorization header.

**شرط:** رقم الموبايل يجب أن يكون مسجلاً في ووردبريس في أحد الحقول: `billing_phone`, `phone`, `mobile`.

---

## 5. فهرس المسارات السريع

### 5.1 المتجر (عميل)

| ماذا تريد | افتح |
|-----------|------|
| الصفحة الرئيسية | `/` |
| المتجر / تصنيف | `/shop` أو `/shop?category=slug` |
| منتج | `/product/[slug]` |
| العروض | `/offers` |
| مقارنة منتجات | `/compare` |
| تسجيل الدخول | `/account/login` |
| نسيت كلمة المرور (OTP) | `/account/login` → «نسيت كلمة المرور؟» |
| إنشاء حساب | `/account/register` |
| حسابي | `/account` |
| تغيير كلمة المرور | `/account` → قسم «تغيير كلمة المرور» |
| تفاصيل طلب | `/account/orders/[id]` |
| السلة | `/cart` |
| الدفع | `/checkout` |
| من نحن | `/about` |
| اتصل بنا | `/contact` |
| الضمان | `/warranty` |
| سياسة الإرجاع | `/return-policy` |

### 5.2 الداشبورد (أدمن)

| ماذا تريد | افتح |
|-----------|------|
| دخول الأدمن | `/admin/login` |
| لوحة التحكم | `/admin` |
| الألوان والشعار | `/admin/theme` |
| الهيدر | `/admin/header` |
| الفوتر | `/admin/footer` |
| بانرات الرئيسية + كاروسيل التصنيفات | `/admin/banners` |
| واتساب / سوشيال / موضع الأزرار | `/admin/social-media` |
| قائمة التصنيفات في الهيدر | `/admin/navigation` |
| المنتجات | `/admin/products` |
| التصنيفات | `/admin/categories` |
| الطلبات | `/admin/orders` |
| تفاصيل طلب | `/admin/orders/[id]` |
| إعداد الشحن | `/admin/dispatch/setup` |
| لوحة التوزيع | `/admin/dispatch/board` |
| السائقين | `/admin/dispatch/drivers` |
| المناطق | `/admin/dispatch/zones` |
| تقارير | `/admin/dispatch/reports` |

### 5.3 السائق

| ماذا تريد | افتح |
|-----------|------|
| دخول السائق | `/driver/login` |
| ملخص اليوم | `/driver/today` |
| ترتيب المحطات | `/driver/route` |
| تأكيد تسليم + OTP | `/driver/order/[id]` |

### 5.4 ووردبريس (خارج Next.js)

| ماذا تريد | أين |
|-----------|-----|
| إعدادات OTP + Test Mode | Settings → SOKANY WhatsApp OTP |
| عملاء / أرقام موبايل | Users → حقول billing_phone, phone, mobile |
| JWT للعملاء | بلجن JWT Authentication |

---

## 6. دليل الميزات التفصيلي

> **قالب كل ميزة:** الوصول | ملفات الواجهة | API | منطق الأعمال | إعدادات أدمن | متغيرات | كيف تعدّل

---

### 6.1 الصفحة الرئيسية `/`

| البند | التفاصيل |
|-------|----------|
| **الوصول** | `/` |
| **ملف الواجهة** | `src/app/page.tsx` |
| **مكوّنات** | `src/components/hero-section.tsx`, `hero-carousel.tsx`, `main-groups-section.tsx`, `category-scroller.tsx`, `trust-badges-section.tsx`, `custom-product-section.tsx` |
| **منطق الأعمال** | `src/lib/theme-settings.ts` (ترتيب الأقسام، بانرات، ألوان) |
| **منتجات** | `src/lib/woocommerce.ts` |
| **إعدادات أدمن** | `/admin/banners`, `/admin/theme`, `/admin/header` |
| **متغيرات** | `WOOCOMMERCE_*`, `DATABASE_URL` (لحفظ إعدادات المظهر) |
| **كيف تعدّل** | 1) غيّر ترتيب الأقسام من `/admin/banners`. 2) غيّر ألوان الشعار من `/admin/theme`. 3) للتعديل البرمجي: `src/app/page.tsx` + `theme-settings.ts`. |

---

### 6.2 المتجر `/shop`

| البند | التفاصيل |
|-------|----------|
| **الوصول** | `/shop`, `/shop?category=slug` |
| **ملف الواجهة** | `src/app/shop/page.tsx` |
| **مكوّنات** | `src/components/product-card.tsx`, `product-section-grid.tsx` |
| **منطق الأعمال** | `src/lib/woocommerce.ts` — `getProducts()`, `getCategories()` |
| **متغيرات** | `WOOCOMMERCE_STORE_URL`, `WOOCOMMERCE_CONSUMER_KEY`, `WOOCOMMERCE_CONSUMER_SECRET` |
| **كيف تعدّل** | 1) عدد المنتجات/الفلترة: عدّل استدعاء WooCommerce في `shop/page.tsx`. 2) شكل البطاقة: `product-card.tsx`. 3) مفاتيح API: `.env.local` أو Vercel env. |

---

### 6.3 صفحة المنتج `/product/[slug]`

| البند | التفاصيل |
|-------|----------|
| **الوصول** | `/product/اسم-المنتج` |
| **ملف الواجهة** | `src/app/product/[slug]/page.tsx` |
| **مكوّنات** | `product-image-gallery.tsx`, `product-page-actions.tsx`, `product-rich-description.tsx`, `product-spec-row.tsx` |
| **منطق الأعمال** | `woocommerce.ts`, `product-spec-parser.ts`, `product-display-code.ts` |
| **SEO** | metadata + JSON-LD داخل `page.tsx` |
| **كيف تعدّل** | 1) عرض المواصفات: `product-spec-parser.ts`. 2) أزرار wishlist/compare: `product-page-actions.tsx`. 3) كود المنتج المعروض: إعداد `productCard.codeMode` من `/admin/theme`. |

---

### 6.4 العروض `/offers`

| البند | التفاصيل |
|-------|----------|
| **الوصول** | `/offers` |
| **ملف الواجهة** | `src/app/offers/page.tsx` |
| **منطق الأعمال** | `woocommerce.ts` — منتجات بتخفيض |
| **كيف تعدّل** | عدّل فلتر العروض في `offers/page.tsx` أو استعلام WooCommerce. |

---

### 6.5 مقارنة المنتجات `/compare`

| البند | التفاصيل |
|-------|----------|
| **الوصول** | `/compare` |
| **ملف الواجهة** | `src/app/compare/page.tsx` |
| **مكوّنات** | `product-compare-table.tsx`, `compare-floating-bar.tsx`, `compare-replace-modal.tsx`, `header-compare-link.tsx` |
| **API** | `GET /api/products/compare` → `src/app/api/products/compare/route.ts` |
| **منطق الأعمال** | `src/lib/compare-utils.ts`, `src/lib/product-lists.ts` |
| **كيف تعدّل** | 1) حد أقصى 4 منتجات: `product-lists.ts`. 2) أعمدة الجدول: `compare-utils.ts`. 3) واجهة: `product-compare-table.tsx`. |

---

### 6.6 المفضلة (Wishlist)

| البند | التفاصيل |
|-------|----------|
| **الوصول** | أيقونة القلب في الهيدر |
| **مكوّنات** | `header-wishlist-menu.tsx`, `product-lists-provider.tsx` |
| **API** | `GET/PUT /api/account/wishlist` → `src/app/api/account/wishlist/route.ts` |
| **منطق الأعمال** | `src/lib/product-lists.ts` — يحفظ في Prisma جدول `CustomerWishlist` |
| **متغيرات** | `DATABASE_URL` |
| **كيف تعدّل** | 1) سلوك الحفظ: `product-lists.ts`. 2) واجهة القائمة: `header-wishlist-menu.tsx`. |

---

### 6.7 البحث عن منتجات

| البند | التفاصيل |
|-------|----------|
| **الوصول** | حقل البحث في الهيدر |
| **مكوّن** | `src/components/header-product-search.tsx` |
| **API** | `GET /api/products/search` → `src/app/api/products/search/route.ts` |
| **منطق الأعمال** | `woocommerce.ts` |
| **كيف تعدّل** | عدّل منطق البحث في `search/route.ts` أو `header-product-search.tsx`. |

---

### 6.8 السلة `/cart` و الدفع `/checkout`

| البند | التفاصيل |
|-------|----------|
| **الوصول** | `/cart`, `/checkout` |
| **ملفات الواجهة** | `src/app/cart/page.tsx`, `src/app/checkout/page.tsx` |
| **API** | `POST /api/checkout` → placeholder |
| **Fawry** | `POST /api/fawry/callback` → placeholder |
| **الحالة** | **واجهة فقط** — لا إنشاء طلب حقيقي بعد |
| **كيف تعدّل** | عند التفعيل: اربط `checkout/route.ts` بـ WooCommerce orders + Fawry env vars. |

---

### 6.9 تسجيل الدخول `/account/login`

| البند | التفاصيل |
|-------|----------|
| **الوصول** | `/account/login` |
| **ملف الواجهة** | `src/app/account/login/page.tsx` |
| **مكوّن** | `src/components/account-auth-form.tsx` |
| **API** | `POST /api/account/login`, `POST /api/account/otp/request`, `POST /api/account/otp/login`, `POST /api/account/otp/reset-password` |
| **منطق الأعمال** | `src/lib/customer-account.ts`, `src/lib/whatsapp-otp.ts` |
| **بلجن ووردبريس** | `wordpress-plugin/sokany-whatsapp-otp/` |
| **متغيرات** | `WOOCOMMERCE_STORE_URL`, `WOOCOMMERCE_CONSUMER_KEY/SECRET`, `NEXTAUTH_SECRET` |
| **كيف تعدّل** | 1) نصوص الواجهة: `login/page.tsx`. 2) تدفق OTP: `account-auth-form.tsx`. 3) منطق الجلسة: `customer-account.ts`. 4) عنوان OTP API: `whatsapp-otp.ts` → دالة `getOtpEndpoint()`. |

**تدفق OTP نسيت كلمة المرور:**
1. المستخدم يدخل 11 رقم موبايل.
2. `POST /api/account/otp/request` → ووردبريس `/wp-json/sokany-otp/v1/request`.
3. شاشة OTP منفصلة (6 أرقام).
4. تحقق + إعادة تعيين كلمة المرور.

---

### 6.10 التسجيل `/account/register`

| البند | التفاصيل |
|-------|----------|
| **الوصول** | `/account/register` |
| **ملف الواجهة** | `src/app/account/register/page.tsx` |
| **مكوّن** | `account-auth-form.tsx` |
| **API** | `POST /api/account/register` |
| **منطق الأعمال** | `customer-account.ts` |
| **كيف تعدّل** | حقول التسجيل في `account-auth-form.tsx` + `register/route.ts`. |

---

### 6.11 حسابي `/account`

| البند | التفاصيل |
|-------|----------|
| **الوصول** | `/account` (يتطلب دخول) |
| **ملف الواجهة** | `src/app/account/page.tsx` |
| **مكوّنات** | `account-change-password-form.tsx`, `account-logout-button.tsx` |
| **API** | `GET /api/account/me`, `POST /api/account/change-password`, `POST /api/account/logout` |
| **منطق الأعمال** | `customer-account.ts` — طلبات، ولاء، جلسة |
| **كيف تعدّل** | 1) أقسام الصفحة: `account/page.tsx`. 2) تغيير كلمة المرور: `account-change-password-form.tsx`. |

---

### 6.12 تفاصيل طلب العميل `/account/orders/[id]`

| البند | التفاصيل |
|-------|----------|
| **الوصول** | `/account/orders/123` |
| **ملف الواجهة** | `src/app/account/orders/[id]/page.tsx` |
| **منطق الأعمال** | `customer-account.ts` — يجلب الطلب من WooCommerce |
| **كيف تعدّل** | عرض الحقول في `orders/[id]/page.tsx`. |

---

### 6.13 صفحات المحتوى الثابت

| المسار | الملف |
|--------|-------|
| `/about` | `src/app/about/page.tsx` |
| `/contact` | `src/app/contact/page.tsx` |
| `/warranty` | `src/app/warranty/page.tsx` |
| `/return-policy` | `src/app/return-policy/page.tsx` |

**كيف تعدّل:** عدّل النص مباشرة في ملف `page.tsx` لكل صفحة.

---

### 6.14 الهيدر والفوتر والأزرار العائمة

| البند | التفاصيل |
|-------|----------|
| **مكوّن رئيسي** | `src/components/site-chrome.tsx` |
| **هيدر** | `src/components/header.tsx` |
| **فوتر** | `src/components/footer.tsx` |
| **تنقل سفلي موبايل** | `src/components/mobile-bottom-nav.tsx` |
| **درج جانبي** | `src/components/mobile-side-drawer.tsx` |
| **أزرار عائمة** | `src/components/floating-action-buttons.tsx` |
| **سوشيال** | `src/components/social-media-sidebar.tsx`, `mobile-social-launcher.tsx` |
| **منطق الأعمال** | `theme-settings.ts`, `widget-placement.ts`, `widget-button-style.ts`, `menu.ts` |
| **إعدادات أدمن** | `/admin/header`, `/admin/footer`, `/admin/social-media` |
| **كيف تعدّل** | 1) نصوص وشعار: `/admin/theme` + `/admin/header`. 2) موضع واتساب/صعود: `/admin/social-media`. 3) برمجياً: `widget-placement.ts`. |

---

### 6.15 لوحة الأدمن `/admin`

| البند | التفاصيل |
|-------|----------|
| **الوصول** | `/admin/login` ثم `/admin` |
| **حماية** | `middleware.ts` + `src/lib/auth.ts` (NextAuth) |
| **قشرة UI** | `src/app/admin/admin-shell.tsx`, `src/app/admin/layout.tsx` |
| **نموذج إعدادات مشترك** | `src/app/admin/settings-form.tsx` |
| **متغيرات** | `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` |
| **كيف تعدّل** | 1) بيانات دخول: env vars. 2) قائمة جانبية: `admin-shell.tsx`. |

---

### 6.16 إعدادات المظهر `/admin/theme`

| البند | التفاصيل |
|-------|----------|
| **الوصول** | `/admin/theme` |
| **ملف الواجهة** | `src/app/admin/theme/page.tsx` |
| **API** | `GET/POST /api/admin/theme-settings` |
| **منطق الأعمال** | `src/lib/theme-settings.ts` — يحفظ JSON في جدول `ThemeSettings` (id=`site`) |
| **متغيرات** | `DATABASE_URL` |
| **كيف تعدّل** | 1) من المتصفح: `/admin/theme`. 2) ألوان CSS: `getThemeCssVariables()` في `theme-settings.ts`. 3) defaults: `defaultThemeSettings` في نفس الملف. |

---

### 6.17 الهيدر والفوتر من الأدمن

| الصفحة | الملف | مفتاح JSON |
|--------|-------|------------|
| `/admin/header` | `src/app/admin/header/page.tsx` | `settings.header`, `settings.topBanner` |
| `/admin/footer` | `src/app/admin/footer/page.tsx` | `settings.footer` |
| `/admin/banners` | `src/app/admin/banners/page.tsx` | `settings.hero`, `settings.sections` |
| `/admin/social-media` | `src/app/admin/social-media/page.tsx` | `settings.socialMedia`, `settings.floatingActions` |
| `/admin/navigation` | `src/app/admin/navigation/page.tsx` | `CategoryMenuSelection` + `menu.ts` |

**رفع صور:** `src/app/admin/image-upload-field.tsx` → `POST /api/admin/upload` → `src/lib/admin-media.ts`

---

### 6.18 المنتجات والتصنيفات (أدمن)

| الصفحة | الملف | API |
|--------|-------|-----|
| `/admin/products` | `src/app/admin/products/page.tsx` | `POST /api/admin/import/products` |
| `/admin/categories` | `src/app/admin/categories/page.tsx` | `POST /api/admin/import/categories` |

**منطق الاستيراد:** `src/lib/admin-imports.ts`, `src/lib/woocommerce-update.ts`

**كيف تعدّل:** بيانات المنتجات الأساسية من WooCommerce؛ الاستيراد يحدّث حقول إضافية في ووردبريس.

---

### 6.19 الطلبات (أدمن)

| البند | التفاصيل |
|-------|----------|
| **القائمة** | `/admin/orders` → `src/app/admin/orders/page.tsx` |
| **التفاصيل** | `/admin/orders/[id]` → `src/app/admin/orders/[id]/page.tsx` |
| **API** | `GET /api/admin/orders`, `GET /api/admin/orders/[id]` |
| **منطق الأعمال** | `src/lib/orders.ts` |
| **شحن Bosta** | `order-shipping-actions.tsx` → `POST /api/admin/shipping/bosta/create` |
| **إشعار واتساب** | `src/lib/whatsapp.ts` |
| **متغيرات** | `WOOCOMMERCE_*`, `BOSTA_*`, `WHATSAPP_*` |
| **كيف تعدّل** | 1) أعمدة القائمة: `orders/page.tsx`. 2) إنشاء شحنة: `bosta-client.ts`. |

---

### 6.20 نظام التوزيع والشحن

| الصفحة | الملف | الوظيفة |
|--------|-------|---------|
| `/admin/dispatch/setup` | `dispatch/setup/page.tsx` | تهيئة DB + Bosta |
| `/admin/dispatch/board` | `dispatch/board/page.tsx` | توزيع طلبات اليوم |
| `/admin/dispatch/drivers` | `dispatch/drivers/page.tsx` | إدارة السائقين |
| `/admin/dispatch/zones` | `dispatch/zones/page.tsx` | مناطق القاهرة/الجيزة |
| `/admin/dispatch/reports` | `dispatch/reports/page.tsx` | تقارير أداء |

**مكتبات:** `src/lib/dispatch/` (assign-orders, drivers, zones, route-optimizer, zone-names)  
**شحن:** `src/lib/shipping/` (bosta-client, bosta-zones, bootstrap, shipments)  
**APIs:** `/api/admin/dispatch/*`, `/api/admin/setup/shipping`, `/api/admin/shipping/bosta/*`  
**متغيرات:** `DATABASE_URL`, `BOSTA_API_KEY`, `BOSTA_BASE_URL`, `BOSTA_WEBHOOK_SECRET`, `GOOGLE_MAPS_API_KEY`

**كيف تعدّل:**
1. أضف سائق من `/admin/dispatch/drivers`.
2. عيّن مناطق من `/admin/dispatch/zones`.
3. وزّع من `/admin/dispatch/board`.
4. مفاتيح Bosta في Vercel env.

---

### 6.21 تطبيق السائق

| المسار | الملف |
|--------|-------|
| `/driver/login` | `src/app/driver/login/page.tsx` |
| `/driver/today` | `src/app/driver/today/page.tsx` |
| `/driver/route` | `src/app/driver/route/page.tsx` |
| `/driver/order/[id]` | `src/app/driver/order/[id]/page.tsx` |

**قشرة:** `src/app/driver/driver-shell.tsx`, `driver/layout.tsx`  
**APIs:** `GET /api/driver/today`, `GET/POST /api/driver/assignments/[id]`  
**OTP تسليم:** `src/lib/security.ts`  
**حماية:** `middleware.ts` — role=`driver`

---

### 6.22 Webhooks

| المسار | الملف | الوظيفة |
|--------|-------|---------|
| `POST /api/webhooks/woocommerce/order-created` | `src/app/api/webhooks/woocommerce/order-created/route.ts` | طلب جديد من WooCommerce |
| `POST /api/webhooks/bosta/[secret]` | `src/app/api/webhooks/bosta/[secret]/route.ts` | تحديث حالة شحنة Bosta |

**متغيرات:** `WOOCOMMERCE_WEBHOOK_SECRET`, `BOSTA_WEBHOOK_SECRET`

---

### 6.23 SEO و PWA

| الملف | الوظيفة |
|-------|---------|
| `src/app/layout.tsx` | metadata عام، خط Almarai، RTL |
| `src/app/sitemap.ts` | خريطة الموقع |
| `src/app/robots.ts` | robots.txt |
| `public/manifest.webmanifest` | PWA manifest |
| `src/components/pwa-install-prompt.tsx` | مطالبة تثبيت التطبيق |

**كيف تعدّل:** عنوان ووصف الموقع في `layout.tsx` → `metadata`.

---

## 7. فهرس التعديل السريع

| ماذا تريد تغييره | الملف / المكان |
|------------------|----------------|
| عنوان ووصف الموقع (SEO) | `src/app/layout.tsx` |
| ألوان العلامة التجارية | `/admin/theme` أو `theme-settings.ts` → `brand` |
| شعار الموقع | `/admin/theme` → `brand.logoUrl` |
| بانرات الهيرو | `/admin/banners` أو `hero-slide-utils.ts` |
| ترتيب أقسام الرئيسية | `/admin/banners` → `homeSectionsOrder` |
| كاروسيل التصنيفات (عدد/سرعة) | `/admin/banners` → `sections.categories` |
| نص البانر العلوي المتحرك | `/admin/header` → `topBanner` |
| قائمة التنقل | `/admin/navigation` + `src/lib/menu.ts` |
| هيدر (بحث، سلة، CTA) | `/admin/header` + `src/components/header.tsx` |
| فوتر | `/admin/footer` + `src/components/footer.tsx` |
| زر واتساب العائم | `/admin/social-media` → `floatingActions` |
| موضع الأزرار العائمة | `src/lib/widget-placement.ts` |
| شكل الأزرار العائمة | `src/lib/widget-button-style.ts` |
| روابط فيسبوك/إنستغرام/تيك توك | `/admin/social-media` |
| بطاقة المنتج (حدود، كود) | `/admin/theme` → `productCard` |
| جلب المنتجات من WooCommerce | `src/lib/woocommerce.ts` |
| تحديث منتج في WooCommerce | `src/lib/woocommerce-update.ts` |
| دخول عميل / JWT | `src/lib/customer-account.ts` |
| OTP واتساب (عميل Next.js) | `src/lib/whatsapp-otp.ts` |
| OTP واتساب (ووردبريس) | `wordpress-plugin/sokany-whatsapp-otp/sokany-whatsapp-otp.php` |
| واجهة دخول / OTP | `src/components/account-auth-form.tsx` |
| صفحة عنوان الدخول | `src/app/account/login/page.tsx` |
| تغيير كلمة مرور | `src/components/account-change-password-form.tsx` |
| مقارنة منتجات | `src/lib/compare-utils.ts` |
| wishlist | `src/lib/product-lists.ts` |
| طلبات أدمن | `src/lib/orders.ts` |
| شحن Bosta | `src/lib/shipping/bosta-client.ts` |
| توزيع / سائقين | `src/lib/dispatch/` |
| حماية admin/driver | `middleware.ts` |
| دخول أدمن | `src/lib/auth.ts` + env `ADMIN_EMAIL/PASSWORD` |
| إشعار واتساب للأدمن عند طلب | `src/lib/whatsapp.ts` |
| بيانات تجريبية عند غياب API | `src/lib/demo-data.ts` |
| حماية middleware | `middleware.ts` |

---

## 8. متغيرات البيئة

| المتغير | الوظيفة | الملفات | كيف تعدّله |
|---------|---------|---------|------------|
| `WOOCOMMERCE_STORE_URL` | عنوان ووردبريس | `woocommerce.ts:6`, `customer-account.ts:9`, `orders.ts:6`, `menu.ts:6`, `whatsapp-otp.ts:5`, `woocommerce-update.ts:3` | `.env.local` أو Vercel → Environment Variables |
| `WOOCOMMERCE_CONSUMER_KEY` | مفتاح REST API | نفس الملفات أعلاه | WooCommerce → Settings → Advanced → REST API |
| `WOOCOMMERCE_CONSUMER_SECRET` | سر REST API | نفس الملفات | نفس المصدر |
| `WOOCOMMERCE_WEBHOOK_SECRET` | تحقق ويب هوك الطلبات | `webhooks/woocommerce/order-created/route.ts:10` | عيّنه في WooCommerce webhook + Vercel |
| `NEXTAUTH_SECRET` | توقيع JWT وجلسات | `auth.ts:13`, `middleware.ts:5`, `customer-account.ts:12` | سر عشوائي 32+ حرف؛ نفس القيمة محلياً وفي Vercel |
| `NEXTAUTH_URL` | URL التطبيق | `bosta-client.ts:118` | `http://localhost:3000` محلياً؛ `https://sokany-storefront.vercel.app` إنتاج |
| `ADMIN_EMAIL` | بريد دخول الأدمن | `auth.ts:6`, `theme-settings/route.ts:9` | `.env.local` / Vercel |
| `ADMIN_PASSWORD` | كلمة مرور الأدمن | `auth.ts:7` | `.env.local` / Vercel — **غيّرها في الإنتاج** |
| `DATABASE_URL` | اتصال MySQL | `prisma/schema.prisma:7`, `db.ts:10`, `prepare-db.mjs:7` | PlanetScale / Railway / MySQL hosting |
| `BOSTA_API_KEY` | مفتاح Bosta | `bosta-client.ts:7`, `bootstrap.ts:169` | لوحة Bosta |
| `BOSTA_BASE_URL` | عنوان API Bosta | `bosta-client.ts:10` | افتراضي: `https://app.bosta.co` |
| `BOSTA_WEBHOOK_SECRET` | تحقق ويب هوك Bosta | `bosta-client.ts:114` | عيّنه في Bosta + Vercel |
| `WHATSAPP_ACCESS_TOKEN` | توكن Meta WhatsApp | `whatsapp.ts:10` | Meta Business Suite |
| `WHATSAPP_PHONE_NUMBER_ID` | معرّف رقم واتساب | `whatsapp.ts:11` | Meta Business |
| `WHATSAPP_ADMIN_RECIPIENT` | رقم مستلم إشعارات الطلبات | `whatsapp.ts:12` | افتراضي: `201000260262` |
| `WHATSAPP_ORDER_TEMPLATE_NAME` | اسم قالب واتساب | `whatsapp.ts:13` | Meta Business templates |
| `GOOGLE_MAPS_API_KEY` | تحسين مسار السائق | `route-optimizer.ts:5` | Google Cloud Console |
| `FAWRY_MERCHANT_CODE` | دفع Fawry | غير مستخدم بعد | placeholder في README |
| `FAWRY_SECURITY_KEY` | دفع Fawry | غير مستخدم بعد | placeholder |
| `NODE_ENV` | بيئة التشغيل | `customer-account.ts:209` | يُضبط تلقائياً |

**تحذير:** لا ترفع `.env` أو `.env.local` إلى GitHub أبداً.

---

## 9. إعدادات المظهر من الداشبورد

إعدادات المظهر تُحفظ كـ JSON في جدول MySQL `ThemeSettings` (مفتاح `id='site'`).  
النوع الكامل: `ThemeSettings` في `src/lib/theme-settings.ts`.

| إعداد | صفحة الأدمن | مفتاح JSON | ملف العرض |
|-------|-------------|------------|-----------|
| شعار وألوان وخط | `/admin/theme` | `brand` | `layout.tsx` (CSS variables) |
| بانر علوي متحرك | `/admin/header` | `topBanner` | `top-banner-marquee.tsx` |
| هيدر (CTA، سلة) | `/admin/header` | `header` | `header.tsx` |
| هيرو + slides | `/admin/banners` | `hero` | `hero-section.tsx`, `hero-carousel.tsx` |
| مجموعات رئيسية | `/admin/banners` | `sections.mainGroups` | `main-groups-section.tsx` |
| كاروسيل تصنيفات | `/admin/banners` | `sections.categories` | `category-scroller.tsx` |
| بانر مخصص | `/admin/banners` | `sections.customBanner` | `page.tsx` |
| ترتيب أقسام الرئيسية | `/admin/banners` | `homeSectionsOrder` | `page.tsx` |
| فوتر | `/admin/footer` | `footer` | `footer.tsx` |
| سوشيال ميديا | `/admin/social-media` | `socialMedia` | `social-media-sidebar.tsx` |
| واتساب + زر صعود | `/admin/social-media` | `floatingActions` | `floating-action-buttons.tsx` |
| بطاقة منتج | `/admin/theme` | `productCard` | `product-card.tsx` |
| قائمة تصنيفات الهيدر | `/admin/navigation` | جدول `CategoryMenuSelection` | `menu.ts` |

**API الحفظ:** `POST /api/admin/theme-settings` → `updateThemeSettings()` في `theme-settings.ts`.

**إذا لم يعمل الحفظ:** تأكد من `DATABASE_URL` في Vercel.

---

## 10. قاعدة البيانات Prisma

**المزود:** MySQL  
**المخطط:** `prisma/schema.prisma`  
**البذر:** `prisma/seed.ts`  
**توثيق الشحن:** `prisma/migrations/README-shipping-dispatch.md`

### الجداول

| الجدول / الكيان | الوظيفة | متى تحتاجه |
|-----------------|---------|------------|
| `ThemeSettings` (SQL خام) | إعدادات مظهر JSON | أي تخصيص من `/admin` |
| `CategoryMenuSelection` | إظهار تصنيف في قائمة الهيدر | `/admin/navigation` |
| `CustomerWishlist` | مفضلة العملاء | wishlist |
| `Shipment` | شحنات مرتبطة بطلبات WooCommerce | Bosta + توزيع |
| `Driver` | بيانات السائقين | `/admin/dispatch/drivers` |
| `DeliveryZone` | مناطق التوصيل | `/admin/dispatch/zones` |
| `DriverZone` | ربط سائق بمنطقة | توزيع |
| `DeliveryRun` | جولة يومية لسائق | `/admin/dispatch/board` |
| `DeliveryAssignment` | ربط شحنة بجولة + OTP تسليم | تطبيق السائق |

### أوامر مفيدة

```bash
npm run db:push    # مزامنة المخطط
npm run db:seed    # بذر المناطق
npx prisma studio  # واجهة بصرية للبيانات
```

---

## 11. بلجنات ووردبريس

### 11.1 SOKANY WhatsApp OTP

| البند | التفاصيل |
|-------|----------|
| **مجلد المشروع** | `wordpress-plugin/sokany-whatsapp-otp/` |
| **الملف الرئيسي** | `sokany-whatsapp-otp.php` |
| **ZIP للرفع** | `dist/sokany-whatsapp-otp.zip` |
| **REST Base** | `https://sokany-eg.com/wp-json/sokany-otp/v1` |
| **Endpoints** | `/request`, `/verify`, `/login`, `/reset-password`, `/register`, `/change-password` |
| **إعدادات** | Settings → SOKANY WhatsApp OTP |
| **Test Mode** | يعرض آخر OTP في صفحة الإعدادات |
| **توثيق** | `wordpress-plugin/sokany-whatsapp-otp/README.md` |

**أخطاء شائعة:**
- «Plugin file does not exist» → بنية مجلد خاطئة في ZIP؛ ارفع يدوياً.
- OTP لا يصل من المتجر لكن Postman يعمل → تحقق من `whatsapp-otp.ts` → `getOtpEndpoint()`.
- «لم يُعثر على مستخدم» → أضف رقم الموبايل في user meta بالووردبريس.

### 11.2 SOKANY Headless Settings

| البند | التفاصيل |
|-------|----------|
| **مجلد** | `wordpress-plugin/sokany-headless-settings/` |
| **ZIP** | `wordpress-plugin/sokany-headless-settings.zip` |
| **REST** | `/wp-json/sokany/v1/theme-settings`, `/wp-json/sokany/v1/menu` |

> حالياً إعدادات المظهر الرئيسية تُدار من Prisma عبر Next.js وليس من هذا البلجن.

---

## 12. سجل التعديلات

| الموضوع | ماذا فُعل | Commit / ملفات |
|---------|-----------|----------------|
| كاروسيل تصنيفات مستمر | أُضيف ثم أُلغي | `b6f361d` → `045b2a4` |
| تحكم كاروسيل التصنيفات | عدد (ديسكتوب/تابلت/موبايل) + سرعة | `/admin/banners` — `045b2a4` |
| موضع الأزرار العائمة | واتساب / صعود / سوشيال | `/admin/social-media` — `045b2a4` |
| إصلاح دخول JWT | بحث بريد + user_id من JWT | `76e5219`, `8f6531a` |
| OTP دخول + تغيير كلمة مرور | بلجن WP + API + UI | `46cb115` |
| إصلاح OTP من المتجر | URL صحيح `/wp-json/sokany-otp/v1/...` | `9b7c892` — `whatsapp-otp.ts` |
| واجهة OTP | 11 رقم موبايل + شاشة كود منفصلة | `0f8f082` |
| تبسيط صفحة الدخول | «تسجيل الدخول» + حذف نص JWT | `0f8f082` |

**ميزات سابقة:** wishlist + compare (`86726c4`), مواصفات مقارنة (`b090249`), منتجات ذات صلة (`790d655`), تنقل سفلي (`7746434`), أزرار عائمة (`439c88f`), هيرو split (`68e32a0`), main groups (`87d0aa9`).

للتاريخ الكامل: `git log --oneline`

---

## 13. حالة الميزات

| الميزة | الحالة |
|--------|--------|
| كتالوج منتجات وتصنيفات | جاهز |
| صفحة منتج + SEO + JSON-LD | جاهز |
| بحث / compare / wishlist | جاهز |
| حساب عميل + OTP + كلمة مرور | جاهز |
| داشبورد مظهر وبانرات | جاهز (يتطلب DATABASE_URL) |
| طلبات أدمن + Bosta + توزيع | جاهز (يتطلب DATABASE_URL + BOSTA) |
| تطبيق سائق PWA | جاهز |
| سلة + checkout + Fawry | واجهة / placeholder فقط |
| إشعارات واتساب طلبات للأدمن | يتطلب WHATSAPP_* env |

---

## 14. دليل للمساعدين

### 14.1 البدء السريع

1. استنسخ المشروع وثبّت الحزم (`npm install`).
2. أنشئ `.env.local` من القالب في [القسم 4.3](#43-إعداد-متغيرات-البيئة).
3. شغّل `npm run dev`.
4. اقرأ هذا الدليل — استخدم **فهرس المسارات** (قسم 5) و**فهرس التعديل** (قسم 7).

### 14.2 كيف تبحث في الدليل

- **تريد معرفة URL صفحة؟** → قسم 5.
- **تريد معرفة أي ملف تعدّل؟** → قسم 7.
- **تريد فهم ميزة بالتفصيل؟** → قسم 6.
- **مشكلة في OTP؟** → أقسام 6.9 و 4.9 و 11.1.
- **مشكلة في النشر؟** → قسم 4.6 و 4.7.

### 14.3 قواعد الأمان

- لا ترفع `.env` أو مفاتيح API إلى GitHub.
- لا `git push --force` على فرع `master`.
- غيّر `ADMIN_PASSWORD` و `NEXTAUTH_SECRET` في الإنتاج.
- اختبر OTP في Test Mode قبل Live Mode.

### 14.4 اختبار OTP (خطوة بخطوة)

1. ووردبريس: فعّل بلجن OTP + Test Mode.
2. تأكد أن رقم الموبايل موجود في Users → user meta.
3. المتجر: `/account/login` → نسيت كلمة المرور → 11 رقم → 6 أرقام OTP.
4. اقرأ الكود من Settings → SOKANY WhatsApp OTP.
5. إذا فشل: افحص Network tab → `/api/account/otp/request` → رسالة الخطأ.

### 14.5 الملفات المرجعية داخل المشروع

| الملف | الغرض |
|-------|-------|
| `docs/SOKANY_HANDBOOK_AR.md` | هذا الدليل (نسخة المشروع) |
| `.cursor/PROJECT_GUIDE.md` | ملخص سريع لـ Cursor |
| `README.md` | README إنجليزي (قديم جزئياً) |
| `.cursor/rules/auto-deploy-after-changes.mdc` | قواعد النشر التلقائي |

---

## ملحق: قائمة APIs كاملة

### APIs العميل

| Method | المسار | الملف |
|--------|--------|-------|
| POST | `/api/account/login` | `api/account/login/route.ts` |
| POST | `/api/account/logout` | `api/account/logout/route.ts` |
| POST | `/api/account/register` | `api/account/register/route.ts` |
| GET | `/api/account/me` | `api/account/me/route.ts` |
| POST | `/api/account/change-password` | `api/account/change-password/route.ts` |
| POST | `/api/account/otp/request` | `api/account/otp/request/route.ts` |
| POST | `/api/account/otp/login` | `api/account/otp/login/route.ts` |
| POST | `/api/account/otp/reset-password` | `api/account/otp/reset-password/route.ts` |
| GET/PUT | `/api/account/wishlist` | `api/account/wishlist/route.ts` |
| GET | `/api/products/search` | `api/products/search/route.ts` |
| GET | `/api/products/compare` | `api/products/compare/route.ts` |
| POST | `/api/checkout` | `api/checkout/route.ts` (placeholder) |
| POST | `/api/fawry/callback` | `api/fawry/callback/route.ts` (placeholder) |

### APIs الأدمن

| Method | المسار | الملف |
|--------|--------|-------|
| GET/POST | `/api/admin/theme-settings` | `api/admin/theme-settings/route.ts` |
| POST | `/api/admin/upload` | `api/admin/upload/route.ts` |
| GET | `/api/admin/orders` | `api/admin/orders/route.ts` |
| GET | `/api/admin/orders/[id]` | `api/admin/orders/[id]/route.ts` |
| POST | `/api/admin/import/products` | `api/admin/import/products/route.ts` |
| POST | `/api/admin/import/categories` | `api/admin/import/categories/route.ts` |
| PATCH | `/api/admin/category-menu-selection/[categoryId]` | `api/admin/category-menu-selection/[categoryId]/route.ts` |
| GET/POST | `/api/admin/dispatch` | `api/admin/dispatch/route.ts` |
| GET/POST/PATCH/DELETE | `/api/admin/dispatch/zones` | `api/admin/dispatch/zones/route.ts` |
| GET/POST/PATCH | `/api/admin/dispatch/drivers` | `api/admin/dispatch/drivers/route.ts` |
| GET | `/api/admin/dispatch/reports` | `api/admin/dispatch/reports/route.ts` |
| GET/POST | `/api/admin/setup/shipping` | `api/admin/setup/shipping/route.ts` |
| POST | `/api/admin/shipping/bosta/create` | `api/admin/shipping/bosta/create/route.ts` |
| GET | `/api/admin/shipping/bosta/track/[trackingNumber]` | `api/admin/shipping/bosta/track/[trackingNumber]/route.ts` |

### APIs السائق

| Method | المسار | الملف |
|--------|--------|-------|
| GET | `/api/driver/today` | `api/driver/today/route.ts` |
| GET/POST | `/api/driver/assignments/[id]` | `api/driver/assignments/[id]/route.ts` |

### Webhooks

| Method | المسار | الملف |
|--------|--------|-------|
| POST | `/api/webhooks/woocommerce/order-created` | `api/webhooks/woocommerce/order-created/route.ts` |
| POST | `/api/webhooks/bosta/[secret]` | `api/webhooks/bosta/[secret]/route.ts` |

### Auth

| Method | المسار | الملف |
|--------|--------|-------|
| * | `/api/auth/[...nextauth]` | `api/auth/[...nextauth]/route.ts` |

---

## ملحق: قائمة مكوّنات UI

| المكوّن | الوظيفة |
|---------|---------|
| `site-chrome.tsx` | غلاف الموقع (هيدر + فوتر + أزرار) |
| `header.tsx` | الهيدر الرئيسي |
| `footer.tsx` | الفوتر |
| `hero-section.tsx` | قسم الهيرو |
| `hero-carousel.tsx` | كاروسيل الهيرو |
| `category-scroller.tsx` | كاروسيل التصنيفات |
| `product-card.tsx` | بطاقة منتج |
| `account-auth-form.tsx` | دخول / تسجيل / OTP |
| `account-change-password-form.tsx` | تغيير كلمة المرور |
| `floating-action-buttons.tsx` | واتساب + صعود للأعلى |
| `mobile-bottom-nav.tsx` | تنقل سفلي |
| `compare-floating-bar.tsx` | شريط المقارنة |
| `pwa-install-prompt.tsx` | تثبيت PWA |

---

*نهاية الدليل — SOKANY Storefront Handbook*

</div>
