# دليل تشغيل Tooliano / سوكانى

**المشروع:** sokany-storefront على GitHub (`mohamad1973/SokanyElmaghraby`)  
**الإنتاج:** https://sokany-storefront.vercel.app  
**المجلد المحلي:** `C:\Users\mm\SokanyElmaghraby\sokany-storefront`  
**تاريخ هذا الدليل:** 31 أكتوبر 2026  

هذا الملف للفهم والقراءة. **لا يغيّر** شاشات الموقع ولا وظائفه. أي تنظيم أو إصلاح أمان مذكور في آخر الدليل للتنفيذ لاحقاً بعد موافقة منفصلة.

---

## 1. إزاي تقرأ الدليل والكود

الموقع مش ملفات HTML منفصلة زي صفحات ووردبريس القديمة. كل شاشة غالباً ملف TypeScript/React اسمه ينتهي بـ `.tsx`. جواه:

- **نصوص عربية وأزرار** تقدر تقرأها حتى لو مش خبير جافاسكربت.
- **`className="..."`** دي ألوان ومسافات Tailwind (قريبة من CSS).
- **`fetch("/api/...")`** ده طلب للحفظ أو البحث. متلمسّوش لو عايز تغيّر الشكل بس.
- **`src/lib/`** منطق الحفظ والشحن والتكت. متلمسّوش من غير مساعدة.

**قاعدة ذهبية:** افتح شاشة واحدة في المرة. دور على الملف اللي اسمه زي الشاشة (`desk-client` للاستقبال، `maintenance-client` للمرتجعات).

| أنت تعرف | تقدر تعدّل بأمان | سيبه لحد فاهم TypeScript |
|----------|------------------|---------------------------|
| HTML / CSS | نصوص الأزرار، `className` في ملفات `*-client.tsx` | `src/lib/` و `src/app/api/` |
| لاحقاً بعد تدريب | إضافة جملة توضيحية على الكارت | جداول قاعدة البيانات، بوسطة، كلمات السر |

لو غيّرت قوس `{` أو فاصلة في `fetch` البناء `npm run build` بيفشل والموقع ما ينزلش.

---

## 2. خريطة البرنامج

```
المتصفح (عميل / أدمن / سائق / موظف CS)
        │
        ▼
Next.js  (مجلد src/app/)
   صفحات الشاشات + واجهات API
        │
        ▼
src/lib/   منطق الأعمال
        ├── WooCommerce  (منتجات وطلبات الموقع: sokany-eg.com)
        ├── Prisma / MySQL  (تأكيدات CS، تكت استقبال، مرتجعات، شيت تميمة)
        └── بوسطة API     (بوليصة توصيل / استرجاع / استبدال)
```

**ثلاث طبقات حماية:**

1. `middleware.ts` في جذر المشروع — يقفل `/cs` و `/admin` و `/driver` إلا بعد جلسة.
2. `src/lib/session-guards.ts` — كل API تقريباً يطلب جلسة: عميل أو أدمن أو سائق أو CS.
3. صلاحيات الموظف داخل CS (مكالمات / مشرف / أدمن / صيانة / استقبال).

**من أين تشتغل كل حاجة؟**

| الطبقة | المجلد |
|--------|--------|
| شاشات المتجر والأدمن والسائق وCS | `src/app/` |
| أزرار وهيدر مشترك للمتجر | `src/components/` |
| منطق الحفظ والشحن والتكت | `src/lib/` وخصوصاً `src/lib/cs/` |
| واجهات الشبكة | `src/app/api/` |
| شكل الجداول | `prisma/schema.prisma` |
| بلجن واتساب OTP | `wordpress-plugin/` |
| شرح للمساعدين | `.cursor/PROJECT_GUIDE.md` و `docs/` |

---

## 3. فين ملفات الشرح في المشروع

