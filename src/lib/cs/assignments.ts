import "server-only";

import { ensureCsTables } from "@/lib/cs/agents";
import { getPrismaClient } from "@/lib/db";

export function parseWooOrderNumber(value: string | number | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return Number(digits) || 0;
}

export async function listAssignmentsDetailed() {
  const prisma = getPrismaClient();
  if (!prisma) return [];
  await ensureCsTables();

  const rows = await prisma.csOrderAssignment.findMany({ orderBy: { createdAt: "desc" } });
  const agents = await prisma.csAgent.findMany();
  const byId = new Map(agents.map((a) => [a.id, a]));

  return rows.map((row) => ({
    id: row.id,
    agentId: row.agentId,
    wooOrderNumberFrom: row.wooOrderNumberFrom,
    wooOrderNumberTo: row.wooOrderNumberTo,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    agentName: byId.get(row.agentId)?.name || `وكيلة #${row.agentId}`,
  }));
}

export async function getAssignmentRangesForAgent(agentId: number) {
  const prisma = getPrismaClient();
  if (!prisma) return [] as Array<{ from: number; to: number }>;
  await ensureCsTables();
  const rows = await prisma.csOrderAssignment.findMany({ where: { agentId } });
  return rows.map((row) => ({
    from: Math.min(row.wooOrderNumberFrom, row.wooOrderNumberTo),
    to: Math.max(row.wooOrderNumberFrom, row.wooOrderNumberTo),
  }));
}

export function orderNumberInRanges(orderNumber: string, ranges: Array<{ from: number; to: number }>) {
  if (ranges.length === 0) return false;
  const n = parseWooOrderNumber(orderNumber);
  return ranges.some((r) => n >= r.from && n <= r.to);
}

export async function createAssignment(input: {
  agentId: number;
  wooOrderNumberFrom: number;
  wooOrderNumberTo: number;
  createdById: number;
}) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureCsTables();

  const from = Math.min(input.wooOrderNumberFrom, input.wooOrderNumberTo);
  const to = Math.max(input.wooOrderNumberFrom, input.wooOrderNumberTo);
  if (!from || !to) return { ok: false as const, message: "أرقام الأوردر غير صالحة." };

  const agent = await prisma.csAgent.findUnique({ where: { id: input.agentId } });
  if (!agent || !agent.isActive) return { ok: false as const, message: "الوكيلة غير موجودة." };

  const row = await prisma.csOrderAssignment.create({
    data: {
      agentId: input.agentId,
      wooOrderNumberFrom: from,
      wooOrderNumberTo: to,
      createdById: input.createdById,
    },
  });

  return { ok: true as const, assignment: row };
}

export async function deleteAssignment(id: number) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureCsTables();
  await prisma.csOrderAssignment.delete({ where: { id } });
  return { ok: true as const };
}
