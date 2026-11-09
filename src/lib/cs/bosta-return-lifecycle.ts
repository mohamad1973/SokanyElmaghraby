import "server-only";

import { getPrismaClient } from "@/lib/db";
import {
  ensureBostaReturnReviewTable,
  DEFECT_LABEL,
  type BostaReturnReview,
  type ReviewDefect,
  type ReviewGrade,
} from "@/lib/cs/bosta-return-review";
import { ensureBostaReturnCaptureTable } from "@/lib/cs/bosta-return-capture";

export type LifecycleDates = {
  openedAt: string | null;
  deliveredToMaintenanceAt: string | null;
  receivedFromMaintenanceAt: string | null;
  shelfAt: string | null;
};

export type CaptureExtras = {
  note: string;
  openedAt: string | null;
};

function isoOrNull(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value);
  if (!text || text.startsWith("0000")) return null;
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function addColumn(sql: string) {
  const prisma = getPrismaClient();
  if (!prisma) return;
  try {
    await prisma.$executeRawUnsafe(sql);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/Duplicate column|already exists|1060/i.test(message)) throw error;
  }
}

export async function ensureMaintenanceLifecycleColumns() {
  await ensureBostaReturnCaptureTable();
  await ensureBostaReturnReviewTable();
  const { ensureBostaReturnProductTable } = await import("@/lib/cs/bosta-return-product");
  await ensureBostaReturnProductTable();
  await addColumn("ALTER TABLE `CsBostaReturnCapture` ADD COLUMN `note` TEXT NULL");
  await addColumn("ALTER TABLE `CsBostaReturnCapture` ADD COLUMN `openedAt` DATETIME(3) NULL");
  await addColumn("ALTER TABLE `CsBostaReturnCapture` ADD COLUMN `source` VARCHAR(16) NOT NULL DEFAULT 'bosta'");
  await addColumn(
    "ALTER TABLE `CsBostaReturnReview` ADD COLUMN `deliveredToMaintenanceAt` DATETIME(3) NULL",
  );
  await addColumn("ALTER TABLE `CsBostaReturnReview` ADD COLUMN `grade` VARCHAR(16) NULL");
  await addColumn("ALTER TABLE `CsBostaReturnReview` ADD COLUMN `techNote` TEXT NULL");
  await addColumn(
    "ALTER TABLE `CsBostaReturnReview` ADD COLUMN `receivedFromMaintenanceAt` DATETIME(3) NULL",
  );
  await addColumn("ALTER TABLE `CsBostaReturnReview` ADD COLUMN `shelfAt` DATETIME(3) NULL");
  await addColumn("ALTER TABLE `CsBostaReturnReview` ADD COLUMN `inspectedAt` DATETIME(3) NULL");
  await addColumn("ALTER TABLE `CsBostaReturnReview` ADD COLUMN `gradedAt` DATETIME(3) NULL");
  await addColumn("ALTER TABLE `CsBostaReturnReview` ADD COLUMN `outletAt` DATETIME(3) NULL");
  await addColumn("ALTER TABLE `CsBostaReturnReview` ADD COLUMN `scrapAt` DATETIME(3) NULL");
}

export async function markReturnOpened(trackingNumber: string) {
  const prisma = getPrismaClient();
  const tracking = trackingNumber.trim();
  if (!prisma || !tracking) return { ok: false as const, message: "البوليصة ناقصة.", openedAt: null as string | null };
  await ensureMaintenanceLifecycleColumns();
  const before = await prisma.$queryRawUnsafe<Array<{ openedAt: Date | string | null }>>(
    `SELECT openedAt FROM CsBostaReturnCapture WHERE trackingNumber = ? LIMIT 1`,
    tracking,
  );
  await prisma.$executeRawUnsafe(
    `UPDATE \`CsBostaReturnCapture\`
     SET \`openedAt\` = COALESCE(\`openedAt\`, CURRENT_TIMESTAMP(3))
     WHERE \`trackingNumber\` = ?`,
    tracking,
  );
  const rows = await prisma.$queryRawUnsafe<Array<{ openedAt: Date | string | null }>>(
    `SELECT openedAt FROM CsBostaReturnCapture WHERE trackingNumber = ? LIMIT 1`,
    tracking,
  );
  if (!before[0]?.openedAt && rows[0]?.openedAt) {
    try {
      const { recordReturnTrackEvent } = await import("@/lib/cs/return-track");
      await recordReturnTrackEvent({ trackingNumber: tracking, stage: "inspect_opened" });
    } catch (error) {
      console.warn("[return-track] open event", error instanceof Error ? error.message : error);
    }
  }
  return { ok: true as const, openedAt: isoOrNull(rows[0]?.openedAt), message: "" };
}

