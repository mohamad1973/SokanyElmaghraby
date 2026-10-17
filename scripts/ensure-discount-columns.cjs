/**
 * Safe ADD COLUMN for discount approval fields only.
 * Never runs prisma db push / --accept-data-loss.
 */
require("dotenv").config({ path: ".env.local" });

const { createRequire } = require("module");
const requireFromCjs = createRequire(__filename);
const { PrismaClient } = requireFromCjs("@prisma/client");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL missing in .env.local");
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });

const COLUMNS = [
  {
    name: "discountApprovalStatus",
    sql: "ALTER TABLE `CsOrderConfirmation` ADD COLUMN `discountApprovalStatus` VARCHAR(32) NOT NULL DEFAULT 'none'",
  },
  {
    name: "discountApprovalRequestedAt",
    sql: "ALTER TABLE `CsOrderConfirmation` ADD COLUMN `discountApprovalRequestedAt` DATETIME(3) NULL",
  },
  {
    name: "discountApprovalDecidedAt",
    sql: "ALTER TABLE `CsOrderConfirmation` ADD COLUMN `discountApprovalDecidedAt` DATETIME(3) NULL",
  },
  {
    name: "discountAgentDecisionSeenAt",
    sql: "ALTER TABLE `CsOrderConfirmation` ADD COLUMN `discountAgentDecisionSeenAt` DATETIME(3) NULL",
  },
];

async function columnExists(name) {
  if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error(`bad column ${name}`);
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'CsOrderConfirmation'
       AND COLUMN_NAME = '${name}'`,
  );
  const c = rows[0]?.c ?? rows[0]?.C;
  return Number(c) > 0;
}

async function indexExists(name) {
  if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error(`bad index ${name}`);
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'CsOrderConfirmation'
       AND INDEX_NAME = '${name}'`,
  );
  const c = rows[0]?.c ?? rows[0]?.C;
  return Number(c) > 0;
}

async function main() {
  const before = {};
  for (const col of COLUMNS) {
    before[col.name] = await columnExists(col.name);
  }
  console.log("before", JSON.stringify(before));

  for (const col of COLUMNS) {
    if (before[col.name]) {
      console.log("skip", col.name, "(exists)");
      continue;
    }
    try {
      await prisma.$executeRawUnsafe(col.sql);
      console.log("added", col.name);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/Duplicate column|already exists/i.test(message)) {
        console.log("skip", col.name, "(duplicate)");
      } else {
        throw error;
      }
    }
  }

  const indexName = "CsOrderConfirmation_discountApprovalStatus_idx";
  if (!(await indexExists(indexName))) {
    try {
      await prisma.$executeRawUnsafe(
        `CREATE INDEX \`${indexName}\` ON \`CsOrderConfirmation\` (\`discountApprovalStatus\`)`,
      );
      console.log("added index", indexName);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/Duplicate|already exists/i.test(message)) {
        console.log("skip index", indexName);
      } else {
        console.warn("index warning:", message.slice(0, 200));
      }
    }
  } else {
    console.log("skip index", indexName, "(exists)");
  }

  // Smoke via SQL (works even if local Prisma client is stale)
  const smoke = await prisma.$queryRawUnsafe(
    `SELECT id, discountApprovalStatus, orderTotalDelta
     FROM CsOrderConfirmation
     ORDER BY id DESC
     LIMIT 1`,
  );
  console.log(
    "smoke",
    JSON.stringify(
      (smoke || []).map((row) => {
        const out = {};
        for (const [k, v] of Object.entries(row)) {
          out[k] = typeof v === "bigint" ? Number(v) : v;
        }
        return out;
      }),
    ),
  );

  const after = {};
  for (const col of COLUMNS) {
    after[col.name] = await columnExists(col.name);
  }
  console.log("after", JSON.stringify(after));
  const missing = Object.entries(after)
    .filter(([, ok]) => !ok)
    .map(([name]) => name);
  if (missing.length) {
    throw new Error(`Still missing columns: ${missing.join(", ")}`);
  }
  console.log("OK discount columns ready");
}

main()
  .catch((e) => {
    console.error("FAIL", e.code || "", e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
