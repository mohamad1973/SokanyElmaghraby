import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const mdPath = join(root, "docs", "SOKANY_HANDBOOK_AR.md");
const htmlPath = join(root, "docs", "SOKANY_HANDBOOK_AR.html");
const tmpPath = join(root, ".tmp-handbook.md");

let md = readFileSync(mdPath, "utf8");
md = md.replace(/^<div dir="rtl">\s*/i, "").replace(/\s*<\/div>\s*$/i, "");

// Replace RTL reading instructions section with HTML-specific note
md = md.replace(
  /## كيف تقرأ هذا الملف باتجاه RTL[\s\S]*?---\n\n/,
  `## كيف تقرأ هذا الدليل

هذا الملف HTML جاهز للقراءة من اليمين لليسار. استخدم **فهرس المحتويات** في الشريط الجانبي للانتقال السريع.

---

`,
);

writeFileSync(tmpPath, md, "utf8");

const body = execSync(`npx --yes marked "${tmpPath}"`, {
  encoding: "utf8",
  cwd: root,
  stdio: ["pipe", "pipe", "inherit"],
});

unlinkSync(tmpPath);

const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>دليل SOKANY Storefront الشامل</title>
  <style>
    :root {
      --bg: #f8f9fb;
      --surface: #ffffff;
      --text: #1a1d26;
      --muted: #5c6478;
      --accent: #b8860b;
      --accent-dark: #8b6914;
      --border: #e2e6ef;
      --code-bg: #f1f3f8;
      --sidebar-width: 280px;
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      font-family: "Segoe UI", Tahoma, "Noto Sans Arabic", Arial, sans-serif;
      font-size: 16px;
      line-height: 1.75;
      color: var(--text);
      background: var(--bg);
      direction: rtl;
    }
    .layout {
      display: grid;
      grid-template-columns: var(--sidebar-width) 1fr;
      min-height: 100vh;
    }
    .sidebar {
      position: sticky;
      top: 0;
      height: 100vh;
      overflow-y: auto;
      background: var(--surface);
      border-left: 1px solid var(--border);
      padding: 1.25rem 1rem;
    }
    .sidebar h2 {
      font-size: 0.95rem;
      margin: 0 0 0.75rem;
      color: var(--accent-dark);
    }
    .sidebar nav a {
      display: block;
      padding: 0.35rem 0.5rem;
      color: var(--muted);
      text-decoration: none;
      font-size: 0.88rem;
      border-radius: 6px;
    }
    .sidebar nav a:hover {
      background: var(--code-bg);
      color: var(--accent-dark);
    }
    .content {
      max-width: 960px;
      padding: 2rem 2.5rem 4rem;
    }
    .badge {
      display: inline-block;
      background: #fff8e6;
      color: var(--accent-dark);
      border: 1px solid #f0d78c;
      padding: 0.35rem 0.75rem;
      border-radius: 999px;
      font-size: 0.85rem;
      margin-bottom: 1rem;
    }
    h1 {
      font-size: 2rem;
      margin: 0 0 0.5rem;
      color: var(--accent-dark);
      border-bottom: 3px solid var(--accent);
      padding-bottom: 0.5rem;
    }
    h2 {
      font-size: 1.45rem;
      margin: 2.5rem 0 1rem;
      color: var(--accent-dark);
      padding-top: 0.5rem;
      border-top: 1px solid var(--border);
    }
    h3 {
      font-size: 1.15rem;
      margin: 1.75rem 0 0.75rem;
      color: #2d3344;
    }
    p { margin: 0.75rem 0; }
    strong { color: #111; }
    a { color: var(--accent-dark); }
    a:hover { color: var(--accent); }
    ul, ol { padding-right: 1.5rem; margin: 0.75rem 0; }
    li { margin: 0.35rem 0; }
    blockquote {
      margin: 1rem 0;
      padding: 0.75rem 1rem;
      background: #fff8e6;
      border-right: 4px solid var(--accent);
      border-radius: 0 8px 8px 0;
      color: #4a4020;
    }
    hr {
      border: none;
      border-top: 1px solid var(--border);
      margin: 2rem 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1rem 0 1.5rem;
      font-size: 0.92rem;
      background: var(--surface);
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    }
    th, td {
      border: 1px solid var(--border);
      padding: 0.6rem 0.75rem;
      text-align: right;
      vertical-align: top;
    }
    th {
      background: #f3f5fa;
      font-weight: 700;
      color: #2d3344;
    }
    tr:nth-child(even) td { background: #fafbfc; }
    code {
      font-family: Consolas, "Courier New", monospace;
      font-size: 0.88em;
      background: var(--code-bg);
      padding: 0.15em 0.4em;
      border-radius: 4px;
      direction: ltr;
      unicode-bidi: embed;
    }
    pre {
      background: #1e2433;
      color: #e8ecf4;
      padding: 1rem 1.25rem;
      border-radius: 8px;
      overflow-x: auto;
      direction: ltr;
      text-align: left;
      margin: 1rem 0;
    }
    pre code {
      background: none;
      padding: 0;
      color: inherit;
      font-size: 0.85rem;
    }
    .footer-note {
      margin-top: 3rem;
      padding-top: 1rem;
      border-top: 1px solid var(--border);
      color: var(--muted);
      font-size: 0.9rem;
      text-align: center;
    }
    @media (max-width: 900px) {
      .layout { grid-template-columns: 1fr; }
      .sidebar {
        position: relative;
        height: auto;
        border-left: none;
        border-bottom: 1px solid var(--border);
      }
      .content { padding: 1.25rem 1rem 3rem; }
    }
    @media print {
      .sidebar { display: none; }
      .layout { display: block; }
      body { background: white; }
    }
  </style>
</head>
<body>
  <div class="layout">
    <aside class="sidebar">
      <h2>فهرس سريع</h2>
      <nav>
        <a href="#1-نظرة-عامة-وروابط-الإنتاج">1. نظرة عامة</a>
        <a href="#2-البنية-المعمارية">2. البنية المعمارية</a>
        <a href="#3-هيكل-المجلدات">3. هيكل المجلدات</a>
        <a href="#4-بناء-الموقع-من-الصفر">4. بناء الموقع</a>
        <a href="#5-فهرس-المسارات-السريع">5. فهرس المسارات</a>
        <a href="#6-دليل-الميزات-التفصيلي">6. دليل الميزات</a>
        <a href="#7-فهرس-التعديل-السريع">7. فهرس التعديل</a>
        <a href="#8-متغيرات-البيئة">8. متغيرات البيئة</a>
        <a href="#9-إعدادات-المظهر-من-الداشبورد">9. إعدادات المظهر</a>
        <a href="#10-قاعدة-البيانات-prisma">10. قاعدة البيانات</a>
        <a href="#11-بلجنات-ووردبريس">11. بلجنات ووردبريس</a>
        <a href="#12-سجل-التعديلات">12. سجل التعديلات</a>
        <a href="#13-حالة-الميزات">13. حالة الميزات</a>
        <a href="#14-دليل-للمساعدين">14. دليل المساعدين</a>
      </nav>
    </aside>
    <main class="content">
      <div class="badge">SOKANY Storefront — دليل شامل RTL</div>
      ${body}
      <p class="footer-note">آخر تحديث: يوليو 2026 — sokany-storefront</p>
    </main>
  </div>
</body>
</html>
`;

writeFileSync(htmlPath, html, "utf8");
console.log(`[handbook-to-html] Wrote ${htmlPath}`);
