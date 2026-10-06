import "server-only";

import { getPrismaClient } from "@/lib/db";

export const WAREHOUSE_SHEET_KEYS = ["online", "tenth", "tenthHome"] as const;

export type WarehouseSheetKey = (typeof WAREHOUSE_SHEET_KEYS)[number];

export type StoredSheetRow = {
  name: string;
  qty: number;
};

export type StoredWarehouseSheet = {
  warehouse: WarehouseSheetKey;
  fileName: string;
  updatedAt: string;
  rows: StoredSheetRow[];
};

let sheetTableReady: Promise<void> | null = null;

export async function ensureWarehouseSheetTable() {
  if (!sheetTableReady) {
    sheetTableReady = createWarehouseSheetTable().catch((error) => {
      sheetTableReady = null;
      throw error;
    });
  }
  await sheetTableReady;
}

async function createWarehouseSheetTable() {
  const prisma = getPrismaClient();
  if (!prisma) return;
  const ready = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT 1 AS n FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'CsWarehouseSheet' LIMIT 1`,
  );
  if (ready.length) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`CsWarehouseSheet\` (
      \`warehouse\` VARCHAR(20) NOT NULL,
      \`fileName\` VARCHAR(255) NOT NULL,
      \`rowsJson\` MEDIUMTEXT NOT NULL,
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`warehouse\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
}

function isSheetKey(value: string): value is WarehouseSheetKey {
  return (WAREHOUSE_SHEET_KEYS as readonly string[]).includes(value);
}

function parseStoredRows(raw: string): StoredSheetRow[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const name = String((row as { name?: unknown }).name ?? "").trim();
    const qty = Number((row as { qty?: unknown }).qty);
    if (!name || !Number.isFinite(qty)) return [];
    return [{ name, qty: Math.max(0, Math.round(qty)) }];
  });
}

export async function loadWarehouseSheets(): Promise<StoredWarehouseSheet[]> {
  const prisma = getPrismaClient();
  if (!prisma) return [];
  await ensureWarehouseSheetTable();
  const rows = await prisma.$queryRawUnsafe<
    Array<{ warehouse: string; fileName: string; rowsJson: string; updatedAt: Date }>
  >(
    "SELECT warehouse, fileName, rowsJson, updatedAt FROM CsWarehouseSheet WHERE warehouse IN ('online', 'tenth', 'tenthHome')",
  );
  const order = new Map(WAREHOUSE_SHEET_KEYS.map((key, index) => [key, index]));
  return rows
    .flatMap((row) => {
      if (!isSheetKey(row.warehouse)) return [];
      return [
        {
          warehouse: row.warehouse,
          fileName: row.fileName,
          updatedAt: new Date(row.updatedAt).toISOString(),
          rows: parseStoredRows(row.rowsJson),
        },
      ];
    })
    .sort((a, b) => (order.get(a.warehouse) ?? 0) - (order.get(b.warehouse) ?? 0));
}

export async function saveWarehouseSheets(
  sheets: Array<{ warehouse: WarehouseSheetKey; fileName: string; rows: StoredSheetRow[] }>,
) {
  const prisma = getPrismaClient();
  if (!prisma) throw new Error("قاعدة البيانات غير متاحة.");
  await ensureWarehouseSheetTable();
  const updatedAt = new Date();
  await prisma.$transaction(async (tx) => {
    for (const sheet of sheets) {
      const fileName = sheet.fileName.trim().slice(0, 255) || "sheet";
      await tx.$executeRaw`
        INSERT INTO CsWarehouseSheet (warehouse, fileName, rowsJson, updatedAt)
        VALUES (${sheet.warehouse}, ${fileName}, ${JSON.stringify(sheet.rows)}, ${updatedAt})
        ON DUPLICATE KEY UPDATE
          fileName = VALUES(fileName),
          rowsJson = VALUES(rowsJson),
          updatedAt = VALUES(updatedAt)
      `;
    }
  });
  return updatedAt.toISOString();
}
