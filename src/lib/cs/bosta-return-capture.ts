import "server-only";

import { getPrismaClient } from "@/lib/db";
import { cairoTodayYmd } from "@/lib/cs/order-window";
import { listBostaHeadingReturns, type BostaHeadingKind } from "@/lib/shipping/bosta-client";

export type DeskReturnSource = "temima" | "eid" | "momen";
export type ReturnCaptureSource = "bosta" | DeskReturnSource;

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
  source: ReturnCaptureSource;
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
  if (!ready.length) {
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
        \`source\` VARCHAR(16) NOT NULL DEFAULT 'bosta',
        \`note\` TEXT NULL,
        \`openedAt\` DATETIME(3) NULL,
        \`capturedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`trackingNumber\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    return;
  }
  for (const sql of [
    "ALTER TABLE `CsBostaReturnCapture` ADD COLUMN `note` TEXT NULL",
    "ALTER TABLE `CsBostaReturnCapture` ADD COLUMN `openedAt` DATETIME(3) NULL",
    "ALTER TABLE `CsBostaReturnCapture` ADD COLUMN `source` VARCHAR(16) NOT NULL DEFAULT 'bosta'",
  ]) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/Duplicate column|already exists|1060/i.test(message)) throw error;
    }
  }
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
  // Keep historical captures: insert-only so reviewed rows and early-morning pulls stay.
  const matched = await matchOrders(fresh);
  let saved = 0;
  for (const row of fresh) {
    const local = matched.byTracking.get(row.trackingNumber) || matched.byNumber.get(orderDigits(row.businessReference));
    const changed = await prisma.$executeRawUnsafe(
      `INSERT INTO \`CsBostaReturnCapture\`
        (\`trackingNumber\`, \`seenDay\`, \`kind\`, \`reasonText\`, \`customerName\`, \`phone\`, \`businessReference\`, \`wooOrderNumber\`, \`confirmationId\`, \`source\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'bosta')
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

function captureSourceOf(value: unknown): ReturnCaptureSource {
  const source = String(value || "").trim();
  if (source === "temima" || source === "eid" || source === "momen") return source;
  return "bosta";
}

function deskSourceOf(shippingCompany: string | null | undefined): DeskReturnSource {
  const code = String(shippingCompany || "").trim();
  if (code === "eid") return "eid";
  if (code === "momen") return "momen";
  return "temima";
}

function deskTrackingOf(confirmationId: number, trackingNumber: string | null | undefined) {
  const tracking = String(trackingNumber || "").trim();
  return tracking || `CS-${confirmationId}`;
}

type SnapLite = { customerName?: string; phone?: string };

function snapLite(value: unknown): SnapLite {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      return snapLite(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return value as SnapLite;
}

export async function captureDeskReturnFromConfirmation(confirmationId: number) {
  try {
    const prisma = getPrismaClient();
    if (!prisma || !Number.isInteger(confirmationId) || confirmationId <= 0) return;
    await ensureBostaReturnCaptureTable();
    const rows = await prisma.$queryRawUnsafe<
      Array<{
        id: number | bigint;
        wooOrderNumber: string;
        trackingNumber: string | null;
        shippingCompany: string | null;
        fulfillmentKind: string | null;
        customerSnapshot: unknown;
        temimaSupervisorResult: string | null;
        monaSupervisorResult: string | null;
        courierOutcome: string | null;
      }>
    >(
      `SELECT id, wooOrderNumber, trackingNumber, shippingCompany, fulfillmentKind, customerSnapshot,
              temimaSupervisorResult, monaSupervisorResult, courierOutcome
       FROM CsOrderConfirmation WHERE id = ? LIMIT 1`,
      confirmationId,
    );
    const row = rows[0];
    if (!row) return;
    const snap = snapLite(row.customerSnapshot);
    const snapKind = String((snap as { fulfillmentKind?: string }).fulfillmentKind || "").trim();
    const fulfillment =
      row.fulfillmentKind === "return" || row.fulfillmentKind === "exchange"
        ? row.fulfillmentKind
        : snapKind === "return" || snapKind === "exchange"
          ? snapKind
          : null;
    const marks = [row.temimaSupervisorResult, row.monaSupervisorResult, row.courierOutcome]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    const cancelled = marks.some((mark) => mark === "return" || mark === "returned" || mark === "refused");
    const delivered = marks.some((mark) => mark === "collect" || mark === "delivered");
    let kind: BostaHeadingKind | null = null;
    if (cancelled) kind = "refused";
    else if (delivered && fulfillment) kind = fulfillment;
    if (!kind) return;

    const tracking = deskTrackingOf(Number(row.id), row.trackingNumber);
    const reason =
      kind === "exchange" ? "استبدال تم بنجاح" : kind === "return" ? "استرجاع تم بنجاح" : "الغاء / رفض استلام";
    await prisma.$executeRawUnsafe(
      `INSERT INTO \`CsBostaReturnCapture\`
        (\`trackingNumber\`, \`seenDay\`, \`kind\`, \`reasonText\`, \`customerName\`, \`phone\`, \`businessReference\`, \`wooOrderNumber\`, \`confirmationId\`, \`source\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE \`trackingNumber\` = \`trackingNumber\``,
      tracking,
      cairoTodayYmd(),
      kind,
      reason,
      String(snap.customerName || "").trim().slice(0, 191),
      String(snap.phone || "").trim().slice(0, 32),
      String(row.wooOrderNumber || ""),
      String(row.wooOrderNumber || ""),
      Number(row.id),
      deskSourceOf(row.shippingCompany),
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[cs] captureDeskReturnFromConfirmation", confirmationId, detail);
  }
}

