import "server-only";

import { getPrismaClient, isDatabaseConfigured } from "./db";

const siteUrl = process.env.WOOCOMMERCE_STORE_URL || "https://sokany-eg.com";
const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY;
const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET;
const syncStateId = "orders";

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
  warning?: string;
  lastSuccessAt?: string | null;
  lastAttemptAt?: string | null;
  source?: "mysql" | "woocommerce";
};

export type OrdersSyncResult = {
  ok: boolean;
  count: number;
  message: string;
  lastSuccessAt?: string | null;
  lastAttemptAt?: string | null;
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

type OrderSnapshotRow = {
  payload: string;
};

type OrderSyncStateRow = {
  status: string;
  message: string | null;
  lastSuccessAt: Date | string | null;
  lastAttemptAt: Date | string | null;
};

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

function normalizeDate(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  return new Date(value).toISOString();
}

function parseStoredOrder(payload: string): AdminOrder | null {
  try {
    return JSON.parse(payload) as AdminOrder;
  } catch {
    return null;
  }
}

function getPagination(query: OrdersQuery) {
  const perPage = Math.min(Math.max(Number(query.perPage || "50") || 50, 1), 100);
  const page = Math.max(Number(query.page || "1") || 1, 1);

  return {
    limit: perPage,
    offset: (page - 1) * perPage,
  };
}

async function ensureOrderSnapshotTables(prisma: NonNullable<ReturnType<typeof getPrismaClient>>) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`ImportedOrder\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`orderId\` INT NOT NULL,
      \`number\` VARCHAR(191) NOT NULL,
      \`customerName\` VARCHAR(255) NOT NULL,
      \`phone\` VARCHAR(100) NOT NULL,
      \`address\` TEXT NOT NULL,
      \`governorate\` VARCHAR(191) NOT NULL,
      \`area\` VARCHAR(191) NOT NULL,
      \`status\` VARCHAR(100) NOT NULL,
      \`paymentMethod\` VARCHAR(191) NOT NULL,
      \`total\` VARCHAR(100) NOT NULL,
      \`currency\` VARCHAR(20) NOT NULL,
      \`dateCreated\` DATETIME(3) NOT NULL,
      \`payload\` LONGTEXT NOT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE INDEX \`ImportedOrder_orderId_key\`(\`orderId\`),
      INDEX \`ImportedOrder_number_idx\`(\`number\`),
      INDEX \`ImportedOrder_status_idx\`(\`status\`),
      INDEX \`ImportedOrder_dateCreated_idx\`(\`dateCreated\`),
      INDEX \`ImportedOrder_phone_idx\`(\`phone\`),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`OrderSyncState\` (
      \`id\` VARCHAR(64) NOT NULL,
      \`status\` VARCHAR(32) NOT NULL,
      \`message\` LONGTEXT NULL,
      \`lastSuccessAt\` DATETIME(3) NULL,
      \`lastAttemptAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
}

async function getOrderSyncState(prisma: NonNullable<ReturnType<typeof getPrismaClient>>) {
  const rows = await prisma.$queryRaw<OrderSyncStateRow[]>`
    SELECT status, message, lastSuccessAt, lastAttemptAt
    FROM OrderSyncState
    WHERE id = 'orders'
    LIMIT 1
  `;

  return rows[0] || null;
}

async function saveOrderSyncState(
  prisma: NonNullable<ReturnType<typeof getPrismaClient>>,
  state: {
    status: "success" | "failed";
    message: string;
    lastSuccessAt?: Date | null;
  },
) {
  await prisma.$executeRaw`
    INSERT INTO OrderSyncState (id, status, message, lastSuccessAt, lastAttemptAt)
    VALUES (${syncStateId}, ${state.status}, ${state.message}, ${state.lastSuccessAt || null}, CURRENT_TIMESTAMP(3))
    ON DUPLICATE KEY UPDATE
      status = VALUES(status),
      message = VALUES(message),
      lastSuccessAt = COALESCE(VALUES(lastSuccessAt), lastSuccessAt),
      lastAttemptAt = CURRENT_TIMESTAMP(3),
      updatedAt = CURRENT_TIMESTAMP(3)
  `;
}

async function saveOrdersToSnapshot(
  prisma: NonNullable<ReturnType<typeof getPrismaClient>>,
  orders: AdminOrder[],
) {
  await Promise.all(orders.map((order) => prisma.$executeRaw`
    INSERT INTO ImportedOrder (
      orderId,
      number,
      customerName,
      phone,
      address,
      governorate,
      area,
      status,
      paymentMethod,
      total,
      currency,
      dateCreated,
      payload
    )
    VALUES (
      ${order.id},
      ${order.number},
      ${order.customerName},
      ${order.phone},
      ${order.address},
      ${order.governorate},
      ${order.area},
      ${order.status},
      ${order.paymentMethod},
      ${order.total},
      ${order.currency},
      ${new Date(order.dateCreated)},
      ${JSON.stringify(order)}
    )
    ON DUPLICATE KEY UPDATE
      number = VALUES(number),
      customerName = VALUES(customerName),
      phone = VALUES(phone),
      address = VALUES(address),
      governorate = VALUES(governorate),
      area = VALUES(area),
      status = VALUES(status),
      paymentMethod = VALUES(paymentMethod),
      total = VALUES(total),
      currency = VALUES(currency),
      dateCreated = VALUES(dateCreated),
      payload = VALUES(payload),
      updatedAt = CURRENT_TIMESTAMP(3)
  `));
}

async function getOrdersFromSnapshot(query: OrdersQuery = {}): Promise<AdminOrdersResult> {
  const prisma = getPrismaClient();

  if (!prisma) {
    return {
      orders: [],
      error:
        "DATABASE_URL غير موجود. أضف DATABASE_URL في Vercel حتى يتم حفظ الطلبات في MySQL ولا تختفي عند تعطل WooCommerce مؤقتاً.",
    };
  }

  await ensureOrderSnapshotTables(prisma);

  const where: string[] = [];
  const values: Array<string | number> = [];
  if (query.status && query.status !== "all") {
    where.push("status = ?");
    values.push(query.status);
  }

  if (query.search) {
    const search = `%${query.search}%`;
    where.push("(number LIKE ? OR customerName LIKE ? OR phone LIKE ? OR address LIKE ?)");
    values.push(search, search, search, search);
  }

  const { limit, offset } = getPagination(query);
  const sql = `
    SELECT payload
    FROM ImportedOrder
    ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY dateCreated DESC
    LIMIT ? OFFSET ?
  `;
  const rows = await prisma.$queryRawUnsafe<OrderSnapshotRow[]>(sql, ...values, limit, offset);
  const syncState = await getOrderSyncState(prisma);
  const warning = syncState?.status === "failed" ? syncState.message || undefined : undefined;
  const orders = rows
    .map((row) => parseStoredOrder(row.payload))
    .filter((order): order is AdminOrder => Boolean(order));

  return {
    orders,
    warning,
    lastSuccessAt: normalizeDate(syncState?.lastSuccessAt),
    lastAttemptAt: normalizeDate(syncState?.lastAttemptAt),
    source: "mysql",
  };
}

async function fetchWooOrdersPage(page: number): Promise<WooFetchResult<WooOrder[]>> {
  const params = new URLSearchParams({
    per_page: "100",
    page: String(page),
    orderby: "date",
    order: "desc",
  });

  return wooOrdersFetch<WooOrder[]>(`orders?${params.toString()}`);
}

async function getOrdersDirectlyFromWooCommerce(query: OrdersQuery = {}): Promise<AdminOrdersResult> {
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

export async function syncOrdersFromWooCommerce(): Promise<OrdersSyncResult> {
  const prisma = getPrismaClient();

  if (!prisma) {
    return {
      ok: false,
      count: 0,
      message:
        "DATABASE_URL غير موجود. لا يمكن تثبيت ظهور الطلبات بدون قاعدة MySQL محلية لحفظ آخر نسخة ناجحة.",
    };
  }

  await ensureOrderSnapshotTables(prisma);

  const syncedOrders: AdminOrder[] = [];
  let lastFailure: WooFetchFailure | null = null;

  for (let page = 1; page <= 3; page += 1) {
    let result: WooFetchResult<WooOrder[]> | null = null;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      result = await fetchWooOrdersPage(page);

      if (result.ok) {
        break;
      }
    }

    if (!result) {
      lastFailure = {
        ok: false,
        message: "تعذر جلب الطلبات من WooCommerce بعد أكثر من محاولة.",
      };
      break;
    }

    if (!result.ok) {
      lastFailure = result;
      break;
    }

    if (result.data.length === 0) {
      break;
    }

    syncedOrders.push(...result.data.map(mapOrder));

    if (result.data.length < 100) {
      break;
    }
  }

  if (lastFailure) {
    await saveOrderSyncState(prisma, {
      status: "failed",
      message: lastFailure.message,
    });

    const currentState = await getOrderSyncState(prisma);

    return {
      ok: false,
      count: syncedOrders.length,
      message: lastFailure.message,
      lastSuccessAt: normalizeDate(currentState?.lastSuccessAt),
      lastAttemptAt: normalizeDate(currentState?.lastAttemptAt),
    };
  }

  await saveOrdersToSnapshot(prisma, syncedOrders);

  const lastSuccessAt = new Date();
  const message = `تم تحديث ${syncedOrders.length} طلب من WooCommerce وحفظهم في MySQL.`;
  await saveOrderSyncState(prisma, {
    status: "success",
    message,
    lastSuccessAt,
  });

  return {
    ok: true,
    count: syncedOrders.length,
    message,
    lastSuccessAt: lastSuccessAt.toISOString(),
    lastAttemptAt: lastSuccessAt.toISOString(),
  };
}

export async function getAdminOrders(query: OrdersQuery = {}): Promise<AdminOrdersResult> {
  if (!isDatabaseConfigured()) {
    return getOrdersDirectlyFromWooCommerce(query);
  }

  const snapshotResult = await getOrdersFromSnapshot(query);

  if (snapshotResult.orders.length > 0 || snapshotResult.lastSuccessAt) {
    return snapshotResult;
  }

  const syncResult = await syncOrdersFromWooCommerce();
  const nextSnapshotResult = await getOrdersFromSnapshot(query);

  if (nextSnapshotResult.orders.length > 0) {
    return {
      ...nextSnapshotResult,
      warning: syncResult.ok ? nextSnapshotResult.warning : syncResult.message,
    };
  }

  if (!syncResult.ok) {
    return {
      ...nextSnapshotResult,
      error: syncResult.message,
    };
  }

  return nextSnapshotResult;
}

export async function getAdminOrder(id: string) {
  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();

    if (prisma) {
      await ensureOrderSnapshotTables(prisma);
      const rows = await prisma.$queryRaw<OrderSnapshotRow[]>`
        SELECT payload
        FROM ImportedOrder
        WHERE orderId = ${Number(id) || 0} OR number = ${id}
        LIMIT 1
      `;
      const storedOrder = rows[0] ? parseStoredOrder(rows[0].payload) : null;

      if (storedOrder) {
        return storedOrder;
      }
    }
  }

  const order = await wooOrdersFetch<WooOrder>(`orders/${id}`);

  if (!order.ok) {
    return null;
  }

  return mapOrder(order.data);
}
