/**
 * One-shot: delete failed exchange child #147862-X1 (id 70158).
 * Does not modify the parent #147862 row.
 *
 * Usage: node scripts/cleanup-failed-fulfillment-147862.cjs
 * Requires DATABASE_URL (or load from .env.local in the shell).
 */
const { PrismaClient } = require("@prisma/client");

const PARENT_NUMBER = "147862";
const CHILD_ID = 70158;
const CHILD_NUMBER = "147862-X1";

const prisma = new PrismaClient();

async function dumpParent(label) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT id, wooOrderNumber, shippingCompany, monaCourierId, trackingNumber,
            fulfillmentKind, parentConfirmationId, status
     FROM CsOrderConfirmation WHERE wooOrderNumber = ? LIMIT 1`,
    PARENT_NUMBER,
  );
  console.log(label, JSON.stringify(rows[0] || null, null, 2));
  return rows[0] || null;
}

(async () => {
  await dumpParent("BEFORE parent");
  const child = await prisma.$queryRawUnsafe(
    `SELECT id, wooOrderNumber, parentConfirmationId, fulfillmentKind, trackingNumber
     FROM CsOrderConfirmation WHERE id = ? LIMIT 1`,
    CHILD_ID,
  );
  console.log("child", JSON.stringify(child[0] || null, null, 2));
  if (!child[0]) {
    console.log("Child already gone — nothing to delete.");
    await dumpParent("AFTER parent");
    await prisma.$disconnect();
    return;
  }
  if (String(child[0].wooOrderNumber) !== CHILD_NUMBER) {
    throw new Error(`Refusing delete: id ${CHILD_ID} is ${child[0].wooOrderNumber}, expected ${CHILD_NUMBER}`);
  }
  const parent = await prisma.$queryRawUnsafe(
    `SELECT id FROM CsOrderConfirmation WHERE wooOrderNumber = ? LIMIT 1`,
    PARENT_NUMBER,
  );
  if (!parent[0] || Number(child[0].parentConfirmationId) !== Number(parent[0].id)) {
    throw new Error("Refusing delete: child is not linked to parent 147862.");
  }

  const answers = await prisma.$executeRawUnsafe(
    `DELETE FROM CsChecklistAnswer WHERE confirmationId = ?`,
    CHILD_ID,
  );
  console.log("deleted answers rows:", Number(answers) || 0);
  const deleted = await prisma.$executeRawUnsafe(
    `DELETE FROM CsOrderConfirmation WHERE id = ? AND wooOrderNumber = ?`,
    CHILD_ID,
    CHILD_NUMBER,
  );
  console.log("deleted confirmation rows:", Number(deleted) || 0);

  const leftover = await prisma.$queryRawUnsafe(
    `SELECT id, wooOrderNumber FROM CsOrderConfirmation WHERE parentConfirmationId = ?`,
    Number(parent[0].id),
  );
  console.log("remaining children", JSON.stringify(leftover, null, 2));
  await dumpParent("AFTER parent");
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
