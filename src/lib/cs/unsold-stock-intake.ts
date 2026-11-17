import "server-only";

import { ensureBostaReturnCaptureTable } from "@/lib/cs/bosta-return-capture";
import { ensureBostaReturnProductTable } from "@/lib/cs/bosta-return-product";
import { ensureBostaReturnReviewTable } from "@/lib/cs/bosta-return-review";
import { ensureMaintenanceLifecycleColumns } from "@/lib/cs/bosta-return-lifecycle";
import { cairoTodayYmd } from "@/lib/cs/order-window";
import { getPrismaClient } from "@/lib/db";

function stamp() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const h = String(now.getUTCHours()).padStart(2, "0");
  const min = String(now.getUTCMinutes()).padStart(2, "0");
  const s = String(now.getUTCSeconds()).padStart(2, "0");
  return `${y}${m}${d}${h}${min}${s}`;
}

function buildTracking(index: number) {
  const suffix = `${Math.floor(Math.random() * 900 + 100)}${index}`;
  return `STK-${stamp()}-${suffix}`.slice(0, 64);
}

/** Register never-sold defective shelf/import units into the shared maintenance pipeline. */
export async function registerUnsoldStockDefects(input: {
  productId: number;
  productName: string;
  productCode?: string;
  quantity: number;
  note?: string;
  defect?: string;
}) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة.", count: 0 };

  const productId = Number(input.productId);
  const productName = String(input.productName || "").trim().slice(0, 191);
  const productCode = String(input.productCode || "").trim().slice(0, 64);
  const quantity = Math.min(50, Math.max(1, Math.floor(Number(input.quantity) || 0)));
  const note = String(input.note || "").trim().slice(0, 2000);
  const defect = String(input.defect || "manufacturing").trim() || "manufacturing";

  if (!Number.isInteger(productId) || productId === 0) {
    return { ok: false as const, message: "اختَر منتجًا.", count: 0 };
  }
  if (productName.length < 2) {
    return { ok: false as const, message: "اسم المنتج ناقص.", count: 0 };
  }
  if (!quantity) {
    return { ok: false as const, message: "حدّد الكمية (1–50).", count: 0 };
  }

  await ensureMaintenanceLifecycleColumns();
  await ensureBostaReturnCaptureTable();
  await ensureBostaReturnReviewTable();
  await ensureBostaReturnProductTable();

  const day = cairoTodayYmd();
  const trackings: string[] = [];

  for (let i = 1; i <= quantity; i += 1) {
    const tracking = buildTracking(i);
    trackings.push(tracking);

    await prisma.$executeRawUnsafe(
      `INSERT INTO \`CsBostaReturnCapture\`
        (\`trackingNumber\`, \`seenDay\`, \`kind\`, \`reasonText\`, \`customerName\`, \`phone\`,
         \`businessReference\`, \`wooOrderNumber\`, \`confirmationId\`, \`source\`, \`note\`, \`openedAt\`, \`capturedAt\`)
       VALUES (?, ?, 'unsold', ?, '', '', ?, '', NULL, 'unsold_stock', ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
      tracking,
      day,
      "مخزون معيب · جديد لم يُبع",
      productCode || productName,
      note || null,
    );

    await prisma.$executeRawUnsafe(
      `INSERT INTO \`CsBostaReturnReview\`
        (\`trackingNumber\`, \`condition\`, \`defects\`, \`destination\`, \`bostaClaim\`, \`usage\`,
         \`deliveredToMaintenanceAt\`, \`inspectedAt\`, \`updatedAt\`)
       VALUES (?, 'defective', ?, 'maintenance', 0, 'new', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE
         \`condition\` = 'defective',
         \`defects\` = VALUES(\`defects\`),
         \`destination\` = 'maintenance',
         \`usage\` = 'new',
         \`deliveredToMaintenanceAt\` = COALESCE(\`deliveredToMaintenanceAt\`, CURRENT_TIMESTAMP(3)),
         \`inspectedAt\` = COALESCE(\`inspectedAt\`, CURRENT_TIMESTAMP(3)),
         \`updatedAt\` = CURRENT_TIMESTAMP(3)`,
      tracking,
      defect,
    );

    await prisma.$executeRawUnsafe(
      `INSERT INTO \`CsBostaReturnProduct\`
        (\`trackingNumber\`, \`productId\`, \`productName\`, \`productCode\`,
         \`condition\`, \`defects\`, \`destination\`, \`usage\`,
         \`deliveredToMaintenanceAt\`, \`inspectedAt\`, \`updatedAt\`)
       VALUES (?, ?, ?, ?, 'defective', ?, 'maintenance', 'new',
               CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE
         \`productName\` = VALUES(\`productName\`),
         \`productCode\` = VALUES(\`productCode\`),
         \`condition\` = 'defective',
         \`defects\` = VALUES(\`defects\`),
         \`destination\` = 'maintenance',
         \`usage\` = 'new',
         \`deliveredToMaintenanceAt\` = COALESCE(\`deliveredToMaintenanceAt\`, CURRENT_TIMESTAMP(3)),
         \`inspectedAt\` = COALESCE(\`inspectedAt\`, CURRENT_TIMESTAMP(3)),
         \`updatedAt\` = CURRENT_TIMESTAMP(3)`,
      tracking,
      productId,
      productName,
      productCode,
      defect,
    );

    try {
      const { recordReturnTrackEvent } = await import("@/lib/cs/return-track");
      await recordReturnTrackEvent({
        trackingNumber: tracking,
        stage: "warehouse_captured",
        meta: { source: "unsold_stock", origin: "unsold_stock", productId, productName },
      });
    } catch (error) {
      console.warn("[return-track] unsold stock", error instanceof Error ? error.message : error);
    }
  }

  return { ok: true as const, count: trackings.length, trackings };
}
