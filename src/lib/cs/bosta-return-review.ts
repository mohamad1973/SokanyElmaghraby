import "server-only";

import { ensureBostaReturnCaptureTable } from "@/lib/cs/bosta-return-capture";
import { getPrismaClient } from "@/lib/db";
import type { BostaHeadingKind } from "@/lib/shipping/bosta-client";

export type ReviewCondition = "sound" | "broken" | "defective";
export type ReviewDefect = "break" | "power" | "disassembled" | "dented" | "manufacturing";
export type ReviewDestination = "online_warehouse" | "shelf" | "maintenance";
export type ReviewUsage = "new" | "used";
export type ReviewGrade = "first" | "second" | "scrap";

export type BostaReturnReview = {
  condition: ReviewCondition;
  defects: ReviewDefect[];
  destination: ReviewDestination;
  bostaClaim: boolean;
  usage: ReviewUsage | null;
  label: string;
  grade: ReviewGrade | null;
  techNote: string;
  deliveredToMaintenanceAt: string | null;
  receivedFromMaintenanceAt: string | null;
  shelfAt: string | null;
};

const DEFECTS: ReviewDefect[] = ["break", "power", "disassembled", "dented", "manufacturing"];
export const DEFECT_LABEL: Record<ReviewDefect, string> = {
  break: "كسر",
  power: "فاصل بور",
  disassembled: "مفكك",
  dented: "مخبوط",
  manufacturing: "عيب صناعة",
};
const USAGE_LABEL: Record<ReviewUsage, string> = {
  new: "جديد",
  used: "مستخدم",
};
const GRADE_LABEL: Record<ReviewGrade, string> = {
  first: "فرز أول",
  second: "فرز ثاني",
  scrap: "هالك",
};

let tableReady: Promise<void> | null = null;

export async function ensureBostaReturnReviewTable() {
  if (!tableReady) {
    tableReady = createBostaReturnReviewTable().catch((error) => {
      tableReady = null;
      throw error;
    });
  }
  await tableReady;
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

async function createBostaReturnReviewTable() {
  const prisma = getPrismaClient();
  if (!prisma) return;
  const ready = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT 1 AS n FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'CsBostaReturnReview' LIMIT 1`,
  );
  if (!ready.length) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`CsBostaReturnReview\` (
        \`trackingNumber\` VARCHAR(64) NOT NULL,
        \`condition\` VARCHAR(16) NOT NULL,
        \`defects\` VARCHAR(64) NOT NULL DEFAULT '',
        \`destination\` VARCHAR(32) NOT NULL,
        \`bostaClaim\` TINYINT NOT NULL DEFAULT 0,
        \`usage\` VARCHAR(16) NULL,
        \`deliveredToMaintenanceAt\` DATETIME(3) NULL,
        \`grade\` VARCHAR(16) NULL,
        \`techNote\` TEXT NULL,
        \`receivedFromMaintenanceAt\` DATETIME(3) NULL,
        \`shelfAt\` DATETIME(3) NULL,
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`trackingNumber\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    return;
  }
  await addColumn("ALTER TABLE `CsBostaReturnReview` ADD COLUMN `usage` VARCHAR(16) NULL");
  await addColumn(
    "ALTER TABLE `CsBostaReturnReview` ADD COLUMN `deliveredToMaintenanceAt` DATETIME(3) NULL",
  );
  await addColumn("ALTER TABLE `CsBostaReturnReview` ADD COLUMN `grade` VARCHAR(16) NULL");
  await addColumn("ALTER TABLE `CsBostaReturnReview` ADD COLUMN `techNote` TEXT NULL");
  await addColumn(
    "ALTER TABLE `CsBostaReturnReview` ADD COLUMN `receivedFromMaintenanceAt` DATETIME(3) NULL",
  );
  await addColumn("ALTER TABLE `CsBostaReturnReview` ADD COLUMN `shelfAt` DATETIME(3) NULL");
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

/** Map Hostinger/Prisma SQL failures to a short Arabic message for CS staff. */
export function maintenanceDbErrorMessage(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  if (/doesn't exist|1146|no such table/i.test(detail)) {
    return { message: "جدول المرتجعات مش موجود في قاعدة البيانات.", detail };
  }
  if (/unknown column|1054/i.test(detail)) {
    return { message: "جدول الصيانة ناقص عمود مطلوب للحفظ.", detail };
  }
  if (/connect|ECONN|ETIMEDOUT|timeout|too many connections|server has gone away/i.test(detail)) {
    return { message: "تعذر الاتصال بقاعدة البيانات. حاول مرة أخرى.", detail };
  }
  if (/Duplicate|1062/i.test(detail)) {
    return { message: "الفحص محفوظ من قبل. حدّث الصفحة وحاول تاني.", detail };
  }
  return { message: "تعذر حفظ العملية بسبب خطأ في السيرفر.", detail };
}

export function reviewLabel(review: Omit<BostaReturnReview, "label">) {
  let base = "";
  if (review.destination === "online_warehouse") base = "مخزن أونلاين";
  else if (review.destination === "shelf") base = "الرف";
  else {
    const defects = review.defects.map((defect) => DEFECT_LABEL[defect]).join("، ");
    const extra = [defects, review.bostaClaim ? "تعويض بوسطة" : ""].filter(Boolean).join(" · ");
    base = extra ? `صيانة · ${extra}` : "صيانة";
  }
  if (review.usage === "new" || review.usage === "used") {
    base = `${base} · ${USAGE_LABEL[review.usage]}`;
  }
  if (review.grade) {
    base = `${base} · ${GRADE_LABEL[review.grade]}`;
  }
  return base;
}

function parseDefects(value: string): ReviewDefect[] {
  const allowed = new Set(DEFECTS);
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is ReviewDefect => allowed.has(item as ReviewDefect));
}

