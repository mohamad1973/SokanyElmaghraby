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

const summary = JSON.parse(
  readFileSync(resolve("scripts/meta-air-fryer-product-set.json"), "utf8"),
);

const targets = summary.products.filter((product) => product.catalogReady);
const results = [];

for (const product of targets) {
  const res = await fetch(`${base}/wp-json/wc/v3/products/${product.id}`, {
    method: "PUT",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      meta_data: [
        { key: "_wc_facebook_sync_enabled_v2", value: "yes" },
        { key: "_wc_facebook_sync_enabled", value: "yes" },
        { key: "fb_visibility", value: "yes" },
      ],
    }),
  });
  const body = await res.json();
  results.push({
    id: product.id,
    name: product.name,
    status: res.status,
    ok: res.ok,
    sync: (body.meta_data || []).find((row) => row.key === "_wc_facebook_sync_enabled_v2")
      ?.value,
    visibility: (body.meta_data || []).find((row) => row.key === "fb_visibility")?.value,
  });
}

const out = {
  updatedAt: new Date().toISOString(),
  count: results.length,
  results,
};

writeFileSync(
  resolve("scripts/meta-air-fryer-sync-enable-result.json"),
  JSON.stringify(out, null, 2),
  "utf8",
);
console.log(JSON.stringify(out, null, 2));
