require("dotenv").config({ path: ".env.local" });
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient();

async function tableExists(name) {
  const rows = await prisma.$queryRawUnsafe(`SHOW TABLES LIKE '${name}'`);
  return Array.isArray(rows) && rows.length > 0;
}

async function count(table) {
  const rows = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM \`${table}\``);
  return Number(rows[0]?.c ?? 0);
}

async function importGroupBuySchema() {
  const sqlPath = path.join(process.cwd(), "final", "database", "group-buy-schema.sql");
  if (!fs.existsSync(sqlPath)) {
    throw new Error(`Missing ${sqlPath}`);
  }
  let sql = fs.readFileSync(sqlPath, "utf8");
  // Strip comments and split by semicolons carefully enough for CREATE TABLE statements
  sql = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
    console.log("executed", statement.slice(0, 60).replace(/\s+/g, " "), "...");
  }
}

async function main() {
  const needed = ["GbUser", "GbVendorProfile", "GbProductSubmission", "GbGroupBuyOrder"];
  const status = {};
  for (const t of needed) {
    status[t] = await tableExists(t);
  }
  console.log("EXISTS", status);

  const missing = needed.filter((t) => !status[t]);
  if (missing.length) {
    console.log("IMPORTING group-buy-schema.sql for missing:", missing.join(", "));
    await importGroupBuySchema();
    for (const t of needed) {
      status[t] = await tableExists(t);
    }
    console.log("EXISTS_AFTER", status);
  }

  for (const t of needed) {
    if (status[t]) {
      console.log("COUNT", t, await count(t));
    } else {
      console.log("STILL_MISSING", t);
    }
  }

  // Sanity: Prisma client models
  try {
    const vendors = await prisma.gbVendorProfile.count();
    const subs = await prisma.gbProductSubmission.count();
    const orders = await prisma.gbGroupBuyOrder.count();
    console.log("PRISMA_OK", { vendors, subs, orders });
  } catch (e) {
    console.log("PRISMA_ERR", e.message);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
