import "server-only";

import { BOSTA_CITY_MAP, resolveFulfillmentMode } from "@/lib/shipping/bosta-zones";
import type { OrderShippingInfo } from "@/lib/shipping/shipments";

const siteUrl = process.env.WOOCOMMERCE_STORE_URL || "https://sokany-eg.com";
const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY;
const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET;

export type WooOrder = {
  id: number;
  number: string;
  status: string;
  currency: string;
  total: string;
  payment_method?: string;
  payment_method_title: string;
  date_created: string;
  billing: {
    first_name?: string;
    last_name?: string;
    phone?: string;
    address_1?: string;
    address_2?: string;
    city?: string;
    state?: string;
  };
  shipping?: {
    address_1?: string;
    address_2?: string;
    city?: string;
    state?: string;
  };
  meta_data?: Array<{ id?: number; key: string; value?: unknown }>;
  line_items: Array<{
    id: number;
    name: string;
    quantity: number;
    total: string;
    price: number;
    sku?: string;
  }>;
};

export type AdminOrder = {
  id: number;
  number: string;
  customerName: string;
  phone: string;
  address: string;
  governorate: string;
  area: string;
  status: string;
  paymentMethod: string;
  paymentMethodId?: string;
  total: string;
  currency: string;
  dateCreated: string;
  fulfillmentMode: "internal" | "bosta";
  shipping?: OrderShippingInfo;
  items: Array<{
    id: number;
    name: string;
    sku: string;
    quantity: number;
    total: string;
    price: number;
  }>;
};

export type OrdersQuery = {
  page?: string;
  perPage?: string;
  status?: string;
  search?: string;
  after?: string;
  before?: string;
};

export type AdminOrdersResult = {
  orders: AdminOrder[];
  error?: string;
  source?: "woocommerce";
};

type WooFetchSuccess<T> = {
  ok: true;
  data: T;
};

type WooFetchFailure = {
  ok: false;
  status?: number;
  message: string;
};

type WooFetchResult<T> = WooFetchSuccess<T> | WooFetchFailure;

function hasWooCredentials() {
  return Boolean(siteUrl && consumerKey && consumerSecret);
}

function getWooStatusMessage(status: number, body: string) {
  const suffix = body ? ` تفاصيل WooCommerce: ${body.slice(0, 220)}` : "";

  if (status === 401) {
    return `WooCommerce رفض المفاتيح 401. تأكد من Consumer Key و Consumer Secret وأن الصلاحية Read أو Read/Write.${suffix}`;
  }

  if (status === 403) {
    return `WooCommerce أو إضافة حماية في WordPress منعت الوصول 403. راجع صلاحيات REST API أو Cloudflare/Hostinger security.${suffix}`;
  }

  if (status === 404) {
    return `رابط WooCommerce REST API غير صحيح 404. تأكد من WOOCOMMERCE_STORE_URL وأن WooCommerce مفعل على الموقع.${suffix}`;
  }

  if (status >= 500) {
    return `WordPress/WooCommerce أعاد خطأ سيرفر ${status}. غالباً مشكلة مؤقتة في الاستضافة أو إضافة داخل WordPress.${suffix}`;
  }

  return `تعذر جلب الطلبات من WooCommerce. كود الاستجابة: ${status}.${suffix}`;
}

async function wooOrdersFetch<T>(path: string): Promise<WooFetchResult<T>> {
  if (!hasWooCredentials()) {
    return {
      ok: false,
      message:
        "مفاتيح WooCommerce REST API غير موجودة. أضف WOOCOMMERCE_STORE_URL و WOOCOMMERCE_CONSUMER_KEY و WOOCOMMERCE_CONSUMER_SECRET في Vercel Environment Variables ثم اعمل Redeploy.",
    };
  }

  const url = new URL(`/wp-json/wc/v3/${path}`, siteUrl);
  const authToken = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Authorization: `Basic ${authToken}`,
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const body = await response.text().catch(() => "");

      return {
        ok: false,
        status: response.status,
        message: getWooStatusMessage(response.status, body),
      };
    }

    return { ok: true, data: (await response.json()) as T };
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "انتهت مهلة الاتصال مع WooCommerce بعد 20 ثانية. غالباً الاستضافة تأخرت في الرد."
      : "تعذر الاتصال بـ WooCommerce حالياً. قد تكون مشكلة شبكة، DNS، SSL، أو حظر مؤقت من الاستضافة.";

    return { ok: false, message };
  }
}

function metaValue(meta: Array<{ key: string; value?: unknown }> | undefined, keys: string[]) {
  if (!meta?.length) return "";
  for (const key of keys) {
    const hit = meta.find((m) => m.key === key);
    const val = String(hit?.value ?? "").trim();
    if (val) return val;
  }
  return "";
}

function looksLikeLocationCode(value: string) {
  const v = value.trim();
  if (!v) return false;
  if (/^EG-?\d+/i.test(v)) return true;
  if (/^[a-f0-9]{20,}$/i.test(v)) return true;
  if (/^\d{4,}$/.test(v)) return true;
  return false;
}

