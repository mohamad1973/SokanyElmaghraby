# دليل شامل — SOKANY Storefront

مرجع محلي لاستخدام Cursor. يوثّق ميزات المتجر والداشبورد، مسارات الوصول، الملفات الأساسية، وسجل التعديلات.

**الدليل التفصيلي الكامل (للديسكتوب والمساعدين):**
- **HTML (موصى به):** [`docs/SOKANY_HANDBOOK_AR.html`](../docs/SOKANY_HANDBOOK_AR.html) — الديسكتوب: `C:\Users\mm\Desktop\SOKANY_STOREFRONT_دليل.html`
- **Markdown:** [`docs/SOKANY_HANDBOOK_AR.md`](../docs/SOKANY_HANDBOOK_AR.md)

**آخر تحديث:** يوليو 2026

---

## روابط الإنتاج

| الخدمة | الرابط |
|--------|--------|
| المتجر (Vercel) | https://sokany-storefront.vercel.app |
| ووردبريس / WooCommerce | https://sokany-eg.com |
| GitHub | `mohamad1973/SokanyElmaghraby` — فرع `master` |
| Vercel project | `tooliano-store/sokany-storefront` |

---

## البنية العامة

```
المتصفح
  → Next.js (src/app/) صفحات + API Routes (src/app/api/)
  → src/lib/ منطق الأعمال
       → WooCommerce REST (ووردبريس)
       → بلجن SOKANY WhatsApp OTP (ووردبريس)
       → Prisma / MySQL (شحن، توصيل، إعدادات، wishlist)
```

| الطبقة | المجلد |
|--------|--------|
| صفحات المتجر | `src/app/` |
| مكوّنات UI | `src/components/` |
| API | `src/app/api/` |
| منطق الأعمال | `src/lib/` |
| بلجنات ووردبريس | `wordpress-plugin/` |
| قاعدة البيانات | `prisma/` |
| قواعد Cursor | `.cursor/rules/` |
| خطط سابقة | `.cursor/plans/` |

---

## كيف أوصل للميزة من المتصفح؟

### المتجر (عميل)

| ماذا تريد | افتح |
|-----------|------|
| الصفحة الرئيسية | `/` |
| المتجر / تصنيف | `/shop` أو `/shop?category=slug` |
| منتج | `/product/[slug]` |
| مقارنة | `/compare` |
| تسجيل الدخول | `/account/login` |
| نسيت كلمة المرور (OTP) | `/account/login` → «نسيت كلمة المرور؟» |
| إنشاء حساب | `/account/register` |
| حسابي | `/account` (بعد الدخول) |
| تغيير كلمة المرور | `/account` → قسم «تغيير كلمة المرور» |
| السلة | `/cart` |
| الدفع | `/checkout` (يتطلب تسجيل دخول) |
| شكر بعد الطلب | `/checkout/thank-you?order=...` |

### الداشبورد (أدمن)

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
| التقارير (حد الطلب) | `/admin/reports` / `/admin/reports/reorder` |
| إعداد الشحن | `/admin/dispatch/setup` |
| لوحة التوزيع | `/admin/dispatch/board` |
| السائقين | `/admin/dispatch/drivers` |
| المناطق | `/admin/dispatch/zones` |
| تقارير | `/admin/dispatch/reports` |

### السائق

| ماذا تريد | افتح |
|-----------|------|
| دخول السائق | `/driver/login` |
| مسار اليوم | `/driver/today` |
| ترتيب المحطات | `/driver/route` |
| تأكيد تسليم + OTP | `/driver/order/[id]` |

### ووردبريس (خارج Next.js)

| ماذا تريد | أين |
|-----------|-----|
| إعدادات OTP (Test Mode + آخر كود) | ووردبريس → **Settings → SOKANY WhatsApp OTP** |
| تثبيت نظيف OTP + lost-password | انظر قسم «تثبيت نظيف من هوستنجر» تحت بلجنات ووردبريس |
| تنسيق Cart/Checkout في Woo فقط | Code Snippets ← `wordpress-plugin/snippets/sokany-cart-checkout-style-v1.3.php` |
| مقارنة منتجات Woo فقط | Code Snippets ← `wordpress-plugin/snippets/sokany-product-compare-v1.1.3.php` |
| عملاء / أرقام موبايل | **Users** → حقول `billing_phone`, `phone`, `mobile` |
| JWT Authentication | بلجن JWT في ووردبريس |

---

## المتجر — صفحات العميل (فرونت)

