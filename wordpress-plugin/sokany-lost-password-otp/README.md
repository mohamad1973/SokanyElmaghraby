# SOKANY Lost Password OTP

بلجن صغير لواجهة **نسيت كلمة المرور بموبايل** على ووكومرس.

**يتطلب:** بلجن `SOKANY WhatsApp OTP` الإصدار **1.2.3+** (مفعّل).

## التثبيت (من لوحة ووردبريس)

1. ثبّت وفعّل أولاً: `dist/sokany-whatsapp-otp-1.2.3.zip`
2. ثم ارفع: `dist/sokany-lost-password-otp.zip`
3. فعّل **SOKANY Lost Password OTP**
4. عطّل أي سنابت Code Snippets قديم لنفس الميزة

## ماذا يصلح؟

- صفحة `/my-account/lost-password/` → حقل موبايل + واتساب OTP + دخول
- يعتمد على `/wp-json/sokany-otp/v1/request` و `/verify` و `/login`

## تنظيف هوستنجر قبل رفع OTP الرئيسي

احذف المجلد التالف إن وُجد:

`public_html/wp-content/plugins/sokany-whatsapp-otp`

ثم ارفع ZIP من Plugins (مش من لصق ملفات متداخلة).
