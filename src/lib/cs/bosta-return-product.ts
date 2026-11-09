import "server-only";

import { getPrismaClient } from "@/lib/db";
import {
  DEFECT_LABEL,
  type BostaReturnReview,
  type ReviewCondition,
  type ReviewDefect,
  asReviewDestination,
  type ReviewDestination,
  type ReviewGrade,
  type ReviewUsage,
  reviewLabel,
} from "@/lib/cs/bosta-return-review";
import { customReturnProductId } from "@/lib/cs/custom-return-product-id";

export { customReturnProductId };

export type LinkedReturnProduct = {
  productId: number;
  productName: string;
  productCode: string;
  condition: ReviewCondition | null;
  defects: ReviewDefect[];
  destination: ReviewDestination | null;
  usage: ReviewUsage | null;
  bostaClaim: boolean;
  grade: ReviewGrade | null;
  techNote: string;
  inspectedAt: string | null;
  gradedAt: string | null;
  deliveredToMaintenanceAt: string | null;
  receivedFromMaintenanceAt: string | null;
  shelfAt: string | null;
  outletAt: string | null;
  scrapAt: string | null;
  label: string;
};

let tableReady: Promise<void> | null = null;

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
        \`condition\` VARCHAR(16) NULL,
        \`defects\` VARCHAR(64) NOT NULL DEFAULT '',
        \`destination\` VARCHAR(32) NULL,
        \`bostaClaim\` TINYINT NOT NULL DEFAULT 0,
        \`usage\` VARCHAR(16) NULL,
        \`grade\` VARCHAR(16) NULL,
        \`techNote\` TEXT NULL,
        \`inspectedAt\` DATETIME(3) NULL,
        \`gradedAt\` DATETIME(3) NULL,
        \`deliveredToMaintenanceAt\` DATETIME(3) NULL,
        \`receivedFromMaintenanceAt\` DATETIME(3) NULL,
        \`shelfAt\` DATETIME(3) NULL,
        \`outletAt\` DATETIME(3) NULL,
        \`scrapAt\` DATETIME(3) NULL,
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
  if (!(keys.length === 2 && keys[0]?.COLUMN_NAME === "trackingNumber" && keys[1]?.COLUMN_NAME === "productId")) {
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
  await addColumn("ALTER TABLE `CsBostaReturnProduct` ADD COLUMN `condition` VARCHAR(16) NULL");
  await addColumn("ALTER TABLE `CsBostaReturnProduct` ADD COLUMN `defects` VARCHAR(64) NOT NULL DEFAULT ''");
  await addColumn("ALTER TABLE `CsBostaReturnProduct` ADD COLUMN `destination` VARCHAR(32) NULL");
  await addColumn("ALTER TABLE `CsBostaReturnProduct` ADD COLUMN `bostaClaim` TINYINT NOT NULL DEFAULT 0");
  await addColumn("ALTER TABLE `CsBostaReturnProduct` ADD COLUMN `usage` VARCHAR(16) NULL");
  await addColumn("ALTER TABLE `CsBostaReturnProduct` ADD COLUMN `grade` VARCHAR(16) NULL");
  await addColumn("ALTER TABLE `CsBostaReturnProduct` ADD COLUMN `techNote` TEXT NULL");
  await addColumn("ALTER TABLE `CsBostaReturnProduct` ADD COLUMN `inspectedAt` DATETIME(3) NULL");
  await addColumn("ALTER TABLE `CsBostaReturnProduct` ADD COLUMN `gradedAt` DATETIME(3) NULL");
  await addColumn("ALTER TABLE `CsBostaReturnProduct` ADD COLUMN `deliveredToMaintenanceAt` DATETIME(3) NULL");
  await addColumn("ALTER TABLE `CsBostaReturnProduct` ADD COLUMN `receivedFromMaintenanceAt` DATETIME(3) NULL");
  await addColumn("ALTER TABLE `CsBostaReturnProduct` ADD COLUMN `shelfAt` DATETIME(3) NULL");
  await addColumn("ALTER TABLE `CsBostaReturnProduct` ADD COLUMN `outletAt` DATETIME(3) NULL");
  await addColumn("ALTER TABLE `CsBostaReturnProduct` ADD COLUMN `scrapAt` DATETIME(3) NULL");
}

function isoOrNull(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value);
  if (!text || text.startsWith("0000")) return null;
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function sqlDateTime(value: Date | string | null | undefined) {
  const iso = isoOrNull(value);
  if (!iso) return null;
  return iso.slice(0, 23).replace("T", " ");
}

function parseDefects(value: string): ReviewDefect[] {
  const allowed = new Set(["break", "power", "disassembled", "dented", "manufacturing"]);
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is ReviewDefect => allowed.has(item));
}

function packLinked(row: {
  productId: number | bigint;
  productName: string;
  productCode: string | null;
  condition?: string | null;
  defects?: string | null;
  destination?: string | null;
  bostaClaim?: number | bigint | boolean | null;
  usage?: string | null;
  grade?: string | null;
  techNote?: string | null;
  inspectedAt?: Date | string | null;
  gradedAt?: Date | string | null;
  deliveredToMaintenanceAt?: Date | string | null;
  receivedFromMaintenanceAt?: Date | string | null;
  shelfAt?: Date | string | null;
  outletAt?: Date | string | null;
  scrapAt?: Date | string | null;
}): LinkedReturnProduct {
  const condition: ReviewCondition | null =
    row.condition === "sound" || row.condition === "broken" || row.condition === "defective" ? row.condition : null;
  const destination = asReviewDestination(row.destination) || null;
  const usage: ReviewUsage | null = row.usage === "new" || row.usage === "used" ? row.usage : null;
  const grade: ReviewGrade | null =
    row.grade === "first" || row.grade === "second" || row.grade === "scrap" ? row.grade : null;
  const defects = parseDefects(String(row.defects || ""));
  const bostaClaim = Number(row.bostaClaim) === 1;
  let label = "";
  if (condition && destination) {
    label = reviewLabel({
      condition,
      defects,
      destination,
      bostaClaim,
      usage,
      grade,
      techNote: String(row.techNote || ""),
      deliveredToMaintenanceAt: isoOrNull(row.deliveredToMaintenanceAt),
      receivedFromMaintenanceAt: isoOrNull(row.receivedFromMaintenanceAt),
      shelfAt: isoOrNull(row.shelfAt),
    });
  }
  return {
    productId: Number(row.productId),
    productName: String(row.productName || "").trim(),
    productCode: String(row.productCode || "").trim(),
    condition,
    defects,
    destination,
    usage,
    bostaClaim,
    grade,
    techNote: String(row.techNote || ""),
    inspectedAt: isoOrNull(row.inspectedAt),
    gradedAt: isoOrNull(row.gradedAt),
    deliveredToMaintenanceAt: isoOrNull(row.deliveredToMaintenanceAt),
    receivedFromMaintenanceAt: isoOrNull(row.receivedFromMaintenanceAt),
    shelfAt: isoOrNull(row.shelfAt),
    outletAt: isoOrNull(row.outletAt),
    scrapAt: isoOrNull(row.scrapAt),
    label,
  };
}

export function linkedProductLabel(products: LinkedReturnProduct[]) {
  return products
    .map((product) => {
      const base = [product.productName, product.productCode].filter(Boolean).join(" · ");
      return product.label ? `${base} (${product.label})` : base;
    })
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
    Array<{
      trackingNumber: string;
      productId: number | bigint;
      productName: string;
      productCode: string | null;
      condition: string | null;
      defects: string | null;
      destination: string | null;
      bostaClaim: number | bigint | null;
      usage: string | null;
      grade: string | null;
      techNote: string | null;
      inspectedAt: Date | string | null;
      gradedAt: Date | string | null;
      deliveredToMaintenanceAt: Date | string | null;
      receivedFromMaintenanceAt: Date | string | null;
      shelfAt: Date | string | null;
      outletAt: Date | string | null;
      scrapAt: Date | string | null;
    }>
  >(
    `SELECT trackingNumber, productId, productName, productCode,
            \`condition\`, defects, destination, bostaClaim, \`usage\`, grade, techNote,
            inspectedAt, gradedAt, deliveredToMaintenanceAt, receivedFromMaintenanceAt,
            shelfAt, outletAt, scrapAt
     FROM CsBostaReturnProduct
     WHERE trackingNumber IN (${marks})
     ORDER BY productName ASC, productId ASC`,
    ...trackings,
  );
  for (const row of rows) {
    const packed = packLinked(row);
    if (!packed.productName) continue;
    const list = found.get(row.trackingNumber) || [];
    list.push(packed);
    found.set(row.trackingNumber, list);
  }
  return found;
}