| الملف | ماذا فيه | متى تفتحه |
|-------|----------|-----------|
| **هذا الدليل** `docs/TOOLIANO_PROGRAM_GUIDE_AR.md` | خرائط + شاشات + تشغيل العملاء + نموذج كود | القراءة اليومية |
| HTML من هذا الدليل `docs/TOOLIANO_PROGRAM_GUIDE_AR.html` | نفس المحتوى بفهرس جانبي | المتصفح |
| PDF `docs/TOOLIANO_PROGRAM_GUIDE_AR.pdf` | للطباعة | الديسكتوب أيضاً |
| `.cursor/PROJECT_GUIDE.md` | روابط الإنتاج، جدول «أي ملف أعدّل»، سجل الجلسات | قبل أي تعديل مع Cursor |
| `docs/SOKANY_HANDBOOK_AR.html` | دليل المتجر والأدمن (أقدم؛ يوليو 2026) | شكل المتجر والهيدر |
| `docs/SOKANY_HANDBOOK_AR.md` | مصدر الـ HTML القديم | إعادة توليد: `node scripts/handbook-to-html.mjs` |
| `.cursor/plans/` | خطط جلسات العمل (استقبال، بوسطة، تكت) | تفهم «ليه اتكتب الكود كده» |
| `docs/HOSTINGER_REMOTE_MYSQL_AR.md` | اتصال قاعدة هوستنجر | **لا تنشر محتواه؛ فيه بيانات حساسة** |
| `docs/VERCEL_TOOLIANO_CUTOVER_AR.md` | نقل النطاق | نشر الإنتاج |

نسخة الديسكتوب: `C:\Users\mm\OneDrive\Desktop\دليل_تشغيل_Tooliano.pdf` (أو `Desktop` العادي إن لم يكن OneDrive).

---

## 4. قاعدة الطبقات الأربع (أهم حاجة تفهمها)

كل ميزة CS تقريباً أربعة ملفات، مش ملف واحد.

| الطبقة | مثال الاستقبال | مثال المرتجعات | دورها |
|--------|----------------|-----------------|--------|
| المسار | `src/app/cs/centers/desk/page.tsx` | `src/app/cs/maintenance/page.tsx` | يتأكد إن الموظف داخل، وإلا يحوّله لصفحة الدخول |
| الشكل | `src/app/cs/centers/desk/desk-client.tsx` | `src/app/cs/maintenance/maintenance-client.tsx` | الأزرار، الخانات، الألوان، النصوص العربية |
| الـ API | `src/app/api/cs/centers/intake/route.ts` | `src/app/api/cs/maintenance/returns/route.ts` | يستقبل الطلب من المتصفح بعد التحقق من الجلسة |
| المنطق | `src/lib/cs/sc-intake.ts` | `src/lib/cs/maintenance-returns.ts` | يحفظ في MySQL ويربط التكت بالأوردر |

نفس الفكرة في قائمة المكالمات:

- الشاشة: `src/app/cs/page.tsx` + `src/app/cs/cs-queue-client.tsx`
- الحفظ: `src/app/api/cs/confirmations/[id]/route.ts`
- المنطق: `src/lib/cs/confirmations.ts`

**لو عايز تغيّر لون زر أو كلمة عربية:** الملف `*-client.tsx`.  
**لو عايز تغيّر إزاي التكت بيتسجل:** `src/lib/cs/` — اطلب مساعدة قبل التعديل.

---

## 5. نموذج من الكود (استقبال)

الملف: `src/app/cs/centers/desk/desk-client.tsx`

الجزء اللي **شكل** (تقدر تقرأه زي HTML):

```tsx
<input
  className="w-full rounded-xl border px-3 py-2"
  placeholder="رقم الموبايل"
  value={form.phone}
  onChange={(e) => setForm({ ...form, phone: e.target.value })}
/>
```

- `placeholder` = الكلام الرمادي داخل الخانة.
- `className` = الشكل (حدود، حواف، مسافة). قريب من CSS.
- `value` / `onChange` = ربط الخانة بالبيانات. لو مسحت `onChange` الخانة مش هتكتب.

الجزء اللي **منطق** (متلمسّوش عشان الشكل):