| المسار | الوظيفة | الملف | الحالة |
|--------|---------|-------|--------|
| `/` | رئيسية: هيرو، تصنيفات، أفضل المبيعات | `src/app/page.tsx` | جاهز |
| `/shop` | منتجات + فلتر تصنيف | `src/app/shop/page.tsx` | جاهز |
| `/product/[slug]` | منتج + SEO + مواصفات | `src/app/product/[slug]/page.tsx` | جاهز |
| `/offers` | عروض | `src/app/offers/page.tsx` | جاهز |
| `/compare` | مقارنة (حتى 4 منتجات) | `src/app/compare/page.tsx` | جاهز |
| `/cart` | سلة | `src/app/cart/page.tsx` | جاهز |
| `/checkout` | دفع COD / فوري + Bosta | `src/app/checkout/page.tsx` + `checkout-form.tsx` | جاهز |
| `/checkout/thank-you` | شكر بعد الطلب | `src/app/checkout/thank-you/page.tsx` | جاهز |
| `/account/login` | دخول + OTP واتساب | `src/app/account/login/page.tsx` | جاهز |
| `/account/register` | تسجيل | `src/app/account/register/page.tsx` | جاهز |
| `/account` | طلبات، ولاء، كلمة مرور | `src/app/account/page.tsx` | جاهز |
| `/account/orders/[id]` | تفاصيل طلب | `src/app/account/orders/[id]/page.tsx` | جاهز |
| `/about`, `/contact`, `/warranty`, `/return-policy` | محتوى | `src/app/*/page.tsx` | جاهز |

**مكوّنات مشتركة:** `src/components/site-chrome.tsx` — هيدر، فوتر، واتساب، سوشيال، بحث، تنقل سفلي.

**مكوّنات الحساب:**
- `src/components/account-auth-form.tsx` — دخول / تسجيل / OTP
- `src/components/account-change-password-form.tsx` — تغيير كلمة المرور (حالية أو OTP)
- `src/components/account-logout-button.tsx`

---

## المتجر — API العميل (باك)

| المسار | الوظيفة | الملف |
|--------|---------|-------|
| `POST /api/account/login` | دخول بكلمة مرور | `src/app/api/account/login/route.ts` |
| `POST /api/account/logout` | خروج | `src/app/api/account/logout/route.ts` |
| `POST /api/account/register` | تسجيل | `src/app/api/account/register/route.ts` |
| `GET /api/account/me` | بيانات الجلسة | `src/app/api/account/me/route.ts` |
| `POST /api/account/change-password` | تغيير كلمة المرور | `src/app/api/account/change-password/route.ts` |
| `POST /api/account/otp/request` | طلب OTP | `src/app/api/account/otp/request/route.ts` |
| `POST /api/account/otp/login` | دخول بـ OTP | `src/app/api/account/otp/login/route.ts` |
| `POST /api/account/otp/reset-password` | إعادة تعيين كلمة مرور بـ OTP | `src/app/api/account/otp/reset-password/route.ts` |
| `GET/PUT /api/account/wishlist` | المفضلة | `src/app/api/account/wishlist/route.ts` |
| `GET /api/products/search` | بحث | `src/app/api/products/search/route.ts` |
| `GET /api/products/compare` | مقارنة | `src/app/api/products/compare/route.ts` |
| `POST /api/checkout` | إنشاء طلب Woo + redirect COD/فوري | `src/app/api/checkout/route.ts` |
| `POST /api/contact` | فورم تواصل معنا → إيميل SMTP | `src/app/api/contact/route.ts` |
| `GET /api/shipping/bosta/cities` | محافظات Bosta | `src/app/api/shipping/bosta/cities/route.ts` |
| `GET /api/shipping/bosta/districts?cityId=` | مناطق Bosta | `src/app/api/shipping/bosta/districts/route.ts` |
| `GET/POST /api/fawry/callback` | تحديث طلب بعد دفع فوري | `src/app/api/fawry/callback/route.ts` |
| `POST /api/webhooks/woocommerce/order-created` | ويب هوك طلب | `src/app/api/webhooks/woocommerce/order-created/route.ts` |
| `POST /api/webhooks/bosta/[secret]` | ويب هوك Bosta | `src/app/api/webhooks/bosta/[secret]/route.ts` |

**مكتبات مرتبطة:**
- `src/lib/customer-account.ts` — جلسة العميل، دخول JWT، طلبات، ولاء
- `src/lib/whatsapp-otp.ts` — عميل OTP (يتصل بووردبريس)
- `src/lib/woocommerce.ts` — منتجات وتصنيفات
- `src/lib/product-lists.ts` — wishlist / compare
- `src/lib/compare-utils.ts` — جدول المقارنة

---

## ووردبريس — بلجنات

### SOKANY WhatsApp OTP

