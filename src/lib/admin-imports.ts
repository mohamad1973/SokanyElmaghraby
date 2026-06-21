import "server-only";

import { getPrismaClient } from "./db";
import { getWordPressCategoryTree } from "./menu";
import type { Product, WooCategoryNode } from "./types";
import { getProducts } from "./woocommerce";

async function ensureImportTables(prisma: NonNullable<ReturnType<typeof getPrismaClient>>) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`ImportedProduct\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`productId\` INT NOT NULL,
      \`slug\` VARCHAR(191) NOT NULL,
      \`name\` VARCHAR(255) NOT NULL,
      \`payload\` JSON NOT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE INDEX \`ImportedProduct_productId_key\`(\`productId\`),
      INDEX \`ImportedProduct_slug_idx\`(\`slug\`),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`ImportedCategory\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`categoryId\` INT NOT NULL,
      \`slug\` VARCHAR(191) NOT NULL,
      \`name\` VARCHAR(255) NOT NULL,
      \`parentId\` INT NOT NULL DEFAULT 0,
      \`payload\` JSON NOT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE INDEX \`ImportedCategory_categoryId_key\`(\`categoryId\`),
      INDEX \`ImportedCategory_slug_idx\`(\`slug\`),
      INDEX \`ImportedCategory_parentId_idx\`(\`parentId\`),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
}

function flattenCategories(categories: WooCategoryNode[]): WooCategoryNode[] {
  return categories.flatMap((category) => [category, ...flattenCategories(category.children)]);
}

export async function importProductsFromWordPress() {
  const prisma = getPrismaClient();

  if (!prisma) {
    throw new Error("DATABASE_URL is not configured.");
  }

  await ensureImportTables(prisma);

  const products = await getProducts(100);

  await Promise.all(products.map((product: Product) => prisma.$executeRaw`
    INSERT INTO ImportedProduct (productId, slug, name, payload)
    VALUES (${product.id}, ${product.slug}, ${product.name}, CAST(${JSON.stringify(product)} AS JSON))
    ON DUPLICATE KEY UPDATE
      slug = VALUES(slug),
      name = VALUES(name),
      payload = VALUES(payload),
      updatedAt = CURRENT_TIMESTAMP(3)
  `));

  return { count: products.length };
}

export async function importCategoriesFromWordPress() {
  const prisma = getPrismaClient();

  if (!prisma) {
    throw new Error("DATABASE_URL is not configured.");
  }

  await ensureImportTables(prisma);

  const categories = flattenCategories(await getWordPressCategoryTree());

  await Promise.all(categories.map((category) => prisma.$executeRaw`
    INSERT INTO ImportedCategory (categoryId, slug, name, parentId, payload)
    VALUES (${category.id}, ${category.slug}, ${category.title}, ${category.parent}, CAST(${JSON.stringify(category)} AS JSON))
    ON DUPLICATE KEY UPDATE
      slug = VALUES(slug),
      name = VALUES(name),
      parentId = VALUES(parentId),
      payload = VALUES(payload),
      updatedAt = CURRENT_TIMESTAMP(3)
  `));

  return { count: categories.length };
}