```tsx
async function search() {
  const res = await fetch(`/api/cs/centers/intake?phone=${encodeURIComponent(phone)}`);
  const data = await res.json();
  // بعد البحث: يفتح آخر تكت لنفس الرقم ويملأ الشكوى وطلب العميل واقتراح الموظف
}
```

`fetch` يكلّم السيرفر. السيرفر في `src/app/api/cs/centers/intake/route.ts` ينادي `src/lib/cs/sc-intake.ts` اللي بيقرأ جدول `ScTicket`.

---

## 6. كتالوج الشاشات — الرابط والملف

الإنتاج: https://sokany-storefront.vercel.app  
نفس المسارات محلياً بعد `npm run dev` على http://localhost:3000

### 6.1 المتجر (العميل)

| ماذا تريد | الرابط | ملف الواجهة | المنطق |
|-----------|--------|-------------|--------|
| الرئيسية | `/` | `src/app/page.tsx` | `src/lib/theme-settings.ts`, `src/lib/woocommerce.ts` |
| المتجر | `/shop` | `src/app/shop/page.tsx` | `woocommerce.ts` |
| منتج | `/product/[slug]` | `src/app/product/[slug]/page.tsx` | مواصفات + صور |
| عروض | `/offers` | `src/app/offers/page.tsx` | منتجات بتخفيض |
| مقارنة | `/compare` | `src/app/compare/page.tsx` | `src/lib/compare-utils.ts` |
| سلة | `/cart` | `src/app/cart/page.tsx` | السلة في المتصفح |
| دفع COD / فوري | `/checkout` | `src/app/checkout/page.tsx` | `src/app/api/checkout/route.ts` |
| شكر | `/checkout/thank-you` | `src/app/checkout/thank-you/page.tsx` | رقم الأوردر |
| دخول / OTP | `/account/login` | `src/components/account-auth-form.tsx` | `src/lib/customer-account.ts`, `whatsapp-otp.ts` |
| حسابي | `/account` | `src/app/account/page.tsx` | طلبات + كلمة مرور |
| تواصل | `/contact` | `src/app/contact/page.tsx` | `src/app/api/contact/route.ts` |

هيدر وفوتر وأزرار واتساب: `src/components/site-chrome.tsx`. الألوان من `/admin/theme`.

### 6.2 لوحة الأدمن (شكل المتجر)

دخول: `/admin/login` — الملف `src/app/admin/login/`

| الشاشة | الرابط | أين الكود |
|--------|--------|-----------|
| الرئيسية | `/admin` | `src/app/admin/page.tsx` |
| ألوان وشعار | `/admin/theme` | `src/app/admin/theme/` + `theme-settings.ts` |
| هيدر | `/admin/header` | `src/app/admin/header/` |
| فوتر | `/admin/footer` | `src/app/admin/footer/` |
| بانرات | `/admin/banners` | `src/app/admin/banners/` |
| سوشيال / واتساب | `/admin/social-media` | `widget-placement.ts` |
| منتجات | `/admin/products` | وكومرس |
| طلبات | `/admin/orders` | `src/lib/orders.ts` |
| توزيع | `/admin/dispatch/*` | `src/lib/dispatch/` |

حماية الأدمن: `middleware.ts` + `requireAdminSession` في `src/lib/session-guards.ts`.

### 6.3 السائق

| الشاشة | الرابط | الملف |
|--------|--------|-------|
| دخول | `/driver/login` | `src/app/driver/login/` |
| مسار اليوم | `/driver/today` | `src/app/driver/today/` |
| ترتيب المحطات | `/driver/route` | `src/app/driver/route/` |
| تسليم + OTP | `/driver/order/[id]` | `src/app/driver/order/[id]/` |

المنطق: `src/lib/dispatch/` و `src/lib/security.ts` (OTP التسليم).

### 6.4 تشغيل العملاء (CS) — قلب النظام اللي اتبنى على Tooliano

دخول: `/cs/login` — الإطار `src/app/cs/cs-shell.tsx` (الثيم أسود وذهبي).

