/**
 * Freeze Sayed Temima sheet day(s): cutoff + freeze snapshot.
 *
 * Usage:
 *   node scripts/backfill-temima-freeze-day.cjs 2026-10-17
 *   node scripts/backfill-temima-freeze-day.cjs --all-past
 *
 * --all-past freezes every Cairo day before today that has sheet activity
 * and is not already in CsTemimaSheetFreezeDay.
 */
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const CAIRO_OFFSET = "+02:00";
const arg = process.argv[2] || "--all-past";
const allPast = arg === "--all-past";
const dayArg = allPast ? null : arg;

if (!allPast && !/^\d{4}-\d{2}-\d{2}$/.test(dayArg || "")) {
  console.error("Usage: node scripts/backfill-temima-freeze-day.cjs YYYY-MM-DD|--all-past");
  process.exit(1);
}

function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    let v = line.slice(i + 1);
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    const k = line.slice(0, i);
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnv();
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });

function cairoTodayYmd() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value || "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function cairoBounds(ymd) {
  const startMs = Date.parse(`${ymd}T00:00:00${CAIRO_OFFSET}`);
  return { start: new Date(startMs), end: new Date(startMs + 24 * 60 * 60 * 1000) };
}

function addCairoDays(ymd, delta) {
  const startMs = Date.parse(`${ymd}T00:00:00${CAIRO_OFFSET}`) + delta * 24 * 60 * 60 * 1000;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(startMs));
  const get = (t) => parts.find((p) => p.type === t)?.value || "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function eachDayInclusive(fromYmd, toYmd) {
  const days = [];
  let cur = fromYmd;
  while (cur <= toYmd) {
    days.push(cur);
    cur = addCairoDays(cur, 1);
  }
  return days;
}

async function ensureTables() {
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
      \`serial\` INT NULL,
      PRIMARY KEY (\`dayYmd\`, \`confirmationId\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`CsTemimaSheetPrintCount\` (
      \`dayYmd\` VARCHAR(10) NOT NULL,
      \`count\` INT NOT NULL DEFAULT 0,
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`dayYmd\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
}