function packReview(row: {
  condition: string;
  defects: string;
  destination: string;
  bostaClaim: number | bigint | boolean;
  usage?: string | null;
  grade?: string | null;
  techNote?: string | null;
  deliveredToMaintenanceAt?: Date | string | null;
  receivedFromMaintenanceAt?: Date | string | null;
  shelfAt?: Date | string | null;
}): BostaReturnReview | null {
  const condition: ReviewCondition | "" =
    row.condition === "sound" || row.condition === "broken" || row.condition === "defective" ? row.condition : "";
  const destination: ReviewDestination | "" =
    row.destination === "online_warehouse" || row.destination === "shelf" || row.destination === "maintenance"
      ? row.destination
      : "";
  if (!condition || !destination) return null;
  const usage: ReviewUsage | null = row.usage === "new" || row.usage === "used" ? row.usage : null;
  const grade: ReviewGrade | null =
    row.grade === "first" || row.grade === "second" || row.grade === "scrap" ? row.grade : null;
  const review: Omit<BostaReturnReview, "label"> = {
    condition,
    defects: parseDefects(row.defects || ""),
    destination,
    bostaClaim: Number(row.bostaClaim) === 1,
    usage,
    grade,
    techNote: String(row.techNote || ""),
    deliveredToMaintenanceAt: isoOrNull(row.deliveredToMaintenanceAt),
    receivedFromMaintenanceAt: isoOrNull(row.receivedFromMaintenanceAt),
    shelfAt: isoOrNull(row.shelfAt),
  };
  return { ...review, label: reviewLabel(review) };
}

export async function listBostaReturnReviews(trackingNumbers: string[]) {
  const found = new Map<string, BostaReturnReview>();
  const prisma = getPrismaClient();
  const trackings = [...new Set(trackingNumbers.map((value) => value.trim()).filter(Boolean))];
  if (!prisma || !trackings.length) return found;
  await ensureBostaReturnReviewTable();
  const marks = trackings.map(() => "?").join(", ");
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      trackingNumber: string;
      condition: string;
      defects: string;
      destination: string;
      bostaClaim: number | bigint;
      usage: string | null;
      grade: string | null;
      techNote: string | null;
      deliveredToMaintenanceAt: Date | string | null;
      receivedFromMaintenanceAt: Date | string | null;
      shelfAt: Date | string | null;
    }>
  >(
    `SELECT trackingNumber, \`condition\`, defects, destination, bostaClaim, \`usage\`,
            grade, techNote, deliveredToMaintenanceAt, receivedFromMaintenanceAt, shelfAt
     FROM CsBostaReturnReview
     WHERE trackingNumber IN (${marks})`,
    ...trackings,
  );
  for (const row of rows) {
    const review = packReview(row);
    if (review) found.set(row.trackingNumber, review);
  }
  return found;
}

function decidedReview(kind: BostaHeadingKind, condition: ReviewCondition, defects: ReviewDefect[]) {
  if (kind === "refused" && condition === "sound") {
    return { condition, defects: [] as ReviewDefect[], destination: "online_warehouse" as const, bostaClaim: false };
  }
  if (kind === "refused" && condition === "broken") {
    return { condition, defects: [] as ReviewDefect[], destination: "maintenance" as const, bostaClaim: true };
  }
  if (condition === "sound") {
    return { condition, defects: [] as ReviewDefect[], destination: "shelf" as const, bostaClaim: false };
  }
  if (condition === "defective" && defects.length) {
    return { condition, defects, destination: "maintenance" as const, bostaClaim: false };
  }
  return null;
}

