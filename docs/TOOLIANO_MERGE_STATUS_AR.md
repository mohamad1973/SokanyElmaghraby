# دمج توليانو → سوكاني (حالة التنفيذ)

تاريخ التحديث: 2026-09-17  
فرع العمل: `feature/tooliano-merge`

## البنية المعتمدة

| الطبقة | أين |
|--------|-----|
| Next.js | **Vercel** (مش Hostinger Node) |
| MySQL / Prisma | **Hostinger** Remote MySQL |
| المنتجات / الطلبات | Woo **sokany-eg.com** |
| الدومين العام | **tooliano.com** → DNS إلى Vercel |

## تم (كود + DB + GitHub)

- تجميد v001 + Prisma `Gb*` + UI فيندور/حملات
- MySQL: `u419683418_sokanytooliano` / user `u419683418_tooliano` + استيراد schema + group-buy
- موافقة الحملة → إنشاء/تحديث منتج Woo (`src/lib/group-buy/publish-woo.ts`)
- قرارات EXTEND / EXECUTE / CANCEL + كرون `/api/cron/sync-campaigns` (كل ساعة عبر `vercel.json`)
- دُمج في **master** عبر PR: https://github.com/mohamad1973/SokanyElmaghraby/pull/1

## متبقي عندك (لوحة فقط)

1. Hostinger → Remote MySQL → أضف `%` (انظر `docs/HOSTINGER_REMOTE_MYSQL_AR.md`) ثم `node scripts/probe-hostinger-db.cjs`
2. سجّل دخول Vercel → env + Domains (انظر `docs/VERCEL_TOOLIANO_CUTOVER_AR.md`)
   - أو: `npx vercel login` ثم `node scripts/set-vercel-tooliano-env.mjs` ثم `npx vercel --prod --yes`
3. DNS لـ `tooliano.com` حسب سجلات Vercel

## Remote MySQL (Hostinger)

Hostname حساب هوستنجر (نفس `u419683418_*`): **`srv1729.hstgr.io`**

1. hPanel → **Databases** → **Remote MySQL**
2. أضف `%` (أو Any Host) ليسمح لـ Vercel بالاتصال
3. `DATABASE_URL` على Vercel:

```text
mysql://u419683418_tooliano:Aml%40suba%23123@srv1729.hstgr.io:3306/u419683418_sokanytooliano
```

(`%40` = `@` ، `%23` = `#`)

## Vercel Environment Variables

```text
NEXTAUTH_URL=https://tooliano.com
NEXTAUTH_SECRET=...
ADMIN_EMAIL=...
ADMIN_PASSWORD=...
DATABASE_URL=mysql://u419683418_tooliano:Aml%40suba%23123@srv1729.hstgr.io:3306/u419683418_sokanytooliano
WOOCOMMERCE_STORE_URL=https://sokany-eg.com
WOOCOMMERCE_CONSUMER_KEY=...
WOOCOMMERCE_CONSUMER_SECRET=...
CRON_SECRET=...
NODE_ENV=production
```

ثم Redeploy من الفرع المرتبط بـ Production.

## DNS: tooliano.com → Vercel

1. Vercel → Project → **Domains** → أضف `tooliano.com` (+ `www`)
2. ضع سجلات A/CNAME اللي Vercel يعرضها عند مسجّل النطاق / Hostinger DNS
3. لا تضف Node.js Web App على Hostinger لهذا الدومين

## رجوع فوري لـ v001

```bash
cd C:\Users\mm\SokanyElmaghraby\sokany-storefront
git switch -c restore-v001-sokany v001-sokany
```
