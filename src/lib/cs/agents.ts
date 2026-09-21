import "server-only";

import { getPrismaClient } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/security";

export function isSupervisorAgent(agent: { name: string; email: string; isSupervisor?: boolean }) {
  if (agent.isSupervisor) return true;
  const supervisorEmail = (process.env.CS_SUPERVISOR_EMAIL || "").trim().toLowerCase();
  if (supervisorEmail && agent.email.toLowerCase() === supervisorEmail) return true;
  return agent.name.replace(/\s+/g, " ").trim() === "منى عباس";
}

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
      \`isSupervisor\` BOOLEAN NOT NULL DEFAULT false,
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
      \`shippingCompany\` VARCHAR(64) NULL,
      \`handedToCarrier\` BOOLEAN NOT NULL DEFAULT false,
      \`deliveredToCustomer\` BOOLEAN NOT NULL DEFAULT false,
      \`customerFollowUp\` BOOLEAN NOT NULL DEFAULT false,
      \`handedToCarrierAt\` DATETIME(3) NULL,
      \`deliveredToCustomerAt\` DATETIME(3) NULL,
      \`customerFollowUpAt\` DATETIME(3) NULL,
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

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`CsOrderAssignment\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`agentId\` INT NOT NULL,
      \`wooOrderNumberFrom\` INT NOT NULL,
      \`wooOrderNumberTo\` INT NOT NULL,
      \`createdById\` INT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX \`CsOrderAssignment_agentId_idx\`(\`agentId\`),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);

  // Safe additive columns for older tables
  const alters = [
    "ALTER TABLE `CsAgent` ADD COLUMN `isSupervisor` BOOLEAN NOT NULL DEFAULT false",
    "ALTER TABLE `CsOrderConfirmation` ADD COLUMN `shippingCompany` VARCHAR(64) NULL",
    "ALTER TABLE `CsOrderConfirmation` ADD COLUMN `handedToCarrier` BOOLEAN NOT NULL DEFAULT false",
    "ALTER TABLE `CsOrderConfirmation` ADD COLUMN `deliveredToCustomer` BOOLEAN NOT NULL DEFAULT false",
    "ALTER TABLE `CsOrderConfirmation` ADD COLUMN `customerFollowUp` BOOLEAN NOT NULL DEFAULT false",
    "ALTER TABLE `CsOrderConfirmation` ADD COLUMN `handedToCarrierAt` DATETIME(3) NULL",
    "ALTER TABLE `CsOrderConfirmation` ADD COLUMN `deliveredToCustomerAt` DATETIME(3) NULL",
    "ALTER TABLE `CsOrderConfirmation` ADD COLUMN `customerFollowUpAt` DATETIME(3) NULL",
  ];
  for (const sql of alters) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch {
      // column already exists
    }
  }
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

  const shouldBeSupervisor = isSupervisorAgent(agent);
  if (shouldBeSupervisor && !(agent as { isSupervisor?: boolean }).isSupervisor) {
    await prisma.csAgent.update({
      where: { id: agent.id },
      data: { isSupervisor: true },
    });
    return { ...agent, isSupervisor: true };
  }

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
    data: { email, name, passwordHash, isActive: true, isSupervisor: false },
  });
}

export async function createCsAgent(input: { name: string; email: string; password: string }) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };

  await ensureCsTables();
  const email = input.email.trim().toLowerCase();
  const exists = await prisma.csAgent.findUnique({ where: { email } });
  if (exists) return { ok: false as const, message: "البريد مستخدم بالفعل." };

  const name = input.name.trim();
  const passwordHash = await hashPassword(input.password);
  const isSupervisor = isSupervisorAgent({ name, email });
  const agent = await prisma.csAgent.create({
    data: {
      name,
      email,
      passwordHash,
      isActive: true,
      isSupervisor,
    },
  });
  return { ok: true as const, agent };
}

export async function listCsAgents() {
  const prisma = getPrismaClient();
  if (!prisma) return [];
  await ensureCsTables();
  return prisma.csAgent.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
}

export async function getCsAgentById(id: number) {
  const prisma = getPrismaClient();
  if (!prisma) return null;
  await ensureCsTables();
  return prisma.csAgent.findUnique({ where: { id } });
}
