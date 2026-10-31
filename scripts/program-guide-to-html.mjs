import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, unlinkSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const mdPath = join(root, "docs", "TOOLIANO_PROGRAM_GUIDE_AR.md");
const htmlPath = join(root, "docs", "TOOLIANO_PROGRAM_GUIDE_AR.html");
const pdfPath = join(root, "docs", "TOOLIANO_PROGRAM_GUIDE_AR.pdf");
const desktopDir =
  process.env.USERPROFILE && existsSync(join(process.env.USERPROFILE, "OneDrive", "Desktop"))
    ? join(process.env.USERPROFILE, "OneDrive", "Desktop")
    : process.env.USERPROFILE
      ? join(process.env.USERPROFILE, "Desktop")
      : "";
const desktopPdf = desktopDir ? join(desktopDir, "دليل_تشغيل_Tooliano.pdf") : "";
const tmpPath = join(root, ".tmp-program-guide.md");

let md = readFileSync(mdPath, "utf8");
md = md.replace(/^<div dir="rtl">\s*/i, "").replace(/\s*<\/div>\s*$/i, "");
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
  <title>دليل تشغيل Tooliano / سوكانى</title>
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
    }
    th, td {
      border: 1px solid var(--border);
      padding: 0.55rem 0.7rem;
      text-align: right;
      vertical-align: top;
    }
    th {
      background: #f3f5fa;
      font-weight: 700;
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
    @page { size: A4; margin: 14mm; }
    @media print {
      .sidebar { display: none; }
      .layout { display: block; }
      body { background: white; font-size: 12.5px; }
      .content { max-width: none; padding: 0; }
      h2 { break-after: avoid; }
      table, pre, blockquote { break-inside: avoid; }
      a { color: inherit; text-decoration: none; }
    }
  </style>
</head>
<body>
  <div class="layout">
    <aside class="sidebar">
      <h2>فهرس سريع</h2>
      <nav>
        <a href="#1-إزاي-تقرأ-الدليل-والكود">1. إزاي تقرأ</a>
        <a href="#2-خريطة-البرنامج">2. خريطة البرنامج</a>
        <a href="#3-فين-ملفات-الشرح-في-المشروع">3. ملفات الشرح</a>
        <a href="#4-قاعدة-الطبقات-الأربع-أهم-حاجة-تفهمها">4. الطبقات الأربع</a>
        <a href="#5-نموذج-من-الكود-استقبال">5. نموذج كود</a>
        <a href="#6-كتالوج-الشاشات--الرابط-والملف">6. كتالوج الشاشات</a>
        <a href="#7-تشغيل-العملاء-بالتفصيل">7. تشغيل العملاء</a>
        <a href="#8-قاعدة-البيانات-من-غير-أسرار">8. قاعدة البيانات</a>
        <a href="#9-ووردبريس-خارج-nextjs">9. ووردبريس</a>
        <a href="#10-إزاي-تعدّل-بعدين-خطوات-عملية">10. إزاي تعدّل</a>
        <a href="#11-ملاحظات-أمان-قراءة-فقط--لا-إصلاح-في-هذا-التسليم">11. أمان</a>
        <a href="#12-إيه-ينفع-يتظبط-لاحقاً-من-غير-تنفيذ-الآن">12. تنظيم لاحقاً</a>
        <a href="#13-أوامر-مفيدة-مرجع">13. أوامر</a>
        <a href="#14-فهرس-سريع-عايز-أغيّر-إيه--فين-الملف">14. فهرس التعديل</a>
        <a href="#15-حالة-الخصائص-مختصر">15. حالة الخصائص</a>
      </nav>
    </aside>
    <main class="content">
      <div class="badge">Tooliano / سوكانى — دليل تشغيل للقراءة فقط</div>
      ${body}
      <p class="footer-note">31 أكتوبر 2026 — لا يغيّر وظائف الموقع</p>
    </main>
  </div>
</body>
</html>
`;

writeFileSync(htmlPath, html, "utf8");
console.log(`[program-guide] Wrote ${htmlPath}`);

function findBrowser() {
  const candidates = [
    process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, "Microsoft", "Edge", "Application", "msedge.exe"),
    process.env["PROGRAMFILES(X86)"] && join(process.env["PROGRAMFILES(X86)"], "Microsoft", "Edge", "Application", "msedge.exe"),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Microsoft", "Edge", "Application", "msedge.exe"),
    process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
  ].filter(Boolean);
  return candidates.find((file) => existsSync(file)) || "";
}

const browser = findBrowser();
if (!browser) {
  console.error("[program-guide] No Edge/Chrome found; HTML is ready, PDF skipped.");
  process.exit(0);
}

const fileUrl = pathToFileURL(htmlPath).href;
const cmd = `"${browser}" --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf="${pdfPath}" "${fileUrl}"`;
execSync(cmd, { stdio: "inherit" });
console.log(`[program-guide] Wrote ${pdfPath}`);

if (desktopPdf) {
  try {
    copyFileSync(pdfPath, desktopPdf);
    console.log(`[program-guide] Copied ${desktopPdf}`);
  } catch (error) {
    console.error("[program-guide] Desktop copy failed:", error instanceof Error ? error.message : error);
  }
}
