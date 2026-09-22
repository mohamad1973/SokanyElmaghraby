import "server-only";

import { extractModelFromTitle } from "@/lib/product-display-code";

const siteUrl = process.env.WOOCOMMERCE_STORE_URL || "https://sokany-eg.com";
const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY;
const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET;

const PRODUCT_FIELDS =
  "id,name,sku,manage_stock,stock_quantity,low_stock_amount,stock_status,categories";
const CATEGORY_FIELDS = "id,name,parent,count";

export type ReorderProduct = {
  id: number;
  name: string;
  sku: string;
  model: string;
  stockQuantity: number;
  threshold: number;
  stockStatus: string;
  manageStock: boolean;
  isAtOrBelowThreshold: boolean;
  suggestedTransferQty: number;
  categoryIds: number[];
  categoryNames: string;
};

export type ReorderCategory = {
  id: number;
  name: string;
  parent: number;
  count: number;
};

export type StockStatusFilter = "instock" | "outofstock";

type WooCategoryRef = {
  id: number;
  name: string;
  slug?: string;
};

type WooStockProduct = {
  id: number;
  name: string;
  sku?: string;
  type?: string;
  status?: string;
  manage_stock?: boolean;
  stock_quantity?: number | null;
  low_stock_amount?: number | null;
  stock_status?: string;
  categories?: WooCategoryRef[];
};

type WooCategoryRow = {
  id: number;
  name: string;
  parent?: number;
  count?: number;
};

type CatalogCache = {
  at: number;
  products: ReorderProduct[];
  categories: ReorderCategory[];
};

const CACHE_MS = 5 * 60 * 1000;
let catalogCache: CatalogCache | null = null;

function hasWooCredentials() {
  return Boolean(siteUrl && consumerKey && consumerSecret);
}

function authHeader() {
  return `Basic ${Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64")}`;
}

async function readJsonBody<T>(response: Response, label: string): Promise<T> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    throw new Error(`WooCommerce ${response.status}: رد فارغ عند جلب ${label}.`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`WooCommerce ${response.status}: رد غير صالح عند جلب ${label}.`);
  }
}

async function wooGetPage(page: number): Promise<WooStockProduct[]> {
  if (!hasWooCredentials()) {
    return [];
  }

  const url = new URL("/wp-json/wc/v3/products", siteUrl);
  url.searchParams.set("per_page", "100");
  url.searchParams.set("page", String(page));
  url.searchParams.set("status", "publish");
  url.searchParams.set("orderby", "title");
  url.searchParams.set("order", "asc");
  url.searchParams.set("_fields", PRODUCT_FIELDS);

  const response = await fetch(url, {
    headers: { Authorization: authHeader() },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `WooCommerce ${response.status}: تعذر جلب المنتجات للمخزون. ${body.slice(0, 120)}`,
    );
  }

  return readJsonBody<WooStockProduct[]>(response, "المنتجات");
}

async function wooGetCategories(): Promise<ReorderCategory[]> {
  if (!hasWooCredentials()) {
    return [];
  }

  const all: ReorderCategory[] = [];
  let page = 1;

  while (page <= 20) {
    const url = new URL("/wp-json/wc/v3/products/categories", siteUrl);
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));
    url.searchParams.set("hide_empty", "false");
    url.searchParams.set("orderby", "name");
    url.searchParams.set("order", "asc");
    url.searchParams.set("_fields", CATEGORY_FIELDS);

    const response = await fetch(url, {
      headers: { Authorization: authHeader() },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`WooCommerce ${response.status}: تعذر جلب التصنيفات.`);
    }

    const batch = await readJsonBody<WooCategoryRow[]>(response, "التصنيفات");
    if (!batch.length) {
      break;
    }

    for (const category of batch) {
      all.push({
        id: category.id,
        name: category.name,
        parent: category.parent || 0,
        count: category.count || 0,
      });
    }

    if (batch.length < 100) {
      break;
    }

    page += 1;
  }

  return all.sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

function mapReorderProduct(product: WooStockProduct): ReorderProduct {
  const manageStock = Boolean(product.manage_stock);
  const stockQuantity = Number(product.stock_quantity ?? 0);
  const thresholdRaw = product.low_stock_amount;
  const threshold =
    thresholdRaw === null || thresholdRaw === undefined
      ? 0
      : Math.max(0, Number(thresholdRaw));

  const qty = Number.isFinite(stockQuantity) ? stockQuantity : 0;
  const thresholdSafe = Number.isFinite(threshold) ? threshold : 0;
  const isAtOrBelowThreshold = thresholdSafe > 0 && qty <= thresholdSafe;
  const suggestedTransferQty = isAtOrBelowThreshold ? Math.max(0, thresholdSafe - qty) : 0;
  const categories = product.categories || [];
  const sku = product.sku || `TOOLIANO-${product.id}`;
  const model = extractModelFromTitle(product.name) || sku;

  return {
    id: product.id,
    name: product.name,
    sku,
    model,
    stockQuantity: qty,
    threshold: thresholdSafe,
    stockStatus: product.stock_status || (qty > 0 ? "instock" : "outofstock"),
    manageStock,
    isAtOrBelowThreshold,
    suggestedTransferQty,
    categoryIds: categories.map((category) => category.id),
    categoryNames: categories.map((category) => category.name).join("، "),
  };
}