export async function saveBostaReturnReview(input: {
  trackingNumber: string;
  condition: string;
  defects: string[];
  usage: string;
}) {
  const prisma = getPrismaClient();
  const trackingNumber = input.trackingNumber.trim();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  if (!trackingNumber) return { ok: false as const, message: "البوليصة ناقصة." };
  const condition =
    input.condition === "sound" || input.condition === "broken" || input.condition === "defective" ? input.condition : "";
  if (!condition) return { ok: false as const, message: "الاختيار مش واضح." };
  const usage: ReviewUsage | "" = input.usage === "new" || input.usage === "used" ? input.usage : "";
  if (!usage) return { ok: false as const, message: "حدّد المنتج جديد أو مستخدم." };
  try {
    await ensureBostaReturnCaptureTable();
    await ensureBostaReturnReviewTable();
    const stored = await prisma.$queryRawUnsafe<Array<{ kind: string; source: string | null }>>(
      `SELECT kind, source FROM CsBostaReturnCapture WHERE trackingNumber = ? LIMIT 1`,
      trackingNumber,
    );
    const kind =
      stored[0]?.kind === "refused" || stored[0]?.kind === "return" || stored[0]?.kind === "exchange"
        ? stored[0].kind
        : "";
    if (!kind) return { ok: false as const, message: "الأوردر مش في مرتجعات الصيانة المحفوظة." };
    const defects = [...new Set(parseDefects(input.defects.join(",")))];
    const decided = decidedReview(kind, condition, defects);
    if (!decided) return { ok: false as const, message: "الاختيار مش مناسب للتصنيف." };
    const source = String(stored[0]?.source || "").trim();
    const deskReturn = source === "temima" || source === "eid" || source === "momen";
    const bostaClaim = deskReturn ? false : decided.bostaClaim;
    const prev = await prisma.$queryRawUnsafe<
      Array<{
        grade: string | null;
        techNote: string | null;
        deliveredToMaintenanceAt: Date | string | null;
        receivedFromMaintenanceAt: Date | string | null;
        shelfAt: Date | string | null;
      }>
    >(
      `SELECT grade, techNote, deliveredToMaintenanceAt, receivedFromMaintenanceAt, shelfAt
       FROM CsBostaReturnReview WHERE trackingNumber = ? LIMIT 1`,
      trackingNumber,
    );
    const prevRow = prev[0];
    const deliveredAt =
      decided.destination === "maintenance"
        ? sqlDateTime(prevRow?.deliveredToMaintenanceAt || new Date())
        : sqlDateTime(prevRow?.deliveredToMaintenanceAt);
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO \`CsBostaReturnReview\`
          (\`trackingNumber\`, \`condition\`, \`defects\`, \`destination\`, \`bostaClaim\`, \`usage\`,
           \`deliveredToMaintenanceAt\`, \`updatedAt\`)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3))`,
        trackingNumber,
        decided.condition,
        decided.defects.join(","),
        decided.destination,
        bostaClaim ? 1 : 0,
        usage,
        deliveredAt,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/Duplicate|1062/i.test(message)) throw error;
      await prisma.$executeRawUnsafe(
        `UPDATE \`CsBostaReturnReview\`
         SET \`condition\` = ?, \`defects\` = ?, \`destination\` = ?, \`bostaClaim\` = ?, \`usage\` = ?,
             \`deliveredToMaintenanceAt\` = ?, \`updatedAt\` = CURRENT_TIMESTAMP(3)
         WHERE \`trackingNumber\` = ?`,
        decided.condition,
        decided.defects.join(","),
        decided.destination,
        bostaClaim ? 1 : 0,
        usage,
        deliveredAt,
        trackingNumber,
      );
    }
    const packed = packReview({
      condition: decided.condition,
      defects: decided.defects.join(","),
      destination: decided.destination,
      bostaClaim: bostaClaim ? 1 : 0,
      usage,
      grade: prevRow?.grade,
      techNote: prevRow?.techNote,
      deliveredToMaintenanceAt: deliveredAt,
      receivedFromMaintenanceAt: prevRow?.receivedFromMaintenanceAt,
      shelfAt: prevRow?.shelfAt,
    });
    return { ok: true as const, review: packed! };
  } catch (error) {
    const mapped = maintenanceDbErrorMessage(error);
    console.error("[cs] saveBostaReturnReview", trackingNumber, mapped.detail);
    return { ok: false as const, message: mapped.message, detail: mapped.detail.slice(0, 200) };
  }
}
