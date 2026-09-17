# دمج توليانو → سوكاني (حالة التنفيذ)

تاريخ: 2026-09-17  
فرع العمل: `feature/tooliano-merge`

## تم (v001 + أساس الفيندور)

- تجميد v001:
  - تاج `v001-sokany` @ `21ed4ba`
  - تاج `v001-tooliano` @ `328d40c`
  - مرآة + ZIP: `C:\Users\mm\SokanyElmaghraby\v001-archives\`
  - الرجوع: افتح `RESTORE_AR.txt`
- Prisma: جداول `GbUser` / `GbVendorProfile` / `GbProductSubmission` / `GbGroupBuyOrder`
- SQL: `final/database/group-buy-schema.sql`
- صفحات: `/vendor/register` ، `/campaign/offer/[id]` ، `/admin/group-buy`
- سكشن فرص شراء جماعي في الرئيسية
- API: تسجيل فيندور، موافقة عرض، حجز كمية (عربون COD مبسّط)

## متبقي (يحتاجك على هوستنجر + تكملة كود)

1. باك أب tooliano.com WordPress → `BACKUP_OK`
2. MySQL على هوستنجر: استيراد `schema.sql` ثم `group-buy-schema.sql`
3. `NEXTAUTH_URL=https://tooliano.com` + رفع Node app
4. نشر منتج الحملة تلقائيًا إلى Woo `sokany-eg.com` (لم يُربط بعد)
5. قرارات EXTEND/EXECUTE/CANCEL + كرون الحملات (نسخة لاحقة)

## رجوع فوري لـ v001

```bash
cd C:\Users\mm\SokanyElmaghraby\sokany-storefront
git switch -c restore-v001-sokany v001-sokany
```
