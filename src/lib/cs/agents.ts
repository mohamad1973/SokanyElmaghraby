import "server-only";

import { getPrismaClient } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/security";

export type CsRole = "agent" | "supervisor" | "admin" | "transfers";

export const CS_ROLES: CsRole[] = ["agent", "supervisor", "admin", "transfers"];

export function normalizeCsUsername(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

export function syntheticCsEmail(username: string) {
  return `${normalizeCsUsername(username)}@cs.local`;
}

export function isElevatedCsRole(role: string | null | undefined) {
  return role === "supervisor" || role === "admin";
}

export function isCsAdminRole(role: string | null | undefined) {
  return role === "admin";
}

export function isTransfersRole(role: string | null | undefined) {
  return role === "transfers";
}

export function canAccessTransfers(role: string | null | undefined) {
  return role === "transfers" || role === "supervisor" || role === "admin";
}

export function normalizeAgentPhone(value: string | null | undefined) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length < 10) return null;
  return digits;
}

/** @deprecated use role — kept for gradual migration of callers */
export function isSupervisorAgent(agent: {
  name?: string;
  email?: string;
  username?: string | null;
  role?: string | null;
  isSupervisor?: boolean;
}) {
  if (agent.role) return isElevatedCsRole(agent.role);
  if (agent.isSupervisor) return true;
  const u = normalizeCsUsername(agent.username || "");
  if (u === "mm") return true;
  return false;
}

function roleFromLegacy(agent: { isSupervisor?: boolean; username?: string | null; email?: string | null }): CsRole {
  const u = normalizeCsUsername(agent.username || agent.email?.split("@")[0] || "");
  if (u === "mm") return "admin";
  if (agent.isSupervisor) return "supervisor";
  return "agent";
}

let ensureCsTablesPromise: Promise<void> | null = null;
let bootstrapCsAdminPromise: Promise<void> | null = null;

async function runEnsureCsTables() {
  const prisma = getPrismaClient();
  if (!prisma) return;

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`CsAgent\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`name\` VARCHAR(191) NOT NULL,
      \`email\` VARCHAR(191) NOT NULL,
      \`username\` VARCHAR(191) NULL,
      \`passwordHash\` VARCHAR(191) NOT NULL,
      \`isActive\` BOOLEAN NOT NULL DEFAULT true,
      \`isSupervisor\` BOOLEAN NOT NULL DEFAULT false,
      \`role\` VARCHAR(32) NOT NULL DEFAULT 'agent',
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

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`CsStockAlert\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`productId\` INT NOT NULL,
      \`productName\` VARCHAR(191) NOT NULL,
      \`sku\` VARCHAR(191) NOT NULL DEFAULT '',
      \`model\` VARCHAR(191) NULL,
      \`stockQuantity\` INT NOT NULL DEFAULT 0,
      \`threshold\` INT NOT NULL DEFAULT 0,
      \`whatsappSent\` BOOLEAN NOT NULL DEFAULT false,
      \`notifiedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`resolvedAt\` DATETIME(3) NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL,
      INDEX \`CsStockAlert_productId_idx\`(\`productId\`),
      INDEX \`CsStockAlert_resolvedAt_idx\`(\`resolvedAt\`),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`CsReturnEvent\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`wooOrderId\` INT NULL,
      \`wooOrderNumber\` VARCHAR(191) NOT NULL DEFAULT '',
      \`productId\` INT NOT NULL,
      \`productName\` VARCHAR(191) NOT NULL,
      \`sku\` VARCHAR(191) NOT NULL DEFAULT '',
      \`quantity\` INT NOT NULL DEFAULT 1,
      \`reason\` VARCHAR(191) NOT NULL,
      \`reasonNote\` TEXT NULL,
      \`isManufacturingDefect\` BOOLEAN NOT NULL DEFAULT false,
      \`source\` VARCHAR(32) NOT NULL DEFAULT 'manual',
      \`createdByAgentId\` INT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL,
      INDEX \`CsReturnEvent_productId_idx\`(\`productId\`),
      INDEX \`CsReturnEvent_createdAt_idx\`(\`createdAt\`),
      INDEX \`CsReturnEvent_isManufacturingDefect_idx\`(\`isManufacturingDefect\`),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);

  const alters = [
    "ALTER TABLE `CsAgent` ADD COLUMN `isSupervisor` BOOLEAN NOT NULL DEFAULT false",
    "ALTER TABLE `CsAgent` ADD COLUMN `username` VARCHAR(191) NULL",
    "ALTER TABLE `CsAgent` ADD COLUMN `role` VARCHAR(32) NOT NULL DEFAULT 'agent'",
    "ALTER TABLE `CsAgent` ADD COLUMN `phone` VARCHAR(32) NULL",
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/Duplicate column|already exists|1060/i.test(message)) {
        console.warn("[cs] ensureCsTables ALTER warning:", message.slice(0, 200));
      }
    }
  }

  try {
    await prisma.$executeRawUnsafe(
      "CREATE UNIQUE INDEX `CsAgent_username_key` ON `CsAgent`(`username`)",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/Duplicate|already exists|1061/i.test(message)) {
      console.warn("[cs] username index:", message.slice(0, 200));
    }
  }

  // Backfill username from email local-part when missing
  try {
    await prisma.$executeRawUnsafe(`
      UPDATE \`CsAgent\`
      SET \`username\` = LOWER(SUBSTRING_INDEX(\`email\`, '@', 1))
      WHERE (\`username\` IS NULL OR \`username\` = '') AND \`email\` IS NOT NULL AND \`email\` <> ''
    `);
  } catch {
    // ignore
  }

  // Sync role from legacy isSupervisor when still default agent
  try {
    await prisma.$executeRawUnsafe(`
      UPDATE \`CsAgent\` SET \`role\` = 'supervisor'
      WHERE \`isSupervisor\` = true AND (\`role\` IS NULL OR \`role\` = '' OR \`role\` = 'agent')
        AND LOWER(COALESCE(\`username\`, '')) <> 'mm'
    `);
    await prisma.$executeRawUnsafe(`
      UPDATE \`CsAgent\` SET \`role\` = 'admin', \`isSupervisor\` = true
      WHERE LOWER(COALESCE(\`username\`, '')) = 'mm'
    `);
  } catch {
    // ignore
  }
}

