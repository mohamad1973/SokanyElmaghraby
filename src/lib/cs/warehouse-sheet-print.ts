import "server-only";

import { ensureCsTables } from "@/lib/cs/agents";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import { getPrismaClient } from "@/lib/db";

export type WarehouseSheetPrintBatch = {
  dayYmd: string;
  shippingCompany: string;
  batchNo: number;
  orderCount: number;
  createdAt: string;
};

let ensureBatchTablePromise: Promise<void> | null = null;

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
          \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          UNIQUE INDEX \`CsWarehouseSheetPrintBatch_day_ship_batch\` (\`dayYmd\`, \`shippingCompany\`, \`batchNo\`),
          INDEX \`CsWarehouseSheetPrintBatch_day_ship_idx\` (\`dayYmd\`, \`shippingCompany\`),
          PRIMARY KEY (\`id\`)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
      `);
    })().catch((error) => {
      ensureBatchTablePromise = null;
      throw error;
    });
  }
  await ensureBatchTablePromise;
}

export async function listWarehouseSheetPrintBatches(dayYmd: string, shippingCompany: string) {
  const prisma = getPrismaClient();
  if (!prisma) return [] as WarehouseSheetPrintBatch[];
  await ensureCsTables();
  await ensureWarehouseSheetPrintBatchTable();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayYmd) || !shippingCompany.trim()) return [];

  const rows = await prisma.$queryRawUnsafe<
    Array<{ dayYmd: string; shippingCompany: string; batchNo: number | bigint; orderCount: number | bigint; createdAt: Date | string }>
  >(
    `SELECT dayYmd, shippingCompany, batchNo, orderCount, createdAt
     FROM CsWarehouseSheetPrintBatch
     WHERE dayYmd = ? AND shippingCompany = ?
     ORDER BY batchNo ASC`,
    dayYmd,
    shippingCompany.trim(),
  );

  return rows.map((row) => ({
    dayYmd: String(row.dayYmd),
    shippingCompany: String(row.shippingCompany),
    batchNo: Number(row.batchNo),
    orderCount: Number(row.orderCount),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  }));
}

export async function recordWarehouseSheetPrintBatch(input: {
  dayYmd: string;
  shippingCompany: string;
  ids: number[];
  agentId: number;
}) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureCsTables();
  await ensureWarehouseSheetPrintBatchTable();

  const viewer = await resolveCsViewer(input.agentId);
  const allowed = viewer.isAdmin || (viewer.isSupervisor && !viewer.isCourierSupervisor);
  if (!allowed) return { ok: false as const, message: "غير مصرح." };

  const dayYmd = String(input.dayYmd || "").trim();
  const shippingCompany = String(input.shippingCompany || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayYmd) || !shippingCompany) {
    return { ok: false as const, message: "يوم أو شركة شحن غير صحيحة." };
  }

  const ids = [...new Set(input.ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) {
    const batches = await listWarehouseSheetPrintBatches(dayYmd, shippingCompany);
    return { ok: true as const, batchNo: 0, orderCount: 0, batches };
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
    return { ok: true as const, batchNo: 0, orderCount: 0, batches, message: "مفيش أوردرات جديدة للتعليم." };
  }

  await prisma.csOrderConfirmation.updateMany({
    where: { id: { in: openIds } },
    data: { warehouseSheetPrinted: true } as never,
  });
  const orderCount = openIds.length;

  const maxRows = await prisma.$queryRawUnsafe<Array<{ maxBatch: number | bigint | null }>>(
    `SELECT MAX(batchNo) AS maxBatch FROM CsWarehouseSheetPrintBatch WHERE dayYmd = ? AND shippingCompany = ?`,
    dayYmd,
    shippingCompany,
  );
  const batchNo = Number(maxRows[0]?.maxBatch ?? 0) + 1;

  await prisma.$executeRawUnsafe(
    `INSERT INTO CsWarehouseSheetPrintBatch (dayYmd, shippingCompany, batchNo, orderCount, createdAt)
     VALUES (?, ?, ?, ?, NOW(3))`,
    dayYmd,
    shippingCompany,
    batchNo,
    orderCount,
  );

  const batches = await listWarehouseSheetPrintBatches(dayYmd, shippingCompany);
  return { ok: true as const, batchNo, orderCount, batches };
}
