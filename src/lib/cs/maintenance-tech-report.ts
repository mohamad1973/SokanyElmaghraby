import "server-only";

import { ensureBostaReturnCaptureTable } from "@/lib/cs/bosta-return-capture";
import { ensureBostaReturnProductTable } from "@/lib/cs/bosta-return-product";
import { ensureBostaReturnReviewTable } from "@/lib/cs/bosta-return-review";
import { cairoTodayYmd, cairoYmdBounds } from "@/lib/cs/order-window";
import { attachDeskTicketsToReturns } from "@/lib/cs/sc-return-tickets";
import { getPrismaClient } from "@/lib/db";

export type TechReportRow = {
  trackingNumber: string;
  wooOrderNumber: string;
  productName: string;
  customerName: string;
  statusLabel: string;
  hasTicket: boolean;
  receivedAt: string | null;
  gradedAt: string | null;
  first: boolean;
  second: boolean;
  scrap: boolean;
};

const KIND_LABEL: Record<string, string> = {
  refused: "رفض استلام",
  return: "استرجاع",
  exchange: "استبدال",
};

function isYmd(value?: string): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function isoOrNull(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value);
  if (!text || text.startsWith("0000")) return null;
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function statusOf(kind: string | null | undefined) {
  const key = String(kind || "").trim();
  return KIND_LABEL[key] || key || "—";
}

async function withTickets(
  rows: Array<
    Omit<TechReportRow, "hasTicket"> & {
      phone: string;
      confirmationId: number | null;
    }
  >,
): Promise<TechReportRow[]> {
  const attached = await attachDeskTicketsToReturns(
    rows.map((row) => ({
      trackingNumber: row.trackingNumber,
      phone: row.phone,
      wooOrderNumber: row.wooOrderNumber,
      confirmationId: row.confirmationId,
    })),
  );
  const ticketByTrack = new Map(attached.map((row) => [row.trackingNumber, Boolean(row.deskTicket)]));
  return rows.map((row) => ({
    trackingNumber: row.trackingNumber,
    wooOrderNumber: row.wooOrderNumber,
    productName: row.productName,
    customerName: row.customerName,
    statusLabel: row.statusLabel,
    hasTicket: ticketByTrack.get(row.trackingNumber) || false,
    receivedAt: row.receivedAt,
    gradedAt: row.gradedAt,
    first: row.first,
    second: row.second,
    scrap: row.scrap,
  }));
}

