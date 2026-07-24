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

const base = (env.WOOCOMMERCE_STORE_URL || "").replace(/\/$/, "");
const auth = Buffer.from(
  `${env.WOOCOMMERCE_CONSUMER_KEY}:${env.WOOCOMMERCE_CONSUMER_SECRET}`,
).toString("base64");

async function getAll(path, params = {}) {
  const items = [];
  let page = 1;
  while (true) {
    const url = new URL(`${base}${path}`);
    for (const [key, value] of Object.entries({ per_page: 100, page, ...params })) {
      url.searchParams.set(key, String(value));
    }
    const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`${path} ${res.status} ${text.slice(0, 300)}`);
    }
    if (!text.trim()) {
      throw new Error(`${path} empty body page ${page}`);
    }
    const batch = JSON.parse(text);
    if (!Array.isArray(batch)) {
      throw new Error(`${path} expected array`);
    }
    items.push(...batch);
    const totalPages = Number(res.headers.get("x-wp-totalpages") || 1);
    console.error(`Fetched ${path} page ${page}/${totalPages} (+${batch.length}, total ${items.length})`);
    if (page >= totalPages) break;
    page += 1;
  }
  return items;
}

function meta(product, key) {
  const row = (product.meta_data || []).find((item) => item.key === key);
  return row?.value;
}

const categories = await getAll("/wp-json/wc/v3/products/categories", {
  hide_empty: false,
  _fields: "id,name,slug,count,parent",
});

const products = await getAll("/wp-json/wc/v3/products", {
  status: "publish",
  _fields:
    "id,name,permalink,price,regular_price,stock_status,images,categories,meta_data",
});

const fryerLike = categories.filter((category) =>
  /قلاي|fryer|air.?fry/i.test(`${category.name} ${category.slug || ""}`),
);
const topCats = [...categories].sort((a, b) => b.count - a.count).slice(0, 25);

const issues = [];
let missingImage = 0;
let missingPrice = 0;
let outOfStock = 0;
let noCats = 0;
const syncStats = { show: 0, hide: 0, no: 0, unknown: 0 };
const byCat = new Map();
const fbKeys = new Set();

for (const product of products) {
  const img = product.images?.[0]?.src;
  const price = product.price || product.regular_price;
  const cats = product.categories || [];

  if (!img) {
    missingImage += 1;
    if (issues.length < 80) {
      issues.push({
        id: product.id,
        name: product.name,
        issue: "no_image",
        permalink: product.permalink,
      });
    }
  }
  if (!price || Number(price) <= 0) {
    missingPrice += 1;
    if (issues.length < 80) {
      issues.push({
        id: product.id,
        name: product.name,
        issue: "no_price",
        permalink: product.permalink,
      });
    }
  }
  if (product.stock_status !== "instock") outOfStock += 1;
  if (!cats.length) {
    noCats += 1;
    if (issues.length < 80) {
      issues.push({
        id: product.id,
        name: product.name,
        issue: "no_category",
        permalink: product.permalink,
      });
    }
  }

  for (const category of cats) {
    byCat.set(category.name, (byCat.get(category.name) || 0) + 1);
  }

  const syncEnabled = meta(product, "_wc_facebook_sync_enabled");
  const visibility = meta(product, "_wc_facebook_visibility");
  if (syncEnabled === "no" || syncEnabled === false || syncEnabled === "0") syncStats.no += 1;
  else if (visibility === "hidden" || visibility === false) syncStats.hide += 1;
  else if (syncEnabled === "yes" || syncEnabled === true || syncEnabled === "1") syncStats.show += 1;
  else syncStats.unknown += 1;
}

for (const product of products.slice(0, 150)) {
  for (const row of product.meta_data || []) {
    if (/facebook|fb_/i.test(row.key)) {
      fbKeys.add(`${row.key}=${JSON.stringify(row.value).slice(0, 120)}`);
    }
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  store: base,
  totals: {
    categories: categories.length,
    publishedProducts: products.length,
    missingImage,
    missingPrice,
    outOfStock,
    noCats,
    catalogReadyEstimate: products.length - missingImage - missingPrice - noCats,
  },
  syncStats,
  note:
    "syncStats.unknown usually means Meta plugin default (sync and show). Explicit yes/no only appears when overridden per product.",
  facebookMetaSample: [...fbKeys].slice(0, 40),
  fryerCategories: fryerLike.map((category) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    count: category.count,
    parent: category.parent,
  })),
  topCategoriesByCount: topCats,
  productsPerCategoryTop: [...byCat.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([name, count]) => ({ name, count })),
  sampleIssues: issues,
};

const outPath = resolve("scripts/meta-catalog-audit-report.json");
writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));
console.error(`Wrote ${outPath}`);