async function listPastDaysWithActivity(beforeYmd) {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT DISTINCT dayYmd FROM (
      SELECT DATE_FORMAT(CONVERT_TZ(confirmedAt, '+00:00', '${CAIRO_OFFSET}'), '%Y-%m-%d') AS dayYmd
      FROM CsOrderConfirmation
      WHERE status = 'CONFIRMED' AND shippingCompany = 'sayed_temima' AND confirmedAt IS NOT NULL
      UNION
      SELECT DATE_FORMAT(CONVERT_TZ(handedToCarrierAt, '+00:00', '${CAIRO_OFFSET}'), '%Y-%m-%d') AS dayYmd
      FROM CsOrderConfirmation
      WHERE status = 'CONFIRMED' AND shippingCompany = 'sayed_temima' AND handedToCarrierAt IS NOT NULL
      UNION
      SELECT dayYmd FROM CsTemimaSheetEdit
      UNION
      SELECT dayYmd FROM CsTemimaSheetCutoff
    ) days
    WHERE dayYmd IS NOT NULL AND dayYmd < ?
    ORDER BY dayYmd ASC
  `, beforeYmd);
  return rows.map((r) => String(r.dayYmd));
}

async function freezeOneDay(dayYmd) {
  const existing = await prisma.$queryRawUnsafe(
    "SELECT dayYmd FROM CsTemimaSheetFreezeDay WHERE dayYmd = ? LIMIT 1",
    dayYmd,
  );
  if (existing.length) {
    return { dayYmd, alreadyFrozen: true, orderCount: null };
  }

  const cutoff = await prisma.csTemimaSheetCutoff.findUnique({ where: { dayYmd } });
  if (!cutoff) {
    await prisma.csTemimaSheetCutoff.create({ data: { dayYmd, minutes: 12 * 60 } });
  }

  const { start, end } = cairoBounds(dayYmd);
  const rows = await prisma.csOrderConfirmation.findMany({
    where: {
      status: "CONFIRMED",
      shippingCompany: "sayed_temima",
      OR: [
        { confirmedAt: { gte: start, lt: end } },
        { handedToCarrierAt: { gte: start, lt: end } },
      ],
    },
    select: { id: true, wooOrderNumber: true },
    orderBy: { id: "desc" },
    take: 5000,
  });

  const edits = await prisma.csTemimaSheetEdit.findMany({
    where: { dayYmd, kind: "include" },
    select: { confirmationId: true },
  });
  const have = new Set(rows.map((r) => r.id));
  const extraIds = edits.map((e) => e.confirmationId).filter((id) => !have.has(id));
  const extra = extraIds.length
    ? await prisma.csOrderConfirmation.findMany({
        where: { id: { in: extraIds } },
        select: { id: true, wooOrderNumber: true },
      })
    : [];

  const excludeIds = new Set(
    (
      await prisma.csTemimaSheetEdit.findMany({
        where: { dayYmd, kind: "exclude" },
        select: { confirmationId: true },
      })
    ).map((e) => e.confirmationId),
  );

  const all = [...rows, ...extra].filter((r) => !excludeIds.has(r.id));
  const ordered = [...all].sort((a, b) => {
    const na = Number(String(a.wooOrderNumber).replace(/\D/g, "")) || 0;
    const nb = Number(String(b.wooOrderNumber).replace(/\D/g, "")) || 0;
    return nb - na;
  });

  // Skip empty past days with no orders and no edits — no sheet to freeze.
  if (!ordered.length) {
    return { dayYmd, alreadyFrozen: false, skippedEmpty: true, orderCount: 0 };
  }

  if (ordered.length) {
    const placeholders = ordered.map(() => "(?, ?, ?)").join(", ");
    const params = ordered.flatMap((row, index) => [dayYmd, row.id, index + 1]);
    await prisma.$executeRawUnsafe(
      `INSERT IGNORE INTO CsTemimaSheetFreeze (dayYmd, confirmationId, serial) VALUES ${placeholders}`,
      ...params,
    );
  }
  await prisma.$executeRawUnsafe("INSERT IGNORE INTO CsTemimaSheetFreezeDay (dayYmd) VALUES (?)", dayYmd);
  await prisma.$executeRawUnsafe(
    `INSERT INTO CsTemimaSheetPrintCount (dayYmd, count) VALUES (?, 5)
     ON DUPLICATE KEY UPDATE count = GREATEST(count, 5)`,
    dayYmd,
  );

  const check = await prisma.$queryRawUnsafe(
    "SELECT COUNT(*) AS c FROM CsTemimaSheetFreeze WHERE dayYmd = ?",
    dayYmd,
  );
  const c = typeof check[0]?.c === "bigint" ? Number(check[0].c) : Number(check[0]?.c || 0);
  return { dayYmd, alreadyFrozen: false, skippedEmpty: false, orderCount: c };
}

async function main() {
  await ensureTables();
  const today = cairoTodayYmd();
  const yesterday = addCairoDays(today, -1);

  let days;
  if (allPast) {
    days = await listPastDaysWithActivity(today);
    // Always include continuum from earliest frozen/activity through yesterday
    // so gaps between print days still get closed if they had activity.
    if (!days.length) {
      days = eachDayInclusive("2026-09-01", yesterday);
    } else {
      const from = days[0] < "2026-09-01" ? days[0] : "2026-09-01";
      const activitySet = new Set(days);
      days = eachDayInclusive(from, yesterday).filter((d) => activitySet.has(d));
    }
  } else {
    days = [dayArg];
  }

  const results = [];
  for (const day of days) {
    if (day >= today) continue;
    const result = await freezeOneDay(day);
    results.push(result);
    console.log(JSON.stringify(result));
  }

  const frozenNow = results.filter((r) => !r.alreadyFrozen && !r.skippedEmpty).length;
  const already = results.filter((r) => r.alreadyFrozen).length;
  const empty = results.filter((r) => r.skippedEmpty).length;
  console.log(
    JSON.stringify({
      ok: true,
      mode: allPast ? "all-past" : "single",
      today,
      daysConsidered: days.length,
      newlyFrozen: frozenNow,
      alreadyFrozen: already,
      skippedEmpty: empty,
    }),
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