function resolveArabicGovernorate(raw: string) {
  const value = raw.trim();
  if (!value || value === "غير محدد") return "";

  const direct = BOSTA_CITY_MAP[value] || BOSTA_CITY_MAP[value.toLowerCase()];
  if (direct?.nameAr) return direct.nameAr;

  const upper = value.toUpperCase().replace(/\s+/g, "");
  for (const entry of Object.values(BOSTA_CITY_MAP)) {
    const code = entry.code.toUpperCase().replace(/-/g, "");
    if (entry.code.toUpperCase() === upper || code === upper.replace(/-/g, "")) {
      return entry.nameAr;
    }
  }

  // Already Arabic / human name
  if (!looksLikeLocationCode(value)) return value;
  return value;
}

function parseStateComposite(state: string | undefined) {
  const raw = String(state || "").trim();
  if (!raw || !/[-–—]/.test(raw)) return null;
  const parts = raw.split(/\s*[-–—]\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  return { area: parts[0], governorate: parts.slice(1).join(" - ") };
}

export function mapOrder(order: WooOrder, shipping?: OrderShippingInfo): AdminOrder {
  const customerName = `${order.billing.first_name || ""} ${order.billing.last_name || ""}`.trim();
  const meta = order.meta_data || [];

  const metaGov = metaValue(meta, [
    "_sokany_governorate",
    "sokany_governorate",
    "_billing_city",
    "bosta_city_name",
  ]);
  const metaArea = metaValue(meta, [
    "_sokany_area",
    "sokany_area",
    "bosta_district_name",
    "bosta_zone_name",
  ]);

  const fromState = parseStateComposite(order.billing.state) || parseStateComposite(order.shipping?.state);

  let governorate =
    resolveArabicGovernorate(metaGov) ||
    resolveArabicGovernorate(order.billing.city || "") ||
    resolveArabicGovernorate(order.shipping?.city || "") ||
    resolveArabicGovernorate(fromState?.governorate || "") ||
    "";

  let area =
    metaArea ||
    order.billing.address_2?.trim() ||
    order.shipping?.address_2?.trim() ||
    fromState?.area ||
    "";

  // If city held a code and state had names, prefer parsed names
  if (looksLikeLocationCode(governorate) && fromState?.governorate) {
    governorate = resolveArabicGovernorate(fromState.governorate) || governorate;
  }
  if ((!area || area === "غير محدد") && fromState?.area) {
    area = fromState.area;
  }

  // Drop code-like area masquerading as district id without a name
  if (looksLikeLocationCode(area)) {
    area = fromState?.area || metaArea || "";
  }

  governorate = resolveArabicGovernorate(governorate) || governorate || "غير محدد";
  area = area.trim() || "غير محدد";

  const street =
    order.billing.address_1?.trim() ||
    order.shipping?.address_1?.trim() ||
    "غير محدد";

  return {
    id: order.id,
    number: order.number,
    customerName: customerName || "غير محدد",
    phone: order.billing.phone || "غير محدد",
    address: street,
    governorate,
    area,
    status: order.status,
    paymentMethod: order.payment_method_title || "غير محدد",
    paymentMethodId: order.payment_method || undefined,
    total: order.total,
    currency: order.currency,
    dateCreated: order.date_created,
    fulfillmentMode: resolveFulfillmentMode(governorate),
    shipping,
    items: order.line_items.map((item) => ({
      id: item.id,
      name: item.name,
      sku: item.sku || "",
      quantity: item.quantity,
      total: item.total,
      price: item.price,
    })),
  };
}

function formatOrderDateBoundary(value: string | undefined, boundary: "start" | "end") {
  if (!value) {
    return "";
  }

  const dateValue = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T${boundary === "start" ? "00:00:00.000" : "23:59:59.999"}`)
    : new Date(value);

  if (Number.isNaN(dateValue.getTime())) {
    return "";
  }

  return dateValue.toISOString();
}

import { getShipmentsByOrderIds, shipmentToOrderShipping } from "@/lib/shipping/shipments";

export async function getAdminOrders(query: OrdersQuery = {}): Promise<AdminOrdersResult> {
  const params = new URLSearchParams({
    per_page: query.perPage || "50",
    page: query.page || "1",
    orderby: "date",
    order: "desc",
  });

  if (query.status && query.status !== "all") {
    params.set("status", query.status);
  }

  if (query.search) {
    params.set("search", query.search);
  }

  const after = formatOrderDateBoundary(query.after, "start");
  const before = formatOrderDateBoundary(query.before, "end");

  if (after) {
    params.set("after", after);
  }

  if (before) {
    params.set("before", before);
  }

  const result = await wooOrdersFetch<WooOrder[]>(`orders?${params.toString()}`);

  if (!result.ok) {
    return { orders: [], error: result.message, source: "woocommerce" };
  }

  const shipmentMap = await getShipmentsByOrderIds(result.data.map((order) => order.id));

  return {
    orders: result.data.map((order) => {
      const shipment = shipmentMap.get(order.id);
      return mapOrder(order, shipment ? shipmentToOrderShipping(shipment) : undefined);
    }),
    source: "woocommerce",
  };
}

export async function getAdminOrder(id: string) {
  const order = await wooOrdersFetch<WooOrder>(`orders/${id}`);

  if (!order.ok) {
    return null;
  }

  const { getShipmentByOrderId } = await import("@/lib/shipping/shipments");
  const shipment = await getShipmentByOrderId(order.data.id);

  return mapOrder(order.data, shipment ? shipmentToOrderShipping(shipment) : undefined);
}
