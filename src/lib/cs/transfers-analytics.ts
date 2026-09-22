import "server-only";

import { cairoDaysAgoYmd, cairoTodayYmd } from "@/lib/cs/order-window";
import { ensureCsTables } from "@/lib/cs/agents";
import { getPrismaClient } from "@/lib/db";
import { getReorderProducts, type ReorderProduct } from "@/lib/reorder-report";

const siteUrl = process.env.WOOCOMMERCE_STORE_URL || "https://sokany-eg.com";
const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY;
const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET;

export const RETURN_REASONS = [
  "رفض استلام",
  "عنوان خاطئ",
  "تأخير التوصيل",
  "عيب صناعة",
  "منتج غير مطابق",
  "أخرى",
] as const;

export type ReturnReason = (typeof RETURN_REASONS)[number];

type WooSalesOrder = {
  id: number;
  number: string;
  status: string;
  date_created: string;
  line_items?: Array<{
    id: number;
    name: string;
    quantity: number;
    sku?: string;
    product_id?: number;
  }>;
};

export type ProductSalesRow = {
  productId: number;
  name: string;
  sku: string;
  sold30: number;
};

export type ProductMotionRow = {
  productId: number;
  name: string;
  sku: string;
  model: string;
  stockQuantity: number;
  threshold: number;
  sold30: number;
  turnover: number;
  isStagnant: boolean;
  isAtOrBelowThreshold: boolean;
  defectQty30: number;
  defectRate: number;
};

export type DeliveryStats = {
  total: number;
  delivered: number;
  returned: number;
  failed: number;
  inProgress: number;
  deliveryRate: number;
  returnRate: number;
};

export type ReturnEventRow = {
  id: number;
  wooOrderId: number | null;
  wooOrderNumber: string;
  productId: number;
  productName: string;
  sku: string;
  quantity: number;
  reason: string;
  reasonNote: string | null;
  isManufacturingDefect: boolean;
  source: string;
  createdAt: string;
};

export type RecommendationRow = {
  productId: number;
  name: string;
  sku: string;
  model: string;
  stockQuantity: number;
  sold30: number;
  turnover: number;
  reason: string;
};

type CacheEntry = { at: number; data: TransfersAnalyticsPayload };
let analyticsCache: CacheEntry | null = null;
const CACHE_MS = 10 * 60 * 1000;

export type TransfersAnalyticsPayload = {
  fetchedAt: string;
  days: number;
  delivery: DeliveryStats;
  motion: ProductMotionRow[];
  stagnant: ProductMotionRow[];
  orderMore: RecommendationRow[];
  advertise: RecommendationRow[];
  returns: ReturnEventRow[];
  reasonBreakdown: Array<{ reason: string; quantity: number }>;
};

function authHeader() {
  return `Basic ${Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64")}`;
}

function hasWooCredentials() {
  return Boolean(siteUrl && consumerKey && consumerSecret);
}

function isDeliveredStatus(status: string) {
  const s = status.toLowerCase();
  return s === "delivered" || s.includes("delivered");
}

function isReturnedStatus(status: string) {
  const s = status.toLowerCase();
  return s === "returned" || s.includes("return") || s.includes("مرتجع");
}

function isFailedStatus(status: string) {
  const s = status.toLowerCase();
  return s === "failed" || s === "cancelled" || s.includes("fail");
}

async function fetchWooOrdersPage(page: number, afterIso: string): Promise<WooSalesOrder[]> {
  if (!hasWooCredentials()) return [];
  const url = new URL("/wp-json/wc/v3/orders", siteUrl);
  url.searchParams.set("per_page", "100");
  url.searchParams.set("page", String(page));
  url.searchParams.set("orderby", "date");
  url.searchParams.set("order", "desc");
  url.searchParams.set("status", "processing,completed,on-hold");
  url.searchParams.set("after", afterIso);

  const response = await fetch(url, {
    headers: { Authorization: authHeader() },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`WooCommerce ${response.status}: تعذر جلب الأوردرات للمبيعات.`);
  }
  return (await response.json()) as WooSalesOrder[];
}

export async function getProductSalesLast30Days(): Promise<Map<number, ProductSalesRow>> {
  const map = new Map<number, ProductSalesRow>();
  if (!hasWooCredentials()) return map;

  const afterYmd = cairoDaysAgoYmd(30);
  const afterIso = new Date(`${afterYmd}T00:00:00+02:00`).toISOString();

  for (let page = 1; page <= 40; page += 1) {
    const batch = await fetchWooOrdersPage(page, afterIso);
    if (!batch.length) break;

    for (const order of batch) {
      for (const item of order.line_items || []) {
        const productId = Number(item.product_id || 0);
        if (!productId) continue;
        const qty = Number(item.quantity) || 0;
        if (qty <= 0) continue;
        const prev = map.get(productId);
        if (prev) {
          prev.sold30 += qty;
        } else {
          map.set(productId, {
            productId,
            name: item.name || `منتج #${productId}`,
            sku: item.sku || `TOOLIANO-${productId}`,
            sold30: qty,
          });
        }
      }
    }

    if (batch.length < 100) break;
  }

  return map;
}