export async function saveReturnStaffNote(trackingNumber: string, note: string) {
  const prisma = getPrismaClient();
  const tracking = trackingNumber.trim();
  if (!prisma || !tracking) return { ok: false as const, message: "البوليصة ناقصة." };
  await ensureMaintenanceLifecycleColumns();
  const exists = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT 1 AS n FROM CsBostaReturnCapture WHERE trackingNumber = ? LIMIT 1`,
    tracking,
  );
  if (!exists.length) return { ok: false as const, message: "الأوردر مش في مرتجعات بوسطة المحفوظة." };
  await prisma.$executeRawUnsafe(
    `UPDATE \`CsBostaReturnCapture\` SET \`note\` = ? WHERE \`trackingNumber\` = ?`,
    note.trim().slice(0, 2000),
    tracking,
  );
  return { ok: true as const, note: note.trim().slice(0, 2000) };
}

export async function listCaptureExtras(trackingNumbers: string[]) {
  const found = new Map<string, CaptureExtras>();
  const prisma = getPrismaClient();
  const trackings = [...new Set(trackingNumbers.map((v) => v.trim()).filter(Boolean))];
  if (!prisma || !trackings.length) return found;
  await ensureMaintenanceLifecycleColumns();
  const marks = trackings.map(() => "?").join(", ");
  const rows = await prisma.$queryRawUnsafe<
    Array<{ trackingNumber: string; note: string | null; openedAt: Date | string | null }>
  >(
    `SELECT trackingNumber, note, openedAt FROM CsBostaReturnCapture WHERE trackingNumber IN (${marks})`,
    ...trackings,
  );
  for (const row of rows) {
    found.set(row.trackingNumber, {
      note: String(row.note || ""),
      openedAt: isoOrNull(row.openedAt),
    });
  }
  return found;
}

export const GRADE_LABEL: Record<ReviewGrade, string> = {
  first: "فرز أول",
  second: "فرز ثاني",
  scrap: "هالك",
};

export function defectsLabel(defects: ReviewDefect[]) {
  return defects.map((d) => DEFECT_LABEL[d]).filter(Boolean).join("، ");
}

