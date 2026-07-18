import "server-only";

const siteUrl = process.env.WOOCOMMERCE_STORE_URL || "https://sokany-eg.com";
const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY;
const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET;
const fawryPaymentMethod = process.env.WOO_FAWRY_PAYMENT_METHOD || "fawry";

export type CreateStoreOrderInput = {
  customerId?: number | null;
  customerEmail?: string;
  name: string;
  phone: string;
  governorate: string;
  area: string;
  address: string;
  customerNote?: string;
  paymentMethod: "cod" | "fawry";
  items: Array<{ productId: number; quantity: number }>;
};

export type CreatedWooOrder = {
  id: number;
  number: string;
  status: string;
  total: string;
  currency: string;
  paymentMethod: string;
  paymentUrl?: string;
};

function hasWooCredentials() {
  return Boolean(siteUrl && consumerKey && consumerSecret);
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "عميل",
    lastName: parts.slice(1).join(" ") || ".",
  };
}

async function wooWriteFetch<T>(
  path: string,
  init: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  if (!hasWooCredentials()) {
    return { ok: false, message: "بيانات WooCommerce غير مُعدّة على السيرفر." };
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
      let message = `WooCommerce ${response.status}`;

      try {
        const parsed = JSON.parse(body) as { message?: string };
        if (parsed.message) {
          message = parsed.message;
        }
      } catch {
        if (body) {
          message = `${message}: ${body.slice(0, 220)}`;
        }
      }

      return { ok: false, message };
    }

    return { ok: true, data: body ? (JSON.parse(body) as T) : ({} as T) };
  } catch {
    return { ok: false, message: "تعذر الاتصال بووكومرس." };
  }
}

function extractPaymentUrl(order: Record<string, unknown>): string | undefined {
  const direct = order.payment_url;
  if (typeof direct === "string" && direct.startsWith("http")) {
    return direct;
  }

  const meta = order.meta_data;
  if (Array.isArray(meta)) {
    for (const entry of meta) {
      if (!entry || typeof entry !== "object") {
        continue;
      }

      const record = entry as { key?: string; value?: unknown };
      if (
        record.key &&
        /fawry|payment_url|checkout_url/i.test(record.key) &&
        typeof record.value === "string" &&
        record.value.startsWith("http")
      ) {
        return record.value;
      }
    }
  }

  return undefined;
}

export async function createWooStoreOrder(
  input: CreateStoreOrderInput,
): Promise<{ ok: true; order: CreatedWooOrder } | { ok: false; message: string }> {
  if (!input.items.length) {
    return { ok: false, message: "السلة فارغة." };
  }

  const { firstName, lastName } = splitName(input.name);
  const isCod = input.paymentMethod === "cod";
  const paymentMethod = isCod ? "cod" : fawryPaymentMethod;
  const paymentTitle = isCod ? "كاش عند الاستلام" : "الدفع عبر فوري";
  const stateLine = [input.area, input.governorate].filter(Boolean).join(" - ");

  const payload: Record<string, unknown> = {
    payment_method: paymentMethod,
    payment_method_title: paymentTitle,
    set_paid: false,
    status: isCod ? "processing" : "pending",
    customer_id: input.customerId || 0,
    customer_note: input.customerNote || "",
    billing: {
      first_name: firstName,
      last_name: lastName,
      address_1: input.address,
      address_2: input.area,
      city: input.governorate,
      state: stateLine || input.governorate,
      country: "EG",
      email: input.customerEmail || "",
      phone: input.phone,
    },
    shipping: {
      first_name: firstName,
      last_name: lastName,
      address_1: input.address,
      address_2: input.area,
      city: input.governorate,
      state: stateLine || input.governorate,
      country: "EG",
      phone: input.phone,
    },
    line_items: input.items.map((item) => ({
      product_id: item.productId,
      quantity: item.quantity,
    })),
    meta_data: [
      { key: "_sokany_governorate", value: input.governorate },
      { key: "_sokany_area", value: input.area },
      { key: "_sokany_storefront_checkout", value: "1" },
    ],
  };

  const result = await wooWriteFetch<Record<string, unknown>>("orders", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!result.ok) {
    return result;
  }

  const order = result.data;
  const id = Number(order.id);
  const number = String(order.number || order.id || "");

  if (!Number.isFinite(id) || id < 1) {
    return { ok: false, message: "تم إنشاء الطلب لكن رقم الطلب غير صالح." };
  }

  return {
    ok: true,
    order: {
      id,
      number,
      status: String(order.status || ""),
      total: String(order.total || "0"),
      currency: String(order.currency || "EGP"),
      paymentMethod: String(order.payment_method || paymentMethod),
      paymentUrl: extractPaymentUrl(order),
    },
  };
}

export async function getWooOrderByNumberOrId(orderRef: string) {
  const trimmed = orderRef.trim();

  if (!trimmed) {
    return null;
  }

  if (/^\d+$/.test(trimmed)) {
    const byId = await wooWriteFetch<Record<string, unknown>>(`orders/${trimmed}`, { method: "GET" });
    if (byId.ok) {
      return byId.data;
    }
  }

  const byNumber = await wooWriteFetch<Array<Record<string, unknown>>>(
    `orders?search=${encodeURIComponent(trimmed)}&per_page=5`,
    { method: "GET" },
  );

  if (!byNumber.ok || !byNumber.data.length) {
    return null;
  }

  return byNumber.data.find((order) => String(order.number) === trimmed) || byNumber.data[0] || null;
}