export async function getShipmentDeliveryStats(days = 30): Promise<DeliveryStats> {
  const prisma = getPrismaClient();
  const empty: DeliveryStats = {
    total: 0,
    delivered: 0,
    returned: 0,
    failed: 0,
    inProgress: 0,
    deliveryRate: 0,
    returnRate: 0,
  };
  if (!prisma) return empty;

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  try {
    const rows = await prisma.shipment.findMany({
      where: { updatedAt: { gte: since } },
      select: { status: true },
    });
    let delivered = 0;
    let returned = 0;
    let failed = 0;
    let inProgress = 0;
    for (const row of rows) {
      const s = String(row.status || "");
      if (isDeliveredStatus(s)) delivered += 1;
      else if (isReturnedStatus(s)) returned += 1;
      else if (isFailedStatus(s)) failed += 1;
      else inProgress += 1;
    }
    const settled = delivered + returned + failed;
    const total = rows.length;
    return {
      total,
      delivered,
      returned,
      failed,
      inProgress,
      deliveryRate: settled > 0 ? delivered / settled : 0,
      returnRate: settled > 0 ? returned / settled : 0,
    };
  } catch {
    return empty;
  }
}

export async function listReturnEvents(limit = 100): Promise<ReturnEventRow[]> {
  const prisma = getPrismaClient();
  if (!prisma) return [];
  await ensureCsTables();
  try {
    const rows = await prisma.$queryRawUnsafe<
      Array<{
        id: number;
        wooOrderId: number | null;
        wooOrderNumber: string;
        productId: number;
        productName: string;
        sku: string;
        quantity: number;
        reason: string;
        reasonNote: string | null;
        isManufacturingDefect: number | boolean;
        source: string;
        createdAt: Date;
      }>
    >(
      `SELECT \`id\`, \`wooOrderId\`, \`wooOrderNumber\`, \`productId\`, \`productName\`, \`sku\`,
              \`quantity\`, \`reason\`, \`reasonNote\`, \`isManufacturingDefect\`, \`source\`, \`createdAt\`
       FROM \`CsReturnEvent\`
       ORDER BY \`createdAt\` DESC
       LIMIT ?`,
      limit,
    );
    return rows.map((r) => ({
      id: r.id,
      wooOrderId: r.wooOrderId,
      wooOrderNumber: r.wooOrderNumber || "",
      productId: r.productId,
      productName: r.productName,
      sku: r.sku,
      quantity: r.quantity,
      reason: r.reason,
      reasonNote: r.reasonNote,
      isManufacturingDefect: Boolean(r.isManufacturingDefect),
      source: r.source,
      createdAt: r.createdAt.toISOString(),
    }));
  } catch {
    return [];
  }
}

export async function createReturnEvent(input: {
  wooOrderId?: number | null;
  wooOrderNumber?: string;
  productId: number;
  productName: string;
  sku?: string;
  quantity: number;
  reason: string;
  reasonNote?: string;
  isManufacturingDefect?: boolean;
  createdByAgentId?: number | null;
}) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureCsTables();

  const productId = Number(input.productId);
  const quantity = Math.max(1, Math.floor(Number(input.quantity) || 1));
  const reason = String(input.reason || "").trim();
  if (!productId || !reason) {
    return { ok: false as const, message: "المنتج وسبب الارتجاع مطلوبان." };
  }

  const isDefect =
    Boolean(input.isManufacturingDefect) || reason === "عيب صناعة" || reason === "منتج غير مطابق";

  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO \`CsReturnEvent\`
       (\`wooOrderId\`, \`wooOrderNumber\`, \`productId\`, \`productName\`, \`sku\`, \`quantity\`,
        \`reason\`, \`reasonNote\`, \`isManufacturingDefect\`, \`source\`, \`createdByAgentId\`,
        \`createdAt\`, \`updatedAt\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, NOW(3), NOW(3))`,
      input.wooOrderId || null,
      String(input.wooOrderNumber || "").slice(0, 180),
      productId,
      String(input.productName || `منتج #${productId}`).slice(0, 180),
      String(input.sku || "").slice(0, 180),
      quantity,
      reason.slice(0, 180),
      input.reasonNote?.slice(0, 2000) || null,
      isDefect,
      input.createdByAgentId || null,
    );
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "تعذر حفظ المرتجع.",
    };
  }
}

async function defectQtyByProduct(days = 30): Promise<Map<number, number>> {
  const prisma = getPrismaClient();
  const map = new Map<number, number>();
  if (!prisma) return map;
  await ensureCsTables();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  try {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ productId: number; qty: number | bigint }>
    >(
      `SELECT \`productId\`, SUM(\`quantity\`) AS \`qty\`
       FROM \`CsReturnEvent\`
       WHERE \`isManufacturingDefect\` = true AND \`createdAt\` >= ?
       GROUP BY \`productId\``,
      since,
    );
    for (const row of rows) {
      map.set(row.productId, Number(row.qty) || 0);
    }
  } catch {
    // ignore
  }
  return map;
}

