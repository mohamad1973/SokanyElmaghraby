import "server-only";

import { getPrismaClient } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/security";

export async function ensureCsTables() {
  const prisma = getPrismaClient();
  if (!prisma) return;

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`CsAgent\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`name\` VARCHAR(191) NOT NULL,
      \`email\` VARCHAR(191) NOT NULL,
      \`passwordHash\` VARCHAR(191) NOT NULL,
      \`isActive\` BOOLEAN NOT NULL DEFAULT true,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL,
      UNIQUE INDEX \`CsAgent_email_key\`(\`email\`),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`CsOrderConfirmation\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`wooOrderId\` INT NOT NULL,
      \`wooOrderNumber\` VARCHAR(191) NOT NULL,
      \`status\` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
      \`assignedAgentId\` INT NULL,
      \`customerSnapshot\` JSON NULL,
      \`failReason\` TEXT NULL,
      \`startedAt\` DATETIME(3) NULL,
      \`confirmedAt\` DATETIME(3) NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL,
      UNIQUE INDEX \`CsOrderConfirmation_wooOrderId_key\`(\`wooOrderId\`),
      INDEX \`CsOrderConfirmation_status_idx\`(\`status\`),
      INDEX \`CsOrderConfirmation_assignedAgentId_idx\`(\`assignedAgentId\`),
      INDEX \`CsOrderConfirmation_createdAt_idx\`(\`createdAt\`),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`CsChecklistAnswer\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`confirmationId\` INT NOT NULL,
      \`itemKey\` VARCHAR(191) NOT NULL,
      \`confirmed\` BOOLEAN NOT NULL DEFAULT false,
      \`value\` TEXT NULL,
      \`note\` TEXT NULL,
      \`updatedAt\` DATETIME(3) NOT NULL,
      UNIQUE INDEX \`CsChecklistAnswer_confirmationId_itemKey_key\`(\`confirmationId\`, \`itemKey\`),
      INDEX \`CsChecklistAnswer_confirmationId_idx\`(\`confirmationId\`),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
}

export async function authenticateCsAgent(email: string, password: string) {
  const prisma = getPrismaClient();
  if (!prisma) return null;

  await ensureCsTables();
  await ensureDefaultCsAgent();

  const agent = await prisma.csAgent.findUnique({
    where: { email: email.trim().toLowerCase() },
  });

  if (!agent || !agent.isActive) return null;
  const ok = await verifyPassword(password, agent.passwordHash);
  if (!ok) return null;
  return agent;
}

export async function ensureDefaultCsAgent() {
  const prisma = getPrismaClient();
  if (!prisma) return;

  const email = (process.env.CS_AGENT_EMAIL || "cs@tooliano.com").trim().toLowerCase();
  const password = process.env.CS_AGENT_PASSWORD || "Cs@Tooliano123";
  const name = process.env.CS_AGENT_NAME || "خدمة العملاء";

  const existing = await prisma.csAgent.findUnique({ where: { email } });
  if (existing) return existing;

  const passwordHash = await hashPassword(password);
  return prisma.csAgent.create({
    data: { email, name, passwordHash, isActive: true },
  });
}

export async function createCsAgent(input: { name: string; email: string; password: string }) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };

  await ensureCsTables();
  const email = input.email.trim().toLowerCase();
  const exists = await prisma.csAgent.findUnique({ where: { email } });
  if (exists) return { ok: false as const, message: "البريد مستخدم بالفعل." };

  const passwordHash = await hashPassword(input.password);
  const agent = await prisma.csAgent.create({
    data: {
      name: input.name.trim(),
      email,
      passwordHash,
      isActive: true,
    },
  });
  return { ok: true as const, agent };
}

export async function listCsAgents() {
  const prisma = getPrismaClient();
  if (!prisma) return [];
  await ensureCsTables();
  return prisma.csAgent.findMany({ orderBy: { createdAt: "desc" } });
}
