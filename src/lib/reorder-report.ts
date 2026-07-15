import "server-only";

const siteUrl = process.env.WOOCOMMERCE_STORE_URL || "https://sokany-eg.com";
const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY;
const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET;

export type ReorderProduct = {
  id: number;
  name: string;
  sku: string;
  stockQuantity: number;
  threshold: number;
  stockStatus: string;
  manageStock: boolean;
  isAtOrBelowThreshold: boolean;
  suggestedTransferQty: number;
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
};

function hasWooCredentials() {
  return Boolean(siteUrl && consumerKey && consumerSecret);
}

function authHeader() {
  return `Basic ${Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64")}`;
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

  const response = await fetch(url, {
    headers: { Authorization: authHeader() },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`WooCommerce ${response.status}: تعذر جلب المنتجات للمخزون.`);
  }

  return (await response.json()) as WooStockProduct[];
}

function mapReorderProduct(product: WooStockProduct): ReorderProduct | null {
  if (!product.manage_stock) {
    return null;
  }

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

  return {
    id: product.id,
    name: product.name,
    sku: product.sku || `SOKANY-${product.id}`,
    stockQuantity: qty,
    threshold: thresholdSafe,
    stockStatus: product.stock_status || "instock",
    manageStock: true,
    isAtOrBelowThreshold,
    suggestedTransferQty,
  };
}

export async function getReorderProducts(options?: {
  lowOnly?: boolean;
  search?: string;
}): Promise<{ products: ReorderProduct[]; fetchedAt: string }> {
  if (!hasWooCredentials()) {
    throw new Error(
      "مفاتيح WooCommerce غير موجودة. أضف WOOCOMMERCE_STORE_URL و Consumer Key/Secret ثم أعد النشر.",
    );
  }

  const all: ReorderProduct[] = [];
  let page = 1;

  while (page <= 50) {
    const batch = await wooGetPage(page);
    if (!batch.length) {
      break;
    }

    for (const product of batch) {
      const mapped = mapReorderProduct(product);
      if (mapped) {
        all.push(mapped);
      }
    }

    if (batch.length < 100) {
      break;
    }

    page += 1;
  }

  let products = all;
  const search = options?.search?.trim().toLowerCase();

  if (search) {
    products = products.filter(
      (item) =>
        item.name.toLowerCase().includes(search) || item.sku.toLowerCase().includes(search),
    );
  }

  if (options?.lowOnly) {
    products = products.filter((item) => item.isAtOrBelowThreshold);
  }

  products.sort((a, b) => {
    if (a.isAtOrBelowThreshold !== b.isAtOrBelowThreshold) {
      return a.isAtOrBelowThreshold ? -1 : 1;
    }

    return a.name.localeCompare(b.name, "ar");
  });

  return { products, fetchedAt: new Date().toISOString() };
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

    const updated = JSON.parse(body) as WooStockProduct;
    const mapped = mapReorderProduct({ ...updated, manage_stock: true });

    if (!mapped) {
      return { ok: false, message: "تم الحفظ لكن تعذر قراءة المنتج بعد التحديث." };
    }

    return { ok: true, product: mapped };
  } catch {
    return { ok: false, message: "تعذر الاتصال بـ WooCommerce." };
  }
}