function buildMotion(
  products: ReorderProduct[],
  sales: Map<number, ProductSalesRow>,
  defects: Map<number, number>,
): ProductMotionRow[] {
  return products.map((p) => {
    const sold30 = sales.get(p.id)?.sold30 || 0;
    const stock = Math.max(0, p.stockQuantity);
    const turnover = sold30 / Math.max(stock, 1);
    const defectQty30 = defects.get(p.id) || 0;
    const defectRate = sold30 > 0 ? defectQty30 / sold30 : defectQty30 > 0 ? 1 : 0;
    const isStagnant = stock > 0 && (sold30 === 0 || turnover < 0.15);
    return {
      productId: p.id,
      name: p.name,
      sku: p.sku,
      model: p.model,
      stockQuantity: stock,
      threshold: p.threshold,
      sold30,
      turnover: Number(turnover.toFixed(3)),
      isStagnant,
      isAtOrBelowThreshold: p.isAtOrBelowThreshold,
      defectQty30,
      defectRate: Number(defectRate.toFixed(3)),
    };
  });
}

function buildRecommendations(motion: ProductMotionRow[]) {
  const orderMore: RecommendationRow[] = [];
  const advertise: RecommendationRow[] = [];

  for (const row of motion) {
    const highDemand =
      row.sold30 >= 5 &&
      (row.isAtOrBelowThreshold || row.turnover >= 1.2 || row.stockQuantity <= Math.max(2, row.threshold));
    const qualityOk = row.defectRate < 0.15;

    if (highDemand && qualityOk) {
      orderMore.push({
        productId: row.productId,
        name: row.name,
        sku: row.sku,
        model: row.model,
        stockQuantity: row.stockQuantity,
        sold30: row.sold30,
        turnover: row.turnover,
        reason:
          row.isAtOrBelowThreshold
            ? "مبيعات جيدة والمخزون عند/تحت حد الطلب"
            : "دوران مرتفع — يُفضّل زيادة التحويل",
      });
    }

    if (
      qualityOk &&
      row.stockQuantity >= 3 &&
      row.sold30 <= 2 &&
      !row.isAtOrBelowThreshold
    ) {
      advertise.push({
        productId: row.productId,
        name: row.name,
        sku: row.sku,
        model: row.model,
        stockQuantity: row.stockQuantity,
        sold30: row.sold30,
        turnover: row.turnover,
        reason: "مخزون متوفر ومبيعات ضعيفة — مناسب لحملة إعلانية",
      });
    }
  }

  orderMore.sort((a, b) => b.turnover - a.turnover || b.sold30 - a.sold30);
  advertise.sort((a, b) => b.stockQuantity - a.stockQuantity || a.sold30 - b.sold30);

  return {
    orderMore: orderMore.slice(0, 40),
    advertise: advertise.slice(0, 40),
  };
}

export async function getTransfersAnalytics(options?: {
  bypassCache?: boolean;
}): Promise<TransfersAnalyticsPayload> {
  if (!options?.bypassCache && analyticsCache && Date.now() - analyticsCache.at < CACHE_MS) {
    return analyticsCache.data;
  }

  const [stock, sales, delivery, returns, defects] = await Promise.all([
    getReorderProducts(),
    getProductSalesLast30Days(),
    getShipmentDeliveryStats(30),
    listReturnEvents(150),
    defectQtyByProduct(30),
  ]);

  const motion = buildMotion(stock.products, sales, defects).sort((a, b) => {
    if (a.isStagnant !== b.isStagnant) return a.isStagnant ? -1 : 1;
    return b.turnover - a.turnover;
  });
  const stagnant = motion.filter((m) => m.isStagnant).slice(0, 80);
  const { orderMore, advertise } = buildRecommendations(motion);

  const reasonMap = new Map<string, number>();
  for (const r of returns) {
    reasonMap.set(r.reason, (reasonMap.get(r.reason) || 0) + r.quantity);
  }
  const reasonBreakdown = [...reasonMap.entries()]
    .map(([reason, quantity]) => ({ reason, quantity }))
    .sort((a, b) => b.quantity - a.quantity);

  const data: TransfersAnalyticsPayload = {
    fetchedAt: new Date().toISOString(),
    days: 30,
    delivery,
    motion,
    stagnant,
    orderMore,
    advertise,
    returns,
    reasonBreakdown,
  };

  analyticsCache = { at: Date.now(), data };
  return data;
}

export function invalidateTransfersAnalyticsCache() {
  analyticsCache = null;
}

/** Expose today for UI labels */
export function transfersAnalyticsPeriodLabel() {
  return `${cairoDaysAgoYmd(30)} → ${cairoTodayYmd()}`;
}
