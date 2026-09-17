const { createRequire } = require("module");
const requireFromCjs = createRequire(__filename);
const { PrismaClient } = requireFromCjs("@prisma/client");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL first (Remote MySQL on Hostinger).");
  process.exit(1);
}

const prisma = new PrismaClient({
  datasources: { db: { url } },
});

async function main() {
  const rows = await prisma.$queryRawUnsafe(
    "SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = DATABASE()",
  );
  console.log("OK", JSON.stringify(rows));
}

main()
  .catch((e) => {
    console.error("FAIL", e.code || "", e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