- **المسار في المشروع:** `wordpress-plugin/sokany-whatsapp-otp/`
- **كود الريبو (أحدث):** `1.3.3` — يشمل واجهة lost-password داخل البلجن
- **التثبيت الموصى به حالياً على السيرفر (مستقر):** `1.2.4` + بلجن صغير منفصل لـ lost-password
- **ZIP إنتاج مستقر:** `dist/sokany-whatsapp-otp-1.2.4.zip` (نفس 1.2.3 + مطابقة موبايل أقوى فقط)
- **ZIP سابق:** `dist/sokany-whatsapp-otp-1.2.3.zip`
- **ZIP تجريبي أحدث:** `dist/sokany-whatsapp-otp.zip` (1.3.3 — ارفعه فقط بعد حذف المجلد القديم بالكامل)
- **توثيق API:** `wordpress-plugin/sokany-whatsapp-otp/README.md`
- **REST Base:** `https://sokany-eg.com/wp-json/sokany-otp/v1` — **لازم يظهر في** `https://sokany-eg.com/wp-json/` كمفتاح `sokany-otp` وإلا OTP/واتساب الأوردر عاطلان
- **Endpoints (1.2.x):** `/request`, `/verify`, `/login`, `/reset-password`, `/register`, `/change-password`
- **Endpoints إضافية (1.3.x):** `/account-session`, `/lost-password-session`
- **Test Mode (بلجن):** الكود يظهر في Settings → SOKANY WhatsApp OTP
- **v1.3.3:** واجهة lost-password بموبايل/OTP داخل البلجن + `/lost-password-session` — رفع ZIP من لوحة Plugins
- **v1.3.2:** تحسين `find_user_by_phone` (صيغ مصر + أرقام بفواصل)
- **v1.3.1:** endpoint `/lost-password-session`
- **v1.3.0:** هوك Checkout Blocks + طابور Action Scheduler + OTP في My Account + إعادة إرسال من الأدمن
- **v1.2.4:** نفس 1.2.3 + `find_user_by_phone` الأقوى فقط (إصلاح user_not_found على Woo lost-password بدون لمس هوكات الأوردر)
- **v1.2.3:** ملخص أوردر واتساب بعد اكتمال البنود — بدون إرسال مبكر بـ `woocommerce_new_order`
- **v1.2.2:** إصلاح تسجيل المتجر عبر Woo REST — تمرير `billing.phone` من JSON إلى `$_POST` وإزالة `phone_error` الكاذب

#### تثبيت نظيف من هوستنجر (إصلاح rest_no_route / مطابقة الموبايل)

1. File Manager → احذف بالكامل إن وُجد: `public_html/wp-content/plugins/sokany-whatsapp-otp` (مهم إذا ظهر مجلد متداخل بعد رفع Replace فاشل)
2. ووردبريس → إضافات → ارفع `dist/sokany-whatsapp-otp-1.2.4.zip` → فعّل
3. تحقق: افتح `https://sokany-eg.com/wp-json/sokany-otp/v1` (لازم بدون 404 namespace)
4. Settings → SOKANY WhatsApp OTP: Live + MazBot + Template OTP + Template الأوردر + تفعيل إشعار الأوردر
5. ارفع وفعّل `dist/sokany-lost-password-otp.zip` إن لم يكن مفعّلاً (واجهة نسيت كلمة المرور على Woo)
6. عطّل أي Code Snippet قديم لـ lost-password OTP
7. JWT: تأكد أن **JWT Authentication for WP REST API** Active؛ إن فشل دخول الإيميل راجع `JWT_AUTH_SECRET_KEY` أو كلمة مرور الحساب + Permalinks → Save

هذا يصلح: OTP في Next.js، تأكيد أوردر واتساب، وواجهة `/my-account/lost-password/` بموبايل (بما فيها أرقام محفوظة بمسافات/صيغ مختلفة).

### SOKANY Lost Password OTP (بلجن صغير)

- **المسار:** `wordpress-plugin/sokany-lost-password-otp/`
- **ZIP:** `dist/sokany-lost-password-otp.zip`
- **يعتمد على:** بلجن OTP 1.2.4+ مفضّل (`/request` + `/verify` + `/login`)
- **الوظيفة:** يستبدل فورم الإيميل في نسيت كلمة المرور على ووكومرس بحقل موبايل + OTP ثم جلسة عبر `admin-ajax`

### تنسيق Cart / Checkout في ووردبريس (Code Snippets فقط)

- **الملف الحالي:** `wordpress-plugin/snippets/sokany-cart-checkout-style-v1.3.php`
- **الملفات القديمة:** `...-v1.2.php` و `...-v1.1.php` و `sokany-cart-checkout-style.php` (عطّلها)
- **الوظيفة:** 80vw + عمودين + ملء جدول أوردرك + ترجمة COD/الشروط + إخفاء دعوة المراجعة + إخفاء البلد + Select2 أسود + localStorage
- **مهم:** يعمل على `sokany-eg.com` فقط — لا يلمس Next.js
- **التثبيت:** عطّل الإصدارات الأقدم → أضف v1.3 بدون `<?php` → Run: Only run on site front-end → Activate

### مقارنة المنتجات في ووردبريس (Code Snippets فقط)

- **الملف الحالي:** `wordpress-plugin/snippets/sokany-product-compare-v1.1.3.php`
- **الإصدار السابق:** عطّل أي أقدم من v1.1.3
- **الوظيفة:** أيقونة ظاهرة دائمًا فوق السوشيال (ديسكتوب) + بجوار سوشيال الفوتر (موبايل) + صفحة مقارنة + مزامنة زر الثيم
- **مهم:** ووردبريس فقط — لا يلمس Next.js ولا يحتاج Vercel
- **التثبيت:** عطّل الأقدم → الصق v1.1.3 بدون `<?php` → Activate → Permalinks Save → امسح الكاش

### SOKANY Headless Settings

- **المسار:** `wordpress-plugin/sokany-headless-settings/`
- **REST:** `/wp-json/sokany/v1/theme-settings`, `/wp-json/sokany/v1/menu`

### Meta for WooCommerce (كتالوج + Pixel)

