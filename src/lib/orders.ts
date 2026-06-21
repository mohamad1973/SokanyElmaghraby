import "server-only";

const siteUrl = process.env.WOOCOMMERCE_STORE_URL || "https://sokany-eg.com";
const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY;
const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET;

type WooOrder = {
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
};

function hasWooCredentials() {
  return Boolean(siteUrl && consumerKey && consumerSecret);
}

async function wooOrdersFetch<T>(path: string): Promise<T | null> {
  if (!hasWooCredentials()) {
    return null;
  }

  const url = new URL(`/wp-json/wc/v3/${path}`, siteUrl);
  const authToken = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Authorization: `Basic ${authToken}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function mapOrder(order: WooOrder): AdminOrder {
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
  if (!hasWooCredentials()) {
    return {
      orders: [],
      error:
        "مفاتيح WooCommerce REST API غير موجودة. أضف WOOCOMMERCE_STORE_URL و WOOCOMMERCE_CONSUMER_KEY و WOOCOMMERCE_CONSUMER_SECRET في Vercel Environment Variables ثم اعمل Redeploy.",
    };
  }

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

  const orders = await wooOrdersFetch<WooOrder[]>(`orders?${params.toString()}`);

  if (!orders) {
    return {
      orders: [],
      error: "تعذر جلب الطلبات من WooCommerce. تأكد من صلاحية المفاتيح وأنها Read أو Read/Write.",
    };
  }

  return {
    orders: orders.map(mapOrder),
  };
}

export async function getAdminOrder(id: string) {
  const order = await wooOrdersFetch<WooOrder>(`orders/${id}`);

  if (!order) {
    return null;
  }

  return mapOrder(order);
}