export async function saveTechGrade(input: {
  trackingNumber: string;
  grade: string;
  techNote?: string;
  productId?: number | null;
}) {
  const prisma = getPrismaClient();
  const tracking = input.trackingNumber.trim();
  const grade: ReviewGrade | "" =
    input.grade === "first" || input.grade === "second" || input.grade === "scrap" ? input.grade : "";
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  if (!tracking) return { ok: false as const, message: "البوليصة ناقصة." };
  if (!grade) return { ok: false as const, message: "اختَر فرز أول أو فرز ثاني أو هالك." };
  await ensureMaintenanceLifecycleColumns();
  const productId =
    Number.isInteger(input.productId) && Number(input.productId) !== 0 ? Number(input.productId) : null;
  const techNote = String(input.techNote || "").trim().slice(0, 2000);

  if (productId != null) {
    const { ensureBostaReturnProductTable } = await import("@/lib/cs/bosta-return-product");
    await ensureBostaReturnProductTable();
    const rows = await prisma.$queryRawUnsafe<
      Array<{ destination: string | null; receivedFromMaintenanceAt: Date | null }>
    >(
      `SELECT destination, receivedFromMaintenanceAt FROM CsBostaReturnProduct
       WHERE trackingNumber = ? AND productId = ? LIMIT 1`,
      tracking,
      productId,
    );
    if (!rows.length || rows[0].destination !== "maintenance") {
      return { ok: false as const, message: "الصنف مش مسلّم للصيانة." };
    }
    if (rows[0].receivedFromMaintenanceAt) {
      return { ok: false as const, message: "اترجعت لمسؤول الصيانة؛ مينفعش تعدّل التصنيف." };
    }
    await prisma.$executeRawUnsafe(
      `UPDATE \`CsBostaReturnProduct\`
       SET \`grade\` = ?, \`techNote\` = ?,
           \`gradedAt\` = COALESCE(\`gradedAt\`, CURRENT_TIMESTAMP(3)),
           \`updatedAt\` = CURRENT_TIMESTAMP(3)
       WHERE \`trackingNumber\` = ? AND \`productId\` = ?`,
      grade,
      techNote || null,
      tracking,
      productId,
    );
    const { syncAggregateReviewFromProducts } = await import("@/lib/cs/bosta-return-review");
    await syncAggregateReviewFromProducts(tracking);
    try {
      const { recordReturnTrackEvent } = await import("@/lib/cs/return-track");
      await recordReturnTrackEvent({
        trackingNumber: tracking,
        stage: "graded",
        meta: { grade, techNote: techNote || null, productId },
      });
      await recordReturnTrackEvent({
        trackingNumber: tracking,
        stage: "returned_from_maintenance",
        meta: { grade, productId },
      });
    } catch (error) {
      console.warn("[return-track] grade event", error instanceof Error ? error.message : error);
    }
    return { ok: true as const, grade, techNote };
  }

  const rows = await prisma.$queryRawUnsafe<Array<{ destination: string; receivedFromMaintenanceAt: Date | null }>>(
    `SELECT destination, receivedFromMaintenanceAt FROM CsBostaReturnReview WHERE trackingNumber = ? LIMIT 1`,
    tracking,
  );
  if (!rows.length || rows[0].destination !== "maintenance") {
    return { ok: false as const, message: "البوليصة مش مسلّمة للصيانة." };
  }
  if (rows[0].receivedFromMaintenanceAt) {
    return { ok: false as const, message: "اترجعت لمسؤول الصيانة؛ مينفعش تعدّل التصنيف." };
  }
  await prisma.$executeRawUnsafe(
    `UPDATE \`CsBostaReturnReview\`
     SET \`grade\` = ?, \`techNote\` = ?,
         \`gradedAt\` = COALESCE(\`gradedAt\`, CURRENT_TIMESTAMP(3)),
         \`updatedAt\` = CURRENT_TIMESTAMP(3)
     WHERE \`trackingNumber\` = ?`,
    grade,
    techNote || null,
    tracking,
  );
  try {
    const { recordReturnTrackEvent } = await import("@/lib/cs/return-track");
    await recordReturnTrackEvent({
      trackingNumber: tracking,
      stage: "graded",
      meta: { grade, techNote: techNote || null },
    });
    await recordReturnTrackEvent({
      trackingNumber: tracking,
      stage: "returned_from_maintenance",
      meta: { grade },
    });
  } catch (error) {
    console.warn("[return-track] grade event", error instanceof Error ? error.message : error);
  }
  return { ok: true as const, grade, techNote };
}

export type ReceiveItem = { trackingNumber: string; productId?: number | null };

