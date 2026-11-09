import "server-only";

import { ensureBostaReturnCaptureTable } from "@/lib/cs/bosta-return-capture";
import { ensureBostaReturnProductTable } from "@/lib/cs/bosta-return-product";
import { ensureBostaReturnReviewTable } from "@/lib/cs/bosta-return-review";
import { getPrismaClient } from "@/lib/db";

export type CustomerReturnWaybillNotice = {
  trackingNumber: string;
  confirmationId: number | null;
  wooOrderNumber: string;
  productName: string;
};

export type PendingMaintenanceNotice = {
  trackingNumber: string;
  confirmationId: number | null;
  wooOrderNumber: string;
  productName: string;
  productId: number | null;
};

/** Returns awaiting outbound waybill after inspect chose «يعود إلى العميل». */
export async function listCustomerReturnWaybillNotices(): Promise<CustomerReturnWaybillNotice[]> {
  const prisma = getPrismaClient();
  if (!prisma) return [];
  await ensureBostaReturnCaptureTable();
  await ensureBostaReturnReviewTable();
  await ensureBostaReturnProductTable();

  const fromReview = await prisma.$queryRawUnsafe<
    Array<{
      trackingNumber: string;
      confirmationId: number | bigint | null;
      wooOrderNumber: string | null;
    }>
  >(
    `SELECT r.\`trackingNumber\`, c.\`confirmationId\`,
            COALESCE(conf.\`wooOrderNumber\`, '') AS wooOrderNumber
     FROM \`CsBostaReturnReview\` r
     LEFT JOIN \`CsBostaReturnCapture\` c ON c.\`trackingNumber\` = r.\`trackingNumber\`
     LEFT JOIN \`CsOrderConfirmation\` conf ON conf.\`id\` = c.\`confirmationId\`
     WHERE r.\`destination\` = 'to_customer'
     ORDER BY r.\`updatedAt\` DESC
     LIMIT 200`,
  );

  const fromProducts = await prisma.$queryRawUnsafe<
    Array<{
      trackingNumber: string;
      confirmationId: number | bigint | null;
      wooOrderNumber: string | null;
      productName: string | null;
    }>
  >(
    `SELECT p.\`trackingNumber\`, c.\`confirmationId\`,
            COALESCE(conf.\`wooOrderNumber\`, '') AS wooOrderNumber,
            p.\`productName\`
     FROM \`CsBostaReturnProduct\` p
     LEFT JOIN \`CsBostaReturnCapture\` c ON c.\`trackingNumber\` = p.\`trackingNumber\`
     LEFT JOIN \`CsOrderConfirmation\` conf ON conf.\`id\` = c.\`confirmationId\`
     WHERE p.\`destination\` = 'to_customer'
     ORDER BY p.\`updatedAt\` DESC
     LIMIT 200`,
  );

  const byTracking = new Map<string, CustomerReturnWaybillNotice>();
  for (const row of fromReview) {
    const trackingNumber = String(row.trackingNumber || "").trim();
    if (!trackingNumber) continue;
    byTracking.set(trackingNumber, {
      trackingNumber,
      confirmationId: row.confirmationId == null ? null : Number(row.confirmationId),
      wooOrderNumber: String(row.wooOrderNumber || "").trim() || trackingNumber,
      productName: "",
    });
  }
  for (const row of fromProducts) {
    const trackingNumber = String(row.trackingNumber || "").trim();
    if (!trackingNumber) continue;
    const prev = byTracking.get(trackingNumber);
    const productName = String(row.productName || "").trim();
    byTracking.set(trackingNumber, {
      trackingNumber,
      confirmationId:
        row.confirmationId == null
          ? prev?.confirmationId ?? null
          : Number(row.confirmationId),
      wooOrderNumber:
        String(row.wooOrderNumber || "").trim() || prev?.wooOrderNumber || trackingNumber,
      productName: productName || prev?.productName || "",
    });
  }
  return [...byTracking.values()];
}

/** Products delivered to maintenance and still awaiting tech grade. */
export async function listPendingMaintenanceForTech(): Promise<PendingMaintenanceNotice[]> {
  const prisma = getPrismaClient();
  if (!prisma) return [];
  await ensureBostaReturnCaptureTable();
  await ensureBostaReturnProductTable();
  await ensureBostaReturnReviewTable();

  const productRows = await prisma.$queryRawUnsafe<
    Array<{
      trackingNumber: string;
      productId: number | bigint;
      productName: string | null;
      confirmationId: number | bigint | null;
      wooOrderNumber: string | null;
    }>
  >(
    `SELECT p.\`trackingNumber\`, p.\`productId\`, p.\`productName\`, c.\`confirmationId\`,
            COALESCE(conf.\`wooOrderNumber\`, '') AS wooOrderNumber
     FROM \`CsBostaReturnProduct\` p
     LEFT JOIN \`CsBostaReturnCapture\` c ON c.\`trackingNumber\` = p.\`trackingNumber\`
     LEFT JOIN \`CsOrderConfirmation\` conf ON conf.\`id\` = c.\`confirmationId\`
     WHERE p.\`destination\` = 'maintenance'
       AND p.\`deliveredToMaintenanceAt\` IS NOT NULL
       AND (p.\`grade\` IS NULL OR p.\`grade\` = '')
       AND p.\`receivedFromMaintenanceAt\` IS NULL
     ORDER BY p.\`deliveredToMaintenanceAt\` ASC
     LIMIT 300`,
  );

  if (productRows.length) {
    return productRows.map((row) => ({
      trackingNumber: String(row.trackingNumber || "").trim(),
      confirmationId: row.confirmationId == null ? null : Number(row.confirmationId),
      wooOrderNumber: String(row.wooOrderNumber || "").trim() || String(row.trackingNumber || ""),
      productName: String(row.productName || "").trim(),
      productId: Number(row.productId),
    }));
  }

  // Fallback: tracking-level reviews without per-product rows yet.
  const reviewRows = await prisma.$queryRawUnsafe<
    Array<{
      trackingNumber: string;
      confirmationId: number | bigint | null;
      wooOrderNumber: string | null;
    }>
  >(
    `SELECT r.\`trackingNumber\`, c.\`confirmationId\`,
            COALESCE(conf.\`wooOrderNumber\`, '') AS wooOrderNumber
     FROM \`CsBostaReturnReview\` r
     LEFT JOIN \`CsBostaReturnCapture\` c ON c.\`trackingNumber\` = r.\`trackingNumber\`
     LEFT JOIN \`CsOrderConfirmation\` conf ON conf.\`id\` = c.\`confirmationId\`
     WHERE r.\`destination\` = 'maintenance'
       AND r.\`deliveredToMaintenanceAt\` IS NOT NULL
       AND (r.\`grade\` IS NULL OR r.\`grade\` = '')
       AND r.\`receivedFromMaintenanceAt\` IS NULL
     ORDER BY r.\`deliveredToMaintenanceAt\` ASC
     LIMIT 300`,
  );

  return reviewRows.map((row) => ({
    trackingNumber: String(row.trackingNumber || "").trim(),
    confirmationId: row.confirmationId == null ? null : Number(row.confirmationId),
    wooOrderNumber: String(row.wooOrderNumber || "").trim() || String(row.trackingNumber || ""),
    productName: "",
    productId: null,
  }));
}