/** Idempotent schema migration for CS tables — safe to call before every CS query. */
export async function ensureCsTables() {
  if (!ensureCsTablesPromise) {
    ensureCsTablesPromise = runEnsureCsTables().catch((error) => {
      ensureCsTablesPromise = null;
      throw error;
    });
  }
  await ensureCsTablesPromise;
}

type AgentRow = {
  id: number;
  name: string;
  email: string;
  username: string | null;
  passwordHash: string;
  isActive: boolean;
  isSupervisor: boolean;
  role: string;
  phone?: string | null;
};

async function findAgentByUsername(username: string): Promise<AgentRow | null> {
  const prisma = getPrismaClient();
  if (!prisma) return null;
  const u = normalizeCsUsername(username);
  if (!u) return null;

  try {
    const rows = await prisma.$queryRawUnsafe<AgentRow[]>(
      `SELECT \`id\`, \`name\`, \`email\`, \`username\`, \`passwordHash\`, \`isActive\`, \`isSupervisor\`,
              COALESCE(\`role\`, 'agent') AS \`role\`, \`phone\`
       FROM \`CsAgent\` WHERE LOWER(\`username\`) = ? LIMIT 1`,
      u,
    );
    if (rows[0]) return rows[0];
  } catch {
    // fall through
  }

  // Legacy: email local-part or full email
  try {
    const byEmail = await prisma.csAgent.findFirst({
      where: {
        OR: [{ email: u }, { email: syntheticCsEmail(u) }, { email: { startsWith: `${u}@` } }],
      },
    });
    if (byEmail) {
      return {
        id: byEmail.id,
        name: byEmail.name,
        email: byEmail.email,
        username: (byEmail as { username?: string | null }).username || u,
        passwordHash: byEmail.passwordHash,
        isActive: byEmail.isActive,
        isSupervisor: Boolean((byEmail as { isSupervisor?: boolean }).isSupervisor),
        role: (byEmail as { role?: string }).role || roleFromLegacy(byEmail as { isSupervisor?: boolean; username?: string }),
      };
    }
  } catch {
    // ignore
  }
  return null;
}

export async function authenticateCsAgent(usernameOrEmail: string, password: string) {
  const prisma = getPrismaClient();
  if (!prisma) return null;

  await ensureCsTables();
  await ensureCsAdminBootstrap();

  const agent = await findAgentByUsername(usernameOrEmail);
  if (!agent || !agent.isActive) return null;
  const ok = await verifyPassword(password, agent.passwordHash);
  if (!ok) return null;

  const role = (CS_ROLES.includes(agent.role as CsRole) ? agent.role : roleFromLegacy(agent)) as CsRole;
  return {
    ...agent,
    username: agent.username || normalizeCsUsername(usernameOrEmail),
    role,
    isSupervisor: isElevatedCsRole(role),
  };
}

/**
 * Wipe other CS agents and ensure sole bootstrap admin: mm / 123456.
 * Runs once per process (idempotent).
 */
export async function ensureCsAdminBootstrap() {
  if (!bootstrapCsAdminPromise) {
    bootstrapCsAdminPromise = runCsAdminBootstrap().catch((error) => {
      bootstrapCsAdminPromise = null;
      throw error;
    });
  }
  await bootstrapCsAdminPromise;
}