- **الموقع المصدر:** `https://sokany-eg.com` (ووردبريس) — روابط الإعلان حالياً لصفحات Woo وليس Vercel.
- **الحالة:** البلجن Connected/Active تحت Marketing → Facebook.
- **Pixel ID على الموقع:** `1249252143469785` (موجود في HTML مع `fbq` + تلميحات `facebook-for-woocommerce`).
- **أحداث ظاهرة في صفحات المنتج:** `PageView`, `ViewContent`, `AddToCart` (اختبار `Purchase` يتم من طلب حقيقي/تجريبي في Events Manager).
- **سكربتات التدقيق في الريبو:**
  - `node scripts/audit-meta-catalog.mjs` — جودة الكتالوج (صور/أسعار/تصنيفات)
  - `node scripts/audit-air-fryer-set.mjs` — مجموعة «قلايه هوائيه»
  - `node scripts/check-meta-pixel.mjs` — التحقق من Pixel في HTML
  - `node scripts/enable-air-fryer-meta-sync.mjs` — فرض Sync على القلايات الجاهزة
- **نتائج تدقيق 2026-07-24:** ~1392 منتج منشور؛ ~123 بدون صورة؛ ~136 بدون سعر؛ تصنيف «قلايه هوائيه» فيه 5 قلايات in-stock جاهزة للإعلان بعد إزالة منتج خاطئ (حلة بخار SK-07018).
- **إنشاء إعلان الفئة (يدوي في Ads Manager):**
  1. Commerce Manager → Catalog → Products / Product sets → تأكد من set «قلايه هوائيه» (أو أنشئ فلتر category).
  2. Marketing → Facebook في WP → View all synced products + مزامنة يدوية إن لزم.
  3. Ads Manager → حملة **Sales** → Catalog → Product set = قلايات → قالب Carousel/Collection/Advantage+.
  4. Business Settings → Domains → وثّق `sokany-eg.com`؛ فعّل Conversions API من إعدادات البلجن إن ظهر الخيار.

---

## الداشبورد — صفحات الأدمن (فرونت)

| المسار | الوظيفة | مجلد |
|--------|---------|------|
| `/admin` | لوحة رئيسية | `src/app/admin/page.tsx` |
| `/admin/theme` | ألوان، خط، شعار | `src/app/admin/theme/` |
| `/admin/header` | هيدر وبانر علوي | `src/app/admin/header/` |
| `/admin/footer` | فوتر | `src/app/admin/footer/` |
| `/admin/banners` | بانرات + عدد/سرعة كاروسيل التصنيفات | `src/app/admin/banners/` |
| `/admin/social-media` | سوشيال، واتساب، صعود، موضع الأزرار | `src/app/admin/social-media/` |
| `/admin/navigation` | ظهور التصنيفات في القائمة | `src/app/admin/navigation/` |
| `/admin/products` | منتجات + استيراد | `src/app/admin/products/` |
| `/admin/categories` | تصنيفات + استيراد | `src/app/admin/categories/` |
| `/admin/orders` | قائمة طلبات | `src/app/admin/orders/` |
| `/admin/orders/[id]` | تفاصيل + شحن | `src/app/admin/orders/[id]/` |
| `/admin/reports` | فهرس التقارير | `src/app/admin/reports/` |
| `/admin/reports/reorder` | تقرير حد الطلب + PDF | `src/app/admin/reports/reorder/` |
| `/admin/dispatch/setup` | إعداد DB + Bosta | `src/app/admin/dispatch/setup/` |
| `/admin/dispatch/board` | توزيع يومي | `src/app/admin/dispatch/board/` |
| `/admin/dispatch/drivers` | سائقين | `src/app/admin/dispatch/drivers/` |
| `/admin/dispatch/zones` | مناطق القاهرة/الجيزة | `src/app/admin/dispatch/zones/` |
| `/admin/dispatch/reports` | تقارير أداء | `src/app/admin/dispatch/reports/` |

**حفظ إعدادات المظهر:** `src/lib/theme-settings.ts` → Prisma جدول `ThemeSettings`

**قشرة الأدمن:** `src/app/admin/admin-shell.tsx`, `src/app/admin/layout.tsx`

---

## الداشبورد — API الأدمن (باك)

| المسار | الوظيفة |
|--------|---------|
| `GET/POST /api/admin/theme-settings` | إعدادات المظهر |
| `POST /api/admin/upload` | رفع وسائط |
| `GET /api/admin/orders` | طلبات |
| `GET /api/admin/orders/[id]` | طلب واحد |
| `GET/PATCH /api/admin/reports/reorder` | تقرير حد الطلب + حفظ الحد |
| `POST /api/admin/import/products` | استيراد منتجات |
| `POST /api/admin/import/categories` | استيراد تصنيفات |
| `PATCH /api/admin/category-menu-selection/[categoryId]` | إظهار/إخفاء/ترتيب/أب/أيقونة/اسم عرض لتصنيف في القائمة |
| `POST /api/admin/category-menu-selection/bulk` | إضافة عدة تصنيفات للقائمة دفعة واحدة |
| `PUT /api/admin/category-menu-selection/structure` | حفظ هيكل السحب (أب + ترتيب) دفعة واحدة |
| `GET/POST /api/admin/dispatch` | لوحة التوزيع |
| `GET/POST/PATCH/DELETE /api/admin/dispatch/zones` | مناطق |
| `GET/POST/PATCH /api/admin/dispatch/drivers` | سائقين |
| `GET /api/admin/dispatch/reports` | تقارير |
| `GET/POST /api/admin/setup/shipping` | bootstrap شحن |
| `POST /api/admin/shipping/bosta/create` | شحنة Bosta |
| `GET /api/admin/shipping/bosta/track/[trackingNumber]` | تتبع Bosta |

