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
    agentName: byId.get(row.agentId)?.name || `مسؤول #${row.agentId}`,
  }));
}

export async function getAssignmentRangesForAgent(agentId: number) {
  const prisma = getPrismaClient();
  if (!prisma) return [] as Array<{ from: number; to: number }>;
  await ensureCsTables();
  try {
    const rows = await prisma.csOrderAssignment.findMany({ where: { agentId } });
    return rows.map((row) => ({
      from: Math.min(row.wooOrderNumberFrom, row.wooOrderNumberTo),
      to: Math.max(row.wooOrderNumberFrom, row.wooOrderNumberTo),
    }));
  } catch (error) {
    console.error("[cs] getAssignmentRangesForAgent:", error);
    await ensureCsTables();
    try {
      const rows = await prisma.csOrderAssignment.findMany({ where: { agentId } });
      return rows.map((row) => ({
        from: Math.min(row.wooOrderNumberFrom, row.wooOrderNumberTo),
        to: Math.max(row.wooOrderNumberFrom, row.wooOrderNumberTo),
      }));
    } catch {
      return [];
    }
  }
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
  if (!agent || !agent.isActive) return { ok: false as const, message: "مسؤول خدمة العملاء غير موجود." };

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

export async function fairSplitAssign(input: {
  agentIds: number[];
  confirmationIds?: number[];
  governorate?: string;
  area?: string;
  createdById: number;
}) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureCsTables();

  const { isWithinCairoTodayOrYesterday } = await import("@/lib/cs/order-window");

  const agentIds = [...new Set(input.agentIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (agentIds.length < 2) return { ok: false as const, message: "اختاري مسؤولين اثنين على الأقل." };

  const agents = await prisma.csAgent.findMany({ where: { id: { in: agentIds }, isActive: true } });
  if (agents.length !== agentIds.length) {
    return { ok: false as const, message: "أحد المسؤولين غير موجود أو غير نشط." };
  }

  function locMatch(haystack: string | null | undefined, needle: string) {
    if (!needle) return true;
    const h = String(haystack || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
    const n = needle.trim().replace(/\s+/g, " ").toLowerCase();
    if (!h || !n) return false;
    return h === n || h.includes(n) || n.includes(h);
  }

  let rows: Awaited<ReturnType<typeof prisma.csOrderConfirmation.findMany>>;

  if (input.confirmationIds?.length) {
    // Visible-queue mode: distribute exactly these IDs
    rows = await prisma.csOrderConfirmation.findMany({
      where: { id: { in: input.confirmationIds } },
      orderBy: { createdAt: "desc" },
    });
    if (rows.length === 0) {
      return { ok: false as const, message: "لا توجد أوردرات ظاهرة للتوزيع. زامني القائمة أولاً." };
    }
  } else {
    rows = await prisma.csOrderConfirmation.findMany({
      where: { status: { in: ["PENDING", "IN_PROGRESS"] } },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    // Same default window as the main queue (today + yesterday)
    rows = rows.filter((row) => {
      const snap = row.customerSnapshot as { dateCreated?: string } | null;
      return isWithinCairoTodayOrYesterday(snap?.dateCreated);
    });
    if (input.governorate || input.area) {
      rows = rows.filter((row) => {
        const snap = row.customerSnapshot as { governorate?: string; area?: string } | null;
        if (input.governorate && !locMatch(snap?.governorate, input.governorate)) return false;
        if (input.area && !locMatch(snap?.area, input.area)) return false;
        return true;
      });
    }
    if (rows.length === 0) {
      return {
        ok: false as const,
        message: "لا توجد أوردرات ظاهرة (اليوم/أمس) للتوزيع. زامني أو اتركي فلتر المحافظة فارغاً.",
      };
    }
  }

  rows = [...rows].sort(
    (a, b) => parseWooOrderNumber(b.wooOrderNumber) - parseWooOrderNumber(a.wooOrderNumber),
  );

  const byAgent = new Map<number, number[]>();
  for (const id of agentIds) byAgent.set(id, []);

  let assigned = 0;
  for (let i = 0; i < rows.length; i++) {
    const agentId = agentIds[i % agentIds.length];
    await prisma.csOrderConfirmation.update({
      where: { id: rows[i].id },
      data: { assignedAgentId: agentId },
    });
    byAgent.get(agentId)!.push(parseWooOrderNumber(rows[i].wooOrderNumber));
    assigned += 1;
  }

  for (const agentId of agentIds) {
    const nums = byAgent.get(agentId)!.filter((n) => n > 0);
    if (!nums.length) continue;
    const from = Math.min(...nums);
    const to = Math.max(...nums);
    await prisma.csOrderAssignment.create({
      data: {
        agentId,
        wooOrderNumberFrom: from,
        wooOrderNumberTo: to,
        createdById: input.createdById,
      },
    });
  }

  return {
    ok: true as const,
    assigned,
    perAgent: Math.ceil(rows.length / agentIds.length),
  };
}

export async function ruleBasedAssign(input: {
  mode: "shipping" | "paid" | "region_agent" | "region_shipping";
  createdById: number;
  governorate?: string;
  area?: string;
  /** agentId keyed by shipping company / paid / region */
  rules: Array<{
    agentId?: number;
    shippingCompany?: "bosta" | "sayed_temima";
    paidOnline?: boolean;
    governorate?: string;
    area?: string;
  }>;
}) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureCsTables();

  let rows = await prisma.csOrderConfirmation.findMany({
    where: { status: { in: ["PENDING", "IN_PROGRESS", "CONFIRMED"] } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  if (input.governorate || input.area) {
    rows = rows.filter((row) => {
      const snap = row.customerSnapshot as { governorate?: string; area?: string } | null;
      if (input.governorate && snap?.governorate !== input.governorate) return false;
      if (input.area && snap?.area !== input.area) return false;
      return true;
    });
  }

  let updated = 0;

  for (const row of rows) {
    const snap = row.customerSnapshot as {
      governorate?: string;
      area?: string;
      paidOnlineHighlight?: boolean;
    } | null;

    if (input.mode === "shipping") {
      for (const rule of input.rules) {
        if (!rule.agentId || !rule.shippingCompany) continue;
        if (row.shippingCompany === rule.shippingCompany) {
          await prisma.csOrderConfirmation.update({
            where: { id: row.id },
            data: { assignedAgentId: rule.agentId },
          });
          updated += 1;
          break;
        }
      }
    } else if (input.mode === "paid") {
      for (const rule of input.rules) {
        if (!rule.agentId || rule.paidOnline === undefined) continue;
        if (Boolean(snap?.paidOnlineHighlight) === rule.paidOnline) {
          await prisma.csOrderConfirmation.update({
            where: { id: row.id },
            data: { assignedAgentId: rule.agentId },
          });
          updated += 1;
          break;
        }
      }
    } else if (input.mode === "region_agent") {
      for (const rule of input.rules) {
        if (!rule.agentId) continue;
        if (rule.governorate && snap?.governorate !== rule.governorate) continue;
        if (rule.area && snap?.area !== rule.area) continue;
        if (!rule.governorate && !rule.area) continue;
        await prisma.csOrderConfirmation.update({
          where: { id: row.id },
          data: { assignedAgentId: rule.agentId },
        });
        updated += 1;
        break;
      }
    } else if (input.mode === "region_shipping") {
      for (const rule of input.rules) {
        if (!rule.shippingCompany) continue;
        if (rule.governorate && snap?.governorate !== rule.governorate) continue;
        if (rule.area && snap?.area !== rule.area) continue;
        if (!rule.governorate && !rule.area) continue;
        await prisma.csOrderConfirmation.update({
          where: { id: row.id },
          data: { shippingCompany: rule.shippingCompany },
        });
        updated += 1;
        break;
      }
    }
  }

  return { ok: true as const, updated };
}
