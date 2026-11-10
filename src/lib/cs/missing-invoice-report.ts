import "server-only";

import { ensureCsTables } from "@/lib/cs/agents";
import { CS_CONFIRMATION_STATUS } from "@/lib/cs/checklist";
import { cairoTodayYmd, cairoYmdBounds, cairoYmdFromIso } from "@/lib/cs/order-window";
import { getPrismaClient } from "@/lib/db";

export type MissingInvoiceReportRow = {
  confirmationId: number;
  wooOrderNumber: string;
  customerName: string;
  phone: string;
  shippingLabel: string;
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

function isoOrNull(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value);
  if (!text || text.startsWith("0000")) return null;
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function getMissingInvoiceReport(dateFromInput?: string, dateToInput?: string) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureCsTables();

  const dateFrom = isYmd(dateFromInput) ? dateFromInput : cairoTodayYmd();
  let dateTo = isYmd(dateToInput) ? dateToInput : dateFrom;
  if (dateTo < dateFrom) dateTo = dateFrom;
  const fromBounds = cairoYmdBounds(dateFrom);
  const toBounds = cairoYmdBounds(dateTo);
  if (!fromBounds || !toBounds) return { ok: false as const, message: "تاريخ غير صالح." };

  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: number;
      wooOrderNumber: string;
      customerSnapshot: unknown;
      shippingCompany: string | null;
      confirmedAt: Date | string | null;
      distributorName: string | null;
    }>
  >(
    `SELECT c.\`id\`, c.\`wooOrderNumber\`, c.\`customerSnapshot\`, c.\`shippingCompany\`, c.\`confirmedAt\`,
            a.\`name\` AS distributorName
     FROM \`CsOrderConfirmation\` c
     LEFT JOIN \`CsAgent\` a ON a.\`id\` = c.\`assignedAgentId\`
     WHERE c.\`status\` = ?
       AND c.\`confirmedAt\` IS NOT NULL
       AND c.\`confirmedAt\` >= ?
       AND c.\`confirmedAt\` < ?
       AND (c.\`invoiceNumber\` IS NULL OR TRIM(c.\`invoiceNumber\`) = '')
     ORDER BY c.\`confirmedAt\` DESC, c.\`id\` DESC
     LIMIT 5000`,
    CS_CONFIRMATION_STATUS.CONFIRMED,
    fromBounds.start,
    toBounds.endExclusive,
  );

  const items: MissingInvoiceReportRow[] = rows.map((row) => {
    const confirmedAt = isoOrNull(row.confirmedAt);
    return {
      confirmationId: Number(row.id),
      wooOrderNumber: String(row.wooOrderNumber || "").trim() || String(row.id),
      customerName: customerNameOf(row.customerSnapshot),
      phone: phoneOf(row.customerSnapshot),
      shippingLabel: shippingLabelOf(row.shippingCompany),
      confirmedAt,
      confirmedDay: (confirmedAt && cairoYmdFromIso(confirmedAt)) || dateFrom,
      distributorName: String(row.distributorName || "").trim() || "—",
    };
  });

  return {
    ok: true as const,
    dateFrom,
    dateTo,
    count: items.length,
    rows: items,
  };
}