| ماذا تريد | الرابط | ملف الشكل | المنطق |
|-----------|--------|-----------|--------|
| قائمة الانتظار | `/cs` | `cs-queue-client.tsx` | `src/lib/cs/confirmations.ts` |
| سكربت المكالمة | `/cs/orders/[id]` | `orders/[id]/call-sheet.tsx` | نفس التأكيد + بوليصة |
| شيت سيد تميمة | `/cs/temima` | `cs-queue-client.tsx` (وضع تميمة) | `temima-settlement.ts` |
| استقبال مركز | `/cs/centers/desk` | `centers/desk/desk-client.tsx` | `sc-intake.ts` |
| مراكز | `/cs/centers` | `centers/` | `sc-centers.ts` |
| صيانة / مرتجعات | `/cs/maintenance` | `maintenance-client.tsx` | `maintenance-returns.ts` |
| لوحة بوسطة | `/cs/bosta` | `bosta/` | `bosta-waybill.ts` |
| شركات الشحن | `/cs/carriers` | `carriers/` | `sokany-waybill.ts` |
| طباعة سوكانى 10×15 | `/cs/print/sokany-awb/[id]` | صفحة طباعة | `CsSokanyWaybill` |
| مناديب عيد/مؤمن | `/cs/mona` | `mona/mona-client.tsx` | `mona-courier.ts` |
| تحويلات مخزون | `/cs/transfers` | `transfers/` | `src/lib/cs/` تحويلات |
| مستخدمين CS | `/cs/users` | `users/users-client.tsx` | `agents.ts` |
| تصفية تميمة | `/cs/settlement` | `settlement/` | `temima-settlement.ts` |

---

## 7. تشغيل العملاء بالتفصيل

### 7.1 تأكيد الأوردر من المكالمة

1. الموظف يفتح `/cs` ويرى الأوردرات.
2. يفتح `/cs/orders/رقم` ويملأ سكربت التأكيد (اسم، موبايل، عنوان، محافظة، شركة الشحن).
3. الحفظ يكتب صف في جدول `CsOrderConfirmation` عبر `src/lib/cs/confirmations.ts`.
4. لو الشركة **بوسطة**: بوليصة حقيقية من API بوسطة (`src/lib/cs/bosta-waybill.ts`) نوع توصيل عادي.
5. لو **سيد تميمة / عيد / مؤمن**: بوليصة سوكانى محلية تطبع من `/cs/print/sokany-awb/[id]`.

كارت الاسترجاع على صفحة الأوردر: `src/app/cs/orders/fulfillment-panel.tsx` (نفس الكارت يظهر في الاستقبال).

### 7.2 استقبال المركز `/cs/centers/desk`

الشاشة نصّين: يمين بحث وتكت، شمال كارت استبدال/استرجاع.

**بحث الموبايل**

- يطلب `/api/cs/centers/intake?phone=...`
- يجيب ملف العميل، زيارات سابقة، أوردرات الموقع، شحنات بوسطة/تميمة.
- لو فيه تكت محفوظ: يفتح **آخر تكت** ويملأ الشكوى وطلب العميل واقتراح الموظف.
- فورم فاضي لتسجيل زيارة جديدة: زر **تكت جديد** فقط.

**التكت يحفظ في**

- جدول `ScCustomer` + `ScTicket` (الملف `src/lib/cs/sc-intake.ts`)
- خانات مهمة: `complaintNote` شكوى العميل، `customerRequest` طلبه، `staffProposal` قرار/اقتراح موظف الاستقبال، صور الفاتورة والمنتج والشكوى.

**كارت الاستبدال / الاسترجاع (شمال)**

- الملف المشترك: `src/app/cs/orders/fulfillment-panel.tsx`
- يختار: استبدال أو استرجاع، ثم سيد تميمة / عيد / مؤمن / بوسطة.
- زر **حفظ وطباعة البوليصة** ينشئ **أوردر ابن** مربوط بالأوردر الأصلي من غير ما يغيّر الأصلي.
  - رقم زي `148344-R1` استرجاع أو `148344-X1` استبدال.
  - المنطق: `src/lib/cs/fulfillment-return.ts`
