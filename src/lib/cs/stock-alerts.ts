import "server-only";

import { ensureCsTables } from "@/lib/cs/agents";
import { getPrismaClient } from "@/lib/db";

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

/** Kept for API compatibility; stock threshold is report-only (no bell notifications). */
export async function listOpenStockAlerts(): Promise<OpenStockAlert[]> {
  return [];
}

/**
 * Stock threshold alerts are report-only (admin reorder report / transfers sheet).
 * Close any leftover open CsStockAlert rows from the old notification flow; do not
 * create new alerts or send WhatsApp.
 */
export async function runStockAlertCheck(): Promise<{
  checked: number;
  opened: number;
  resolved: number;
  whatsappSent: number;
  errors: string[];
  notificationsDisabled: boolean;
}> {
  const prisma = getPrismaClient();
  if (!prisma) {
    return {
      checked: 0,
      opened: 0,
      resolved: 0,
      whatsappSent: 0,
      errors: ["DB offline"],
      notificationsDisabled: true,
    };
  }

  await ensureCsTables();

  let resolved = 0;
  const errors: string[] = [];
  try {
    const result = await prisma.$executeRawUnsafe(
      `UPDATE \`CsStockAlert\`
       SET \`resolvedAt\` = NOW(3), \`updatedAt\` = NOW(3)
       WHERE \`resolvedAt\` IS NULL`,
    );
    resolved = Number(result) || 0;
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  return {
    checked: 0,
    opened: 0,
    resolved,
    whatsappSent: 0,
    errors: errors.slice(0, 20),
    notificationsDisabled: true,
  };
}
