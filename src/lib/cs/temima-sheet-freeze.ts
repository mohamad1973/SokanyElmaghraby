import "server-only";

import { getPrismaClient } from "@/lib/db";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function ensureTemimaFreezeTables() {
  const prisma = getPrismaClient();
  if (!prisma) return;
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
