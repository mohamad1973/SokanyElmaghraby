import "server-only";

import { ensureCsTables } from "@/lib/cs/agents";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import { getPrismaClient } from "@/lib/db";

export type WarehouseSheetPrintBatchKind = "new" | "reprint";

export type WarehouseSheetPrintBatch = {
  dayYmd: string;
  shippingCompany: string;
  batchNo: number;
  orderCount: number;
  kind: WarehouseSheetPrintBatchKind;
  createdAt: string;
};

export type WarehouseSheetDaySummary = {
  dayYmd: string;
  shippingCompany: string;
  invoiced: number;
  printed: number;
  unprinted: number;
  batches: WarehouseSheetPrintBatch[];
};

let ensureBatchTablePromise: Promise<void> | null = null;

function canManageWarehouseSheet(viewer: {
  isAdmin?: boolean;
  isSupervisor?: boolean;
  isCourierSupervisor?: boolean;
}) {
  return Boolean(viewer.isAdmin || (viewer.isSupervisor && !viewer.isCourierSupervisor));
}

export async function ensureWarehouseSheetPrintBatchTable() {
  if (!ensureBatchTablePromise) {
    ensureBatchTablePromise = (async () => {
      const prisma = getPrismaClient();
      if (!prisma) return;
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS \`CsWarehouseSheetPrintBatch\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`dayYmd\` VARCHAR(10) NOT NULL,
          \`shippingCompany\` VARCHAR(64) NOT NULL,
          \`batchNo\` INT NOT NULL,
          \`orderCount\` INT NOT NULL,
          \`kind\` VARCHAR(16) NOT NULL DEFAULT 'new',
          \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          UNIQUE INDEX \`CsWarehouseSheetPrintBatch_day_ship_batch\` (\`dayYmd\`, \`shippingCompany\`, \`batchNo\`),
          INDEX \`CsWarehouseSheetPrintBatch_day_ship_idx\` (\`dayYmd\`, \`shippingCompany\`),
          PRIMARY KEY (\`id\`)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
      `);
      try {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE \`CsWarehouseSheetPrintBatch\` ADD COLUMN \`kind\` VARCHAR(16) NOT NULL DEFAULT 'new'`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/Duplicate column|already exists|1060/i.test(message)) {
          console.warn("[cs] warehouse batch kind ALTER:", message.slice(0, 200));
        }
      }
    })().catch((error) => {
      ensureBatchTablePromise = null;
      throw error;
    });
  }
  await ensureBatchTablePromise;
}

function mapBatchRow(row: {
  dayYmd: string;
  shippingCompany: string;
  batchNo: number | bigint;
  orderCount: number | bigint;
  kind?: string | null;
  createdAt: Date | string;
}): WarehouseSheetPrintBatch {
  const kind = String(row.kind || "new").trim() === "reprint" ? "reprint" : "new";
  return {
    dayYmd: String(row.dayYmd),
    shippingCompany: String(row.shippingCompany),
    batchNo: Number(row.batchNo),
    orderCount: Number(row.orderCount),
    kind,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}

export async function listWarehouseSheetPrintBatches(dayYmd: string, shippingCompany: string) {
  const prisma = getPrismaClient();
  if (!prisma) return [] as WarehouseSheetPrintBatch[];
  await ensureCsTables();
  await ensureWarehouseSheetPrintBatchTable();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayYmd) || !shippingCompany.trim()) return [];

  const rows = await prisma.$queryRawUnsafe<
    Array<{
      dayYmd: string;
      shippingCompany: string;
      batchNo: number | bigint;
      orderCount: number | bigint;
      kind?: string | null;
      createdAt: Date | string;
    }>
  >(
    `SELECT dayYmd, shippingCompany, batchNo, orderCount, kind, createdAt
     FROM CsWarehouseSheetPrintBatch
     WHERE dayYmd = ? AND shippingCompany = ?
     ORDER BY batchNo ASC`,
    dayYmd,
    shippingCompany.trim(),
  );

  return rows.map(mapBatchRow);
}

export async function summarizeWarehouseSheetDay(dayYmd: string, shippingCompany: string) {
  const empty: WarehouseSheetDaySummary = {
    dayYmd,
    shippingCompany,
    invoiced: 0,
    printed: 0,
    unprinted: 0,
    batches: [],
  };
  const prisma = getPrismaClient();
  if (!prisma) return empty;
  await ensureCsTables();
  await ensureWarehouseSheetPrintBatchTable();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayYmd) || !shippingCompany.trim()) return empty;

  const { cairoYmdBounds } = await import("@/lib/cs/order-window");
  const bounds = cairoYmdBounds(dayYmd);
  if (!bounds) return empty;
  const ship = shippingCompany.trim();

  const counts = await prisma.$queryRawUnsafe<
    Array<{ invoiced: number | bigint; printed: number | bigint; unprinted: number | bigint }>
  >(
    `SELECT
       COUNT(*) AS invoiced,
       SUM(CASE WHEN warehouseSheetPrinted = 1 THEN 1 ELSE 0 END) AS printed,
       SUM(CASE WHEN warehouseSheetPrinted = 0 OR warehouseSheetPrinted IS NULL THEN 1 ELSE 0 END) AS unprinted
     FROM CsOrderConfirmation
     WHERE shippingCompany = ?
       AND invoiceNumber IS NOT NULL AND TRIM(invoiceNumber) <> ''
       AND invoiceNumberAt >= ? AND invoiceNumberAt < ?`,
    ship,
    bounds.start,
    bounds.endExclusive,
  );

  const batches = await listWarehouseSheetPrintBatches(dayYmd, ship);
  return {
    dayYmd,
    shippingCompany: ship,
    invoiced: Number(counts[0]?.invoiced ?? 0),
    printed: Number(counts[0]?.printed ?? 0),
    unprinted: Number(counts[0]?.unprinted ?? 0),
    batches,
  };
}