export async function saveBostaReturnProduct(input: {
  trackingNumber: string;
  productId?: number | null;
  productName: string;
  productCode?: string | null;
  custom?: boolean;
}) {
  const prisma = getPrismaClient();
  const trackingNumber = input.trackingNumber.trim();
  const productName = input.productName.trim().slice(0, 191);
  const productCode = String(input.productCode || "").trim().slice(0, 64);
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  if (!trackingNumber) return { ok: false as const, message: "البوليصة ناقصة." };
  if (!productName || productName.length < 2) {
    return { ok: false as const, message: "اكتب اسم المنتج أو الموديل." };
  }
  const custom = Boolean(input.custom) || !(Number.isInteger(input.productId) && Number(input.productId) > 0);
  const productId = custom ? customReturnProductId(productName) : Number(input.productId);
  if (!Number.isInteger(productId) || productId === 0) {
    return { ok: false as const, message: "اختَر منتج من البحث أو احفظ النص المكتوب." };
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
    productId,
    productName,
    productCode,
    productName,
    productCode,
  );
  const listed = await listBostaReturnProducts([trackingNumber]);
  const product = (listed.get(trackingNumber) || []).find((item) => item.productId === productId);
  return {
    ok: true as const,
    product: product || {
      productId,
      productName,
      productCode,
      condition: null,
      defects: [],
      destination: null,
      usage: null,
      bostaClaim: false,
      grade: null,
      techNote: "",
      inspectedAt: null,
      gradedAt: null,
      deliveredToMaintenanceAt: null,
      receivedFromMaintenanceAt: null,
      shelfAt: null,
      outletAt: null,
      scrapAt: null,
      label: "",
    },
  };
}

