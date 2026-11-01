import "server-only";

import { csFlagsFromRoles, getCsAgentById, listCsAgents, parseCsRoles, type CsRole } from "@/lib/cs/agents";
import { stampAssignedAgentInOrderRange } from "@/lib/cs/assignments";
import { isCairoHmInWindow, normalizeHm } from "@/lib/cs/order-window";
import { getPrismaClient } from "@/lib/db";

const CURSOR_ID = 1;
const DEFAULT_START = "12:00";
const DEFAULT_END = "17:00";

export type HomeConfirmShiftRow = {
  agentId: number;
  name: string;
  isAvailable: boolean;
  startHm: string;
  endHm: string;
  inShiftNow: boolean;
};

let ensurePromise: Promise<void> | null = null;

export async function ensureHomeConfirmTables() {
  if (!ensurePromise) {
    ensurePromise = createHomeConfirmTables().catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }
  await ensurePromise;
}

async function createHomeConfirmTables() {
  const prisma = getPrismaClient();
  if (!prisma) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`CsHomeConfirmShift\` (
      \`agentId\` INT NOT NULL,
      \`isAvailable\` BOOLEAN NOT NULL DEFAULT false,
      \`startHm\` VARCHAR(5) NOT NULL DEFAULT '12:00',
      \`endHm\` VARCHAR(5) NOT NULL DEFAULT '17:00',
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`agentId\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`CsHomeConfirmCursor\` (
      \`id\` INT NOT NULL,
      \`lastAgentId\` INT NULL,
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  await prisma.$executeRawUnsafe(
    `INSERT IGNORE INTO \`CsHomeConfirmCursor\` (\`id\`, \`lastAgentId\`, \`updatedAt\`) VALUES (1, NULL, NOW(3))`,
  );
}

export function isHomeConfirmRoleList(roles: CsRole[] | string[] | undefined) {
  return (roles || []).includes("home_confirm");
}

export async function isHomeConfirmOnlyAgent(agentId: number) {
  const agent = await getCsAgentById(agentId);
  if (!agent) return false;
  return csFlagsFromRoles(
    parseCsRoles(agent as { role?: string; roles?: string | string[] | null; isSupervisor?: boolean; username?: string }),
  ).isHomeConfirmOnly;
}

export async function listHomeConfirmAgents() {
  const agents = await listCsAgents();
  return agents.filter((agent) => {
    if (!agent.isActive) return false;
    const roles = ((agent as { roles?: CsRole[] }).roles || [agent.role]) as CsRole[];
    return roles.includes("home_confirm");
  });
}

export async function listHomeConfirmShifts(): Promise<{
  agents: HomeConfirmShiftRow[];
  lastAgentId: number | null;
  lastAgentName: string | null;
}> {
  const prisma = getPrismaClient();
  await ensureHomeConfirmTables();
  const agents = await listHomeConfirmAgents();
  if (!prisma) {
    return {
      agents: agents.map((agent) => ({
        agentId: agent.id,
        name: agent.name,
        isAvailable: false,
        startHm: DEFAULT_START,
        endHm: DEFAULT_END,
        inShiftNow: false,
      })),
      lastAgentId: null,
      lastAgentName: null,
    };
  }

  const shiftRows = await prisma.$queryRawUnsafe<
    Array<{ agentId: number; isAvailable: number | boolean; startHm: string; endHm: string }>
  >(`SELECT \`agentId\`, \`isAvailable\`, \`startHm\`, \`endHm\` FROM \`CsHomeConfirmShift\``);
  const byId = new Map(shiftRows.map((row) => [Number(row.agentId), row]));
  const cursorRows = await prisma.$queryRawUnsafe<Array<{ lastAgentId: number | null }>>(
    `SELECT \`lastAgentId\` FROM \`CsHomeConfirmCursor\` WHERE \`id\` = ? LIMIT 1`,
    CURSOR_ID,
  );
  const lastAgentId = cursorRows[0]?.lastAgentId != null ? Number(cursorRows[0].lastAgentId) : null;

  const list = agents.map((agent) => {
    const shift = byId.get(agent.id);
    const startHm = normalizeHm(shift?.startHm, DEFAULT_START);
    const endHm = normalizeHm(shift?.endHm, DEFAULT_END);
    const isAvailable = Boolean(shift?.isAvailable);
    return {
      agentId: agent.id,
      name: agent.name,
      isAvailable,
      startHm,
      endHm,
      inShiftNow: isAvailable && isCairoHmInWindow(startHm, endHm),
    };
  });

  return {
    agents: list,
    lastAgentId,
    lastAgentName: list.find((row) => row.agentId === lastAgentId)?.name || null,
  };
}

