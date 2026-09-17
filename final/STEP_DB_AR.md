# خطوة القاعدة — tooliano.com

نفّذ في hPanel ثم انسخ الناتج هنا في الشات:

## إنشاء MySQL (دقيقة واحدة)

1. hPanel → **Databases** → **MySQL Databases**
2. Create new database:
   - Database name: `sokany_next` (أو أي اسم يظهر مع البادئة uXXXX_)
   - User: نفس الاسم أو مستخدم جديد
   - Password: قوية واحفظها
3. اربط المستخدم بالقاعدة (All privileges)
4. phpMyAdmin → اختر القاعدة → **Import** → الملف:
   `C:\Users\mm\SokanyElmaghraby\sokany-storefront\final\schema-FOR-PHPMYADMIN.sql`
   أو `final\database\schema.sql`

## بعد الإنشاء اكتب لي بالشكل ده

```text
DB_NAME=...
DB_USER=...
DB_PASS=...
DB_HOST=localhost
```

(غالبًا الهوست على هوستنجر = `localhost`)

بعدها أحدّث `DATABASE_URL` في `final/app/.env` ونكمّل رفع Node.js على **tooliano.com**.
