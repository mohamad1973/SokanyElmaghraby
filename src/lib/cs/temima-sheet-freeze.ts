import "server-only";

import { getPrismaClient } from "@/lib/db";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

let freezeTablesReady: Promise<void> | null = null;

export async function ensureTemimaFreezeTables() {
  if (!freezeTablesReady) {
    freezeTablesReady = createTemimaFreezeTables().catch((error) => {
      freezeTablesReady = null;
      throw error;
    });
  }
  await freezeTablesReady;
}

async function createTemimaFreezeTables() {
  const prisma = getPrismaClient();
  if (!prisma) return;
  const ready = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT 1 AS n FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'CsTemimaSheetFreeze' LIMIT 1`,
  );
  if (ready.length) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`CsTemimaSheetFreezeDay\` (
      \`dayYmd\` VARCHAR(10) NOT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`dayYmd\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`CsTemimaSheetFreeze\` (
      \`dayYmd\` VARCHAR(10) NOT NULL,
      \`confirmationId\` INT NOT NULL,
      PRIMARY KEY (\`dayYmd\`, \`confirmationId\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
}

export async function hasTemimaFreezeDay(dayYmd: string) {
  const prisma = getPrismaClient();
  if (!prisma || !DAY.test(dayYmd)) return false;
  await ensureTemimaFreezeTables();
  const rows = await prisma.$queryRawUnsafe<Array<{ dayYmd: string }>>(
    "SELECT dayYmd FROM CsTemimaSheetFreezeDay WHERE dayYmd = ? LIMIT 1",
    dayYmd,
  );
  return rows.length > 0;
}

export async function listTemimaFreezePairs(dateFrom: string, dateTo: string) {
  const prisma = getPrismaClient();
  if (!prisma || !DAY.test(dateFrom) || !DAY.test(dateTo)) return [];
  await ensureTemimaFreezeTables();
  const rows = await prisma.$queryRawUnsafe<Array<{ dayYmd: string; confirmationId: number | bigint }>>(
    "SELECT dayYmd, confirmationId FROM CsTemimaSheetFreeze WHERE dayYmd >= ? AND dayYmd <= ?",
    dateFrom,
    dateTo,
  );
  return rows.map((row) => ({ dayYmd: String(row.dayYmd), confirmationId: Number(row.confirmationId) }));
}

export async function listTemimaFreezeIds(dayYmd: string) {
  const prisma = getPrismaClient();
  if (!prisma || !DAY.test(dayYmd)) return [];
  const rows = await prisma.$queryRawUnsafe<Array<{ confirmationId: number | bigint }>>(
    "SELECT confirmationId FROM CsTemimaSheetFreeze WHERE dayYmd = ?",
    dayYmd,
  );
  return rows.map((row) => Number(row.confirmationId));
}

export async function listTemimaFrozenDays(dateFrom: string, dateTo: string) {
  const prisma = getPrismaClient();
  if (!prisma || !DAY.test(dateFrom) || !DAY.test(dateTo)) return new Set<string>();
  await ensureTemimaFreezeTables();
  const rows = await prisma.$queryRawUnsafe<Array<{ dayYmd: string }>>(
    "SELECT dayYmd FROM CsTemimaSheetFreezeDay WHERE dayYmd >= ? AND dayYmd <= ?",
    dateFrom,
    dateTo,
  );
  return new Set(rows.map((row) => row.dayYmd));
}

export async function saveTemimaFreeze(dayYmd: string, confirmationIds: number[]) {
  const prisma = getPrismaClient();
  if (!prisma || !DAY.test(dayYmd)) return;
  await ensureTemimaFreezeTables();
  const ids = [...new Set(confirmationIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (ids.length) {
    const placeholders = ids.map(() => "(?, ?)").join(", ");
    const params = ids.flatMap((id) => [dayYmd, id]);
    await prisma.$executeRawUnsafe(
      `INSERT IGNORE INTO CsTemimaSheetFreeze (dayYmd, confirmationId) VALUES ${placeholders}`,
      ...params,
    );
  }
  await prisma.$executeRawUnsafe("INSERT IGNORE INTO CsTemimaSheetFreezeDay (dayYmd) VALUES (?)", dayYmd);
}

export async function addTemimaFreezeIds(dayYmd: string, confirmationIds: number[]) {
  const prisma = getPrismaClient();
  if (!prisma || !DAY.test(dayYmd)) return;
  const ids = [...new Set(confirmationIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return;
  await ensureTemimaFreezeTables();
  const placeholders = ids.map(() => "(?, ?)").join(", ");
  const params = ids.flatMap((id) => [dayYmd, id]);
  await prisma.$executeRawUnsafe(
    `INSERT IGNORE INTO CsTemimaSheetFreeze (dayYmd, confirmationId) VALUES ${placeholders}`,
    ...params,
  );
}

export async function listEarliestFreezeDays(confirmationIds: number[]) {
  const prisma = getPrismaClient();
  const ids = [...new Set(confirmationIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (!prisma || !ids.length) return new Map<number, string>();
  await ensureTemimaFreezeTables();
  const placeholders = ids.map(() => "?").join(", ");
  const rows = await prisma.$queryRawUnsafe<Array<{ confirmationId: number | bigint; dayYmd: string }>>(
    `SELECT confirmationId, MIN(dayYmd) AS dayYmd FROM CsTemimaSheetFreeze WHERE confirmationId IN (${placeholders}) GROUP BY confirmationId`,
    ...ids,
  );
  return new Map(rows.map((row) => [Number(row.confirmationId), String(row.dayYmd)]));
}

export async function removeTemimaFreezeExcept(confirmationId: number, keepDay: string) {
  const prisma = getPrismaClient();
  if (!prisma || !Number.isInteger(confirmationId) || confirmationId <= 0 || !DAY.test(keepDay)) return;
  await ensureTemimaFreezeTables();
  await prisma.$executeRawUnsafe(
    "DELETE FROM CsTemimaSheetFreeze WHERE confirmationId = ? AND dayYmd <> ?",
    confirmationId,
    keepDay,
  );
}

export async function removeTemimaFreezeId(dayYmd: string, confirmationId: number) {
  const prisma = getPrismaClient();
  if (!prisma || !DAY.test(dayYmd) || !Number.isInteger(confirmationId) || confirmationId <= 0) return;
  await ensureTemimaFreezeTables();
  await prisma.$executeRawUnsafe(
    "DELETE FROM CsTemimaSheetFreeze WHERE dayYmd = ? AND confirmationId = ?",
    dayYmd,
    confirmationId,
  );
}

export async function hasTemimaPrepareHold(dayYmd: string) {
  const prisma = getPrismaClient();
  if (!prisma || !DAY.test(dayYmd)) return false;
  await ensureTemimaPrepareHoldTable();
  const rows = await prisma.$queryRawUnsafe<Array<{ dayYmd: string }>>(
    "SELECT dayYmd FROM CsTemimaSheetPrepareHold WHERE dayYmd = ? LIMIT 1",
    dayYmd,
  );
  return rows.length > 0;
}

export async function markTemimaPrepareHold(dayYmd: string) {
  const prisma = getPrismaClient();
  if (!prisma || !DAY.test(dayYmd)) return;
  await ensureTemimaPrepareHoldTable();
  await prisma.$executeRawUnsafe("INSERT IGNORE INTO CsTemimaSheetPrepareHold (dayYmd) VALUES (?)", dayYmd);
}

export async function clearTemimaPrepareHold(dayYmd: string) {
  const prisma = getPrismaClient();
  if (!prisma || !DAY.test(dayYmd)) return;
  await ensureTemimaPrepareHoldTable();
  await prisma.$executeRawUnsafe("DELETE FROM CsTemimaSheetPrepareHold WHERE dayYmd = ?", dayYmd);
}

let prepareHoldReady: Promise<void> | null = null;

async function ensureTemimaPrepareHoldTable() {
  if (!prepareHoldReady) {
    prepareHoldReady = createTemimaPrepareHoldTable().catch((error) => {
      prepareHoldReady = null;
      throw error;
    });
  }
  await prepareHoldReady;
}

async function createTemimaPrepareHoldTable() {
  const prisma = getPrismaClient();
  if (!prisma) return;
  const ready = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT 1 AS n FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'CsTemimaSheetPrepareHold' LIMIT 1`,
  );
  if (ready.length) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`CsTemimaSheetPrepareHold\` (
      \`dayYmd\` VARCHAR(10) NOT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`dayYmd\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
}