export async function receiveFromMaintenance(items: Array<string | ReceiveItem>) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة.", count: 0 };
  const normalized: ReceiveItem[] = items
    .map((item) =>
      typeof item === "string"
        ? { trackingNumber: item.trim(), productId: null }
        : {
            trackingNumber: String(item.trackingNumber || "").trim(),
            productId:
              Number.isInteger(item.productId) && Number(item.productId) !== 0
                ? Number(item.productId)
                : null,
          },
    )
    .filter((item) => item.trackingNumber);
  if (!normalized.length) return { ok: false as const, message: "اختَر بوالص للاستلام.", count: 0 };
  await ensureMaintenanceLifecycleColumns();
  const { ensureBostaReturnProductTable } = await import("@/lib/cs/bosta-return-product");
  const { syncAggregateReviewFromProducts } = await import("@/lib/cs/bosta-return-review");
  await ensureBostaReturnProductTable();

  let changed = 0;
  const trackEvents: Array<{ trackingNumber: string; grade: string | null; productId: number | null }> = [];
  const trackingsToSync = new Set<string>();

  for (const item of normalized) {
    if (item.productId != null) {
      const pending = await prisma.$queryRawUnsafe<Array<{ grade: string | null }>>(
        `SELECT grade FROM CsBostaReturnProduct
         WHERE trackingNumber = ? AND productId = ?
           AND destination = 'maintenance'
           AND grade IS NOT NULL AND grade <> ''
           AND receivedFromMaintenanceAt IS NULL
         LIMIT 1`,
        item.trackingNumber,
        item.productId,
      );
      if (!pending.length) continue;
      const n = await prisma.$executeRawUnsafe(
        `UPDATE \`CsBostaReturnProduct\`
         SET \`receivedFromMaintenanceAt\` = COALESCE(\`receivedFromMaintenanceAt\`, CURRENT_TIMESTAMP(3)),
             \`outletAt\` = CASE WHEN \`grade\` = 'second' THEN COALESCE(\`outletAt\`, CURRENT_TIMESTAMP(3)) ELSE \`outletAt\` END,
             \`scrapAt\` = CASE WHEN \`grade\` = 'scrap' THEN COALESCE(\`scrapAt\`, CURRENT_TIMESTAMP(3)) ELSE \`scrapAt\` END,
             \`updatedAt\` = CURRENT_TIMESTAMP(3)
         WHERE \`trackingNumber\` = ? AND \`productId\` = ?
           AND \`destination\` = 'maintenance'
           AND \`grade\` IS NOT NULL AND \`grade\` <> ''
           AND \`receivedFromMaintenanceAt\` IS NULL`,
        item.trackingNumber,
        item.productId,
      );
      if (Number(n)) {
        changed += Number(n);
        trackEvents.push({
          trackingNumber: item.trackingNumber,
          grade: pending[0].grade,
          productId: item.productId,
        });
        trackingsToSync.add(item.trackingNumber);
      }
    } else {
      const pending = await prisma.$queryRawUnsafe<Array<{ grade: string | null }>>(
        `SELECT grade FROM CsBostaReturnReview
         WHERE trackingNumber = ?
           AND destination = 'maintenance'
           AND grade IS NOT NULL AND grade <> ''
           AND receivedFromMaintenanceAt IS NULL
         LIMIT 1`,
        item.trackingNumber,
      );
      if (!pending.length) continue;
      const n = await prisma.$executeRawUnsafe(
        `UPDATE \`CsBostaReturnReview\`
         SET \`receivedFromMaintenanceAt\` = COALESCE(\`receivedFromMaintenanceAt\`, CURRENT_TIMESTAMP(3)),
             \`outletAt\` = CASE WHEN \`grade\` = 'second' THEN COALESCE(\`outletAt\`, CURRENT_TIMESTAMP(3)) ELSE \`outletAt\` END,
             \`scrapAt\` = CASE WHEN \`grade\` = 'scrap' THEN COALESCE(\`scrapAt\`, CURRENT_TIMESTAMP(3)) ELSE \`scrapAt\` END,
             \`updatedAt\` = CURRENT_TIMESTAMP(3)
         WHERE \`trackingNumber\` = ?
           AND \`destination\` = 'maintenance'
           AND \`grade\` IS NOT NULL AND \`grade\` <> ''
           AND \`receivedFromMaintenanceAt\` IS NULL`,
        item.trackingNumber,
      );
      if (Number(n)) {
        changed += Number(n);
        trackEvents.push({
          trackingNumber: item.trackingNumber,
          grade: pending[0].grade,
          productId: null,
        });
      }
    }
  }

  for (const tracking of trackingsToSync) {
    await syncAggregateReviewFromProducts(tracking);
  }

  try {
    const { recordReturnTrackEvent } = await import("@/lib/cs/return-track");
    for (const row of trackEvents) {
      await recordReturnTrackEvent({
        trackingNumber: row.trackingNumber,
        stage: "received_from_maintenance",
        meta: { grade: row.grade, productId: row.productId },
      });
      if (row.grade === "second") {
        await recordReturnTrackEvent({
          trackingNumber: row.trackingNumber,
          stage: "to_outlet",
          meta: { productId: row.productId },
        });
      } else if (row.grade === "scrap") {
        await recordReturnTrackEvent({
          trackingNumber: row.trackingNumber,
          stage: "to_scrap",
          meta: { productId: row.productId },
        });
      }
    }
  } catch (error) {
    console.warn("[return-track] receive events", error instanceof Error ? error.message : error);
  }
  return { ok: true as const, count: changed, message: "" };
}

