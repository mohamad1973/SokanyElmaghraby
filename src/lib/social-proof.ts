import { getPrismaClient } from "@/lib/db";
import { getProductDisplayCode } from "@/lib/product-display-code";
import { getThemeSettings } from "@/lib/theme-settings";
import { getProducts } from "@/lib/woocommerce";

export type SocialProofEvent = {
  id: number;
  productName: string;
  productCode: string;
  createdAt: string;
};

export type SocialProofProduct = {
  name: string;
  code: string;
};

export { formatSocialProofMessage } from "./social-proof-format";

const MAX_EVENTS = 20;

async function ensureSocialProofTable(prisma: NonNullable<ReturnType<typeof getPrismaClient>>) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`SocialProofEvent\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`productName\` VARCHAR(512) NOT NULL,
      \`productCode\` VARCHAR(128) NOT NULL DEFAULT '',
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`SocialProofEvent_createdAt_idx\` (\`createdAt\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
}

export async function recordSocialProofEvent(productName: string, productCode = "") {
  const prisma = getPrismaClient();
  const name = productName.trim();

  if (!prisma || !name) {
    return;
  }

  try {
    await ensureSocialProofTable(prisma);

    await prisma.$executeRaw`
      INSERT INTO SocialProofEvent (productName, productCode)
      VALUES (${name.slice(0, 512)}, ${productCode.trim().slice(0, 128)})
    `;

    await prisma.$executeRawUnsafe(`
      DELETE FROM SocialProofEvent
      WHERE id NOT IN (
        SELECT id FROM (
          SELECT id FROM SocialProofEvent ORDER BY createdAt DESC, id DESC LIMIT ${MAX_EVENTS}
        ) AS keep_rows
      )
    `);
  } catch {
    // Social proof is best-effort; never fail the webhook/order path.
  }
}

export async function listSocialProofEvents(limit = 10): Promise<SocialProofEvent[]> {
  const prisma = getPrismaClient();

  if (!prisma) {
    return [];
  }

  try {
    await ensureSocialProofTable(prisma);

    const rows = await prisma.$queryRaw<
      Array<{ id: number; productName: string; productCode: string; createdAt: Date | string }>
    >`
      SELECT id, productName, productCode, createdAt
      FROM SocialProofEvent
      ORDER BY createdAt DESC, id DESC
      LIMIT ${Math.max(1, Math.min(limit, MAX_EVENTS))}
    `;

    return rows.map((row) => ({
      id: Number(row.id),
      productName: row.productName,
      productCode: row.productCode || "",
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    }));
  } catch {
    return [];
  }
}

export async function listSocialProofCatalogProducts(limit = 24): Promise<SocialProofProduct[]> {
  const [products, settings] = await Promise.all([getProducts(limit), getThemeSettings()]);
  const codeMode = settings.productCard.codeMode;

  return products.map((product) => ({
    name: product.name,
    code: getProductDisplayCode(product, codeMode) || product.sku || "",
  }));
}
