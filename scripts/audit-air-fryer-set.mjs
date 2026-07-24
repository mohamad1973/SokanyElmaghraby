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

const categoryId = 289; // قلايه هوائيه
const url = new URL(`${base}/wp-json/wc/v3/products`);
url.searchParams.set("category", String(categoryId));
url.searchParams.set("status", "publish");
url.searchParams.set("per_page", "100");
url.searchParams.set(
  "_fields",
  "id,name,permalink,price,regular_price,stock_status,images,meta_data",
);

const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
const products = await res.json();
if (!Array.isArray(products)) {
  throw new Error(JSON.stringify(products).slice(0, 300));
}

function meta(product, key) {
  return (product.meta_data || []).find((row) => row.key === key)?.value;
}

const rows = products.map((product) => {
  const syncV2 = meta(product, "_wc_facebook_sync_enabled_v2");
  const sync = meta(product, "_wc_facebook_sync_enabled");
  const visibility = meta(product, "fb_visibility");
  return {
    id: product.id,
    name: product.name,
    stock_status: product.stock_status,
    price: product.price || product.regular_price || "",
    hasImage: Boolean(product.images?.[0]?.src),
    sync: syncV2 || sync || "",
    visibility: visibility || "",
    permalink: product.permalink,
    catalogReady:
      Boolean(product.images?.[0]?.src) &&
      Number(product.price || product.regular_price || 0) > 0 &&
      product.stock_status === "instock" &&
      sync !== "no" &&
      syncV2 !== "no",
  };
});

const summary = {
  categoryId,
  categoryName: "قلايه هوائيه",
  total: rows.length,
  inStock: rows.filter((row) => row.stock_status === "instock").length,
  catalogReady: rows.filter((row) => row.catalogReady).length,
  missingImage: rows.filter((row) => !row.hasImage).length,
  missingPrice: rows.filter((row) => !row.price || Number(row.price) <= 0).length,
  products: rows,
};

writeFileSync(
  resolve("scripts/meta-air-fryer-product-set.json"),
  JSON.stringify(summary, null, 2),
  "utf8",
);
console.log(JSON.stringify(summary, null, 2));