- **بوسطة:** شحنة حقيقية نوع 25 استرجاع (استلام من العميل) أو 30 استبدال (توصيل البديل). PDF من `/api/cs/confirmations/[id]/bosta-awb`.
- **سيد/عيد/مؤمن:** بوليصة سوكانى `SK-...` للطباعة الحرارية 10×15.
- بعد الإنشاء يتربط التكت المفتوح بالابن (`fulfillmentConfirmationId` + رقم التتبع) عشان المخزن يشوف شارة «تكت».

لازم أوردر موقع محفوظ وفيه اسم وموبايل وعنوان **ومحافظة**. تكت حضوري من غير أوردر موقع لا ينشئ بوليصة من الكارت.

### 7.3 سيد تميمة والمناديب

- شيت اليوم: `/cs/temima` — `temima-settlement.ts`
- **تم بنجاح** أو **الغاء** على بوليصة الاسترجاع/الاستبدال (الأوردر الابن) يضيف صفاً في مرتجعات الصيانة (`captureDeskReturnFromConfirmation` في `bosta-return-capture.ts`).
- عيد ومؤمن: `/cs/mona` — نفس فكرة التتبع المحلي + نتيجة المندوب.
- إضافة أوردر لشيت يوم مقفول قبله: `src/lib/cs/temima-sheet-edits.ts`.

### 7.4 مرتجعات الصيانة `/cs/maintenance`

تبويبات: بوسطة / تميمة / عيد / مؤمن.

- القائمة من جدول `CsBostaReturnCapture`.
- بوسطة: الشحنات «متجه إليك» (أنواع 20 رفض، 25 استرجاع، 30 استبدال) عبر الكرون أو زر «حفظ ظاهر بوسطة».
- لو فيه تكت استقبال مطابق (موبايل آخر 10 أرقام، أو رقم الأوردر الأب بعد شيل `-R1`/`-X1`، أو رقم التأكيد): شارة حمراء **تكت**.
- الضغط على الشارة يفتح بوباب: شكوى العميل، طلب العميل، قرار موظف الاستقبال، الصور. فحص المخزن يفضل بضغط الصف مش الشارة.
- الملفات: `maintenance-client.tsx`، `sc-return-tickets.ts`، `maintenance-returns.ts`.

### 7.5 مسار مختصر من الزيارة للمخزن

```
موظف الاستقبال يبحث الموبايل
        │
        ▼
يسجّل التكت (شكوى / طلب / قرار)
        │
        ▼
من الكارت: استرجاع أو استبدال + شركة الشحن
        │
        ▼
يتطبع بوليصة (سوكانى أو بوسطة 25/30)
        │
        ▼
سيد/مندوب: تم بنجاح   أو   بوسطة: وصلت للمتجه إليك
        │
        ▼
الصف يظهر في /cs/maintenance
        │
        ▼
شارة حمراء «تكت» → بوباب تفاصيل الاستقبال
```

---

## 8. قاعدة البيانات (من غير أسرار)

الجداول متعرّفة في `prisma/schema.prisma`، وجزء من جداول CS/الاستقبال بيتبني وقت التشغيل (`CREATE TABLE IF NOT EXISTS` داخل `src/lib/cs/agents.ts` و `sc-centers.ts`).

| الجدول (تقريبي) | الغرض |
|-----------------|--------|
| `CsAgent` | موظفو CS وصلاحياتهم |
| `CsOrderConfirmation` | تأكيد المكالمة + أوردرات الاسترجاع/الاستبدال الأبناء |
| `CsSokanyWaybill` | بوليصة سوكانى المحلية |
| `CsBostaReturnCapture` | صفوف مرتجعات المخزن |
| `ScCustomer` / `ScTicket` | عميل الاستقبال والتكت |
| `ScTicketPhoto` / `ScTicketEvent` | صور وأحداث التكت |
| إعدادات المظهر | ثيم، بانرات، هيدر |

