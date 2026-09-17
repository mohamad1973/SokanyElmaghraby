# تفعيل Remote MySQL لـ Vercel (Hostinger)

Hostname الحساب: **`srv1729.hstgr.io`**  
قاعدة سوكاني: `u419683418_sokanytooliano` / user `u419683418_tooliano`

## خطوات hPanel (دقيقة واحدة)

1. افتح [hPanel](https://hpanel.hostinger.com) → **Databases** → **Remote MySQL**
2. في **Access Host** أضف: `%` ثم **Create** / **Add**
3. تأكد أن اليوزر `u419683418_tooliano` مربوط بقاعدة `u419683418_sokanytooliano`

## DATABASE_URL على Vercel

```text
mysql://u419683418_tooliano:Aml%40suba%23123@srv1729.hstgr.io:3306/u419683418_sokanytooliano
```

تحقق محلي بعد التفعيل:

```bash
node scripts/probe-hostinger-db.cjs
```

المتوقع: `OK [{"c":...}]`
