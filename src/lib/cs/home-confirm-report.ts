import "server-only";

import { ensureCsTables } from "@/lib/cs/agents";
import { CS_CONFIRMATION_STATUS } from "@/lib/cs/checklist";
import { listHomeConfirmAgents } from "@/lib/cs/home-confirm";
import {
  cairoOffsetClock,
  cairoTodayYmd,
  cairoYmdBounds,
  cairoYmdFromIso,
} from "@/lib/cs/order-window";
import { getPrismaClient } from "@/lib/db";

export type HomeConfirmReportOrderRow = {
  confirmationId: number;
  wooOrderNumber: string;
  customerName: string;
  transferDay: string;
  saved: boolean;
  cancelled: boolean;
  postponed: boolean;
  hasNotes: boolean;
  callHour: number | null;
};

export type HomeConfirmReportAgentBlock = {
  agentId: number;
  agentName: string;
  transferDay: string;
  transferredCount: number;
  calledCount: number;
  orders: HomeConfirmReportOrderRow[];
};

function isYmd(value?: string): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function customerNameOf(snapshot: unknown) {
  const snap = snapshot as { customerName?: string; homeConfirmNote?: string } | null;
  return String(snap?.customerName || "").trim() || "—";
}

function homeNoteOf(snapshot: unknown) {
  const snap = snapshot as { homeConfirmNote?: string } | null;
  return String(snap?.homeConfirmNote || "").trim();
}

function hasNotesText(note: string, failReason: string | null | undefined) {
  const cleaned = [note, String(failReason || "").trim()]
    .map((part) => part.replace(/^(تأجيل|لاغى|ملغي|ملغى)\s*$/i, "").trim())
    .filter(Boolean);
  return cleaned.some((part) => part.length > 0);
}

function callHourOf(startedAt: Date | string | null | undefined): number | null {
  if (!startedAt) return null;
  const iso = startedAt instanceof Date ? startedAt.toISOString() : String(startedAt);
  const clock = cairoOffsetClock(iso) || null;
  if (!clock) return null;
  return Math.floor(clock.minutes / 60);
}

function transferDayOf(assignedAt: Date | null | undefined, createdAt: Date) {
  if (assignedAt) {
    const ymd = cairoYmdFromIso(assignedAt.toISOString());
    if (ymd) return ymd;
  }
  return cairoYmdFromIso(createdAt.toISOString()) || cairoTodayYmd();
}

export async function getHomeConfirmReport(dateFromInput?: string, dateToInput?: string) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureCsTables();

  const dateFrom = isYmd(dateFromInput) ? dateFromInput : cairoTodayYmd();
  let dateTo = isYmd(dateToInput) ? dateToInput : dateFrom;
  if (dateTo < dateFrom) dateTo = dateFrom;
  const fromBounds = cairoYmdBounds(dateFrom);
  const toBounds = cairoYmdBounds(dateTo);
  if (!fromBounds || !toBounds) return { ok: false as const, message: "تاريخ غير صالح." };

  const homeAgents = await listHomeConfirmAgents();
  const agentIds = homeAgents.map((agent) => agent.id);
  if (!agentIds.length) {
    return {
      ok: true as const,
      dateFrom,
      dateTo,
      agents: [] as HomeConfirmReportAgentBlock[],
    };
  }

  const agentName = new Map(homeAgents.map((agent) => [agent.id, agent.name]));

  const rows = await prisma.csOrderConfirmation.findMany({
    where: {
      assignedAgentId: { in: agentIds },
      OR: [
        { assignedAt: { gte: fromBounds.start, lt: toBounds.endExclusive } },
        {
          AND: [
            { assignedAt: null },
            { createdAt: { gte: fromBounds.start, lt: toBounds.endExclusive } },
          ],
        },
      ],
    },
    select: {
      id: true,
      wooOrderNumber: true,
      status: true,
      assignedAgentId: true,
      assignedAt: true,
      startedAt: true,
      failReason: true,
      customerSnapshot: true,
      createdAt: true,
    },
    orderBy: [{ assignedAgentId: "asc" }, { id: "asc" }],
    take: 5000,
  });

  const byAgentDay = new Map<string, HomeConfirmReportAgentBlock>();

  for (const row of rows) {
    const agentId = row.assignedAgentId;
    if (!agentId || !agentName.has(agentId)) continue;
    const day = transferDayOf(row.assignedAt, row.createdAt);
    if (day < dateFrom || day > dateTo) continue;
    const key = `${agentId}:${day}`;
    let block = byAgentDay.get(key);
    if (!block) {
      block = {
        agentId,
        agentName: agentName.get(agentId) || `موظفة #${agentId}`,
        transferDay: day,
        transferredCount: 0,
        calledCount: 0,
        orders: [],
      };
      byAgentDay.set(key, block);
    }

    const note = homeNoteOf(row.customerSnapshot);
    const order: HomeConfirmReportOrderRow = {
      confirmationId: row.id,
      wooOrderNumber: row.wooOrderNumber,
      customerName: customerNameOf(row.customerSnapshot),
      transferDay: day,
      saved: row.status === CS_CONFIRMATION_STATUS.CONFIRMED,
      cancelled: row.status === CS_CONFIRMATION_STATUS.CANCELLED,
      postponed: row.status === CS_CONFIRMATION_STATUS.FAILED_CONTACT,
      hasNotes: hasNotesText(note, row.failReason),
      callHour: callHourOf(row.startedAt),
    };
    block.orders.push(order);
    block.transferredCount += 1;
    if (order.callHour != null || row.startedAt) block.calledCount += 1;
  }

  const agents = [...byAgentDay.values()].sort((a, b) => {
    if (a.transferDay !== b.transferDay) return a.transferDay < b.transferDay ? 1 : -1;
    return a.agentName.localeCompare(b.agentName, "ar");
  });

  for (const block of agents) {
    block.orders.sort(
      (a, b) =>
        Number(String(b.wooOrderNumber).replace(/\D/g, "")) - Number(String(a.wooOrderNumber).replace(/\D/g, "")),
    );
  }

  return {
    ok: true as const,
    dateFrom,
    dateTo,
    agents,
  };
}