لا ترفع ملف `.env` إلى GitHub. المتغيرات تتحط في Vercel → Settings → Environment Variables.

أسماء المتغيرات المهمة (القيم نفسها مش في هذا الدليل): `DATABASE_URL`, `NEXTAUTH_SECRET`, `WOOCOMMERCE_*`, `BOSTA_API_KEY`, `BOSTA_WEBHOOK_SECRET`, `WOOCOMMERCE_WEBHOOK_SECRET`, `ADMIN_PASSWORD` / `ADMIN_PASSWORD_MM`.

---

## 9. ووردبريس (خارج Next.js)

المتجر يقرأ المنتجات والطلبات من https://sokany-eg.com

| البلجن / القصاصة | المجلد في المشروع |
|------------------|-------------------|
| واتساب OTP (الأحدث في الريبو) | `wordpress-plugin/sokany-whatsapp-otp/` |
| ZIP تثبيت مستقر | `dist/sokany-whatsapp-otp-1.2.4.zip` |
| إعدادات هيدلس | `wordpress-plugin/` ملفات headless-settings |
| تنسيق السلة | `wordpress-plugin/snippets/sokany-cart-checkout-style-v1.3.php` |

إعداد OTP: ووردبريس → Settings → SOKANY WhatsApp OTP. رقم الموبايل لازم يكون على حساب العميل في ووردبريس.

---

## 10. إزاي تعدّل بعدين (خطوات عملية)

1. افتح المشروع في Cursor: `C:\Users\mm\SokanyElmaghraby\sokany-storefront`
2. ابحث باسم الشاشة أو الزر العربي (مثلاً «تكت جديد» أو «حفظ وطباعة البوليصة»).
3. لو الملف `*-client.tsx`: غيّر النص أو `className` فقط، احفظ.
4. من الطرفية: `npm run build` — لازم ينجح.
5. لو البناء نجح وعايز الإنتاج: commit ثم `git push origin master` ثم `npx vercel --prod --yes`.
6. لو البناء فشل: ارجع التعديل (`git checkout -- الملف`) واطلب مساعدة. متكملش نشر.

**أمثلة آمنة لمبتدئ HTML/CSS**

- تغيير كلمة زر في الاستقبال: ابحث في `desk-client.tsx`.
- لون كارت المرتجعات: `maintenance-client.tsx` (`bg-red-600` للشارة الحمراء).
- جملة تحت المبلغ في كارت بوسطة: `fulfillment-panel.tsx`.

**أمثلة غير آمنة من غير مراجعة**

- أي ملف تحت `src/lib/cs/`
- `src/lib/auth.ts` و `middleware.ts`
- `prisma/schema.prisma`
- مسح `fetch` أو `onClick`

---

## 11. ملاحظات أمان (قراءة فقط — لا إصلاح في هذا التسليم)

الكود منظّم على طبقات، وواجهات CS التشغيلية تقريباً كلها تمر على `requireCsSession()`. ده جيد.

نقاط لازم تعرفها **من غير ما نغيّرها دلوقتي**:

1. **تسجيل CS الذاتي** من `/cs/login` مفتوح لأي حد يقدر يوصل الصفحة، وينشئ موظف دور `agent`. الملف: `src/app/api/cs/register/route.ts`.
2. **حساب أدمن ثابت في الكود** يُعاد ضبطه عند تشغيل السيرفر (`src/lib/auth.ts` و `src/lib/cs/agents.ts`). تغيير الباسورد من الشاشة قد لا يثبت بعد إعادة التشغيل.
3. **أسرار افتراضية** لو متغيرات البيئة ناقصة على السيرفر: جلسة NextAuth، ويب هوك بوسطة، ويب هوك Woo. لازم تكون متعرفة في Vercel.
4. **مستندات داخل الريبو** تتكلم عن اتصال قاعدة هوستنجر. لا تشارك الملفات دي علناً. لو اتسربت: غيّر كلمة مرور قاعدة هوستنجر من لوحة الاستضافة ثم حدّث Vercel.
5. حقن SQL من نص المستخدم: الاستعلامات الحساسة بتستخدم علامات `?`. مش ثغرة مؤكدة من مدخلات الشاشات.

