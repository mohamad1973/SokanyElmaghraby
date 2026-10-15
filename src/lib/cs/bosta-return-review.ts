import "server-only";

import { getPrismaClient } from "@/lib/db";
import type { BostaHeadingKind } from "@/lib/shipping/bosta-client";

export type ReviewCondition = "sound" | "broken" | "defective";
export type ReviewDefect = "break" | "power" | "disassembled" | "dented";
export type ReviewDestination = "online_warehouse" | "shelf" | "maintenance";

export type BostaReturnReview = {
  condition: ReviewCondition;
  defects: ReviewDefect[];
  destination: ReviewDestination;
  bostaClaim: boolean;
  label: string;
};

const DEFECTS: ReviewDefect[] = ["break", "power", "disassembled", "dented"];
const DEFECT_LABEL: Record<ReviewDefect, string> = {
  break: "كسر",
  power: "فاصل بور",
  disassembled: "مفكك",
  dented: "مخبوط",
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
  if (ready.length) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`CsBostaReturnReview\` (
      \`trackingNumber\` VARCHAR(64) NOT NULL,
      \`condition\` VARCHAR(16) NOT NULL,
      \`defects\` VARCHAR(64) NOT NULL DEFAULT '',
      \`destination\` VARCHAR(32) NOT NULL,
      \`bostaClaim\` TINYINT NOT NULL DEFAULT 0,
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`trackingNumber\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
}

export function reviewLabel(review: Omit<BostaReturnReview, "label">) {
  if (review.destination === "online_warehouse") return "مخزن أونلاين";
  if (review.destination === "shelf") return "الرف";
  const defects = review.defects.map((defect) => DEFECT_LABEL[defect]).join("، ");
  const extra = [defects, review.bostaClaim ? "تعويض بوسطة" : ""].filter(Boolean).join(" · ");
  return extra ? `صيانة · ${extra}` : "صيانة";
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
}): BostaReturnReview | null {
  const condition: ReviewCondition | "" =
    row.condition === "sound" || row.condition === "broken" || row.condition === "defective" ? row.condition : "";
  const destination: ReviewDestination | "" =
    row.destination === "online_warehouse" || row.destination === "shelf" || row.destination === "maintenance"
      ? row.destination
      : "";
  if (!condition || !destination) return null;
  const review: Omit<BostaReturnReview, "label"> = {
    condition,
    defects: parseDefects(row.defects || ""),
    destination,
    bostaClaim: Number(row.bostaClaim) === 1,
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
    Array<{ trackingNumber: string; condition: string; defects: string; destination: string; bostaClaim: number | bigint }>
  >(
    `SELECT trackingNumber, \`condition\`, defects, destination, bostaClaim
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

export async function saveBostaReturnReview(input: { trackingNumber: string; condition: string; defects: string[] }) {
  const prisma = getPrismaClient();
  const trackingNumber = input.trackingNumber.trim();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  if (!trackingNumber) return { ok: false as const, message: "البوليصة ناقصة." };
  const condition = input.condition === "sound" || input.condition === "broken" || input.condition === "defective" ? input.condition : "";
  if (!condition) return { ok: false as const, message: "الاختيار مش واضح." };
  await ensureBostaReturnReviewTable();
  const stored = await prisma.$queryRawUnsafe<Array<{ kind: string }>>(
    `SELECT kind FROM CsBostaReturnCapture WHERE trackingNumber = ? LIMIT 1`,
    trackingNumber,
  );
  const kind = stored[0]?.kind === "refused" || stored[0]?.kind === "return" || stored[0]?.kind === "exchange" ? stored[0].kind : "";
  if (!kind) return { ok: false as const, message: "الأوردر مش في مرتجعات بوسطة المحفوظة." };
  const defects = [...new Set(parseDefects(input.defects.join(",")))];
  const review = decidedReview(kind, condition, defects);
  if (!review) return { ok: false as const, message: "الاختيار مش مناسب للتصنيف." };
  await prisma.$executeRawUnsafe(
    `INSERT INTO \`CsBostaReturnReview\`
      (\`trackingNumber\`, \`condition\`, \`defects\`, \`destination\`, \`bostaClaim\`, \`updatedAt\`)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE
      \`condition\` = ?,
      \`defects\` = ?,
      \`destination\` = ?,
      \`bostaClaim\` = ?,
      \`updatedAt\` = CURRENT_TIMESTAMP(3)`,
    trackingNumber,
    review.condition,
    review.defects.join(","),
    review.destination,
    review.bostaClaim ? 1 : 0,
    review.condition,
    review.defects.join(","),
    review.destination,
    review.bostaClaim ? 1 : 0,
  );
  return { ok: true as const, review: { ...review, label: reviewLabel(review) } };
}
