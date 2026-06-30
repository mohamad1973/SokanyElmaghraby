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
