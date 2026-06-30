# إعداد قاعدة بيانات الشحن والمندوبين

## على Vercel (تلقائي)

عند كل **Deploy**، السكربت `scripts/prepare-db.mjs` يقوم بـ:

1. `prisma db push` — إنشاء/تحديث جداول الشحن والمندوبين في MySQL
2. `prisma db seed` — إضافة مناطق القاهرة والجيزة الافتراضية (مرة واحدة)

**المطلوب:** `DATABASE_URL` موجود في Environment Variables على Vercel.

## بعد Deploy

1. افتح `/admin/dispatch/setup` وتحقق أن قاعدة البيانات **متصلة**
2. انسخ **Webhook URL** وسجّله في Bosta Business
3. اضغط **إنشاء مناطق القاهرة والجيزة** إن لم تُنشأ تلقائياً
4. أضف المندوبين من `/admin/dispatch/drivers`
5. جرّب **إنشاء Bosta** من `/admin/orders` لطلب خارج القاهرة/الجيزة

## يدوياً (محلي)

```bash
cp .env.local.example .env.local
# عدّل DATABASE_URL والمفاتيح

npm run db:push
npm run db:seed
```

## الجداول

- `Shipment` — شحنات Bosta والداخلية
- `Driver` — المندوبين
- `DeliveryZone` — المناطق
- `DeliveryRun` — مسار يومي
- `DeliveryAssignment` — تعيين طلب + OTP
