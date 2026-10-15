import "server-only";

import { getPrismaClient } from "@/lib/db";
import { cairoTodayYmd } from "@/lib/cs/order-window";
import { listBostaHeadingReturns, type BostaHeadingKind } from "@/lib/shipping/bosta-client";

export type StoredBostaReturn = {
  trackingNumber: string;
  seenDay: string;
  kind: BostaHeadingKind;
  reasonText: string;
  customerName: string;
  phone: string;
  businessReference: string;
  wooOrderNumber: string;
  confirmationId: number | null;
};

const KIND: Record<string, BostaHeadingKind> = {
  refused: "refused",
  return: "return",
  exchange: "exchange",
};

let tableReady: Promise<void> | null = null;

export async function ensureBostaReturnCaptureTable() {
  if (!tableReady) {
    tableReady = createBostaReturnCaptureTable().catch((error) => {
      tableReady = null;
      throw error;
    });
  }
  await tableReady;
}

async function createBostaReturnCaptureTable() {
  const prisma = getPrismaClient();
  if (!prisma) return;
  const ready = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT 1 AS n FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'CsBostaReturnCapture' LIMIT 1`,
  );
  if (ready.length) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`CsBostaReturnCapture\` (
      \`trackingNumber\` VARCHAR(64) NOT NULL,
      \`seenDay\` CHAR(10) NOT NULL,
      \`kind\` VARCHAR(16) NOT NULL,
      \`reasonText\` VARCHAR(191) NOT NULL DEFAULT '',
      \`customerName\` VARCHAR(191) NOT NULL DEFAULT '',
      \`phone\` VARCHAR(32) NOT NULL DEFAULT '',
      \`businessReference\` VARCHAR(191) NOT NULL DEFAULT '',
      \`wooOrderNumber\` VARCHAR(64) NOT NULL DEFAULT '',
      \`confirmationId\` INT NULL,
      \`capturedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`trackingNumber\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
}

function orderDigits(value: string) {
  return value.replace(/\D/g, "");
}

async function matchOrders(rows: Array<{ trackingNumber: string; businessReference: string }>) {
  const prisma = getPrismaClient();
  const byTracking = new Map<string, { id: number; wooOrderNumber: string }>();
  const byNumber = new Map<string, { id: number; wooOrderNumber: string }>();
  if (!prisma || !rows.length) return { byTracking, byNumber };
  const trackings = [...new Set(rows.map((row) => row.trackingNumber).filter(Boolean))];
  const numbers = [...new Set(rows.map((row) => orderDigits(row.businessReference)).filter((value) => value.length >= 3))];
  if (!trackings.length && !numbers.length) return { byTracking, byNumber };
  const found = await prisma.csOrderConfirmation.findMany({
    where: {
      OR: [
        ...(trackings.length ? [{ trackingNumber: { in: trackings } }] : []),
        ...(numbers.length ? [{ wooOrderNumber: { in: numbers } }] : []),
      ],
    },
    select: { id: true, wooOrderNumber: true, trackingNumber: true },
  });
  for (const row of found) {
    const packed = { id: row.id, wooOrderNumber: row.wooOrderNumber };
    const tracking = String(row.trackingNumber || "").trim();
    if (tracking) byTracking.set(tracking, packed);
    const digits = orderDigits(row.wooOrderNumber);
    if (digits) byNumber.set(digits, packed);
  }
  return { byTracking, byNumber };
}

export async function captureBostaHeadingReturns() {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة.", found: 0, saved: 0 };
  await ensureBostaReturnCaptureTable();
  const listed = await listBostaHeadingReturns();
  if (!listed.ok) return { ok: false as const, message: listed.message, found: 0, saved: 0 };
  const today = cairoTodayYmd();
  const fresh = listed.rows;
  if (fresh.length) {
    const keep = fresh.map((row) => row.trackingNumber);
    const marks = keep.map(() => "?").join(", ");
    await prisma.$executeRawUnsafe(
      `DELETE FROM \`CsBostaReturnCapture\` WHERE seenDay = ? AND trackingNumber NOT IN (${marks})`,
      today,
      ...keep,
    );
  }
  const matched = await matchOrders(fresh);
  let saved = 0;
  for (const row of fresh) {
    const local = matched.byTracking.get(row.trackingNumber) || matched.byNumber.get(orderDigits(row.businessReference));
    const changed = await prisma.$executeRawUnsafe(
      `INSERT INTO \`CsBostaReturnCapture\`
        (\`trackingNumber\`, \`seenDay\`, \`kind\`, \`reasonText\`, \`customerName\`, \`phone\`, \`businessReference\`, \`wooOrderNumber\`, \`confirmationId\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE \`trackingNumber\` = \`trackingNumber\``,
      row.trackingNumber,
      today,
      row.kind,
      row.reasonText,
      row.customerName,
      row.phone,
      row.businessReference,
      local?.wooOrderNumber || orderDigits(row.businessReference),
      local?.id ?? null,
    );
    if (Number(changed) > 0) saved += 1;
  }
  return { ok: true as const, message: "", found: fresh.length, saved };
}

export async function listCapturedBostaReturns(from: string, to: string) {
  const prisma = getPrismaClient();
  if (!prisma) return [] as StoredBostaReturn[];
  await ensureBostaReturnCaptureTable();
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      trackingNumber: string;
      seenDay: string;
      kind: string;
      reasonText: string;
      customerName: string;
      phone: string;
      businessReference: string;
      wooOrderNumber: string;
      confirmationId: number | bigint | null;
    }>
  >(
    `SELECT trackingNumber, seenDay, kind, reasonText, customerName, phone, businessReference, wooOrderNumber, confirmationId
     FROM CsBostaReturnCapture
     WHERE seenDay >= ? AND seenDay <= ?
     ORDER BY seenDay DESC, trackingNumber DESC`,
    from,
    to,
  );
  return rows.flatMap((row) => {
    const kind = KIND[row.kind];
    if (!kind) return [];
    return [
      {
        trackingNumber: row.trackingNumber,
        seenDay: String(row.seenDay),
        kind,
        reasonText: row.reasonText || "",
        customerName: row.customerName || "",
        phone: row.phone || "",
        businessReference: row.businessReference || "",
        wooOrderNumber: row.wooOrderNumber || "",
        confirmationId: row.confirmationId == null ? null : Number(row.confirmationId),
      },
    ];
  });
}
