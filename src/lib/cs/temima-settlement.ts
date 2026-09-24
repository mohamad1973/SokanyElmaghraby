import "server-only";

import { ensureCsTables } from "@/lib/cs/agents";
import { resolvePaymentState } from "@/lib/cs/order-window";
import {
  cairoTodayYmd,
  cairoYmdBounds,
  cairoYmdFromIso,
  isWithinCairoDateRange,
} from "@/lib/cs/order-window";
import { getPrismaClient } from "@/lib/db";

export const TEMIMA_COMPANY = "sayed_temima";
const FEE_NORMAL = 75;
const FEE_LARGE = 100;

export type TemimaDisposition = "collect" | "return" | "postpone";

export type TemimaSheetRow = {
  confirmationId: number;
  wooOrderNumber: string;
  customerName: string;
  productNames: string;
  cashAmount: number;
  disposition: TemimaDisposition;
  isLarge: boolean;
  carried: boolean;
  postponeLineId: number | null;
};

function addDaysYmd(ymd: string, days: number) {
  const bounds = cairoYmdBounds(ymd);
  if (!bounds) return ymd;
  return cairoYmdFromIso(new Date(bounds.start.getTime() + days * 24 * 60 * 60 * 1000).toISOString());
}

function weekdayIndex(ymd: string) {
  const bounds = cairoYmdBounds(ymd);
  if (!bounds) return 0;
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo",
    weekday: "short",
  }).format(bounds.start);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[label] ?? 0;
}

export function sundayOnOrBefore(ymd: string) {
  return addDaysYmd(ymd, -weekdayIndex(ymd));
}

export function defaultSettlementWeekStart() {
  const today = cairoTodayYmd();
  const sunday = sundayOnOrBefore(today);
  if (sunday === today) return addDaysYmd(today, -7);
  return sunday;
}

