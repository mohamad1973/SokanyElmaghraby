/**
 * Recover Temima sheet 2026-11-05 after a bad past-day freeze
 * (cutoff stamped with Saturday clock → only ~5 orders).
 *
 * Steps: reopen day → set cutoff 23:59 → rebuild freeze from live sheet rules.
 *
 * Usage: node scripts/recover-temima-nov5.cjs
 */
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const DAY = "2026-11-05";
const END_OF_DAY = 23 * 60 + 59;
const CAIRO_OFFSET = "+02:00";

function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    let v = line.slice(i + 1);
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    const k = line.slice(0, i);
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnv();
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

function cairoBounds(ymd) {
  const startMs = Date.parse(`${ymd}T00:00:00${CAIRO_OFFSET}`);
  return { start: new Date(startMs), end: new Date(startMs + 24 * 60 * 60 * 1000) };
}

async function reopenDay(dayYmd) {
  await prisma.$executeRawUnsafe("DELETE FROM CsTemimaSheetFreeze WHERE dayYmd = ?", dayYmd);
  await prisma.$executeRawUnsafe("DELETE FROM CsTemimaSheetFreezeDay WHERE dayYmd = ?", dayYmd);
  await prisma.$executeRawUnsafe("DELETE FROM CsTemimaSheetPrintCount WHERE dayYmd = ?", dayYmd);
  await prisma.$executeRawUnsafe("DELETE FROM CsTemimaSheetCutoff WHERE dayYmd = ?", dayYmd);
}

async function setEndOfDayCutoff(dayYmd) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO CsTemimaSheetCutoff (dayYmd, minutes) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE minutes = VALUES(minutes)`,
    dayYmd,
    END_OF_DAY,
  );
}

async function rebuildFreeze(dayYmd) {
  const { start, end } = cairoBounds(dayYmd);
  const rows = await prisma.csOrderConfirmation.findMany({
    where: {
      status: "CONFIRMED",
      shippingCompany: "sayed_temima",
      OR: [
        { confirmedAt: { gte: start, lt: end } },
        { confirmationEditedAt: { gte: start, lt: end } },
        { handedToCarrierAt: { gte: start, lt: end } },
      ],
    },
    select: { id: true, wooOrderNumber: true },
    orderBy: { id: "desc" },
    take: 5000,
  });

  const edits = await prisma.csTemimaSheetEdit.findMany({
    where: { dayYmd },
    select: { confirmationId: true, kind: true },
  });
  const excludeIds = new Set(edits.filter((e) => e.kind === "exclude").map((e) => e.confirmationId));
  const includeIds = edits.filter((e) => e.kind === "include").map((e) => e.confirmationId);
  const have = new Set(rows.map((r) => r.id));
  const missingIncludes = includeIds.filter((id) => !have.has(id));
  const extra = missingIncludes.length
    ? await prisma.csOrderConfirmation.findMany({
        where: { id: { in: missingIncludes }, status: "CONFIRMED", shippingCompany: "sayed_temima" },
        select: { id: true, wooOrderNumber: true },
      })
    : [];

  const all = [...rows, ...extra].filter((r) => !excludeIds.has(r.id));
  // Ascending order number to match current print sort preference.
  const ordered = [...all].sort((a, b) => {
    const na = Number(String(a.wooOrderNumber).replace(/\D/g, "")) || 0;
    const nb = Number(String(b.wooOrderNumber).replace(/\D/g, "")) || 0;
    return na - nb;
  });

  if (!ordered.length) {
    return { orderCount: 0 };
  }

  const placeholders = ordered.map(() => "(?, ?, ?)").join(", ");
  const params = ordered.flatMap((row, index) => [dayYmd, row.id, index + 1]);
  await prisma.$executeRawUnsafe(
    `INSERT INTO CsTemimaSheetFreeze (dayYmd, confirmationId, serial) VALUES ${placeholders}`,
    ...params,
  );
  await prisma.$executeRawUnsafe("INSERT INTO CsTemimaSheetFreezeDay (dayYmd) VALUES (?)", dayYmd);

  // Keep print count so the day stays locked; do not force high count.
  await prisma.$executeRawUnsafe(
    `INSERT INTO CsTemimaSheetPrintCount (dayYmd, count) VALUES (?, 1)
     ON DUPLICATE KEY UPDATE count = GREATEST(count, 1)`,
    dayYmd,
  );

  return { orderCount: ordered.length };
}

async function main() {
  const beforeCutoff = await prisma.$queryRawUnsafe(
    "SELECT dayYmd, minutes FROM CsTemimaSheetCutoff WHERE dayYmd = ?",
    DAY,
  );
  const beforeFreeze = await prisma.$queryRawUnsafe(
    "SELECT COUNT(*) AS n FROM CsTemimaSheetFreeze WHERE dayYmd = ?",
    DAY,
  );
  console.log(
    "before",
    JSON.stringify(
      { cutoff: beforeCutoff, freezeCount: beforeFreeze },
      (_, v) => (typeof v === "bigint" ? Number(v) : v),
    ),
  );

  await reopenDay(DAY);
  console.log("reopened", DAY);

  await setEndOfDayCutoff(DAY);
  console.log("cutoff", END_OF_DAY);

  const rebuilt = await rebuildFreeze(DAY);
  console.log("rebuilt", JSON.stringify(rebuilt));

  const afterCutoff = await prisma.$queryRawUnsafe(
    "SELECT dayYmd, minutes FROM CsTemimaSheetCutoff WHERE dayYmd = ?",
    DAY,
  );
  const afterFreeze = await prisma.$queryRawUnsafe(
    "SELECT COUNT(*) AS n FROM CsTemimaSheetFreeze WHERE dayYmd = ?",
    DAY,
  );
  console.log(
    "after",
    JSON.stringify(
      { cutoff: afterCutoff, freezeCount: afterFreeze },
      (_, v) => (typeof v === "bigint" ? Number(v) : v),
    ),
  );
}

main()
  .catch((e) => {
    console.error("FAIL", e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
