/**
 * يضبط متغيرات الإنتاج على Vercel من .env.local + Remote MySQL Hostinger.
 * الاستخدام:
 *   set VERCEL_TOKEN=...
 *   node scripts/set-vercel-tooliano-env.mjs
 *
 * يتطلب: vercel CLI مسجّل أو VERCEL_TOKEN، ومشروع مربوط (.vercel/project.json).
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const envPath = path.join(root, ".env.local");

function parseEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i < 0) continue;
    const key = trimmed.slice(0, i).trim();
    let value = trimmed.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const local = parseEnv(envPath);

const DATABASE_URL =
  process.env.TOOLIANO_DATABASE_URL ||
  "mysql://u419683418_tooliano:Aml%40suba%23123@srv1729.hstgr.io:3306/u419683418_sokanytooliano";

const vars = {
  NEXTAUTH_URL: "https://tooliano.com",
  NEXTAUTH_SECRET: local.NEXTAUTH_SECRET || process.env.NEXTAUTH_SECRET,
  ADMIN_EMAIL: local.ADMIN_EMAIL || process.env.ADMIN_EMAIL,
  ADMIN_PASSWORD: local.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD,
  DATABASE_URL,
  WOOCOMMERCE_STORE_URL:
    local.WOOCOMMERCE_STORE_URL || "https://sokany-eg.com",
  WOOCOMMERCE_CONSUMER_KEY:
    local.WOOCOMMERCE_CONSUMER_KEY || process.env.WOOCOMMERCE_CONSUMER_KEY,
  WOOCOMMERCE_CONSUMER_SECRET:
    local.WOOCOMMERCE_CONSUMER_SECRET || process.env.WOOCOMMERCE_CONSUMER_SECRET,
  CRON_SECRET:
    local.CRON_SECRET ||
    process.env.CRON_SECRET ||
    require("crypto").randomBytes(24).toString("hex"),
  NODE_ENV: "production",
};

const missing = Object.entries(vars)
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missing.length) {
  console.error("Missing values:", missing.join(", "));
  process.exit(1);
}

function setEnv(key, value) {
  console.log(`Setting ${key}...`);
  execFileSync(
    "npx",
    ["vercel", "env", "add", key, "production", "--force", "--yes"],
    {
      cwd: root,
      input: `${value}\n`,
      stdio: ["pipe", "inherit", "inherit"],
      env: process.env,
      shell: true,
    },
  );
}

for (const [key, value] of Object.entries(vars)) {
  setEnv(key, value);
}

console.log("Done. Run: npx vercel --prod --yes");
console.log("Then add domain tooliano.com in Vercel → Domains.");
