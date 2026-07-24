import { readFileSync } from "fs";
import { resolve } from "path";

const envText = readFileSync(resolve(".env.local"), "utf8");
const env = {};
for (const line of envText.split(/\r?\n/)) {
  if (!line || line.startsWith("#")) continue;
  const i = line.indexOf("=");
  if (i < 0) continue;
  let value = line.slice(i + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  env[line.slice(0, i).trim()] = value;
}

const base = env.WOOCOMMERCE_STORE_URL.replace(/\/$/, "");
const auth = Buffer.from(
  `${env.WOOCOMMERCE_CONSUMER_KEY}:${env.WOOCOMMERCE_CONSUMER_SECRET}`,
).toString("base64");

const url = `${base}/wp-json/wc/v3/products?per_page=2`;
const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
const text = await res.text();
console.log(
  JSON.stringify(
    {
      status: res.status,
      contentType: res.headers.get("content-type"),
      total: res.headers.get("x-wp-total"),
      bodyPreview: text.slice(0, 400),
    },
    null,
    2,
  ),
);