export async function removeBostaReturnProduct(trackingNumberRaw: string, productId: number) {
  const prisma = getPrismaClient();
  const trackingNumber = trackingNumberRaw.trim();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  if (!trackingNumber) return { ok: false as const, message: "البوليصة ناقصة." };
  if (!Number.isInteger(productId) || productId === 0) return { ok: false as const, message: "المنتج ناقص." };
  await ensureBostaReturnProductTable();
  const changed = await prisma.$executeRawUnsafe(
    `DELETE FROM \`CsBostaReturnProduct\` WHERE trackingNumber = ? AND productId = ?`,
    trackingNumber,
    productId,
  );
  if (!Number(changed)) return { ok: false as const, message: "المنتج مش مربوط بالمرتجع." };
  return { ok: true as const };
}

export async function saveProductReturnReview(input: {
  trackingNumber: string;
  productId: number;
  condition: ReviewCondition;
  defects: ReviewDefect[];
  usage: ReviewUsage;
  destination: ReviewDestination;
  bostaClaim: boolean;
}) {
  const prisma = getPrismaClient();
  const trackingNumber = input.trackingNumber.trim();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  if (!trackingNumber) return { ok: false as const, message: "البوليصة ناقصة." };
  if (!Number.isInteger(input.productId) || input.productId === 0) {
    return { ok: false as const, message: "اختَر الصنف." };
  }
  await ensureBostaReturnProductTable();
  const existing = await prisma.$queryRawUnsafe<
    Array<{
      productName: string;
      deliveredToMaintenanceAt: Date | string | null;
      receivedFromMaintenanceAt: Date | string | null;
      shelfAt: Date | string | null;
    }>
  >(
    `SELECT productName, deliveredToMaintenanceAt, receivedFromMaintenanceAt, shelfAt
     FROM CsBostaReturnProduct WHERE trackingNumber = ? AND productId = ? LIMIT 1`,
    trackingNumber,
    input.productId,
  );
  if (!existing.length) return { ok: false as const, message: "الصنف مش مربوط بالمرتجع." };
  const deliveredAt =
    input.destination === "maintenance"
      ? sqlDateTime(existing[0].deliveredToMaintenanceAt || new Date())
      : sqlDateTime(existing[0].deliveredToMaintenanceAt);
  const shelfAt =
    input.destination === "shelf"
      ? sqlDateTime(existing[0].shelfAt || new Date())
      : sqlDateTime(existing[0].shelfAt);
  await prisma.$executeRawUnsafe(
    `UPDATE \`CsBostaReturnProduct\`
     SET \`condition\` = ?, \`defects\` = ?, \`destination\` = ?, \`bostaClaim\` = ?, \`usage\` = ?,
         \`deliveredToMaintenanceAt\` = ?, \`shelfAt\` = ?,
         \`inspectedAt\` = COALESCE(\`inspectedAt\`, CURRENT_TIMESTAMP(3)),
         \`updatedAt\` = CURRENT_TIMESTAMP(3)
     WHERE \`trackingNumber\` = ? AND \`productId\` = ?`,
    input.condition,
    input.defects.join(","),
    input.destination,
    input.bostaClaim ? 1 : 0,
    input.usage,
    deliveredAt,
    shelfAt,
    trackingNumber,
    input.productId,
  );
  const listed = await listBostaReturnProducts([trackingNumber]);
  const product = (listed.get(trackingNumber) || []).find((item) => item.productId === input.productId);
  return { ok: true as const, product: product! };
}

