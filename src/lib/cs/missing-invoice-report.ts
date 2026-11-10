import "server-only";

import { ensureCsTables } from "@/lib/cs/agents";
import { CS_CONFIRMATION_STATUS } from "@/lib/cs/checklist";
import { cairoTodayYmd, cairoYmdBounds, cairoYmdFromIso } from "@/lib/cs/order-window";
import { getPrismaClient } from "@/lib/db";

const SHIPPING_CODES = new Set(["bosta", "sayed_temima", "eid", "momen"]);
const STATUS_CODES = new Set(Object.values(CS_CONFIRMATION_STATUS));

export const MISSING_INVOICE_STATUS_LABEL: Record<string, string> = {
  PENDING: "جديد",
  IN_PROGRESS: "جاري",
  CONFIRMED: "تم الحفظ",
  FAILED_CONTACT: "لم يرد",
  CANCELLED: "لاغى",
};

export type MissingInvoiceReportRow = {
  confirmationId: number;
  wooOrderNumber: string;
  customerName: string;
  phone: string;
  shippingLabel: string;
  status: string;
  statusLabel: string;
  confirmedAt: string | null;
  confirmedDay: string;
  distributorName: string;
};

function isYmd(value?: string): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function snapshotOf(snapshot: unknown): { customerName?: string; phone?: string } | null {
  if (!snapshot) return null;
  if (typeof snapshot === "string") {
    try {
      return JSON.parse(snapshot) as { customerName?: string; phone?: string };
    } catch {
      return null;
    }
  }
  if (typeof snapshot === "object") return snapshot as { customerName?: string; phone?: string };
  return null;
}

function customerNameOf(snapshot: unknown) {
  return String(snapshotOf(snapshot)?.customerName || "").trim() || "—";
}

function phoneOf(snapshot: unknown) {
  const text = String(snapshotOf(snapshot)?.phone || "").trim();
  return text && text !== "null" ? text : "";
}

function shippingLabelOf(code: string | null | undefined) {
  const value = String(code || "").trim();
  if (value === "bosta") return "بوسطة";
  if (value === "sayed_temima" || value === "temima") return "سيد تميمة";
  if (value === "eid") return "عيد";
  if (value === "momen") return "مؤمن";
  return value || "—";
}

function normalizeShipping(input?: string | null) {
  const value = String(input || "").trim();
  return SHIPPING_CODES.has(value) ? value : "";
}

function normalizeStatus(input?: string | null) {
  const value = String(input || "").trim();
  if (!value || value === "all") return "all";
  if (STATUS_CODES.has(value as (typeof CS_CONFIRMATION_STATUS)[keyof typeof CS_CONFIRMATION_STATUS])) {
    return value;
  }
  return CS_CONFIRMATION_STATUS.CONFIRMED;
}

function isoOrNull(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value);
  if (!text || text.startsWith("0000")) return null;
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function getMissingInvoiceReport(
  dateFromInput?: string,
  dateToInput?: string,
  shippingInput?: string,
  statusInput?: string,
) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureCsTables();

  const dateFrom = isYmd(dateFromInput) ? dateFromInput : cairoTodayYmd();
  let dateTo = isYmd(dateToInput) ? dateToInput : dateFrom;
  if (dateTo < dateFrom) dateTo = dateFrom;
  const fromBounds = cairoYmdBounds(dateFrom);
  const toBounds = cairoYmdBounds(dateTo);
  if (!fromBounds || !toBounds) return { ok: false as const, message: "تاريخ غير صالح." };

  const shipping = normalizeShipping(shippingInput);
  const status = normalizeStatus(statusInput);
  const useConfirmedAtOnly = status === CS_CONFIRMATION_STATUS.CONFIRMED;

  const params: unknown[] = [];
  const where: string[] = [
    "(c.`invoiceNumber` IS NULL OR TRIM(c.`invoiceNumber`) = '')",
  ];

  if (status === "all") {
    // no status constraint
  } else {
    where.push("c.`status` = ?");
    params.push(status);
  }

  if (useConfirmedAtOnly) {
    where.push("c.`confirmedAt` IS NOT NULL");
    where.push("c.`confirmedAt` >= ?");
    where.push("c.`confirmedAt` < ?");
    params.push(fromBounds.start, toBounds.endExclusive);
  } else {
    where.push("COALESCE(c.`confirmedAt`, c.`createdAt`) >= ?");
    where.push("COALESCE(c.`confirmedAt`, c.`createdAt`) < ?");
    params.push(fromBounds.start, toBounds.endExclusive);
  }

  if (shipping) {
    where.push("c.`shippingCompany` = ?");
    params.push(shipping);
  }

  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: number;
      wooOrderNumber: string;
      customerSnapshot: unknown;
      shippingCompany: string | null;
      status: string;
      confirmedAt: Date | string | null;
      createdAt: Date | string | null;
      distributorName: string | null;
    }>
  >(
    `SELECT c.\`id\`, c.\`wooOrderNumber\`, c.\`customerSnapshot\`, c.\`shippingCompany\`, c.\`status\`,
            c.\`confirmedAt\`, c.\`createdAt\`, a.\`name\` AS distributorName
     FROM \`CsOrderConfirmation\` c
     LEFT JOIN \`CsAgent\` a ON a.\`id\` = c.\`assignedAgentId\`
     WHERE ${where.join("\n       AND ")}
     ORDER BY COALESCE(c.\`confirmedAt\`, c.\`createdAt\`) DESC, c.\`id\` DESC
     LIMIT 5000`,
    ...params,
  );

  const items: MissingInvoiceReportRow[] = rows.map((row) => {
    const confirmedAt = isoOrNull(row.confirmedAt);
    const createdAt = isoOrNull(row.createdAt);
    const daySource = confirmedAt || createdAt;
    const statusCode = String(row.status || "").trim();
    return {
      confirmationId: Number(row.id),
      wooOrderNumber: String(row.wooOrderNumber || "").trim() || String(row.id),
      customerName: customerNameOf(row.customerSnapshot),
      phone: phoneOf(row.customerSnapshot),
      shippingLabel: shippingLabelOf(row.shippingCompany),
      status: statusCode,
      statusLabel: MISSING_INVOICE_STATUS_LABEL[statusCode] || statusCode || "—",
      confirmedAt,
      confirmedDay: (daySource && cairoYmdFromIso(daySource)) || dateFrom,
      distributorName: String(row.distributorName || "").trim() || "—",
    };
  });

  return {
    ok: true as const,
    dateFrom,
    dateTo,
    shipping,
    status,
    count: items.length,
    rows: items,
  };
}
