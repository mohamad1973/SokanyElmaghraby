import "server-only";

const siteUrl = process.env.WOOCOMMERCE_STORE_URL || "https://sokany-eg.com";
const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY;
const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET;

export type WooOrder = {
  id: number;
  number: string;
  status: string;
  currency: string;
  total: string;
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
  total: string;
  currency: string;
  dateCreated: string;
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

export function mapOrder(order: WooOrder): AdminOrder {
  const customerName = `${order.billing.first_name || ""} ${order.billing.last_name || ""}`.trim();

  return {
    id: order.id,
    number: order.number,
    customerName: customerName || "غير محدد",
    phone: order.billing.phone || "غير محدد",
    address: [order.billing.address_1, order.billing.address_2].filter(Boolean).join(" - ") || "غير محدد",
    governorate: order.billing.state || "غير محدد",
    area: order.billing.city || "غير محدد",
    status: order.status,
    paymentMethod: order.payment_method_title || "غير محدد",
    total: order.total,
    currency: order.currency,
    dateCreated: order.date_created,
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

  const result = await wooOrdersFetch<WooOrder[]>(`orders?${params.toString()}`);

  if (!result.ok) {
    return { orders: [], error: result.message, source: "woocommerce" };
  }

  return {
    orders: result.data.map(mapOrder),
    source: "woocommerce",
  };
}

export async function getAdminOrder(id: string) {
  const order = await wooOrdersFetch<WooOrder>(`orders/${id}`);

  if (!order.ok) {
    return null;
  }

  return mapOrder(order.data);
}