export async function markShelf(trackingNumber: string, productId?: number | null) {
  const prisma = getPrismaClient();
  const tracking = trackingNumber.trim();
  if (!prisma || !tracking) return { ok: false as const, message: "البوليصة ناقصة." };
  await ensureMaintenanceLifecycleColumns();
  const pid =
    Number.isInteger(productId) && Number(productId) !== 0 ? Number(productId) : null;

  if (pid != null) {
    const { ensureBostaReturnProductTable } = await import("@/lib/cs/bosta-return-product");
    const { syncAggregateReviewFromProducts } = await import("@/lib/cs/bosta-return-review");
    await ensureBostaReturnProductTable();
    const rows = await prisma.$queryRawUnsafe<
      Array<{ grade: string | null; receivedFromMaintenanceAt: Date | null }>
    >(
      `SELECT grade, receivedFromMaintenanceAt FROM CsBostaReturnProduct
       WHERE trackingNumber = ? AND productId = ? LIMIT 1`,
      tracking,
      pid,
    );
    if (!rows.length) return { ok: false as const, message: "مفيش فحص للصنف." };
    if (rows[0].grade !== "first") return { ok: false as const, message: "الرف لفرز أول فقط." };
    if (!rows[0].receivedFromMaintenanceAt) return { ok: false as const, message: "استلم من الصيانة أولًا." };
    await prisma.$executeRawUnsafe(
      `UPDATE \`CsBostaReturnProduct\`
       SET \`shelfAt\` = COALESCE(\`shelfAt\`, CURRENT_TIMESTAMP(3)), \`updatedAt\` = CURRENT_TIMESTAMP(3)
       WHERE \`trackingNumber\` = ? AND \`productId\` = ?`,
      tracking,
      pid,
    );
    await syncAggregateReviewFromProducts(tracking);
    try {
      const { recordReturnTrackEvent } = await import("@/lib/cs/return-track");
      await recordReturnTrackEvent({
        trackingNumber: tracking,
        stage: "on_shelf",
        meta: { productId: pid },
      });
    } catch (error) {
      console.warn("[return-track] shelf event", error instanceof Error ? error.message : error);
    }
    return { ok: true as const };
  }

  const rows = await prisma.$queryRawUnsafe<
    Array<{ grade: string | null; receivedFromMaintenanceAt: Date | null }>
  >(
    `SELECT grade, receivedFromMaintenanceAt FROM CsBostaReturnReview WHERE trackingNumber = ? LIMIT 1`,
    tracking,
  );
  if (!rows.length) return { ok: false as const, message: "مفيش فحص." };
  if (rows[0].grade !== "first") return { ok: false as const, message: "الرف لفرز أول فقط." };
  if (!rows[0].receivedFromMaintenanceAt) return { ok: false as const, message: "استلم من الصيانة أولًا." };
  await prisma.$executeRawUnsafe(
    `UPDATE \`CsBostaReturnReview\`
     SET \`shelfAt\` = COALESCE(\`shelfAt\`, CURRENT_TIMESTAMP(3)), \`updatedAt\` = CURRENT_TIMESTAMP(3)
     WHERE \`trackingNumber\` = ?`,
    tracking,
  );
  try {
    const { recordReturnTrackEvent } = await import("@/lib/cs/return-track");
    await recordReturnTrackEvent({ trackingNumber: tracking, stage: "on_shelf" });
  } catch (error) {
    console.warn("[return-track] shelf event", error instanceof Error ? error.message : error);
  }
  return { ok: true as const };
}