export async function getMaintenanceTechReport(fromYmdInput?: string, toYmdInput?: string) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };

  const fromYmd = isYmd(fromYmdInput) ? fromYmdInput : cairoTodayYmd();
  let toYmd = isYmd(toYmdInput) ? toYmdInput : fromYmd;
  if (toYmd < fromYmd) toYmd = fromYmd;
  const fromBounds = cairoYmdBounds(fromYmd);
  const toBounds = cairoYmdBounds(toYmd);
  if (!fromBounds || !toBounds) return { ok: false as const, message: "تاريخ غير صالح." };

  await ensureBostaReturnCaptureTable();
  await ensureBostaReturnProductTable();
  await ensureBostaReturnReviewTable();

  const start = fromBounds.start;
  const end = toBounds.endExclusive;

  const productRows = await prisma.$queryRawUnsafe<
    Array<{
      trackingNumber: string;
      productName: string | null;
      wooOrderNumber: string | null;
      customerName: string | null;
      phone: string | null;
      kind: string | null;
      confirmationId: number | null;
      deliveredToMaintenanceAt: Date | string | null;
      gradedAt: Date | string | null;
      grade: string | null;
    }>
  >(
    `SELECT p.\`trackingNumber\`, p.\`productName\`,
            COALESCE(NULLIF(conf.\`wooOrderNumber\`, ''), NULLIF(c.\`wooOrderNumber\`, ''), '') AS wooOrderNumber,
            COALESCE(NULLIF(c.\`customerName\`, ''), '') AS customerName,
            COALESCE(NULLIF(c.\`phone\`, ''), '') AS phone,
            COALESCE(c.\`kind\`, '') AS kind,
            c.\`confirmationId\` AS confirmationId,
            p.\`deliveredToMaintenanceAt\`, p.\`gradedAt\`, p.\`grade\`
     FROM \`CsBostaReturnProduct\` p
     LEFT JOIN \`CsBostaReturnCapture\` c ON c.\`trackingNumber\` = p.\`trackingNumber\`
     LEFT JOIN \`CsOrderConfirmation\` conf ON conf.\`id\` = c.\`confirmationId\`
     WHERE p.\`destination\` = 'maintenance'
       AND p.\`deliveredToMaintenanceAt\` IS NOT NULL
       AND p.\`deliveredToMaintenanceAt\` >= ?
       AND p.\`deliveredToMaintenanceAt\` < ?
     ORDER BY p.\`deliveredToMaintenanceAt\` ASC, p.\`trackingNumber\` ASC`,
    start,
    end,
  );

  type DraftRow = Omit<TechReportRow, "hasTicket"> & {
    phone: string;
    confirmationId: number | null;
  };

  let drafts: DraftRow[] = productRows.map((row) => {
    const grade = String(row.grade || "").trim();
    const trackingNumber = String(row.trackingNumber || "").trim();
    return {
      trackingNumber,
      wooOrderNumber: String(row.wooOrderNumber || "").trim() || trackingNumber,
      productName: String(row.productName || "").trim(),
      customerName: String(row.customerName || "").trim(),
      statusLabel: statusOf(row.kind),
      phone: String(row.phone || "").trim(),
      confirmationId: row.confirmationId == null ? null : Number(row.confirmationId),
      receivedAt: isoOrNull(row.deliveredToMaintenanceAt),
      gradedAt: isoOrNull(row.gradedAt),
      first: grade === "first",
      second: grade === "second",
      scrap: grade === "scrap",
    };
  });

  if (!drafts.length) {
    const reviewRows = await prisma.$queryRawUnsafe<
      Array<{
        trackingNumber: string;
        wooOrderNumber: string | null;
        customerName: string | null;
        phone: string | null;
        kind: string | null;
        confirmationId: number | null;
        deliveredToMaintenanceAt: Date | string | null;
        gradedAt: Date | string | null;
        grade: string | null;
      }>
    >(
      `SELECT r.\`trackingNumber\`,
              COALESCE(NULLIF(conf.\`wooOrderNumber\`, ''), NULLIF(c.\`wooOrderNumber\`, ''), '') AS wooOrderNumber,
              COALESCE(NULLIF(c.\`customerName\`, ''), '') AS customerName,
              COALESCE(NULLIF(c.\`phone\`, ''), '') AS phone,
              COALESCE(c.\`kind\`, '') AS kind,
              c.\`confirmationId\` AS confirmationId,
              r.\`deliveredToMaintenanceAt\`, r.\`gradedAt\`, r.\`grade\`
       FROM \`CsBostaReturnReview\` r
       LEFT JOIN \`CsBostaReturnCapture\` c ON c.\`trackingNumber\` = r.\`trackingNumber\`
       LEFT JOIN \`CsOrderConfirmation\` conf ON conf.\`id\` = c.\`confirmationId\`
       WHERE r.\`destination\` = 'maintenance'
         AND r.\`deliveredToMaintenanceAt\` IS NOT NULL
         AND r.\`deliveredToMaintenanceAt\` >= ?
         AND r.\`deliveredToMaintenanceAt\` < ?
       ORDER BY r.\`deliveredToMaintenanceAt\` ASC`,
      start,
      end,
    );
    drafts = reviewRows.map((row) => {
      const grade = String(row.grade || "").trim();
      const trackingNumber = String(row.trackingNumber || "").trim();
      return {
        trackingNumber,
        wooOrderNumber: String(row.wooOrderNumber || "").trim() || trackingNumber,
        productName: "",
        customerName: String(row.customerName || "").trim(),
        statusLabel: statusOf(row.kind),
        phone: String(row.phone || "").trim(),
        confirmationId: row.confirmationId == null ? null : Number(row.confirmationId),
        receivedAt: isoOrNull(row.deliveredToMaintenanceAt),
        gradedAt: isoOrNull(row.gradedAt),
        first: grade === "first",
        second: grade === "second",
        scrap: grade === "scrap",
      };
    });
  }

  const rows = await withTickets(drafts);

  const receivedCount = rows.length;
  const repairedCount = rows.filter((row) => row.first || row.second || row.scrap).length;
  const firstCount = rows.filter((row) => row.first).length;
  const secondCount = rows.filter((row) => row.second).length;
  const scrapCount = rows.filter((row) => row.scrap).length;

  return {
    ok: true as const,
    from: fromYmd,
    to: toYmd,
    summary: {
      receivedCount,
      repairedCount,
      firstCount,
      secondCount,
      scrapCount,
    },
    rows,
  };
}