function money(value: unknown) {
  const n = Number(String(value ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function cashAmountOf(row: {
  customerSnapshot: unknown;
  depositAmount: unknown;
  depositPaid: boolean | null;
}) {
  const snap = (row.customerSnapshot || {}) as {
    total?: string;
    paymentMethod?: string;
    paymentMethodId?: string | null;
    wooStatus?: string;
    datePaid?: string | null;
    paymentState?: "awaiting_payment" | "paid" | "cod";
  };
  const state =
    snap.paymentState ||
    resolvePaymentState({
      paymentMethod: snap.paymentMethod,
      paymentMethodId: snap.paymentMethodId,
      wooStatus: snap.wooStatus,
      datePaid: snap.datePaid,
    });
  if (state !== "cod") return 0;
  const deposit = row.depositPaid ? money(row.depositAmount) : 0;
  return Math.max(0, money(snap.total) - deposit);
}

function anchorIso(row: {
  shippingAssignedAt: Date | null;
  createdAt: Date;
  customerSnapshot: unknown;
}) {
  if (row.shippingAssignedAt) return row.shippingAssignedAt.toISOString();
  const snap = row.customerSnapshot as { dateCreated?: string } | null;
  if (snap?.dateCreated) return snap.dateCreated;
  return row.createdAt.toISOString();
}

function customerNameOf(snapshot: unknown) {
  const snap = snapshot as { customerName?: string } | null;
  return snap?.customerName || "—";
}

function productNamesOf(snapshot: unknown) {
  const snap = snapshot as { items?: Array<{ name?: string; quantity?: number }> } | null;
  const items = snap?.items || [];
  const names = items
    .map((line) => {
      const name = String(line.name || "").trim();
      if (!name) return "";
      const qty = typeof line.quantity === "number" && line.quantity > 1 ? ` × ${line.quantity}` : "";
      return `${name}${qty}`;
    })
    .filter(Boolean);
  return names.length ? names.join(" · ") : "—";
}

async function loadWeeks() {
  const prisma = getPrismaClient();
  if (!prisma) return [];
  return prisma.csCarrierWeek.findMany({
    where: { carrierCompany: TEMIMA_COMPANY },
    include: { lines: true },
    orderBy: { weekStart: "desc" },
  });
}

export async function getTemimaWeekSheet(weekStartInput?: string) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureCsTables();

  const sunday = sundayOnOrBefore(weekStartInput || defaultSettlementWeekStart());
  const saturday = addDaysYmd(sunday, 6);
  const weeks = await loadWeeks();
  const week = weeks.find((row) => cairoYmdFromIso(row.weekStart.toISOString()) === sunday) || null;

  const resolvedPostponeIds = new Set<number>();
  for (const item of weeks) {
    if (item.status !== "closed") continue;
    for (const line of item.lines) {
      if (line.resolvesLineId) resolvedPostponeIds.add(line.resolvesLineId);
    }
  }

  const settledIds = new Set<number>();
  const openPostpones: Array<{
    lineId: number;
    confirmationId: number;
    wooOrderNumber: string;
    cashAmount: number;
    isLarge: boolean;
  }> = [];
  for (const item of weeks) {
    if (item.status !== "closed") continue;
    if (week && item.id === week.id) continue;
    for (const line of item.lines) {
      if (line.disposition === "postpone") {
        if (!resolvedPostponeIds.has(line.id)) {
          openPostpones.push({
            lineId: line.id,
            confirmationId: line.confirmationId,
            wooOrderNumber: line.wooOrderNumber,
            cashAmount: Number(line.cashAmount),
            isLarge: line.isLarge,
          });
        }
        continue;
      }
      settledIds.add(line.confirmationId);
    }
  }

  if (week?.status === "closed") {
    const ids = week.lines.map((line) => line.confirmationId);
    const snaps = ids.length
      ? await prisma.csOrderConfirmation.findMany({
          where: { id: { in: ids } },
          select: { id: true, customerSnapshot: true },
        })
      : [];
    const snapById = new Map(snaps.map((row) => [row.id, row.customerSnapshot]));
    const rows: TemimaSheetRow[] = week.lines.map((line) => ({
      confirmationId: line.confirmationId,
      wooOrderNumber: line.wooOrderNumber,
      customerName: customerNameOf(snapById.get(line.confirmationId)),
      productNames: productNamesOf(snapById.get(line.confirmationId)),
      cashAmount: Number(line.cashAmount),
      disposition: line.disposition as TemimaDisposition,
      isLarge: line.isLarge,
      carried: Boolean(line.resolvesLineId),
      postponeLineId: line.resolvesLineId,
    }));
    return {
      ok: true as const,
      weekStart: sunday,
      weekEnd: saturday,
      status: "closed" as const,
      cashDue: Number(week.cashDue),
      cashPaid: Number(week.cashPaid),
      monthId: week.monthId,
      rows,
      history: historyOf(weeks),
    };
  }

  const orders = await prisma.csOrderConfirmation.findMany({
    where: { shippingCompany: TEMIMA_COMPANY },
    orderBy: { createdAt: "desc" },
    take: 1500,
    select: {
      id: true,
      wooOrderNumber: true,
      customerSnapshot: true,
      depositAmount: true,
      depositPaid: true,
      shippingAssignedAt: true,
      createdAt: true,
    },
  });

  const postponeIds = new Set(openPostpones.map((row) => row.confirmationId));
  const draft = new Map((week?.lines || []).map((line) => [line.confirmationId, line]));

  const rows: TemimaSheetRow[] = [];
  for (const order of orders) {
    if (settledIds.has(order.id) || postponeIds.has(order.id)) continue;
    if (!isWithinCairoDateRange(anchorIso(order), sunday, saturday)) continue;
    const saved = draft.get(order.id);
    rows.push({
      confirmationId: order.id,
      wooOrderNumber: order.wooOrderNumber,
      customerName: customerNameOf(order.customerSnapshot),
      productNames: productNamesOf(order.customerSnapshot),
      cashAmount: cashAmountOf(order),
      disposition: (saved?.disposition as TemimaDisposition) || "collect",
      isLarge: saved?.isLarge || false,
      carried: false,
      postponeLineId: null,
    });
  }

  for (const carried of openPostpones) {
    const saved = draft.get(carried.confirmationId);
    const order = orders.find((row) => row.id === carried.confirmationId);
    rows.push({
      confirmationId: carried.confirmationId,
      wooOrderNumber: carried.wooOrderNumber,
      customerName: order ? customerNameOf(order.customerSnapshot) : "—",
      productNames: order ? productNamesOf(order.customerSnapshot) : "—",
      cashAmount: carried.cashAmount,
      disposition: (saved?.disposition as TemimaDisposition) || "postpone",
      isLarge: saved?.isLarge ?? carried.isLarge,
      carried: true,
      postponeLineId: carried.lineId,
    });
  }

  rows.sort((a, b) => Number(b.wooOrderNumber) - Number(a.wooOrderNumber));
  const cashDue = rows
    .filter((row) => row.disposition === "collect")
    .reduce((sum, row) => sum + row.cashAmount, 0);

  return {
    ok: true as const,
    weekStart: sunday,
    weekEnd: saturday,
    status: "open" as const,
    cashDue,
    cashPaid: week ? Number(week.cashPaid) : 0,
    monthId: week?.monthId ?? null,
    rows,
    history: historyOf(weeks),
  };
}

function historyOf(
  weeks: Array<{
    weekStart: Date;
    weekEnd: Date;
    status: string;
    cashDue: unknown;
    cashPaid: unknown;
    monthId: number | null;
  }>,
) {
  return weeks.slice(0, 12).map((row) => ({
    weekStart: cairoYmdFromIso(row.weekStart.toISOString()),
    weekEnd: cairoYmdFromIso(row.weekEnd.toISOString()),
    status: row.status,
    cashDue: Number(row.cashDue),
    cashPaid: Number(row.cashPaid),
    inMonth: Boolean(row.monthId),
  }));
}

async function upsertOpenWeek(sunday: string, saturday: string, agentId: number) {
  const prisma = getPrismaClient();
  if (!prisma) return null;
  const start = cairoYmdBounds(sunday)?.start;
  const end = cairoYmdBounds(saturday)?.start;
  if (!start || !end) return null;
  const existing = await prisma.csCarrierWeek.findUnique({
    where: { carrierCompany_weekStart: { carrierCompany: TEMIMA_COMPANY, weekStart: start } },
  });
  if (existing?.status === "closed") return existing;
  if (existing) return existing;
  return prisma.csCarrierWeek.create({
    data: {
      carrierCompany: TEMIMA_COMPANY,
      weekStart: start,
      weekEnd: end,
      status: "open",
      closedById: agentId,
    },
  });
}

export async function saveTemimaWeek(input: {
  weekStart: string;
  cashPaid: number;
  rows: TemimaSheetRow[];
  agentId: number;
  close: boolean;
}) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureCsTables();

  const sunday = sundayOnOrBefore(input.weekStart);
  const saturday = addDaysYmd(sunday, 6);
  const week = await upsertOpenWeek(sunday, saturday, input.agentId);
  if (!week) return { ok: false as const, message: "تعذر فتح الأسبوع." };
  if (week.status === "closed") return { ok: false as const, message: "هذا الأسبوع مقفل." };

  const cashDue = input.rows
    .filter((row) => row.disposition === "collect")
    .reduce((sum, row) => sum + Number(row.cashAmount || 0), 0);

  await prisma.csCarrierWeekLine.deleteMany({ where: { weekId: week.id } });
  if (input.rows.length) {
    await prisma.csCarrierWeekLine.createMany({
      data: input.rows.map((row) => ({
        weekId: week.id,
        confirmationId: row.confirmationId,
        wooOrderNumber: row.wooOrderNumber,
        disposition: row.disposition,
        cashAmount: row.cashAmount,
        isLarge: row.disposition === "collect" ? row.isLarge : false,
        resolvesLineId: row.carried && row.disposition !== "postpone" ? row.postponeLineId : null,
      })),
    });
  }

  await prisma.csCarrierWeek.update({
    where: { id: week.id },
    data: {
      cashDue,
      cashPaid: Math.max(0, Number(input.cashPaid) || 0),
      status: input.close ? "closed" : "open",
      closedAt: input.close ? new Date() : null,
      closedById: input.agentId,
    },
  });

  return { ok: true as const, cashDue };
}

export async function previewTemimaMonth(closeDateInput?: string) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureCsTables();
  const closeDate = closeDateInput || cairoTodayYmd();
  const end = cairoYmdBounds(closeDate)?.endExclusive;
  if (!end) return { ok: false as const, message: "تاريخ غير صالح." };

  const weeks = await prisma.csCarrierWeek.findMany({
    where: {
      carrierCompany: TEMIMA_COMPANY,
      status: "closed",
      monthId: null,
      weekEnd: { lt: end },
    },
    include: { lines: true },
    orderBy: { weekStart: "asc" },
  });

  let orders = 0;
  let shippingTotal = 0;
  for (const week of weeks) {
    for (const line of week.lines) {
      if (line.disposition !== "collect") continue;
      orders += 1;
      shippingTotal += line.isLarge ? FEE_LARGE : FEE_NORMAL;
    }
  }

  return {
    ok: true as const,
    closeDate,
    weeks: weeks.map((week) => ({
      weekStart: cairoYmdFromIso(week.weekStart.toISOString()),
      weekEnd: cairoYmdFromIso(week.weekEnd.toISOString()),
      cashPaid: Number(week.cashPaid),
    })),
    deliveredOrders: orders,
    shippingTotal,
  };
}

export async function closeTemimaMonth(input: { closeDate: string; shippingPaid: number; agentId: number }) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  const preview = await previewTemimaMonth(input.closeDate);
  if (!preview.ok) return preview;
  if (preview.weeks.length === 0) {
    return { ok: false as const, message: "لا توجد أسابيع مقفلة جاهزة لهذا التاريخ." };
  }
  const end = cairoYmdBounds(input.closeDate);
  if (!end) return { ok: false as const, message: "تاريخ غير صالح." };

  const month = await prisma.csCarrierMonth.create({
    data: {
      carrierCompany: TEMIMA_COMPANY,
      closeDate: end.start,
      shippingTotal: preview.shippingTotal,
      shippingPaid: Math.max(0, Number(input.shippingPaid) || 0),
      closedById: input.agentId,
      closedAt: new Date(),
    },
  });

  await prisma.csCarrierWeek.updateMany({
    where: {
      carrierCompany: TEMIMA_COMPANY,
      status: "closed",
      monthId: null,
      weekEnd: { lt: end.endExclusive },
    },
    data: { monthId: month.id },
  });

  return { ok: true as const, shippingTotal: preview.shippingTotal, weeks: preview.weeks.length };
}
