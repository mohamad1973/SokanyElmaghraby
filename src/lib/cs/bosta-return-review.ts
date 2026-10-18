import "server-only";

import { getPrismaClient } from "@/lib/db";
import type { BostaHeadingKind } from "@/lib/shipping/bosta-client";

export type ReviewCondition = "sound" | "broken" | "defective";
export type ReviewDefect = "break" | "power" | "disassembled" | "dented";
export type ReviewDestination = "online_warehouse" | "shelf" | "maintenance";
export type ReviewUsage = "new" | "used";

export type BostaReturnReview = {
  condition: ReviewCondition;
  defects: ReviewDefect[];
  destination: ReviewDestination;
  bostaClaim: boolean;
  usage: ReviewUsage | null;
  label: string;
};

const DEFECTS: ReviewDefect[] = ["break", "power", "disassembled", "dented"];
const DEFECT_LABEL: Record<ReviewDefect, string> = {
  break: "كسر",
  power: "فاصل بور",
  disassembled: "مفكك",
  dented: "مخبوط",
};
const USAGE_LABEL: Record<ReviewUsage, string> = {
  new: "جديد",
  used: "مستخدم",
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
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`trackingNumber\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    return;
  }
  try {
    await prisma.$executeRawUnsafe(
      "ALTER TABLE `CsBostaReturnReview` ADD COLUMN `usage` VARCHAR(16) NULL",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/Duplicate column|already exists|1060/i.test(message)) throw error;
  }
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
    return `${base} · ${USAGE_LABEL[review.usage]}`;
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
}): BostaReturnReview | null {
  const condition: ReviewCondition | "" =
    row.condition === "sound" || row.condition === "broken" || row.condition === "defective" ? row.condition : "";
  const destination: ReviewDestination | "" =
    row.destination === "online_warehouse" || row.destination === "shelf" || row.destination === "maintenance"
      ? row.destination
      : "";
  if (!condition || !destination) return null;
  const usage: ReviewUsage | null = row.usage === "new" || row.usage === "used" ? row.usage : null;
  const review: Omit<BostaReturnReview, "label"> = {
    condition,
    defects: parseDefects(row.defects || ""),
    destination,
    bostaClaim: Number(row.bostaClaim) === 1,
    usage,
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
    }>
  >(
    `SELECT trackingNumber, \`condition\`, defects, destination, bostaClaim, \`usage\`
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
  await ensureBostaReturnReviewTable();
  const stored = await prisma.$queryRawUnsafe<Array<{ kind: string }>>(
    `SELECT kind FROM CsBostaReturnCapture WHERE trackingNumber = ? LIMIT 1`,
    trackingNumber,
  );
  const kind =
    stored[0]?.kind === "refused" || stored[0]?.kind === "return" || stored[0]?.kind === "exchange" ? stored[0].kind : "";
  if (!kind) return { ok: false as const, message: "الأوردر مش في مرتجعات بوسطة المحفوظة." };
  const defects = [...new Set(parseDefects(input.defects.join(",")))];
  const decided = decidedReview(kind, condition, defects);
  if (!decided) return { ok: false as const, message: "الاختيار مش مناسب للتصنيف." };
  const review = { ...decided, usage };
  await prisma.$executeRawUnsafe(
    `INSERT INTO \`CsBostaReturnReview\`
      (\`trackingNumber\`, \`condition\`, \`defects\`, \`destination\`, \`bostaClaim\`, \`usage\`, \`updatedAt\`)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE
      \`condition\` = ?,
      \`defects\` = ?,
      \`destination\` = ?,
      \`bostaClaim\` = ?,
      \`usage\` = ?,
      \`updatedAt\` = CURRENT_TIMESTAMP(3)`,
    trackingNumber,
    review.condition,
    review.defects.join(","),
    review.destination,
    review.bostaClaim ? 1 : 0,
    review.usage,
    review.condition,
    review.defects.join(","),
    review.destination,
    review.bostaClaim ? 1 : 0,
    review.usage,
  );
  return { ok: true as const, review: { ...review, label: reviewLabel(review) } };
}
