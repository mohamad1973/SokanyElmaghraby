import { readFileSync, writeFileSync } from "fs";
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

const productId = 41453; // حلة طهي بالبخار wrongly in قلايه هوائيه
const airFryerCategoryId = 289;

const getRes = await fetch(`${base}/wp-json/wc/v3/products/${productId}`, {
  headers: { Authorization: `Basic ${auth}` },
});
const product = await getRes.json();
const before = (product.categories || []).map((category) => ({
  id: category.id,
  name: category.name,
}));
const nextCategories = (product.categories || [])
  .filter((category) => category.id !== airFryerCategoryId)
  .map((category) => ({ id: category.id }));

const putRes = await fetch(`${base}/wp-json/wc/v3/products/${productId}`, {
  method: "PUT",
  headers: {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ categories: nextCategories }),
});
const updated = await putRes.json();
const after = (updated.categories || []).map((category) => ({
  id: category.id,
  name: category.name,
}));

const out = {
  productId,
  name: product.name,
  status: putRes.status,
  before,
  after,
};
writeFileSync(
  resolve("scripts/meta-fix-miscategorized-steam-cooker.json"),
  JSON.stringify(out, null, 2),
  "utf8",
);
console.log(JSON.stringify(out, null, 2));
