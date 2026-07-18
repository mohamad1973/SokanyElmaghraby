# SOKANY WhatsApp OTP

WordPress plugin for WhatsApp OTP customer flows.

## What It Does

- Sends OTP for password reset, login, and registration.
- Sends customer **order confirmation** WhatsApp via MazBot on WooCommerce order create.
- Searches customers by `billing_phone`, `phone`, or `mobile` user meta.
- Fixes headless storefront registration: maps REST JSON `billing.phone` into `$_POST` and clears false `phone_error` from themes/plugins that only check form POST.
- Stores OTP records in the same WordPress MySQL database.
- Uses Test Mode before the real WhatsApp API is available.
- Provides admin settings at:
  `Settings > SOKANY WhatsApp OTP`

## REST Endpoints

Base URL:

```text
https://sokany-eg.com/wp-json/sokany-otp/v1
```

### Request OTP

```http
POST /request
Content-Type: application/json
```

```json
{
  "phone": "01000260262",
  "purpose": "reset_password"
}
```

Allowed purposes:

- `reset_password`
- `register`
- `login`

### Verify OTP

```http
POST /verify
Content-Type: application/json
```

```json
{
  "phone": "01000260262",
  "purpose": "reset_password",
  "otp": "123456"
}
```

Returns a temporary `token` if valid.

### Reset Password

```http
POST /reset-password
Content-Type: application/json
```

```json
{
  "phone": "01000260262",
  "token": "TOKEN_FROM_VERIFY",
  "password": "new-secure-password"
}
```

### Register Customer

```http
POST /register
Content-Type: application/json
```

```json
{
  "name": "Customer Name",
  "email": "customer@example.com",
  "phone": "01000260262",
  "password": "secure-password",
  "token": "TOKEN_FROM_VERIFY"
}
```

### Complete Login (after OTP verify with purpose `login`)

```http
POST /login
Content-Type: application/json
```

```json
{
  "phone": "01000260262",
  "token": "TOKEN_FROM_VERIFY"
}
```

### Change Password (with current password)

```http
POST /change-password
Content-Type: application/json
```

```json
{
  "email": "customer@example.com",
  "currentPassword": "old-password",
  "newPassword": "new-secure-password"
}
```

## Test Mode

Keep `Mode = Test` while developing. The OTP code appears on:

`Settings > SOKANY WhatsApp OTP`

## Live Mode — MazBot (recommended)

1. Connect WhatsApp in MazBot dashboard.
2. Create and get Meta approval for an **Authentication / OTP** template.
3. Note the real **template_id** from MazBot (not a placeholder like `1` unless that is the real ID).
4. Use owner or staff credentials as MazBot support confirmed for your account.
5. In WordPress: `Settings > SOKANY WhatsApp OTP`:
   - Mode: **Live**
   - Provider: **MazBot**
   - MazBot API Base: `https://mazbot.net/api`
   - API Key from MazBot → API page
   - MazBot account email + password
   - Template ID
6. Use **Send test OTP via MazBot** on the settings page before testing the store.

The plugin:

1. Logs in via `POST /api/login` (and falls back to `/ar/api/login` / `/en/api/login` on 404)
2. Caches JWT ~50 min and remembers the working API base
3. Sends via `POST .../whatsapp/send-template`
4. Surfaces the **real MazBot error** in admin settings and to the storefront API consumer

```json
{
  "template_id": 42,
  "mobile": "201000260262",
  "body_matchs": { "1": "input_value" },
  "body_values": { "1": "123456" },
  "button_matchs": { "1": "input_value" },
  "button_values": { "1": "123456" }
}
```

`button_*` fields are optional (disable if your template has no copy-code button).

Docs: https://api.mazbot.net/

## Customer order WhatsApp (MazBot)

When a WooCommerce order is created, the plugin can send an approved **order confirmation** template to `billing_phone`.

### Prerequisites

1. Fix Meta/MazBot **Business eligibility payment issue** (messages otherwise appear in MazBot chat but not on the phone).
2. Create a separate Meta template (not the OTP template), example name `sokany_order_confirm`, Arabic, category UTILITY:

```text
مرحباً {{1}} في سوكاني
تم عمل أوردر رقم {{2}} بالمنتجات التالية {{3}} بقيمة {{4}}
للتأكيد اضغط [زر: تأكيد الأوردر]
أو انتظار مكالمة من أحد ممثلي خدمة العملاء خلال 24 ساعة عمل
شكراً لثقتكم
```

3. Add a **URL button** labeled «تأكيد الأوردر» pointing to company WhatsApp with prefilled text:

```text
https://wa.me/201156111015?text=%D8%AA%D8%A3%D9%83%D9%8A%D8%AF%20%D8%A7%D9%84%D8%A7%D9%88%D8%B1%D8%AF%D8%B1
```

(Opens chat with `01156111015` and message «تأكيد الاوردر».)

4. After **APPROVED**, copy the numeric **Template ID** into WordPress.

### WordPress settings

`Settings > SOKANY WhatsApp OTP` (v1.2.3+):

- Mode: **Live**
- Provider: **MazBot**
- Enable **إشعار الأوردر**
- Set **Order Template ID**
- Use **اختبار قالب الأوردر** before placing a real order

Hooks used:

- `woocommerce_checkout_order_processed` (classic checkout)
- `woocommerce_rest_insert_shop_order_object` (headless / REST — after line items)
- `woocommerce_update_order` (fallback when items arrive on a later save)

**Not** `woocommerce_new_order` (too early on REST: empty items / 0 total).

Deduping: order meta `_sokany_order_wa_sent`  
Send only when the order has at least one line item and `total > 0`.

Variables sent to MazBot:

- `{{1}}` → customer name  
- `{{2}}` → order number  
- `{{3}}` → line summary: `اسم ×كمية | سعر الوحدة ج.م | قيمة السطر ج.م` (truncated ~400 chars)  
- `{{4}}` → order total as `1,500 ج.م`  

The confirm button URL is configured **inside the MazBot template** (not sent by the plugin per order).  

### E2E checklist

1. Upload plugin ZIP / replace PHP → title shows **v1.2.3**
2. Live + MazBot credentials OK (login test)
3. Order Template ID saved and enabled
4. Admin test order template → phone receives message (no eligibility error in MazBot chat)
5. Place a storefront order → WhatsApp shows real product names, qty, unit price, line total, and order total (not «منتجات» / «0 EGP»); «آخر إرسال أوردر» shows `ok: true`

## Live Mode — Generic API (legacy)

For other providers, set Provider to **Generic API** and configure:

- API Base URL
- API Token
- Token Header / Prefix
- Sender ID
- Template Name / Language

```json
{
  "to": "201000260262",
  "sender": "SENDER_ID",
  "template": "otp_code",
  "language": "ar",
  "variables": ["123456", "5"]
}
```