export async function saveHomeConfirmShifts(
  shifts: Array<{ agentId: number; isAvailable?: boolean; startHm?: string; endHm?: string }>,
) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureHomeConfirmTables();
  const allowed = new Set((await listHomeConfirmAgents()).map((agent) => agent.id));
  if (!shifts.length) return { ok: false as const, message: "لا توجد شيفتات للحفظ." };

  for (const shift of shifts) {
    const agentId = Number(shift.agentId);
    if (!allowed.has(agentId)) continue;
    const startHm = normalizeHm(shift.startHm, DEFAULT_START);
    const endHm = normalizeHm(shift.endHm, DEFAULT_END);
    const isAvailable = Boolean(shift.isAvailable);
    await prisma.$executeRawUnsafe(
      `INSERT INTO \`CsHomeConfirmShift\` (\`agentId\`, \`isAvailable\`, \`startHm\`, \`endHm\`, \`updatedAt\`)
       VALUES (?, ?, ?, ?, NOW(3))
       ON DUPLICATE KEY UPDATE \`isAvailable\` = VALUES(\`isAvailable\`), \`startHm\` = VALUES(\`startHm\`),
         \`endHm\` = VALUES(\`endHm\`), \`updatedAt\` = NOW(3)`,
      agentId,
      isAvailable,
      startHm,
      endHm,
    );
  }
  return { ok: true as const };
}

export async function stampHomeConfirmRange(input: { agentId: number; from: number; to: number }) {
  const agent = await getCsAgentById(input.agentId);
  if (!agent || !agent.isActive) return { ok: false as const, message: "موظفة تأكيدات المنزل غير موجودة." };
  const flags = csFlagsFromRoles(
    parseCsRoles(agent as { role?: string; roles?: string | string[] | null; isSupervisor?: boolean; username?: string }),
  );
  if (!flags.isHomeConfirm) {
    return { ok: false as const, message: "التوزيع اليدوي هنا لحسابات تأكيدات المنزل فقط." };
  }
  const from = Math.min(Number(input.from), Number(input.to));
  const to = Math.max(Number(input.from), Number(input.to));
  if (!from || !to) return { ok: false as const, message: "أرقام الأوردر غير صالحة." };
  const stamped = await stampAssignedAgentInOrderRange(input.agentId, from, to);
  return { ok: true as const, stamped };
}

async function onShiftHomeAgentIds() {
  const { agents } = await listHomeConfirmShifts();
  return agents.filter((row) => row.inShiftNow).map((row) => row.agentId);
}

export async function tryAssignHomeConfirmRoundRobin(confirmationId: number) {
  const prisma = getPrismaClient();
  if (!prisma || !Number.isInteger(confirmationId) || confirmationId <= 0) return null;
  await ensureHomeConfirmTables();

  await prisma.$queryRawUnsafe(`SELECT GET_LOCK('cs_home_confirm_rr', 5)`);
  try {
    const current = await prisma.$queryRawUnsafe<Array<{ assignedAgentId: number | null }>>(
      `SELECT \`assignedAgentId\` FROM \`CsOrderConfirmation\` WHERE \`id\` = ? LIMIT 1`,
      confirmationId,
    );
    if (!current[0] || current[0].assignedAgentId != null) return null;

    const ids = await onShiftHomeAgentIds();
    if (!ids.length) return null;
    ids.sort((a, b) => a - b);

    const cursorRows = await prisma.$queryRawUnsafe<Array<{ lastAgentId: number | null }>>(
      `SELECT \`lastAgentId\` FROM \`CsHomeConfirmCursor\` WHERE \`id\` = ? LIMIT 1`,
      CURSOR_ID,
    );
    const lastAgentId = cursorRows[0]?.lastAgentId != null ? Number(cursorRows[0].lastAgentId) : null;
    const lastIndex = lastAgentId != null ? ids.indexOf(lastAgentId) : -1;
    const nextId = ids[(lastIndex + 1) % ids.length];

    const updated = await prisma.$executeRawUnsafe(
      `UPDATE \`CsOrderConfirmation\` SET \`assignedAgentId\` = ? WHERE \`id\` = ? AND \`assignedAgentId\` IS NULL`,
      nextId,
      confirmationId,
    );
    if (!Number(updated)) return null;

    await prisma.$executeRawUnsafe(
      `INSERT INTO \`CsHomeConfirmCursor\` (\`id\`, \`lastAgentId\`, \`updatedAt\`)
       VALUES (?, ?, NOW(3))
       ON DUPLICATE KEY UPDATE \`lastAgentId\` = VALUES(\`lastAgentId\`), \`updatedAt\` = NOW(3)`,
      CURSOR_ID,
      nextId,
    );
    return nextId;
  } finally {
    await prisma.$queryRawUnsafe(`SELECT RELEASE_LOCK('cs_home_confirm_rr')`);
  }
}
