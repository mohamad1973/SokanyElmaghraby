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
  await ensureTemimaSerialColumn();
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
    const orders = await prisma.csOrderConfirmation.findMany({
      where: { id: { in: ids } },
      select: { id: true, wooOrderNumber: true },
    });
    const ordered = [...orders].sort((a, b) => wooSerialKey(b.wooOrderNumber) - wooSerialKey(a.wooOrderNumber));
    if (ordered.length) {
      const placeholders = ordered.map(() => "(?, ?, ?)").join(", ");
      const params = ordered.flatMap((row, index) => [dayYmd, row.id, index + 1]);
      await prisma.$executeRawUnsafe(
        `INSERT IGNORE INTO CsTemimaSheetFreeze (dayYmd, confirmationId, serial) VALUES ${placeholders}`,
        ...params,
      );
    }
  }
  await prisma.$executeRawUnsafe("INSERT IGNORE INTO CsTemimaSheetFreezeDay (dayYmd) VALUES (?)", dayYmd);
}

function wooSerialKey(value: string) {
  return Number(String(value).replace(/\D/g, "")) || 0;
}

let serialColumnReady: Promise<void> | null = null;

async function ensureTemimaSerialColumn() {
  if (!serialColumnReady) {
    serialColumnReady = addTemimaSerialColumn().catch((error) => {
      serialColumnReady = null;
      throw error;
    });
  }
  await serialColumnReady;
}

async function addTemimaSerialColumn() {
  const prisma = getPrismaClient();
  if (!prisma) return;
  try {
    await prisma.$executeRawUnsafe("ALTER TABLE `CsTemimaSheetFreeze` ADD COLUMN `serial` INT NULL");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/Duplicate column|already exists|1060/i.test(message)) throw error;
  }
}

async function nextTemimaSerial(dayYmd: string) {
  const prisma = getPrismaClient();
  if (!prisma) return 0;
  const rows = await prisma.$queryRawUnsafe<Array<{ maxSerial: number | null }>>(
    "SELECT MAX(serial) AS maxSerial FROM CsTemimaSheetFreeze WHERE dayYmd = ?",
    dayYmd,
  );
  return Number(rows[0]?.maxSerial) || 0;
}

export async function addTemimaFreezeIds(dayYmd: string, confirmationIds: number[]) {
  const prisma = getPrismaClient();
  if (!prisma || !DAY.test(dayYmd)) return;
  const ids = [...new Set(confirmationIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return;
  await ensureTemimaFreezeTables();
  const existing = await prisma.$queryRawUnsafe<Array<{ confirmationId: number | bigint; serial: number | null }>>(
    `SELECT confirmationId, serial FROM CsTemimaSheetFreeze WHERE dayYmd = ? AND confirmationId IN (${ids.map(() => "?").join(", ")})`,
    dayYmd,
    ...ids,
  );
  const have = new Map(existing.map((row) => [Number(row.confirmationId), row.serial == null ? null : Number(row.serial)]));
  let next = await nextTemimaSerial(dayYmd);
  for (const id of ids) {
    if (have.get(id) != null) continue;
    next += 1;
    if (have.has(id)) {
      await prisma.$executeRawUnsafe(
        "UPDATE CsTemimaSheetFreeze SET serial = ? WHERE dayYmd = ? AND confirmationId = ? AND serial IS NULL",
        next,
        dayYmd,
        id,
      );
    } else {
      await prisma.$executeRawUnsafe(
        "INSERT IGNORE INTO CsTemimaSheetFreeze (dayYmd, confirmationId, serial) VALUES (?, ?, ?)",
        dayYmd,
        id,
        next,
      );
    }
  }
}

async function fillMissingTemimaSerials(dateFrom: string, dateTo: string) {
  const prisma = getPrismaClient();
  if (!prisma) return;
  const rows = await prisma.$queryRawUnsafe<Array<{ confirmationId: number | bigint; dayYmd: string; serial: number | null }>>(
    "SELECT confirmationId, dayYmd, serial FROM CsTemimaSheetFreeze WHERE dayYmd >= ? AND dayYmd <= ?",
    dateFrom,
    dateTo,
  );
  const byDay = new Map<string, Array<{ id: number; serial: number | null }>>();
  for (const row of rows) {
    const list = byDay.get(String(row.dayYmd)) || [];
    list.push({ id: Number(row.confirmationId), serial: row.serial == null ? null : Number(row.serial) });
    byDay.set(String(row.dayYmd), list);
  }
  for (const [day, list] of byDay) {
    if (!list.length || list.some((row) => row.serial != null)) continue;
    const orders = await prisma.csOrderConfirmation.findMany({
      where: { id: { in: list.map((row) => row.id) } },
      select: { id: true, wooOrderNumber: true },
    });
    const ordered = [...orders].sort((a, b) => wooSerialKey(b.wooOrderNumber) - wooSerialKey(a.wooOrderNumber));
    for (let index = 0; index < ordered.length; index += 1) {
      await prisma.$executeRawUnsafe(
        "UPDATE CsTemimaSheetFreeze SET serial = ? WHERE dayYmd = ? AND confirmationId = ? AND serial IS NULL",
        index + 1,
        day,
        ordered[index].id,
      );
    }
  }
}

export async function listTemimaSheetSerials(dateFrom: string, dateTo: string) {
  const map = new Map<number, number>();
  const prisma = getPrismaClient();
  if (!prisma || !DAY.test(dateFrom) || !DAY.test(dateTo)) return map;
  await ensureTemimaFreezeTables();
  await fillMissingTemimaSerials(dateFrom, dateTo);
  const rows = await prisma.$queryRawUnsafe<Array<{ confirmationId: number | bigint; serial: number | null }>>(
    "SELECT confirmationId, serial FROM CsTemimaSheetFreeze WHERE dayYmd >= ? AND dayYmd <= ? AND serial IS NOT NULL ORDER BY dayYmd ASC",
    dateFrom,
    dateTo,
  );
  for (const row of rows) {
    const id = Number(row.confirmationId);
    if (!map.has(id)) map.set(id, Number(row.serial));
  }
  return map;
}

export async function setTemimaSheetSerial(dayYmd: string, confirmationId: number, serial: number) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  if (!DAY.test(dayYmd) || !Number.isInteger(confirmationId) || confirmationId <= 0) {
    return { ok: false as const, message: "الأوردر غير موجود." };
  }
  if (!Number.isInteger(serial) || serial <= 0 || serial > 9999) {
    return { ok: false as const, message: "المسلسل غير صحيح." };
  }
  await ensureTemimaFreezeTables();
  if (!(await hasTemimaFreezeDay(dayYmd))) {
    return { ok: false as const, message: "المسلسل يتثبت بعد قفل الشيت." };
  }
  const changed = await prisma.$executeRawUnsafe(
    "UPDATE CsTemimaSheetFreeze SET serial = ? WHERE dayYmd = ? AND confirmationId = ?",
    serial,
    dayYmd,
    confirmationId,
  );
  if (!Number(changed)) return { ok: false as const, message: "الأوردر مش على الشيت المقفول." };
  return { ok: true as const, serial };
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
