import "server-only";

import { ensureCsTables, listCsAgents } from "@/lib/cs/agents";
import { getPrismaClient } from "@/lib/db";
import { getReorderProducts } from "@/lib/reorder-report";
import { sendPlainWhatsAppText } from "@/lib/whatsapp";

export type OpenStockAlert = {
  id: number;
  productId: number;
  productName: string;
  sku: string;
  model: string | null;
  stockQuantity: number;
  threshold: number;
  notifiedAt: string;
};

export async function listOpenStockAlerts(): Promise<OpenStockAlert[]> {
  const prisma = getPrismaClient();
  if (!prisma) return [];
  await ensureCsTables();

  try {
    const rows = await prisma.$queryRawUnsafe<
      Array<{
        id: number;
        productId: number;
        productName: string;
        sku: string;
        model: string | null;
        stockQuantity: number;
        threshold: number;
        notifiedAt: Date;
      }>
    >(
      `SELECT \`id\`, \`productId\`, \`productName\`, \`sku\`, \`model\`, \`stockQuantity\`, \`threshold\`, \`notifiedAt\`
       FROM \`CsStockAlert\`
       WHERE \`resolvedAt\` IS NULL
       ORDER BY \`notifiedAt\` DESC
       LIMIT 200`,
    );
    return rows.map((r) => ({
      ...r,
      notifiedAt: r.notifiedAt.toISOString(),
    }));
  } catch {
    return [];
  }
}

export async function runStockAlertCheck(): Promise<{
  checked: number;
  opened: number;
  resolved: number;
  whatsappSent: number;
  errors: string[];
}> {
  const prisma = getPrismaClient();
  const errors: string[] = [];
  if (!prisma) {
    return { checked: 0, opened: 0, resolved: 0, whatsappSent: 0, errors: ["DB offline"] };
  }

  await ensureCsTables();

  const { products } = await getReorderProducts();
  const low = products.filter((p) => p.isAtOrBelowThreshold);
  const lowIds = new Set(low.map((p) => p.id));

  let opened = 0;
  let resolved = 0;
  let whatsappSent = 0;

  // Resolve alerts that recovered above threshold
  try {
    const openRows = await prisma.$queryRawUnsafe<Array<{ id: number; productId: number }>>(
      `SELECT \`id\`, \`productId\` FROM \`CsStockAlert\` WHERE \`resolvedAt\` IS NULL`,
    );
    for (const row of openRows) {
      if (!lowIds.has(row.productId)) {
        await prisma.$executeRawUnsafe(
          `UPDATE \`CsStockAlert\` SET \`resolvedAt\` = NOW(3), \`updatedAt\` = NOW(3) WHERE \`id\` = ?`,
          row.id,
        );
        resolved += 1;
      }
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  const agents = (await listCsAgents()).filter(
    (a) => a.isActive && a.role === "transfers" && (a as { phone?: string | null }).phone,
  );

  for (const product of low) {
    try {
      const existing = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
        `SELECT \`id\` FROM \`CsStockAlert\`
         WHERE \`productId\` = ? AND \`resolvedAt\` IS NULL
         LIMIT 1`,
        product.id,
      );
      if (existing[0]) {
        // Refresh quantities on open alert
        await prisma.$executeRawUnsafe(
          `UPDATE \`CsStockAlert\` SET \`stockQuantity\` = ?, \`threshold\` = ?, \`productName\` = ?,
           \`sku\` = ?, \`model\` = ?, \`updatedAt\` = NOW(3) WHERE \`id\` = ?`,
          product.stockQuantity,
          product.threshold,
          product.name.slice(0, 180),
          product.sku.slice(0, 180),
          product.model.slice(0, 180),
          existing[0].id,
        );
        continue;
      }

      await prisma.$executeRawUnsafe(
        `INSERT INTO \`CsStockAlert\`
         (\`productId\`, \`productName\`, \`sku\`, \`model\`, \`stockQuantity\`, \`threshold\`,
          \`whatsappSent\`, \`notifiedAt\`, \`createdAt\`, \`updatedAt\`)
         VALUES (?, ?, ?, ?, ?, ?, false, NOW(3), NOW(3), NOW(3))`,
        product.id,
        product.name.slice(0, 180),
        product.sku.slice(0, 180),
        product.model.slice(0, 180),
        product.stockQuantity,
        product.threshold,
      );
      opened += 1;

      const message = [
        "تنبيه مخزون — Tooliano",
        `المنتج: ${product.name}`,
        `الموديل: ${product.model}`,
        `الكمية الحالية: ${product.stockQuantity}`,
        `حد الطلب: ${product.threshold}`,
        "يُرجى عمل طلبية تحويل للمخزن الأونلاين.",
      ].join("\n");

      let anySent = false;
      for (const agent of agents) {
        const phone = (agent as { phone?: string | null }).phone;
        if (!phone) continue;
        const result = await sendPlainWhatsAppText(phone, message);
        if (result.ok) {
          whatsappSent += 1;
          anySent = true;
        } else {
          errors.push(`${agent.username}: ${result.message}`);
        }
      }

      if (anySent) {
        await prisma.$executeRawUnsafe(
          `UPDATE \`CsStockAlert\` SET \`whatsappSent\` = true, \`updatedAt\` = NOW(3)
           WHERE \`productId\` = ? AND \`resolvedAt\` IS NULL`,
          product.id,
        );
      }
    } catch (error) {
      errors.push(
        `product ${product.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return {
    checked: products.length,
    opened,
    resolved,
    whatsappSent,
    errors: errors.slice(0, 20),
  };
}