**الحماية:** `src/lib/auth.ts` (NextAuth) + `src/lib/session-guards.ts`

---

## تطبيق السائق

| المسار | الوظيفة |
|--------|---------|
| `/driver/login` | دخول |
| `/driver/today` | ملخص اليوم |
| `/driver/route` | محطات + خرائط |
| `/driver/order/[id]` | تفاصيل + OTP تسليم |

| API | الوظيفة |
|-----|---------|
| `GET /api/driver/today` | مسار اليوم |
| `GET/POST /api/driver/assignments/[id]` | تفاصيل / تحديث حالة |

**مكتبات:** `src/lib/dispatch/*`, `src/lib/security.ts` (OTP)

---

## أي ملف أعدّل لو أردت تغيير…؟

| التغيير | الملف الأساسي |
|---------|---------------|
| شكل الرئيسية (أقسام، هيرو) | `src/lib/theme-settings.ts` + `src/app/page.tsx` |
| هيدر / قائمة / بحث | `src/components/site-chrome.tsx`, `src/lib/menu.ts` |
| أزرار واتساب / سوشيال / صعود | `src/lib/widget-placement.ts`, `src/lib/widget-button-style.ts` |
| إعدادات من الداشبورد | `src/app/admin/*/settings-form.tsx` |
| منتجات من ووكومرس | `src/lib/woocommerce.ts` |
| دخول عميل / JWT | `src/lib/customer-account.ts` |
| OTP واتساب | `src/lib/whatsapp-otp.ts` + بلجن ووردبريس |
| واجهة دخول / OTP | `src/components/account-auth-form.tsx` |
| تغيير كلمة مرور حسابي | `src/components/account-change-password-form.tsx` |
| مقارنة منتجات | `src/lib/compare-utils.ts`, `src/app/compare/page.tsx` |
| wishlist | `src/lib/product-lists.ts` |
| طلبات أدمن | `src/lib/orders.ts` |
| توزيع / سائقين | `src/lib/dispatch/` |
| Bosta | `src/lib/shipping/bosta-client.ts` |
| إنشاء طلب من المتجر | `src/lib/woocommerce-orders.ts`, `src/app/api/checkout/route.ts` |
| فوري | `src/lib/fawry.ts`, `src/app/api/fawry/callback/route.ts` |
| middleware (حماية admin/driver) | `middleware.ts` |

---

## متغيرات البيئة المهمة

| المتغير | الاستخدام |
|---------|-----------|
| `WOOCOMMERCE_STORE_URL` | عنوان ووردبريس (افتراضي: sokany-eg.com) |
| `WOOCOMMERCE_CONSUMER_KEY` | مفتاح REST API |
| `WOOCOMMERCE_CONSUMER_SECRET` | سر REST API |
| `WOOCOMMERCE_WEBHOOK_SECRET` | ويب هوك الطلبات |
| `NEXTAUTH_SECRET` | جلسات أدمن/سائق + توقيع جلسة العميل |
| `NEXTAUTH_URL` | URL التطبيق (Vercel) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | دخول الأدمن |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | إرسال فورم تواصل معنا (مثلاً Hostinger) |
| `CONTACT_FROM_EMAIL` | عنوان المرسل في الفورم |
| `CONTACT_TO_EMAIL` | صندوق الاستقبال (افتراضي: `info@sokanyelmaghraby.com`) |
| `DATABASE_URL` | Prisma (شحن، توصيل، theme، wishlist) |
| `BOSTA_API_KEY`, `BOSTA_BASE_URL`, `BOSTA_WEBHOOK_SECRET` | شحن Bosta |
| `GOOGLE_MAPS_API_KEY` | تحسين مسار السائق |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | إشعارات واتساب (متجر) |
| `WHATSAPP_ADMIN_RECIPIENT`, `WHATSAPP_ORDER_TEMPLATE_NAME` | قوالب طلبات |
| `FAWRY_MERCHANT_CODE`, `FAWRY_SECURITY_KEY`, `FAWRY_BASE_URL` | فوري Express Checkout |
| `WOO_FAWRY_PAYMENT_METHOD` | slug طريقة دفع فوري في Woo (افتراضي: `fawry`) |

**ملاحظة:** لا ترفع `.env` إلى GitHub. إعدادات Vercel: Project → Settings → Environment Variables.

---

## سجل التعديلات (جلسات العمل معاً)