async function insertBatch(input: {
  dayYmd: string;
  shippingCompany: string;
  orderCount: number;
  kind: WarehouseSheetPrintBatchKind;
}) {
  const prisma = getPrismaClient();
  if (!prisma) return { batchNo: 0, batches: [] as WarehouseSheetPrintBatch[] };

  const maxRows = await prisma.$queryRawUnsafe<Array<{ maxBatch: number | bigint | null }>>(
    `SELECT MAX(batchNo) AS maxBatch FROM CsWarehouseSheetPrintBatch WHERE dayYmd = ? AND shippingCompany = ?`,
    input.dayYmd,
    input.shippingCompany,
  );
  const batchNo = Number(maxRows[0]?.maxBatch ?? 0) + 1;

  await prisma.$executeRawUnsafe(
    `INSERT INTO CsWarehouseSheetPrintBatch (dayYmd, shippingCompany, batchNo, orderCount, kind, createdAt)
     VALUES (?, ?, ?, ?, ?, NOW(3))`,
    input.dayYmd,
    input.shippingCompany,
    batchNo,
    input.orderCount,
    input.kind,
  );

  const batches = await listWarehouseSheetPrintBatches(input.dayYmd, input.shippingCompany);
  return { batchNo, batches };
}

export async function recordWarehouseSheetPrintBatch(input: {
  dayYmd: string;
  shippingCompany: string;
  ids: number[];
  agentId: number;
  reprint?: boolean;
}) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureCsTables();
  await ensureWarehouseSheetPrintBatchTable();

  const viewer = await resolveCsViewer(input.agentId);
  if (!canManageWarehouseSheet(viewer)) return { ok: false as const, message: "غير مصرح." };

  const dayYmd = String(input.dayYmd || "").trim();
  const shippingCompany = String(input.shippingCompany || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayYmd) || !shippingCompany) {
    return { ok: false as const, message: "يوم أو شركة شحن غير صحيحة." };
  }

  const ids = [...new Set(input.ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
  const reprint = Boolean(input.reprint);

  if (reprint) {
    if (!ids.length) {
      const batches = await listWarehouseSheetPrintBatches(dayYmd, shippingCompany);
      return {
        ok: true as const,
        batchNo: 0,
        orderCount: 0,
        kind: "reprint" as const,
        batches,
        message: "مفيش تقرير مطبوع لإعادة طباعته.",
      };
    }
    const alreadyPrinted = await prisma.$queryRawUnsafe<Array<{ id: number | bigint }>>(
      `SELECT id FROM CsOrderConfirmation
       WHERE id IN (${ids.map(() => "?").join(",")})
         AND warehouseSheetPrinted = 1`,
      ...ids,
    );
    const printedIds = alreadyPrinted.map((row) => Number(row.id)).filter((id) => id > 0);
    if (!printedIds.length) {
      const batches = await listWarehouseSheetPrintBatches(dayYmd, shippingCompany);
      return {
        ok: true as const,
        batchNo: 0,
        orderCount: 0,
        kind: "reprint" as const,
        batches,
        message: "مفيش تقرير مطبوع لإعادة طباعته.",
      };
    }
    const { batchNo, batches } = await insertBatch({
      dayYmd,
      shippingCompany,
      orderCount: printedIds.length,
      kind: "reprint",
    });
    return { ok: true as const, batchNo, orderCount: printedIds.length, kind: "reprint" as const, batches };
  }

  if (!ids.length) {
    const batches = await listWarehouseSheetPrintBatches(dayYmd, shippingCompany);
    return { ok: true as const, batchNo: 0, orderCount: 0, kind: "new" as const, batches };
  }

  // Only mark rows that are still unprinted so a concurrent print cannot double-count.
  const stillOpen = await prisma.$queryRawUnsafe<Array<{ id: number | bigint }>>(
    `SELECT id FROM CsOrderConfirmation
     WHERE id IN (${ids.map(() => "?").join(",")})
       AND (warehouseSheetPrinted = 0 OR warehouseSheetPrinted IS NULL)`,
    ...ids,
  );
  const openIds = stillOpen.map((row) => Number(row.id)).filter((id) => id > 0);
  if (!openIds.length) {
    const batches = await listWarehouseSheetPrintBatches(dayYmd, shippingCompany);
    return {
      ok: true as const,
      batchNo: 0,
      orderCount: 0,
      kind: "new" as const,
      batches,
      message: "مفيش أوردرات جديدة للتعليم.",
    };
  }

  await prisma.csOrderConfirmation.updateMany({
    where: { id: { in: openIds } },
    data: { warehouseSheetPrinted: true } as never,
  });

  const { batchNo, batches } = await insertBatch({
    dayYmd,
    shippingCompany,
    orderCount: openIds.length,
    kind: "new",
  });
  return { ok: true as const, batchNo, orderCount: openIds.length, kind: "new" as const, batches };
}
