# SOKANY WhatsApp OTP

WordPress plugin for WhatsApp OTP customer flows **and** WooCommerce order confirmation via MazBot.

**Current version: 1.3.0**

## What It Does

- Sends OTP for password reset, login, and registration (REST API for the headless storefront).
- Optional **My Account OTP** UI on the native WooCommerce account page (login + register with WhatsApp code + WordPress cookie session).
- Sends customer **order confirmation** WhatsApp via MazBot when a WooCommerce order is placed from:
  - Classic shortcode checkout
  - Checkout Blocks / Store API
  - Headless / REST (Next.js storefront)
- Queues sends through WooCommerce Action Scheduler (unique per order) with HPOS-safe state and retries.
- Searches customers by `billing_phone`, `phone`, or `mobile` user meta.
- Fixes headless storefront registration: maps REST JSON `billing.phone` into `$_POST` and clears false `phone_error`.
- Stores OTP records in the same WordPress MySQL database.
- Admin settings at: `Settings > SOKANY WhatsApp OTP`

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

Allowed purposes: `reset_password`, `register`, `login`

### Verify OTP

```http
POST /verify
```

```json
{
  "phone": "01000260262",
  "purpose": "login",
  "otp": "123456"
}
```

### Account session (My Account UI only)

```http
POST /account-session
```

Creates a WordPress logged-in cookie after OTP verify. Requires `nonce` from the localized My Account script.

Also: `/reset-password`, `/register`, `/login`, `/change-password` (unchanged for the headless storefront).

## Customer order WhatsApp (MazBot) — v1.3.0

### Hooks

- `woocommerce_checkout_order_processed` — classic checkout
- `woocommerce_store_api_checkout_order_processed` — Checkout Blocks
- `woocommerce_rest_insert_shop_order_object` — headless / REST
- `woocommerce_new_order` — delayed safety-net enqueue only
- `woocommerce_update_order` — fallback when items arrive later
- Worker: Action Scheduler hook `sokany_whatsapp_otp_process_order`

### Behaviour

- Unified `queue_order_whatsapp()` → Action Scheduler → validate → MazBot template
- One message per order (states: `queued` / `sending` / `sent` / `failed`)
- HPOS-safe order meta via `$order->get_meta()` / `update_meta_data()` / `save_meta_data()`
- Phone resolution: billing → shipping → customer user meta
- Test Mode previews only (does **not** mark as sent)
- Retries transient MazBot/network errors with backoff
- WC logger source: `sokany-whatsapp-otp`
- Admin: last history + **resend by Order ID**

### Template variables

- `{{1}}` customer name
- `{{2}}` order number
- `{{3}}` line summary
- `{{4}}` total (`1,500 ج.م`)

Confirm button URL stays configured inside the MazBot template.

## My Account OTP (native Woo)

1. Enable **OTP في صفحة حساب ووكومرس** in plugin settings.
2. Visit WooCommerce My Account while logged out.
3. Use WhatsApp login/register panels above the classic forms.

## Install / upgrade

1. Upload the ZIP (or replace the plugin folder) so version shows **v1.3.0**.
2. Keep Live + MazBot credentials.
3. Enable order notifications + Order Template ID.
4. Optionally enable My Account OTP.
5. Place a test order from the **native Woo checkout** and confirm WhatsApp delivery.
6. Check WooCommerce → Status → Logs → `sokany-whatsapp-otp` if needed.

## Changelog

### 1.3.0

- Checkout Blocks support (`woocommerce_store_api_checkout_order_processed`)
- Unified Action Scheduler queue with retries and HPOS-safe state
- My Account OTP login/register UI + `/account-session`
- Admin order history + manual resend

### 1.2.3

- Order summary after line items ready; removed early `woocommerce_new_order` send

### 1.2.2

- REST customer phone mapping / `phone_error` fix
