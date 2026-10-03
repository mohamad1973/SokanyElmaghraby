import "server-only";

import { getPrismaClient } from "@/lib/db";
import { cashAmountOf } from "@/lib/cs/temima-settlement";
import { updateBostaDeliveryCod } from "@/lib/shipping/bosta-client";
import { appendWooOrderProduct, removeWooOrderProduct } from "@/lib/woocommerce-update";

export type OrderItemAddRow = {
  id: number;
  confirmationId: number;
  wooOrderNumber: string;
  kind: "add" | "remove";
  wooProductId: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  status: string;
};

function money(value: unknown) {
  const n = Number(String(value ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

async function ensureTable() {
  const prisma = getPrismaClient();
  if (!prisma) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`CsOrderItemAdd\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`confirmationId\` INT NOT NULL,
      \`kind\` VARCHAR(16) NOT NULL DEFAULT 'add',
      \`wooProductId\` INT NOT NULL,
      \`productName\` VARCHAR(191) NOT NULL,
      \`quantity\` INT NOT NULL,
      \`unitPrice\` DECIMAL(12,2) NOT NULL,
      \`lineTotal\` DECIMAL(12,2) NOT NULL,
      \`status\` VARCHAR(16) NOT NULL DEFAULT 'pending',
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`decidedAt\` DATETIME(3) NULL,
      INDEX \`CsOrderItemAdd_confirmationId_idx\`(\`confirmationId\`),
      INDEX \`CsOrderItemAdd_status_idx\`(\`status\`),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  try {
    await prisma.$executeRawUnsafe("ALTER TABLE `CsOrderItemAdd` ADD COLUMN `kind` VARCHAR(16) NOT NULL DEFAULT 'add'");
  } catch {
    // column already exists
  }
}

export async function listOrderItemAdds(confirmationId: number) {
  const prisma = getPrismaClient();
  if (!prisma) return [];
  await ensureTable();
  const rows = await prisma.$queryRaw<
    Array<{
      id: number;
      confirmationId: number;
      kind: string;
      wooProductId: number;
      productName: string;
      quantity: number;
      unitPrice: unknown;
      lineTotal: unknown;
      status: string;
    }>
  >`
    SELECT id, confirmationId, kind, wooProductId, productName, quantity, unitPrice, lineTotal, status
    FROM CsOrderItemAdd
    WHERE confirmationId = ${confirmationId}
    ORDER BY id DESC
  `;
  return rows.map((row) => ({
    id: Number(row.id),
    confirmationId: Number(row.confirmationId),
    kind: row.kind === "remove" ? ("remove" as const) : ("add" as const),
    wooProductId: Number(row.wooProductId),
    productName: row.productName,
    quantity: Number(row.quantity),
    unitPrice: money(row.unitPrice),
    lineTotal: money(row.lineTotal),
    status: row.status,
  }));
}

export async function listPendingOrderItemAdds(): Promise<OrderItemAddRow[]> {
  const prisma = getPrismaClient();
  if (!prisma) return [];
  await ensureTable();
  const rows = await prisma.$queryRaw<
    Array<{
      id: number;
      confirmationId: number;
      wooOrderNumber: string;
      kind: string;
      wooProductId: number;
      productName: string;
      quantity: number;
      unitPrice: unknown;
      lineTotal: unknown;
      status: string;
    }>
  >`
    SELECT a.id, a.confirmationId, c.wooOrderNumber, a.kind, a.wooProductId, a.productName,
           a.quantity, a.unitPrice, a.lineTotal, a.status
    FROM CsOrderItemAdd a
    JOIN CsOrderConfirmation c ON c.id = a.confirmationId
    WHERE a.status = 'pending'
    ORDER BY a.id DESC
    LIMIT 40
  `;
  return rows.map((row) => ({
    id: Number(row.id),
    confirmationId: Number(row.confirmationId),
    wooOrderNumber: String(row.wooOrderNumber || ""),
    kind: row.kind === "remove" ? "remove" : "add",
    wooProductId: Number(row.wooProductId),
    productName: row.productName,
    quantity: Number(row.quantity),
    unitPrice: money(row.unitPrice),
    lineTotal: money(row.lineTotal),
    status: row.status,
  }));
}

export async function requestOrderItemChange(input: {
  confirmationId: number;
  kind: "add" | "remove";
  wooProductId: number;
  productName: string;
  quantity: number;
  unitPrice: number;
}) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متاحة." };
  const name = input.productName.trim();
  const quantity = Math.round(input.quantity);
  const unitPrice = money(input.unitPrice);
  if (!name || !Number.isInteger(quantity) || quantity < 1 || unitPrice < 0) {
    return { ok: false as const, message: "الصنف أو الكمية غير صحيحة." };
  }
  const order = await prisma.csOrderConfirmation.findUnique({
    where: { id: input.confirmationId },
    select: { id: true },
  });
  if (!order) return { ok: false as const, message: "الأوردر مش موجود." };
  await ensureTable();
  const lineTotal = Math.round(unitPrice * quantity * 100) / 100;
  await prisma.$executeRaw`
    INSERT INTO CsOrderItemAdd
      (confirmationId, kind, wooProductId, productName, quantity, unitPrice, lineTotal, status)
    VALUES
      (${input.confirmationId}, ${input.kind}, ${input.wooProductId || 0}, ${name}, ${quantity}, ${unitPrice}, ${lineTotal}, 'pending')
  `;
  return {
    ok: true as const,
    message: input.kind === "remove" ? "طلب إلغاء الصنف اتبعت للأدمن." : "طلب إضافة الصنف اتبعت للأدمن.",
  };
}

async function applyTotals(
  confirmationId: number,
  wooOrderId: number,
  total: string,
  items: Array<{ name: string; sku: string; quantity: number; price: number; total: string }>,
) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متاحة." };
  const row = await prisma.csOrderConfirmation.findUnique({
    where: { id: confirmationId },
    select: {
      customerSnapshot: true,
      depositAmount: true,
      depositPaid: true,
      trackingNumber: true,
      shippingCompany: true,
    },
  });
  if (!row) return { ok: false as const, message: "الأوردر مش موجود." };
  const snap = (row.customerSnapshot && typeof row.customerSnapshot === "object" ? row.customerSnapshot : {}) as Record<
    string,
    unknown
  >;
  const nextSnap = { ...snap, total, items };
  await prisma.csOrderConfirmation.update({
    where: { id: confirmationId },
    data: { customerSnapshot: nextSnap },
  });
  let bostaNote = "";
  if (row.shippingCompany === "bosta" && row.trackingNumber) {
    const cod = cashAmountOf({
      customerSnapshot: nextSnap,
      depositAmount: row.depositAmount,
      depositPaid: row.depositPaid,
    });
    const bosta = await updateBostaDeliveryCod(row.trackingNumber, cod);
    if (!bosta.ok) bostaNote = ` السعر اتسجل، وتحديث بوسطة: ${bosta.message}`;
  }
  void wooOrderId;
  return { ok: true as const, message: `اتحفظ السعر الجديد.${bostaNote}` };
}

export async function decideOrderItemAdd(id: number, decision: "approved" | "rejected") {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متاحة." };
  await ensureTable();
  const rows = await prisma.$queryRaw<
    Array<{
      id: number;
      confirmationId: number;
      kind: string;
      wooProductId: number;
      productName: string;
      quantity: number;
      unitPrice: unknown;
      status: string;
    }>
  >`
    SELECT id, confirmationId, kind, wooProductId, productName, quantity, unitPrice, status
    FROM CsOrderItemAdd
    WHERE id = ${id}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return { ok: false as const, message: "الطلب مش موجود." };
  if (row.status !== "pending") return { ok: false as const, message: "الطلب اتقرر قبل كده." };
  if (decision === "rejected") {
    await prisma.$executeRaw`
      UPDATE CsOrderItemAdd SET status = 'rejected', decidedAt = NOW(3) WHERE id = ${id} AND status = 'pending'
    `;
    return { ok: true as const, message: "تم رفض التعديل. السعر زي ما هو." };
  }
  const order = await prisma.csOrderConfirmation.findUnique({
    where: { id: Number(row.confirmationId) },
    select: { wooOrderId: true, customerSnapshot: true },
  });
  if (!order) return { ok: false as const, message: "الأوردر مش موجود." };
  const kind = row.kind === "remove" ? "remove" : "add";
  const woo =
    kind === "remove"
      ? await removeWooOrderProduct(order.wooOrderId, row.productName, Number(row.wooProductId))
      : await appendWooOrderProduct(order.wooOrderId, Number(row.wooProductId), Number(row.quantity));
  if (!woo.ok) {
    const snap = (order.customerSnapshot && typeof order.customerSnapshot === "object" ? order.customerSnapshot : {}) as {
      total?: string;
      items?: Array<{ name?: string; quantity?: number; total?: string; price?: number; sku?: string }>;
    };
    const items = [...(snap.items || [])];
    const price = money(row.unitPrice);
    const qty = Number(row.quantity);
    if (kind === "add") {
      items.push({ name: row.productName, quantity: qty, price, total: String(price * qty), sku: "" });
    } else {
      const index = items.findIndex((item) => String(item.name || "").trim() === row.productName.trim());
      if (index >= 0) items.splice(index, 1);
    }
    const base = money(snap.total);
    const nextTotal = String(Math.max(0, kind === "add" ? base + price * qty : base - price * qty));
    const applied = await applyTotals(
      Number(row.confirmationId),
      order.wooOrderId,
      nextTotal,
      items.map((item) => ({
        name: String(item.name || ""),
        sku: String(item.sku || ""),
        quantity: Number(item.quantity || 1),
        price: Number(item.price || 0),
        total: String(item.total || "0"),
      })),
    );
    if (!applied.ok) return applied;
    await prisma.$executeRaw`
      UPDATE CsOrderItemAdd SET status = 'approved', decidedAt = NOW(3) WHERE id = ${id} AND status = 'pending'
    `;
    return { ok: true as const, message: `${applied.message} ووكومرس: ${woo.message}` };
  }
  const applied = await applyTotals(Number(row.confirmationId), order.wooOrderId, woo.total, woo.items);
  if (!applied.ok) return applied;
  await prisma.$executeRaw`
    UPDATE CsOrderItemAdd SET status = 'approved', decidedAt = NOW(3) WHERE id = ${id} AND status = 'pending'
  `;
  return applied;
}
