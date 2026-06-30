# SOKANY WhatsApp OTP

WordPress plugin for WhatsApp OTP customer flows.

## What It Does

- Sends OTP for password reset, login, and registration.
- Searches customers by `billing_phone`, `phone`, or `mobile` user meta.
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

## Test Mode

Before Direct Tech provides the API, keep `Mode = Test`.

When an OTP is requested, the code is saved in the WordPress admin page:

`Settings > SOKANY WhatsApp OTP`

## Live Mode

After Direct Tech provides API details, add:

- API Base URL
- API Token
- Token Header
- Token Prefix
- Sender ID / Phone Number ID
- Template Name
- Template Language

The plugin sends this JSON payload:

```json
{
  "to": "201000260262",
  "sender": "SENDER_ID",
  "template": "otp_code",
  "language": "ar",
  "variables": ["123456", "5"]
}
```

If Direct Tech requires a different payload shape, update only `send_whatsapp_otp()` in the plugin.