/** @deprecated use ensureCsAdminBootstrap */
export async function ensureDefaultCsAgent() {
  await ensureCsAdminBootstrap();
}

async function runCsAdminBootstrap() {
  const prisma = getPrismaClient();
  if (!prisma) return;

  await ensureCsTables();

  const username = "mm";
  const password = "123456";
  const email = syntheticCsEmail(username);
  const passwordHash = await hashPassword(password);

  const existing = await findAgentByUsername("mm");

  // One-time fresh start: only wipe others when mm does not exist yet
  if (!existing) {
    try {
      await prisma.$executeRawUnsafe(`DELETE FROM \`CsAgent\``);
    } catch (error) {
      console.warn("[cs] wipe agents:", error instanceof Error ? error.message.slice(0, 200) : error);
    }

    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO \`CsAgent\` (\`name\`, \`email\`, \`username\`, \`passwordHash\`, \`isActive\`, \`isSupervisor\`, \`role\`, \`createdAt\`, \`updatedAt\`)
         VALUES (?, ?, 'mm', ?, true, true, 'admin', NOW(3), NOW(3))`,
        "أدمن",
        email,
        passwordHash,
      );
    } catch {
      await prisma.csAgent.create({
        data: {
          name: "أدمن",
          email,
          passwordHash,
          isActive: true,
          isSupervisor: true,
        },
      });
      try {
        await prisma.$executeRawUnsafe(
          `UPDATE \`CsAgent\` SET \`username\` = 'mm', \`role\` = 'admin' WHERE \`email\` = ?`,
          email,
        );
      } catch {
        // ignore
      }
    }
    return;
  }

  // mm exists: keep other users; only lock mm as admin with known password
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE \`CsAgent\` SET \`name\` = ?, \`email\` = ?, \`username\` = 'mm', \`passwordHash\` = ?,
       \`isActive\` = true, \`isSupervisor\` = true, \`role\` = 'admin', \`updatedAt\` = NOW(3)
       WHERE \`id\` = ?`,
      "أدمن",
      email,
      passwordHash,
      existing.id,
    );
  } catch {
    await prisma.csAgent.update({
      where: { id: existing.id },
      data: {
        name: "أدمن",
        email,
        passwordHash,
        isActive: true,
        isSupervisor: true,
      },
    });
  }
}

export async function createCsAgent(input: {
  name: string;
  username: string;
  password: string;
  role?: CsRole;
  phone?: string | null;
}) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };

  await ensureCsTables();
  const username = normalizeCsUsername(input.username);
  if (!username || username.length < 2) {
    return { ok: false as const, message: "اليوزرنيم قصير جداً." };
  }
  if (username === "mm") {
    return { ok: false as const, message: "هذا اليوزرنيم محجوز للأدمن." };
  }

  const exists = await findAgentByUsername(username);
  if (exists) return { ok: false as const, message: "اليوزرنيم مستخدم بالفعل." };

  const name = input.name.trim();
  if (name.length < 2) return { ok: false as const, message: "الاسم قصير جداً." };

  const role: CsRole = input.role && CS_ROLES.includes(input.role) ? input.role : "agent";
  const email = syntheticCsEmail(username);
  const passwordHash = await hashPassword(input.password);
  const isSupervisor = isElevatedCsRole(role);
  const phone = normalizeAgentPhone(input.phone);

  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO \`CsAgent\` (\`name\`, \`email\`, \`username\`, \`passwordHash\`, \`isActive\`, \`isSupervisor\`, \`role\`, \`phone\`, \`createdAt\`, \`updatedAt\`)
       VALUES (?, ?, ?, ?, true, ?, ?, ?, NOW(3), NOW(3))`,
      name,
      email,
      username,
      passwordHash,
      isSupervisor,
      role,
      phone,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/Duplicate|1062/i.test(message)) {
      return { ok: false as const, message: "اليوزرنيم مستخدم بالفعل." };
    }
    return { ok: false as const, message: "تعذر إنشاء الحساب." };
  }

  const agent = await findAgentByUsername(username);
  if (!agent) return { ok: false as const, message: "تم الإنشاء لكن تعذر الجلب." };
  return {
    ok: true as const,
    agent: { ...agent, role, isSupervisor, username, phone },
  };
}

