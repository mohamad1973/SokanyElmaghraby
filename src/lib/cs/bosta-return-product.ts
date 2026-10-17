import "server-only";

import { getPrismaClient } from "@/lib/db";

export type LinkedReturnProduct = {
  productId: number;
  productName: string;
  productCode: string;
};

let tableReady: Promise<void> | null = null;

export async function ensureBostaReturnProductTable() {
  if (!tableReady) {
    tableReady = createBostaReturnProductTable().catch((error) => {
      tableReady = null;
      throw error;
    });
  }
  await tableReady;
}

async function createBostaReturnProductTable() {
  const prisma = getPrismaClient();
  if (!prisma) return;
  const ready = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT 1 AS n FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'CsBostaReturnProduct' LIMIT 1`,
  );
  if (!ready.length) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`CsBostaReturnProduct\` (
        \`trackingNumber\` VARCHAR(64) NOT NULL,
        \`productId\` INT NOT NULL,
        \`productName\` VARCHAR(191) NOT NULL,
        \`productCode\` VARCHAR(64) NOT NULL DEFAULT '',
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`trackingNumber\`, \`productId\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    return;
  }
  const keys = await prisma.$queryRawUnsafe<Array<{ COLUMN_NAME: string }>>(
    `SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'CsBostaReturnProduct'
       AND CONSTRAINT_NAME = 'PRIMARY'
     ORDER BY ORDINAL_POSITION`,
  );
  if (keys.length === 2 && keys[0]?.COLUMN_NAME === "trackingNumber" && keys[1]?.COLUMN_NAME === "productId") {
    return;
  }
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`CsBostaReturnProduct_multi\` (
      \`trackingNumber\` VARCHAR(64) NOT NULL,
      \`productId\` INT NOT NULL,
      \`productName\` VARCHAR(191) NOT NULL,
      \`productCode\` VARCHAR(64) NOT NULL DEFAULT '',
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`trackingNumber\`, \`productId\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  await prisma.$executeRawUnsafe(`
    INSERT IGNORE INTO \`CsBostaReturnProduct_multi\`
      (\`trackingNumber\`, \`productId\`, \`productName\`, \`productCode\`, \`updatedAt\`)
    SELECT \`trackingNumber\`, \`productId\`, \`productName\`, \`productCode\`, \`updatedAt\`
    FROM \`CsBostaReturnProduct\`
  `);
  await prisma.$executeRawUnsafe(`DROP TABLE \`CsBostaReturnProduct\``);
  await prisma.$executeRawUnsafe(`RENAME TABLE \`CsBostaReturnProduct_multi\` TO \`CsBostaReturnProduct\``);
}

export function linkedProductLabel(products: LinkedReturnProduct[]) {
  return products
    .map((product) => [product.productName, product.productCode].filter(Boolean).join(" · "))
    .filter(Boolean)
    .join("، ");
}

export async function listBostaReturnProducts(trackingNumbers: string[]) {
  const found = new Map<string, LinkedReturnProduct[]>();
  const prisma = getPrismaClient();
  const trackings = [...new Set(trackingNumbers.map((value) => value.trim()).filter(Boolean))];
  if (!prisma || !trackings.length) return found;
  await ensureBostaReturnProductTable();
  const marks = trackings.map(() => "?").join(", ");
  const rows = await prisma.$queryRawUnsafe<
    Array<{ trackingNumber: string; productId: number | bigint; productName: string; productCode: string }>
  >(
    `SELECT trackingNumber, productId, productName, productCode
     FROM CsBostaReturnProduct
     WHERE trackingNumber IN (${marks})
     ORDER BY productName ASC, productId ASC`,
    ...trackings,
  );
  for (const row of rows) {
    const productName = String(row.productName || "").trim();
    if (!productName) continue;
    const packed: LinkedReturnProduct = {
      productId: Number(row.productId),
      productName,
      productCode: String(row.productCode || "").trim(),
    };
    const list = found.get(row.trackingNumber) || [];
    list.push(packed);
    found.set(row.trackingNumber, list);
  }
  return found;
}

export async function saveBostaReturnProduct(input: {
  trackingNumber: string;
  productId: number;
  productName: string;
  productCode: string;
}) {
  const prisma = getPrismaClient();
  const trackingNumber = input.trackingNumber.trim();
  const productName = input.productName.trim().slice(0, 191);
  const productCode = input.productCode.trim().slice(0, 64);
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  if (!trackingNumber) return { ok: false as const, message: "البوليصة ناقصة." };
  if (!Number.isInteger(input.productId) || input.productId <= 0 || !productName) {
    return { ok: false as const, message: "اختَر منتج من البحث." };
  }
  await ensureBostaReturnProductTable();
  const stored = await prisma.$queryRawUnsafe<Array<{ trackingNumber: string }>>(
    `SELECT trackingNumber FROM CsBostaReturnCapture WHERE trackingNumber = ? LIMIT 1`,
    trackingNumber,
  );
  if (!stored.length) return { ok: false as const, message: "الأوردر مش في مرتجعات بوسطة المحفوظة." };
  await prisma.$executeRawUnsafe(
    `INSERT INTO \`CsBostaReturnProduct\`
      (\`trackingNumber\`, \`productId\`, \`productName\`, \`productCode\`, \`updatedAt\`)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE
      \`productName\` = ?,
      \`productCode\` = ?,
      \`updatedAt\` = CURRENT_TIMESTAMP(3)`,
    trackingNumber,
    input.productId,
    productName,
    productCode,
    productName,
    productCode,
  );
  const product: LinkedReturnProduct = { productId: input.productId, productName, productCode };
  return { ok: true as const, product };
}

export async function removeBostaReturnProduct(trackingNumberRaw: string, productId: number) {
  const prisma = getPrismaClient();
  const trackingNumber = trackingNumberRaw.trim();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  if (!trackingNumber) return { ok: false as const, message: "البوليصة ناقصة." };
  if (!Number.isInteger(productId) || productId <= 0) return { ok: false as const, message: "المنتج ناقص." };
  await ensureBostaReturnProductTable();
  const changed = await prisma.$executeRawUnsafe(
    `DELETE FROM \`CsBostaReturnProduct\` WHERE trackingNumber = ? AND productId = ?`,
    trackingNumber,
    productId,
  );
  if (!Number(changed)) return { ok: false as const, message: "المنتج مش مربوط بالمرتجع." };
  return { ok: true as const };
}
