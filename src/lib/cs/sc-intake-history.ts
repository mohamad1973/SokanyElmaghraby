import "server-only";

import { SHIPPING_COMPANY_LABEL } from "@/lib/cs/checklist";
import { ensureCsTables } from "@/lib/cs/agents";
import { getPrismaClient } from "@/lib/db";
import { listWooOrdersByPhone } from "@/lib/orders";
import { listBostaDeliveriesByPhone } from "@/lib/shipping/bosta-client";
import { getBostaStatusLabelAr } from "@/lib/shipping/bosta-zones";

function normalizeScPhone(value: string) {
  return String(value || "").replace(/\D/g, "");
}

const WOO_STATUS_AR: Record<string, string> = {
  pending: "قيد الانتظار",
  processing: "جاري التجهيز",
  "on-hold": "معلّق",
  completed: "مكتمل",
  cancelled: "ملغي",
  refunded: "مسترجع",
  failed: "فشل",
};

function last10(phone: string) {
  return normalizeScPhone(phone).slice(-10);
}

function snapItems(raw: unknown): Array<{ name: string; quantity: number; total: string }> {
  const snap = (raw || {}) as { items?: Array<{ name?: unknown; quantity?: unknown; total?: unknown }> };
  return (Array.isArray(snap.items) ? snap.items : []).map((item) => ({
    name: String(item.name || "").trim() || "صنف",
    quantity: Math.max(1, Number(item.quantity) || 1),
    total: String(item.total || ""),
  }));
}

function temimaLabel(value: string | null) {
  if (value === "collect") return "تم بنجاح";
  if (value === "return") return "الغاء";
  if (value === "postpone") return "مؤجل";
  return "لم يسجل";
}

function courierLabel(value: string | null) {
  if (value === "delivered") return "المندوب: تم التسليم";
  if (value === "refused") return "المندوب: رفض";
  if (value === "postponed") return "المندوب: تأجيل";
  return "";
}

async function listCsOrdersByPhone(phone: string) {
  const prisma = getPrismaClient();
  if (!prisma) return [];
  await ensureCsTables();
  const tail = last10(phone);
  if (tail.length < 10) return [];
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: number;
      wooOrderId: number;
      wooOrderNumber: string;
      shippingCompany: string | null;
      trackingNumber: string | null;
      bostaStatus: string | null;
      courierOutcome: string | null;
      temimaSupervisorResult: string | null;
      customerSnapshot: unknown;
      confirmedAt: Date | string | null;
    }>
  >(
    `SELECT id, wooOrderId, wooOrderNumber, shippingCompany, trackingNumber, bostaStatus, courierOutcome,
            temimaSupervisorResult, customerSnapshot, confirmedAt
     FROM CsOrderConfirmation
     WHERE CAST(customerSnapshot AS CHAR) LIKE ?
     ORDER BY id DESC
     LIMIT 40`,
    `%${tail}%`,
  );
  return rows
    .filter((row) => {
      const snap = (row.customerSnapshot || {}) as { phone?: unknown };
      const phoneTail = String(snap.phone || "").replace(/\D/g, "").slice(-10);
      return !phoneTail || phoneTail === tail;
    })
    .map((row) => {
      const snap = (row.customerSnapshot || {}) as {
        customerName?: unknown;
        phone?: unknown;
        address?: unknown;
        total?: unknown;
        dateCreated?: unknown;
        governorate?: unknown;
        area?: unknown;
      };
      const company = String(row.shippingCompany || "bosta");
      const official =
        company === "sayed_temima"
          ? temimaLabel(row.temimaSupervisorResult)
          : company === "bosta"
            ? getBostaStatusLabelAr(String(row.bostaStatus || ""))
            : courierLabel(row.courierOutcome) || temimaLabel(row.temimaSupervisorResult);
      return {
        confirmationId: Number(row.id),
        wooOrderId: Number(row.wooOrderId),
        wooOrderNumber: row.wooOrderNumber,
        shippingCompany: company,
        shippingLabel: SHIPPING_COMPANY_LABEL[company] || company,
        trackingNumber: row.trackingNumber || "",
        statusLabel: official || "بدون حالة",
        customerName: String(snap.customerName || ""),
        phone: String(snap.phone || ""),
        address: String(snap.address || ""),
        governorate: String(snap.governorate || ""),
        area: String(snap.area || ""),
        total: String(snap.total || ""),
        dateCreated: String(snap.dateCreated || row.confirmedAt || ""),
        items: snapItems(row.customerSnapshot),
      };
    });
}

export async function loadScPhoneHistory(phone: string) {
  const digits = normalizeScPhone(phone);
  const [woo, cs, bosta] = await Promise.all([
    listWooOrdersByPhone(digits).catch(() => ({ orders: [], error: "تعذر جلب أوردرات الموقع." })),
    listCsOrdersByPhone(digits).catch(() => []),
    listBostaDeliveriesByPhone(digits).catch(() => ({ shipments: [], error: "تعذر جلب شحنات بوسطة." })),
  ]);
  const siteOrders = woo.orders.map((order) => ({
    wooOrderId: order.id,
    wooOrderNumber: order.number,
    confirmationId: cs.find((row) => row.wooOrderNumber === order.number || row.wooOrderId === order.id)?.confirmationId || null,
    dateCreated: order.dateCreated,
    status: order.status,
    statusLabel: WOO_STATUS_AR[order.status] || order.status,
    customerName: order.customerName,
    phone: order.phone,
    address: [order.address, order.area, order.governorate].filter(Boolean).join(" — "),
    total: order.total,
    currency: order.currency,
    items: order.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      total: item.total,
    })),
  }));
  const pick = (...values: Array<string | null | undefined>) =>
    values.map((value) => String(value || "").trim()).find((value) => value && value !== "غير محدد") || "";
  const site = siteOrders[0];
  const csRow = cs[0];
  const bostaRow = bosta.shipments[0];
  const localPhone = digits.length === 11 && digits.startsWith("01") ? digits : digits.slice(-10).length === 10 ? `0${digits.slice(-10)}` : digits;
  return {
    siteOrders,
    siteError: woo.error || "",
    csOrders: cs,
    bostaShipments: bosta.shipments,
    bostaError: bosta.error || "",
    profile: {
      name: pick(site?.customerName, csRow?.customerName, bostaRow?.customerName),
      phone: pick(site?.phone, csRow?.phone, bostaRow?.phone, localPhone),
      address: pick(
        site?.address,
        [csRow?.address, csRow?.area, csRow?.governorate].filter(Boolean).join(" — "),
        bostaRow?.address,
      ),
    },
  };
}

export type ScPhoneHistory = Awaited<ReturnType<typeof loadScPhoneHistory>>;