| الموضوع | ماذا فُعل | Commit / ملفات |
|---------|-----------|----------------|
| فورم تواصل Woo v1.1.2 | إرسال عبر Next `/api/contact` (SMTP على Vercel) بدون كلمة مرور في السنابت؛ احتياطي `SOKANY_SMTP_PASS` في wp-config؛ يصلح خطأ SMTP_PASS في v1.1 | `wordpress-plugin/snippets/sokany-contact-form-v1.1.2.php` |
| مقارنة منتجات Woo v1.1.3 | أيقونة مقارنة ظاهرة دائمًا (CSS/JS مباشر في head/footer) فوق السوشيال ديسكتوب + فوتر موبايل؛ بدون Vercel | `wordpress-plugin/snippets/sokany-product-compare-v1.1.3.php` |
| مقارنة منتجات Woo v1.1.2 | نقل أيقونة المقارنة: ديسكتوب فوق أيقونات السوشيال (RTL/LTR تلقائي) + موبايل بجوار سوشيال الفوتر؛ بدون الاعتماد على هيدر البحث | `wordpress-plugin/snippets/sokany-product-compare-v1.1.2.php`, `wordpress-plugin/snippets/README.md` |
| مقارنة منتجات Woo v1.1.1 | إصلاح ظهور أيقونة المقارنة داخل الهيدر قرب البحث عبر selectors أوسع للثيم (خصوصاً WoodMart) + fallback هيدر صارم بدون أيقونة عائمة | `wordpress-plugin/snippets/sokany-product-compare-v1.1.1.php`, `wordpress-plugin/snippets/README.md` |
| مقارنة منتجات Woo v1.1 | إلغاء زر المقارنة المكرر داخل الكارت؛ ربط زر/أيقونة الثيم الأصلية مع localStorage؛ نقل أيقونة المقارنة للهيدر قرب البحث + عداد + صفحة مقارنة موحدة | `wordpress-plugin/snippets/sokany-product-compare-v1.1.php`, `wordpress-plugin/snippets/README.md` |
| تنسيق Woo Cart/Checkout v1.3 | ملء جدول أوردرك + ترجمة الدفع عند الاستلام والشروط + إخفاء دعوة المراجعة؛ استبدل به v1.2 | `wordpress-plugin/snippets/sokany-cart-checkout-style-v1.3.php` |
| تنسيق Woo Cart/Checkout v1.2 | عرض 80vw + flex عمودين قسريين للسلة والتشيك أوت؛ استبدل به v1.1 | `wordpress-plugin/snippets/sokany-cart-checkout-style-v1.2.php` |
| تنسيق Woo Cart/Checkout v1.1 | عرض أوسع + إجمالي جنب المنتجات + تشيك أوت أعرض + إخفاء البلد + Select2 نص أسود؛ استبدل به v1.0 | `wordpress-plugin/snippets/sokany-cart-checkout-style-v1.1.php` |
| تنسيق Woo Cart/Checkout + حفظ بيانات | سنابت Code Snippets: CSS (رسالة خضراء بدل الحمراء + شكل أقرب لـ Next) + JS localStorage لبيانات العميل؛ بدون لمس Next | `wordpress-plugin/snippets/sokany-cart-checkout-style.php` |
| إصلاح Woo lost-password OTP فقط | 1.2.4 = 1.2.3 + `find_user_by_phone` أقوى (صيغ مصر + أرقام بفواصل)؛ بدون لمس Next أو هوكات تأكيد الأوردر | `dist/sokany-whatsapp-otp-1.2.4.zip` |
| إصلاح جذري OTP + واتساب أوردر | تثبيت نظيف 1.2.3 من هوستنجر + بلجن صغير lost-password ZIP؛ توثيق خطوات Hostinger/JWT؛ السبب: namespace sokany-otp غائب من wp-json | `dist/sokany-whatsapp-otp-1.2.3.zip`, `dist/sokany-lost-password-otp.zip`, `wordpress-plugin/sokany-lost-password-otp/` |
| نسيت كلمة المرور بموبايل OTP على Woo | سنابت متوافق مع بلجن 1.2.3: `/request`+`/verify` ثم جلسة عبر admin-ajax + `/login` (بدون lost-password-session) | `wordpress-plugin/snippets/sokany-lost-password-otp.php` |
| Meta Catalog / Pixel على Woo | تدقيق كتالوج Woo؛ Pixel `1249252143469785`؛ فرض sync على قلايات in-stock؛ إصلاح تصنيف حلة بخار داخل قلايات؛ دليل Ads Manager في PROJECT_GUIDE | `scripts/audit-meta-*.mjs`, `scripts/check-meta-pixel.mjs`, `PROJECT_GUIDE.md` |
| محول لغة واحد + وضع اللغة | إصلاح تكرار المحول في هيدر الموبايل؛ إعداد `localeMode` (لغتين / عربي فقط) في الثيم مع فرض العربية عبر middleware | `header.tsx`, `theme-settings.ts`, `settings-form.tsx`, `api/public/locale-mode`, `middleware.ts` |
| ربط Woo الأصلي بـ MazBot + OTP | بلجن v1.3.0: هوك Checkout Blocks + طابور Action Scheduler + OTP في My Account؛ منع تكرار وإعادة محاولة وتشخيص | `wordpress-plugin/sokany-whatsapp-otp/` |
| ثنائية اللغة AR/EN | next-intl؛ افتراضي عربي بدون بادئة؛ `/en/...` للإنجليزي؛ مبدّل لغة؛ ترجمة واجهة المتجر + شِل الأدمن؛ منتجات Woo والثيم كما هي | `messages/`, `src/i18n/`, `middleware.ts`, `[locale]/` |
| إصلاح عدد منتجات السكشن المخصص | السبب: Woo REST يعيد نافداً أولاً فيظهر كرتان فقط؛ الحل: `stock_status=instock` + إكمال العدد من Store API + أبناء التصنيف/over-fetch | `woocommerce.ts`, `product-section-grid.tsx`, `custom-product-section.tsx` |
| تفعيل فورم تواصل معنا | إرسال الاسم/الهاتف/الرسالة إلى `info@sokanyelmaghraby.com` عبر SMTP | `contact-form.tsx`, `api/contact`, `contact-mail.ts` |
| سحب منيو + اسم عرض مخصص | dnd-kit شجري بدل أعلى/أسفل؛ `menuTitle` للفرونت؛ PUT structure؛ أول جذر يظهر يمين الهيدر | `wordpress-menu-builder.tsx`, `category-menu-selection.ts`, `structure` API |
| منيو تصنيفات بواجهة ووردبريس الكلاسيكية | عمودان: إضافة تصنيفات (checkbox) + هيكل القائمة؛ bulk API؛ أعلى/أسفل/أب/أيقونة/إزالة | `wordpress-menu-builder.tsx`, `category-menu-selection/bulk`, `navigation/page.tsx` |
| أيقونة مايك جديدة فوق تقييم صوتي | استبدال المايك بأيقونة خطية شفافة؛ أبيض على أسود / أسود على ذهبي؛ المايك فوق النص | `studio-mic.png`, `customer-reviews-section.tsx` |
| تحسين كارت الآراء (مايك + ألوان) | مايك ستوديو كبير بجانب شراء مؤكد؛ أخضر brand؛ ذهبي `#E8C547`؛ صورة منتج أكبر؛ إزالة شارة المايك من صورة المنتج | `customer-reviews-section.tsx`, `public/reviews/studio-mic.png` |
| إصلاح آراء العملاء (أسود/ذهبي + رفع + مايك) | حفظ بـ POST بدل PUT؛ امتداد صوت من اسم الملف؛ كروت أسود/ذهبي وعكسها؛ صورة المنتج + شارة مايك للتقييم الصوتي | `reviews-settings-form.tsx`, `upload/route.ts`, `theme-settings.ts`, `customer-reviews-section.tsx` |
| منيو أب/ترتيب/أيقونات + آراء صوتية + زوم + إلغاء طلب | تجاوز أب التصنيف في الداشبورد، أيقونات جاهزة، سكشن آراء نص/صوت، lightbox للمنتج، إلغاء طلب من الحساب | `category-menu-selection.ts`, `navigation`, `customer-reviews-section.tsx`, `product-image-gallery.tsx`, `cancel` API |
| Checkout UX + هوتلاين + فوتر + الأكثر مبيعاً | كمية +/- وشحن مجاني وعنوان محفوظ؛ تحكم حجم الهوتلاين؛ لوجو فوتر مستقل؛ كاروسيل صف واحد بـ 5 أعمدة | `checkout-form.tsx`, `header.tsx`, `footer.tsx`, `theme-settings.ts`, `page.tsx` |
| إصلاح ملخص واتساب أوردر v1.2.3 | إرسال بعد اكتمال البنود (REST) بدل `new_order` المبكر؛ ملخص اسم×كمية\|سعر\|قيمة + إجمالي ج.م | `wordpress-plugin/sokany-whatsapp-otp/` |
| إتمام طلب حقيقي COD + فوري + Bosta | checkout مربوط بالسلة والجلسة؛ محافظات/مناطق Bosta؛ إنشاء طلب Woo؛ thank-you للكاش؛ redirect فوري + callback | `checkout-form.tsx`, `api/checkout`, `woocommerce-orders.ts`, `fawry.ts`, `bosta-client.ts` |
| هوت لاين ديسكتوب + شارة سلة + بوب أوردرات | زر 17355 في هيدر الديسكتوب؛ شارة عدد القطع وبوب إضافة بجوار السلة؛ بوب أب إثبات اجتماعي (ويب هوك + عشوائي) 5ث ديسكتوب | `header.tsx`, `header-cart-link.tsx`, `order-social-proof-toast.tsx`, `social-proof.ts` |
| إصلاح تسجيل REST phone_error v1.2.2 | بلجن OTP يمرّر `billing.phone` من JSON إلى `$_POST` ويزيل `phone_error` الكاذب عند إنشاء عميل من المتجر | `wordpress-plugin/sokany-whatsapp-otp/` |
| نصوص الميزة التنافسية + إظهار/إخفاء لكل سكشن | تحديث نص سكشن الشراء من الموقع الرسمي؛ خيار ظاهر/مخفي أمام كل سكشن في ترتيب الصفحة الرئيسية | `page.tsx`, `theme-settings.ts`, `settings-form.tsx` |
| أيقونة سلة على الكارت + إخفاء مخزون صفر | إزالة عداد الكارت؛ أيقونة سلة بجانب مفضلة/مقارنة + toast بعدد القطع؛ إخفاء `outofstock`/`stockQuantity<=0` من المتجر مع `includeUnavailable` للأدمن | `product-action-buttons.tsx`, `cart-provider.tsx`, `woocommerce.ts` |
| عداد كمية + سلة محلية + مشاركة + تابات المنتج | `stockQuantity` من Woo، `CartProvider`/`sokany-cart`، عداد على PDP، مشاركة واتساب/فيسبوك/نسخ/Web Share، تابات مواصفات/مراجعات/شحن | `cart-provider.tsx`, `product-quantity-cart.tsx`, `product-share-buttons.tsx`, `product-detail-tabs.tsx`, `product/[slug]/page.tsx` |
| كاروسيل تصنيفات مستمر | أُضيف ثم **أُلغي** | `b6f361d` → `045b2a4` |
| تحكم كاروسيل التصنيفات من الداشبورد | عدد (ديسكتوب/تابلت/موبايل) + سرعة | `/admin/banners` — `045b2a4` |
| موضع الأزرار العائمة | واتساب / صعود / سوشيال | `/admin/social-media` — `045b2a4` |
| إصلاح دخول JWT | بحث بريد + `user_id` من JWT | `76e5219`, `8f6531a` — `customer-account.ts` |
| OTP دخول + تغيير كلمة مرور | بلجن WP + API + UI | `46cb115` |
| إصلاح OTP من المتجر | URL صحيح `/wp-json/sokany-otp/v1/...` | `9b7c892` — `whatsapp-otp.ts` |
| واجهة OTP | 11 رقم موبايل + شاشة كود منفصلة | `0f8f082` |
| تبسيط صفحة الدخول | «تسجيل الدخول» + حذف نص JWT | `0f8f082` — `login/page.tsx` |
| MazBot OTP v1.1.4 | منع `/login/login` + ترحيل Base تلقائياً + Resolved URL | `wordpress-plugin/sokany-whatsapp-otp/` |
| MazBot OTP v1.1.5 | دخول ثابت `https://mazbot.net/api/login` + مسح خطأ قديم + filemtime | `wordpress-plugin/sokany-whatsapp-otp/` |
| إشعار أوردر واتساب v1.2.0 | هوك Woo → MazBot قالب أوردر للعميل (`billing_phone`) | `wordpress-plugin/sokany-whatsapp-otp/` |
| صيغة أوردر v1.2.1 | متغيرات اسم/رقم/منتجات/قيمة + زر wa.me تأكيد إلى 01156111015 | `wordpress-plugin/sokany-whatsapp-otp/` |
| تقرير حد الطلب | كميات Woo + حد طلب + PDF يومي للتحويل للمخزن الأونلاين | `/admin/reports/reorder` |

