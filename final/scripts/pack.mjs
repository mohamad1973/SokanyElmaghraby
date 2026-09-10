/**
 * Pack a Hostinger-ready standalone Next.js app into final/app.
 *
 * Usage (from repo root):
 *   node final/scripts/pack.mjs
 *
 * Prerequisites: dependencies installed. This script runs `npm run build`
 * then copies standalone + static + public into final/app.
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { execSync } from "child_process";

const root = resolve(process.cwd());
const finalDir = join(root, "final");
const appDir = join(finalDir, "app");
const standaloneDir = join(root, ".next", "standalone");
const staticDir = join(root, ".next", "static");
const publicDir = join(root, "public");

function run(cmd) {
  console.log(`\n> ${cmd}\n`);
  execSync(cmd, { stdio: "inherit", cwd: root, env: process.env });
}

if (!existsSync(join(root, "package.json"))) {
  console.error("Run this script from the repository root.");
  process.exit(1);
}

console.log("[pack] Building Next.js (standalone)...");
run("npm run build");

if (!existsSync(standaloneDir)) {
  console.error(
    "Missing .next/standalone. Ensure next.config.ts has output: \"standalone\".",
  );
  process.exit(1);
}

if (existsSync(appDir)) {
  rmSync(appDir, { recursive: true, force: true });
}
mkdirSync(appDir, { recursive: true });

console.log("[pack] Copying standalone server...");
cpSync(standaloneDir, appDir, { recursive: true });

const appNextStatic = join(appDir, ".next", "static");
mkdirSync(join(appDir, ".next"), { recursive: true });
if (existsSync(staticDir)) {
  console.log("[pack] Copying .next/static...");
  cpSync(staticDir, appNextStatic, { recursive: true });
}

if (existsSync(publicDir)) {
  console.log("[pack] Copying public/...");
  cpSync(publicDir, join(appDir, "public"), { recursive: true });
}

// Prisma client needs schema for some deploy flows / debugging
const prismaSrc = join(root, "prisma");
if (existsSync(prismaSrc)) {
  cpSync(prismaSrc, join(appDir, "prisma"), { recursive: true });
}

// Ship config template next to the app
const configExample = join(finalDir, "config.env.example");
if (existsSync(configExample)) {
  cpSync(configExample, join(appDir, "config.env.example"));
}

const startSh = `#!/bin/sh
# Hostinger / Node: load env then start standalone server
set -e
cd "$(dirname "$0")"
if [ -f .env ]; then
  set -a
  . ./.env
  set +a
elif [ -f config.env ]; then
  set -a
  . ./config.env
  set +a
fi
export PORT="\${PORT:-3000}"
export HOSTNAME="\${HOSTNAME:-0.0.0.0}"
exec node server.js
`;

writeFileSync(join(appDir, "start.sh"), startSh.replace(/\r\n/g, "\n"), {
  encoding: "utf8",
});

const startCmd = `@echo off
REM Hostinger Windows-style start (local test). Prefer start.sh on Linux hosting.
cd /d "%~dp0"
if exist .env (
  for /f "usebackq tokens=1,* delims==" %%A in (".env") do set "%%A=%%B"
)
if exist config.env (
  for /f "usebackq tokens=1,* delims==" %%A in ("config.env") do set "%%A=%%B"
)
set PORT=%PORT%
if "%PORT%"=="" set PORT=3000
set HOSTNAME=0.0.0.0
node server.js
`;
writeFileSync(join(appDir, "start.cmd"), startCmd, { encoding: "utf8" });

const appReadme = `# تشغيل نسخة final/app

1. انسخ \`config.env.example\` إلى \`.env\` واملأ الدومين و MySQL و Woo.
2. تأكد أن جداول \`final/database/schema.sql\` مستوردة في MySQL.
3. التشغيل:
   - Linux (هوستنجر): \`chmod +x start.sh && ./start.sh\`
   - أو: \`node server.js\` بعد تصدير متغيرات البيئة
4. المنفذ الافتراضي: \`PORT=3000\` (هوستنجر قد يفرض منفذًا عبر لوحة Node.js).

لا ترفع ملف \`.env\` إلى GitHub.
`;
writeFileSync(join(appDir, "README.md"), appReadme, { encoding: "utf8" });

// Marker for pack time
let version = "unknown";
try {
  version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version || version;
} catch {
  /* ignore */
}
writeFileSync(
  join(appDir, "PACKED_AT.txt"),
  `packedAt=${new Date().toISOString()}\nappVersion=${version}\n`,
  "utf8",
);

console.log(`\n[pack] Done → ${appDir}`);
console.log("[pack] Next: copy final/config.env.example → final/app/.env and fill values.");
console.log("[pack] Import final/database/schema.sql into Hostinger MySQL.");
