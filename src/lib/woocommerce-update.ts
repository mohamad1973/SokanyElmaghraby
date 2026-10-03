import "server-only";

const siteUrl = process.env.WOOCOMMERCE_STORE_URL || "https://sokany-eg.com";
const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY;
const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET;

function hasWooCredentials() {
  return Boolean(siteUrl && consumerKey && consumerSecret);
}

async function wooWriteFetch<T>(path: string, init: RequestInit): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  if (!hasWooCredentials()) {
    return { ok: false, message: "WooCommerce credentials missing." };
  }

  const url = new URL(`/wp-json/wc/v3/${path}`, siteUrl);
  const authToken = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");

  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Basic ${authToken}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
      cache: "no-store",
    });

    const body = await response.text().catch(() => "");

    if (!response.ok) {
      return { ok: false, message: `WooCommerce ${response.status}: ${body.slice(0, 220)}` };
    }

    return { ok: true, data: body ? (JSON.parse(body) as T) : ({} as T) };
  } catch {
    return { ok: false, message: "Failed to connect to WooCommerce." };
  }
}

export async function updateWooOrderStatus(orderId: number, status: "completed" | "processing" | "cancelled", note?: string) {
  const result = await wooWriteFetch<{ id: number; status: string }>(`orders/${orderId}`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });

  if (!result.ok) {
    return result;
  }

  if (note) {
    await wooWriteFetch(`orders/${orderId}/notes`, {
      method: "POST",
      body: JSON.stringify({ note, customer_note: false }),
    });
  }

  return result;
}

export async function markWooOrderDelivered(orderId: number, deliveryNote: string) {
  return updateWooOrderStatus(orderId, "completed", deliveryNote);
}

type WooLine = {
  id?: number;
  product_id?: number;
  name?: string;
  sku?: string;
  quantity?: number;
  price?: number | string;
  total?: string;
};

export async function appendWooOrderProduct(orderId: number, productId: number, quantity: number) {
  const current = await wooWriteFetch<{ line_items?: WooLine[]; total?: string }>(`orders/${orderId}`, { method: "GET" });
  if (!current.ok) return current;
  const existing = (current.data.line_items || []).map((line) => ({
    id: line.id,
    product_id: line.product_id,
    quantity: line.quantity,
  }));
  const saved = await wooWriteFetch<{ line_items?: WooLine[]; total?: string }>(`orders/${orderId}`, {
    method: "PUT",
    body: JSON.stringify({
      line_items: [...existing, { product_id: productId, quantity }],
    }),
  });
  if (!saved.ok) return saved;
  return {
    ok: true as const,
    total: String(saved.data.total || current.data.total || "0"),
    items: (saved.data.line_items || []).map(mapWooLine),
  };
}

function mapWooLine(line: WooLine) {
  return {
    name: String(line.name || ""),
    sku: String(line.sku || ""),
    quantity: Number(line.quantity || 1),
    price: Number(line.price || 0),
    total: String(line.total || "0"),
  };
}

export async function removeWooOrderProduct(orderId: number, productName: string, productId: number) {
  const current = await wooWriteFetch<{ line_items?: WooLine[]; total?: string }>(`orders/${orderId}`, { method: "GET" });
  if (!current.ok) return current;
  const lines = current.data.line_items || [];
  const match = lines.find((line) =>
    (productId > 0 && Number(line.product_id) === productId) || String(line.name || "").trim() === productName.trim(),
  );
  if (!match?.id) return { ok: false as const, message: "الصنف مش موجود في طلب ووكومرس." };
  const saved = await wooWriteFetch<{ line_items?: WooLine[]; total?: string }>(`orders/${orderId}`, {
    method: "PUT",
    body: JSON.stringify({
      line_items: lines.map((line) =>
        line.id === match.id
          ? { id: line.id, quantity: 0 }
          : { id: line.id, product_id: line.product_id, quantity: line.quantity },
      ),
    }),
  });
  if (!saved.ok) return saved;
  return {
    ok: true as const,
    total: String(saved.data.total || "0"),
    items: (saved.data.line_items || []).filter((line) => Number(line.quantity) > 0).map(mapWooLine),
  };
}
