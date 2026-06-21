import "server-only";

import { getPrismaClient } from "./db";

export type MediaAsset = {
  id: number;
  filename: string;
  mimeType: string;
  size: number;
  data: Buffer;
};

async function ensureMediaTable(prisma: NonNullable<ReturnType<typeof getPrismaClient>>) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`AdminMediaAsset\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`filename\` VARCHAR(255) NOT NULL,
      \`mimeType\` VARCHAR(100) NOT NULL,
      \`size\` INT NOT NULL,
      \`purpose\` VARCHAR(191) NOT NULL,
      \`data\` LONGBLOB NOT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`AdminMediaAsset_purpose_idx\`(\`purpose\`),
      INDEX \`AdminMediaAsset_createdAt_idx\`(\`createdAt\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
}

export async function saveMediaAsset({
  filename,
  mimeType,
  size,
  purpose,
  data,
}: {
  filename: string;
  mimeType: string;
  size: number;
  purpose: string;
  data: Buffer;
}) {
  const prisma = getPrismaClient();

  if (!prisma) {
    throw new Error("DATABASE_URL is not configured.");
  }

  await ensureMediaTable(prisma);

  await prisma.$executeRaw`
    INSERT INTO AdminMediaAsset (filename, mimeType, size, purpose, data)
    VALUES (${filename}, ${mimeType}, ${size}, ${purpose}, ${data})
  `;

  const rows = await prisma.$queryRaw<Array<{ id: bigint | number }>>`
    SELECT LAST_INSERT_ID() as id
  `;
  const id = Number(rows[0]?.id);

  if (!id) {
    throw new Error("Failed to save uploaded image.");
  }

  return {
    id,
    url: `/api/media/${id}`,
    filename,
    size,
    type: mimeType,
  };
}

export async function getMediaAsset(id: number): Promise<MediaAsset | null> {
  const prisma = getPrismaClient();

  if (!prisma) {
    return null;
  }

  await ensureMediaTable(prisma);

  const rows = await prisma.$queryRaw<
    Array<{
      id: number;
      filename: string;
      mimeType: string;
      size: number;
      data: Buffer | Uint8Array;
    }>
  >`
    SELECT id, filename, mimeType, size, data
    FROM AdminMediaAsset
    WHERE id = ${id}
    LIMIT 1
  `;
  const asset = rows[0];

  if (!asset) {
    return null;
  }

  return {
    ...asset,
    data: Buffer.from(asset.data),
  };
}