/** Build aggregate tracking-level review fields from per-product reviews. */
export function aggregateReviewFromProducts(products: LinkedReturnProduct[]): Omit<BostaReturnReview, "label"> | null {
  const reviewed = products.filter((p) => p.condition && p.destination);
  if (!reviewed.length) return null;
  const maintenance = reviewed.filter((p) => p.destination === "maintenance");
  const toCustomer = reviewed.filter((p) => p.destination === "to_customer");
  const online = reviewed.filter((p) => p.destination === "online_warehouse");
  const shelf = reviewed.filter((p) => p.destination === "shelf");
  let destination: ReviewDestination = "shelf";
  if (maintenance.length) destination = "maintenance";
  else if (toCustomer.length) destination = "to_customer";
  else if (online.length && !shelf.length) destination = "online_warehouse";
  else if (shelf.length) destination = "shelf";
  else if (online.length) destination = "online_warehouse";

  const focus = maintenance[0] || toCustomer[0] || shelf[0] || online[0] || reviewed[0];
  const earliest = (values: Array<string | null>) =>
    values.filter(Boolean).sort()[0] || null;
  const latest = (values: Array<string | null>) =>
    values.filter(Boolean).sort().reverse()[0] || null;

  return {
    condition: focus.condition!,
    defects: focus.defects,
    destination,
    bostaClaim: reviewed.some((p) => p.bostaClaim),
    usage: focus.usage,
    grade: maintenance.find((p) => p.grade)?.grade || null,
    techNote: maintenance.map((p) => p.techNote).filter(Boolean).join(" | "),
    deliveredToMaintenanceAt: earliest(maintenance.map((p) => p.deliveredToMaintenanceAt)),
    receivedFromMaintenanceAt: latest(maintenance.map((p) => p.receivedFromMaintenanceAt)),
    shelfAt: earliest(
      reviewed.filter((p) => p.destination === "shelf" || p.grade === "first").map((p) => p.shelfAt),
    ),
  };
}

export { DEFECT_LABEL, sqlDateTime, isoOrNull };