للتاريخ الكامل: `git log --oneline`

---

## ميزات أُضيفت سابقاً (قبل جلسات OTP)

| الميزة | Commit تقريبي |
|--------|---------------|
| wishlist + compare | `86726c4` |
| مواصفات من HTML للمقارنة | `b090249` |
| منتجات ذات صلة | `790d655` |
| تنقل سفلي + درج جانبي + About | `7746434` |
| أزرار عائمة (واتساب، سوشيال، صعود) | `439c88f` |
| تنسيق هيرو split 60/40 → 70/30 | `68e32a0`, `1db5362` |
| main groups section | `87d0aa9` |
| ألوان أزرار عائمة (brand green/gold) | `6fbcd8d` |

---

## أين تجد معلومات إضافية؟

| ماذا | أين |
|------|-----|
| **دليل شامل (بناء، env، تعديل كل ميزة)** | `docs/SOKANY_HANDBOOK_AR.md` |
| كل الصفحات والـ API | `src/app/` |
| منطق الأعمال | `src/lib/` |
| بلجن OTP | `wordpress-plugin/sokany-whatsapp-otp/` |
| شحن وتوصيل (توثيق DB) | `prisma/migrations/README-shipping-dispatch.md` |
| خطط تنفيذ سابقة | `.cursor/plans/` |
| محادثات Cursor | agent-transcripts في مشروع Cursor |
| نشر تلقائي بعد التعديل | `.cursor/rules/auto-deploy-after-changes.mdc` |
| README (قديم جزئياً) | `README.md` |