function matchesStockStatus(stockStatus: string, filter: StockStatusFilter) {
  if (filter === "instock") {
    return stockStatus === "instock";
  }

  return stockStatus === "outofstock" || stockStatus === "onbackorder";
}

async function loadFullCatalog(): Promise<{ products: ReorderProduct[]; categories: ReorderCategory[] }> {
  if (catalogCache && Date.now() - catalogCache.at < CACHE_MS) {
    return { products: catalogCache.products, categories: catalogCache.categories };
  }

  const [categories, allProducts] = await Promise.all([
    wooGetCategories(),
    (async () => {
      const all: ReorderProduct[] = [];
      let page = 1;

      while (page <= 50) {
        const batch = await wooGetPage(page);
        if (!batch.length) {
          break;
        }

        for (const product of batch) {
          if (!product?.id) continue;
          all.push(mapReorderProduct(product));
        }

        if (batch.length < 100) {
          break;
        }

        page += 1;
      }

      return all;
    })(),
  ]);

  catalogCache = { at: Date.now(), products: allProducts, categories };
  return { products: allProducts, categories };
}

export function invalidateReorderCatalogCache() {
  catalogCache = null;
}

export async function getReorderProducts(options?: {
  lowOnly?: boolean;
  search?: string;
  categoryId?: number;
  stockStatus?: StockStatusFilter;
  bypassCache?: boolean;
}): Promise<{ products: ReorderProduct[]; categories: ReorderCategory[]; fetchedAt: string }> {
  if (!hasWooCredentials()) {
    throw new Error(
      "مفاتيح WooCommerce غير موجودة. أضف WOOCOMMERCE_STORE_URL و Consumer Key/Secret ثم أعد النشر.",
    );
  }

  if (options?.bypassCache) {
    catalogCache = null;
  }

  const { products: catalogProducts, categories } = await loadFullCatalog();

  let products = catalogProducts;
  const search = options?.search?.trim().toLowerCase();
  const categoryId = options?.categoryId;
  const stockStatus = options?.stockStatus;

  if (categoryId && Number.isFinite(categoryId) && categoryId > 0) {
    products = products.filter((item) => item.categoryIds.includes(categoryId));
  }

  if (stockStatus) {
    products = products.filter((item) => matchesStockStatus(item.stockStatus, stockStatus));
  }

  if (search) {
    products = products.filter(
      (item) =>
        item.name.toLowerCase().includes(search) ||
        item.sku.toLowerCase().includes(search) ||
        item.model.toLowerCase().includes(search),
    );
  }

  if (options?.lowOnly) {
    products = products.filter((item) => item.isAtOrBelowThreshold);
  }

  products = [...products].sort((a, b) => {
    if (a.isAtOrBelowThreshold !== b.isAtOrBelowThreshold) {
      return a.isAtOrBelowThreshold ? -1 : 1;
    }

    return a.name.localeCompare(b.name, "ar");
  });

  return { products, categories, fetchedAt: new Date().toISOString() };
}

export async function updateProductReorderThreshold(
  productId: number,
  threshold: number,
): Promise<{ ok: true; product: ReorderProduct } | { ok: false; message: string }> {
  if (!hasWooCredentials()) {
    return { ok: false, message: "مفاتيح WooCommerce غير موجودة." };
  }

  if (!Number.isFinite(productId) || productId < 1) {
    return { ok: false, message: "معرّف المنتج غير صالح." };
  }

  const safeThreshold = Math.max(0, Math.floor(threshold));
  const url = new URL(`/wp-json/wc/v3/products/${productId}`, siteUrl);
  url.searchParams.set("_fields", PRODUCT_FIELDS);

  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        manage_stock: true,
        low_stock_amount: safeThreshold,
      }),
      cache: "no-store",
    });

    const body = await response.text().catch(() => "");

    if (!response.ok) {
      return { ok: false, message: `WooCommerce ${response.status}: ${body.slice(0, 220)}` };
    }

    if (!body.trim()) {
      return { ok: false, message: "تم الحفظ لكن رد WooCommerce فارغ." };
    }

    let updated: WooStockProduct;
    try {
      updated = JSON.parse(body) as WooStockProduct;
    } catch {
      return { ok: false, message: "تم الحفظ لكن تعذر قراءة رد WooCommerce." };
    }

    const mapped = mapReorderProduct({ ...updated, manage_stock: true });
    invalidateReorderCatalogCache();
    return { ok: true, product: mapped };
  } catch {
    return { ok: false, message: "تعذر الاتصال بـ WooCommerce." };
  }
}
