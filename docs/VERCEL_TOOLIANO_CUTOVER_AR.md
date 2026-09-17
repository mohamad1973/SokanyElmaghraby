# ضبط Vercel لـ tooliano.com (بعد Remote MySQL)

نفّذ بعد تفعيل Remote MySQL (`docs/HOSTINGER_REMOTE_MYSQL_AR.md`).

## أ) Environment Variables

1. افتح [Vercel Dashboard](https://vercel.com) → مشروع **sokany-storefront**
2. **Settings → Environment Variables** → Production
3. أضف/حدّث:

| Key | Value |
|-----|--------|
| `NEXTAUTH_URL` | `https://tooliano.com` |
| `DATABASE_URL` | Remote MySQL من دليل Hostinger (srv1729…) |
| `WOOCOMMERCE_STORE_URL` | `https://sokany-eg.com` |
| `WOOCOMMERCE_*` / `NEXTAUTH_SECRET` / `ADMIN_*` | من `.env.local` |
| `CRON_SECRET` | سلسلة عشوائية طويلة |

أو من الجهاز بعد `npx vercel login`:

```bash
node scripts/set-vercel-tooliano-env.mjs
npx vercel --prod --yes
```

## ب) الفرع والـ Deploy

- الكود على `feature/tooliano-merge` (نشر الحملات + قرارات + cron)
- اربط Production بهذا الفرع أو ادمج إلى `master` ثم Redeploy

## ج) Domain

1. **Settings → Domains** → أضف `tooliano.com` و `www.tooliano.com`
2. انسخ سجلات A/CNAME من Vercel إلى DNS عند Hostinger/المسجّل
3. انتظر تفعيل SSL

## د) تحقق

- `https://tooliano.com`
- `https://tooliano.com/admin/login`
- `https://tooliano.com/admin/group-buy`