---

## كيف تستخدم هذا الدليل مع Cursor؟

1. في الشات اكتب: `@.cursor/PROJECT_GUIDE.md` عند طلب تعديل كبير.
2. القاعدة `project-guide-reference.mdc` توجّه الوكيل لقراءة هذا الملف.
3. بعد أي ميزة جديدة كبيرة: أضف سطراً في «سجل التعديلات» أعلاه.

---

## حالة الميزات (ملخص)

| الميزة | الحالة |
|--------|--------|
| كتالوج منتجات وتصنيفات | جاهز |
| صفحة منتج + SEO | جاهز |
| بحث / compare / wishlist | جاهز |
| حساب عميل + OTP + كلمة مرور | جاهز |
| داشبورد مظهر وبانرات | جاهز |
| طلبات أدمن + Bosta + توزيع | جاهز (يتطلب DATABASE_URL) |
| تطبيق سائق PWA | جاهز |
| سلة محلية (كمية محدودة بالمخزون) + مشاركة + تابات PDP | جاهز |
| سلة + checkout + COD / Fawry + Bosta | جاهز (يتطلب مفاتيح Woo / Bosta؛ فوري اختياري عبر FAWRY_* أو بوابة Woo) |

---

## النشر

```bash
npm run build
git push origin master
npx vercel --prod --yes
```

انظر `.cursor/rules/auto-deploy-after-changes.mdc` للتفاصيل.