export type VarianceRow = {
  trackingNumber: string;
  wooOrderNumber: string;
  product: string;
  deliveredAt: string | null;
  grade: ReviewGrade | null;
  receivedAt: string | null;
  status: "pending_grade" | "pending_return" | "returned" | "ok";
};

export async function maintenanceVarianceReport(from: string, to: string) {
  const prisma = getPrismaClient();
  if (!prisma) return { delivered: 0, graded: 0, returned: 0, missing: [] as VarianceRow[] };
  await ensureMaintenanceLifecycleColumns();
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      trackingNumber: string;
      wooOrderNumber: string;
      deliveredToMaintenanceAt: Date | string | null;
      grade: string | null;
      receivedFromMaintenanceAt: Date | string | null;
      seenDay: string;
    }>
  >(
    `SELECT r.trackingNumber, c.wooOrderNumber, r.deliveredToMaintenanceAt, r.grade, r.receivedFromMaintenanceAt, c.seenDay
     FROM CsBostaReturnReview r
     INNER JOIN CsBostaReturnCapture c ON c.trackingNumber = r.trackingNumber
     WHERE r.destination = 'maintenance'
       AND c.seenDay >= ? AND c.seenDay <= ?
     ORDER BY c.seenDay DESC, r.trackingNumber DESC`,
    from,
    to,
  );
  const missing: VarianceRow[] = [];
  let graded = 0;
  let returned = 0;
  for (const row of rows) {
    const grade =
      row.grade === "first" || row.grade === "second" || row.grade === "scrap" ? row.grade : null;
    if (grade) graded += 1;
    if (row.receivedFromMaintenanceAt) returned += 1;
    let status: VarianceRow["status"] = "ok";
    if (!grade) status = "pending_grade";
    else if (!row.receivedFromMaintenanceAt) status = "pending_return";
    if (status !== "ok") {
      missing.push({
        trackingNumber: row.trackingNumber,
        wooOrderNumber: String(row.wooOrderNumber || ""),
        product: "",
        deliveredAt: isoOrNull(row.deliveredToMaintenanceAt),
        grade,
        receivedAt: isoOrNull(row.receivedFromMaintenanceAt),
        status,
      });
    }
  }
  return { delivered: rows.length, graded, returned, missing };
}

export async function techNoteForConfirmation(confirmationId: number) {
  const prisma = getPrismaClient();
  if (!prisma || !confirmationId) return null as string | null;
  await ensureMaintenanceLifecycleColumns();
  const rows = await prisma.$queryRawUnsafe<Array<{ techNote: string | null }>>(
    `SELECT r.techNote
     FROM CsBostaReturnReview r
     INNER JOIN CsBostaReturnCapture c ON c.trackingNumber = r.trackingNumber
     WHERE c.confirmationId = ? AND r.techNote IS NOT NULL AND r.techNote <> ''
     ORDER BY r.updatedAt DESC
     LIMIT 1`,
    confirmationId,
  );
  if (rows[0]?.techNote) return String(rows[0].techNote);
  const byTrack = await prisma.$queryRawUnsafe<Array<{ techNote: string | null }>>(
    `SELECT r.techNote
     FROM CsOrderConfirmation o
     INNER JOIN CsBostaReturnReview r ON r.trackingNumber = o.trackingNumber
     WHERE o.id = ? AND r.techNote IS NOT NULL AND r.techNote <> ''
     LIMIT 1`,
    confirmationId,
  );
  return byTrack[0]?.techNote ? String(byTrack[0].techNote) : null;
}

export type { BostaReturnReview };
