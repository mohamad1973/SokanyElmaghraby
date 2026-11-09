import "server-only";

import { ensureBostaReturnCaptureTable } from "@/lib/cs/bosta-return-capture";
import { ensureBostaReturnProductTable } from "@/lib/cs/bosta-return-product";
import { ensureBostaReturnReviewTable } from "@/lib/cs/bosta-return-review";
import { cairoTodayYmd, cairoYmdBounds } from "@/lib/cs/order-window";
import { getPrismaClient } from "@/lib/db";

export type TechReportRow = {
  trackingNumber: string;
  wooOrderNumber: string;
  productName: string;
  receivedAt: string | null;
  gradedAt: string | null;
  first: boolean;
  second: boolean;
  scrap: boolean;
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
      deliveredToMaintenanceAt: Date | string | null;
      gradedAt: Date | string | null;
      grade: string | null;
    }>
  >(
    `SELECT p.\`trackingNumber\`, p.\`productName\`,
            COALESCE(conf.\`wooOrderNumber\`, '') AS wooOrderNumber,
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

  let rows: TechReportRow[] = productRows.map((row) => {
    const grade = String(row.grade || "").trim();
    return {
      trackingNumber: String(row.trackingNumber || "").trim(),
      wooOrderNumber: String(row.wooOrderNumber || "").trim() || String(row.trackingNumber || ""),
      productName: String(row.productName || "").trim(),
      receivedAt: isoOrNull(row.deliveredToMaintenanceAt),
      gradedAt: isoOrNull(row.gradedAt),
      first: grade === "first",
      second: grade === "second",
      scrap: grade === "scrap",
    };
  });

  if (!rows.length) {
    const reviewRows = await prisma.$queryRawUnsafe<
      Array<{
        trackingNumber: string;
        wooOrderNumber: string | null;
        deliveredToMaintenanceAt: Date | string | null;
        gradedAt: Date | string | null;
        grade: string | null;
      }>
    >(
      `SELECT r.\`trackingNumber\`,
              COALESCE(conf.\`wooOrderNumber\`, '') AS wooOrderNumber,
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
    rows = reviewRows.map((row) => {
      const grade = String(row.grade || "").trim();
      return {
        trackingNumber: String(row.trackingNumber || "").trim(),
        wooOrderNumber: String(row.wooOrderNumber || "").trim() || String(row.trackingNumber || ""),
        productName: "",
        receivedAt: isoOrNull(row.deliveredToMaintenanceAt),
        gradedAt: isoOrNull(row.gradedAt),
        first: grade === "first",
        second: grade === "second",
        scrap: grade === "scrap",
      };
    });
  }

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