أي إصلاح مما سبق يحتاج موافقة منفصلة. هذا الدليل ما ينفّذش الإصلاح.

---

## 12. إيه ينفع يتظبط لاحقاً (من غير تنفيذ الآن)

تنظيم **آمن نسبياً** (ملفات مشغلة مؤقتة، مش وظائف):

- إضافة `dist/` وملفات `scripts/_tmp*` وZIP البلجنات إلى `.gitignore` حتى لا تكبر المستودع.
- عدم الالتزام بنسخ مكررة من بلجن واتساب (`sokany-whatsapp-otp111`).
- شيل بيانات الاتصال بقاعدة البيانات من ملفات `docs/` العامة واستبدلها بتعليمات «حط القيمة في Vercel».

تنظيم **خطر على السلوك** (لا تلمسه من غير طلب صريح):

- تقطيع الملفات الضخمة مثل `cs-queue-client.tsx` (آلاف الأسطر) أو `confirmations.ts`.
- تغيير طريقة بناء الجداول وقت التشغيل إلى migrations فقط.
- قفل تسجيل CS أو تدوير باسورد الأدمن — ده تغيير تشغيل، مش ترتيب ملفات.

الكود الحالي **مرتّب بالطبقات** حتى لو بعض ملفات الواجهة طويلة. الطول وحده مش عطل.

---

## 13. أوامر مفيدة (مرجع)

من مجلد المشروع في PowerShell:

```bash
npm install
npm run dev
npm run build
git status
git push origin master
npx vercel --prod --yes
node scripts/handbook-to-html.mjs
node scripts/program-guide-to-html.mjs
```

إعادة توليد هذا الدليل HTML: `node scripts/program-guide-to-html.mjs`

---

## 14. فهرس سريع «عايز أغيّر إيه → فين الملف»

| التغيير | الملف |
|---------|--------|
| شكل الرئيسية | `src/app/page.tsx` + `/admin/banners` |
| هيدر المتجر | `src/components/site-chrome.tsx` |
| دخول العميل / OTP | `src/components/account-auth-form.tsx` |
| استقبال: بحث وشكل التكت | `src/app/cs/centers/desk/desk-client.tsx` |
| استقبال: حفظ التكت | `src/lib/cs/sc-intake.ts` |
| كارت استبدال/استرجاع | `src/app/cs/orders/fulfillment-panel.tsx` |
| إنشاء ابن الاسترجاع | `src/lib/cs/fulfillment-return.ts` |
| بوليصة بوسطة | `src/lib/cs/bosta-waybill.ts` |
| بوليصة سوكانى | `src/lib/cs/sokany-waybill.ts` |
| شيت تميمة | `src/lib/cs/temima-settlement.ts` |
| مرتجعات + شارة تكت | `maintenance-client.tsx` + `sc-return-tickets.ts` |
| حماية المسارات | `middleware.ts` |
| دخول أدمن/CS | `src/lib/auth.ts` |

---

## 15. حالة الخصائص (مختصر)

| الخاصية | الحالة |
|---------|--------|
| متجر عربي RTL + وكومرس | جاهز على الإنتاج |
| أدمن مظهر وبانرات | جاهز |
| سائق PWA | جاهز |
| تأكيد مكالمات CS | جاهز |
| شيت تميمة / مناديب | جاهز |
| استقبال تكت + صور + شكوى/طلب/قرار | جاهز |
| استرجاع/استبدال من الكارت (سوكانى وبوسطة) | جاهز |
| شارة تكت على مرتجعات الصيانة | جاهز |
| تنظيم الملفات المؤقتة / تدوير الأسرار | مؤجّل حتى الموافقة |

---

آخر تحديث: 31 أكتوبر 2026 — الدليل للقراءة فقط ولا يغيّر تشغيل الموقع.