export async function listCsAgents() {
  const prisma = getPrismaClient();
  if (!prisma) return [];
  await ensureCsTables();
  try {
    const rows = await prisma.$queryRawUnsafe<
      Array<{
        id: number;
        name: string;
        email: string;
        username: string | null;
        isActive: boolean;
        isSupervisor: boolean;
        role: string;
        phone: string | null;
        createdAt: Date;
      }>
    >(
      `SELECT \`id\`, \`name\`, \`email\`, \`username\`, \`isActive\`, \`isSupervisor\`,
              COALESCE(\`role\`, 'agent') AS \`role\`, \`phone\`, \`createdAt\`
       FROM \`CsAgent\` ORDER BY \`name\` ASC`,
    );
    return rows.map((r) => ({
      ...r,
      username: r.username || normalizeCsUsername(r.email.split("@")[0] || ""),
      role: (CS_ROLES.includes(r.role as CsRole) ? r.role : roleFromLegacy(r)) as CsRole,
      isSupervisor: isElevatedCsRole(r.role) || r.isSupervisor,
      phone: r.phone || null,
    }));
  } catch {
    await ensureCsTables();
    const fallback = await prisma.csAgent.findMany({ orderBy: { name: "asc" } });
    return fallback.map((r) => {
      const username =
        (r as { username?: string | null }).username ||
        normalizeCsUsername(r.email.split("@")[0] || "");
      const role =
        ((r as { role?: string }).role as CsRole) ||
        roleFromLegacy({ isSupervisor: (r as { isSupervisor?: boolean }).isSupervisor, username });
      return {
        ...r,
        username,
        role,
        isSupervisor: isElevatedCsRole(role),
      };
    });
  }
}

export async function listActiveCsAgents() {
  const all = await listCsAgents();
  return all.filter((a) => a.isActive);
}

export async function getCsAgentById(id: number) {
  const prisma = getPrismaClient();
  if (!prisma) return null;
  await ensureCsTables();
  try {
    const rows = await prisma.$queryRawUnsafe<AgentRow[]>(
      `SELECT \`id\`, \`name\`, \`email\`, \`username\`, \`passwordHash\`, \`isActive\`, \`isSupervisor\`,
              COALESCE(\`role\`, 'agent') AS \`role\`, \`phone\`
       FROM \`CsAgent\` WHERE \`id\` = ? LIMIT 1`,
      id,
    );
    const r = rows[0];
    if (!r) return null;
    const role = (CS_ROLES.includes(r.role as CsRole) ? r.role : roleFromLegacy(r)) as CsRole;
    return {
      ...r,
      role,
      isSupervisor: isElevatedCsRole(role),
      username: r.username || "",
      phone: r.phone || null,
    };
  } catch {
    return prisma.csAgent.findUnique({ where: { id } });
  }
}

export async function updateCsAgentByAdmin(input: {
  id: number;
  role?: CsRole;
  isActive?: boolean;
  name?: string;
  password?: string;
  phone?: string | null;
}) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureCsTables();

  const agent = await getCsAgentById(input.id);
  if (!agent) return { ok: false as const, message: "المستخدم غير موجود." };

  const username = normalizeCsUsername(
    (agent as { username?: string }).username || agent.email?.split("@")[0] || "",
  );
  if (username === "mm" && input.role && input.role !== "admin") {
    return { ok: false as const, message: "لا يمكن تغيير دور الأدمن mm." };
  }
  if (username === "mm" && input.isActive === false) {
    return { ok: false as const, message: "لا يمكن تعطيل الأدمن mm." };
  }

  const role = input.role ?? ((agent as { role?: CsRole }).role || "agent");
  const isSupervisor = isElevatedCsRole(role);
  const name = input.name?.trim() || agent.name;
  const isActive = input.isActive ?? agent.isActive;
  const phone =
    input.phone !== undefined
      ? normalizeAgentPhone(input.phone)
      : ((agent as { phone?: string | null }).phone || null);
  let passwordHash = agent.passwordHash;
  if (input.password && input.password.length >= 6) {
    passwordHash = await hashPassword(input.password);
  }

  try {
    await prisma.$executeRawUnsafe(
      `UPDATE \`CsAgent\` SET \`name\` = ?, \`role\` = ?, \`isSupervisor\` = ?, \`isActive\` = ?,
       \`passwordHash\` = ?, \`phone\` = ?, \`updatedAt\` = NOW(3) WHERE \`id\` = ?`,
      name,
      role,
      isSupervisor,
      isActive,
      passwordHash,
      phone,
      input.id,
    );
  } catch {
    return { ok: false as const, message: "تعذر التحديث." };
  }

  const updated = await getCsAgentById(input.id);
  return { ok: true as const, agent: updated };
}

export async function deleteCsAgentByAdmin(id: number) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureCsTables();
  const agent = await getCsAgentById(id);
  if (!agent) return { ok: false as const, message: "المستخدم غير موجود." };
  const username = normalizeCsUsername(
    (agent as { username?: string }).username || agent.email?.split("@")[0] || "",
  );
  if (username === "mm") return { ok: false as const, message: "لا يمكن حذف الأدمن mm." };

  try {
    await prisma.csAgent.delete({ where: { id } });
  } catch {
    return { ok: false as const, message: "تعذر الحذف." };
  }
  return { ok: true as const };
}