const backfillInFlight = new Map<string, Promise<void>>();

export async function backfillDeskReturnCaptures(from: string, to: string) {
  const key = `${from}:${to}`;
  const existing = backfillInFlight.get(key);
  if (existing) {
    await existing;
    return;
  }
  const run = (async () => {
    const prisma = getPrismaClient();
    if (!prisma) return;
    await ensureBostaReturnCaptureTable();
    const ids = await prisma.$queryRawUnsafe<Array<{ id: number | bigint }>>(
      `SELECT c.id
       FROM CsOrderConfirmation c
       LEFT JOIN CsBostaReturnCapture r ON r.confirmationId = c.id
       WHERE c.status = 'CONFIRMED'
         AND r.trackingNumber IS NULL
         AND (
           c.temimaSupervisorResult = 'return'
           OR c.monaSupervisorResult = 'refused'
           OR c.courierOutcome = 'refused'
           OR (
             (c.temimaSupervisorResult = 'collect' OR c.monaSupervisorResult = 'delivered' OR c.courierOutcome = 'delivered')
             AND (
               c.fulfillmentKind IN ('return', 'exchange')
               OR JSON_UNQUOTE(JSON_EXTRACT(c.customerSnapshot, '$.fulfillmentKind')) IN ('return', 'exchange')
             )
           )
         )
         AND (
           LEFT(JSON_UNQUOTE(JSON_EXTRACT(c.customerSnapshot, '$.dateCreated')), 10) BETWEEN ? AND ?
           OR LEFT(c.confirmedAt, 10) BETWEEN ? AND ?
         )
       ORDER BY c.id DESC
       LIMIT 2000`,
      from,
      to,
      from,
      to,
    );
    for (const row of ids) {
      await captureDeskReturnFromConfirmation(Number(row.id));
    }
  })().finally(() => {
    if (backfillInFlight.get(key) === run) backfillInFlight.delete(key);
  });
  backfillInFlight.set(key, run);
  await run;
}

export async function listCapturedReturns(from: string, to: string, sources: ReturnCaptureSource[]) {
  const prisma = getPrismaClient();
  if (!prisma) return [] as StoredBostaReturn[];
  await ensureBostaReturnCaptureTable();
  const wanted = sources.length ? sources : (["bosta"] as ReturnCaptureSource[]);
  const marks = wanted.map(() => "?").join(", ");
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
      source: string | null;
    }>
  >(
    `SELECT trackingNumber, seenDay, kind, reasonText, customerName, phone, businessReference, wooOrderNumber, confirmationId, source
     FROM CsBostaReturnCapture
     WHERE seenDay >= ? AND seenDay <= ?
       AND COALESCE(NULLIF(source, ''), 'bosta') IN (${marks})
     ORDER BY seenDay DESC, trackingNumber DESC`,
    from,
    to,
    ...wanted,
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
        source: captureSourceOf(row.source),
      },
    ];
  });
}

export async function listCapturedBostaReturns(from: string, to: string) {
  return listCapturedReturns(from, to, ["bosta"]);
}
