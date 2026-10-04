import "server-only";

import { ensureCsTables } from "@/lib/cs/agents";
import { effectivePaymentState, isFawryMethod, resolvePaymentState, sheetCollectedSplit } from "@/lib/cs/order-window";
import { cairoTodayYmd, cairoYmdBounds, cairoYmdFromIso } from "@/lib/cs/order-window";
import { listUnifiedSayedSheetIds } from "@/lib/cs/temima-sheet-edits";
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
  depositAmount: number;
  orderTotal: number;
  fawry: boolean;
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

export function defaultSettlementRange() {
  const today = cairoTodayYmd();
  const sunday = sundayOnOrBefore(today);
  const start = sunday === today ? addDaysYmd(today, -7) : sunday;
  const saturday = addDaysYmd(start, 6);
  const end = saturday > today ? today : saturday;
  return { start, end: end < start ? start : end };
}

export function defaultSettlementWeekStart() {
  return defaultSettlementRange().start;
}

function clampWeekEnd(start: string, endInput?: string) {
  const saturday = addDaysYmd(start, 6);
  const today = cairoTodayYmd();
  const cap = saturday > today ? today : saturday;
  if (!endInput) return cap < start ? start : cap;
  if (endInput < start) return start;
  if (endInput > saturday) return saturday;
  return endInput;
}

function money(value: unknown) {
  const n = Number(String(value ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function cashAmountOf(row: {
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

function settlementSplit(
  row: {
    customerSnapshot: unknown;
    depositAmount: unknown;
    depositPaid: boolean | null;
    depositApprovalStatus?: string | null;
  },
  override: number | null,
  freshFawry: boolean,
) {
  const snap = (row.customerSnapshot || {}) as {
    total?: string;
    paymentMethod?: string;
    paymentMethodId?: string | null;
    wooStatus?: string;
    datePaid?: string | null;
    paymentState?: "awaiting_payment" | "paid" | "cod";
  };
  const state = freshFawry
    ? effectivePaymentState({
        paymentMethod: snap.paymentMethod,
        paymentMethodId: snap.paymentMethodId,
        wooStatus: snap.wooStatus,
        datePaid: snap.datePaid,
        paymentState: snap.paymentState,
      })
    : snap.paymentState ||
      resolvePaymentState({
        paymentMethod: snap.paymentMethod,
        paymentMethodId: snap.paymentMethodId,
        wooStatus: snap.wooStatus,
        datePaid: snap.datePaid,
      });
  return sheetCollectedSplit({
    total: money(snap.total),
    wooStatus: snap.wooStatus,
    paymentState: state,
    depositAmount: money(row.depositAmount),
    depositPaid: row.depositPaid,
    depositApprovalStatus: row.depositApprovalStatus,
    settlementDepositOverride: override,
  });
}

async function depositOverrides(ids: number[]) {
  const prisma = getPrismaClient();
  const map = new Map<number, number | null>();
  if (!prisma) return map;
  const safe = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
  if (!safe.length) return map;
  const rows = await prisma.$queryRawUnsafe<Array<{ id: number; settlementDepositOverride: unknown }>>(
    `SELECT id, settlementDepositOverride FROM CsOrderConfirmation WHERE id IN (${safe.join(",")})`,
  );
  for (const row of rows) {
    const amount = row.settlementDepositOverride == null ? null : Number(row.settlementDepositOverride);
    map.set(Number(row.id), amount != null && Number.isFinite(amount) ? amount : null);
  }
  return map;
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

export async function getTemimaWeekSheet(weekStartInput?: string, weekEndInput?: string) {
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
          select: {
            id: true,
            customerSnapshot: true,
            depositAmount: true,
            depositPaid: true,
            depositApprovalStatus: true,
          },
        })
      : [];
    const snapById = new Map(snaps.map((row) => [row.id, row]));
    const overrides = await depositOverrides(ids);
    const rows: TemimaSheetRow[] = week.lines.map((line) => {
      const order = snapById.get(line.confirmationId);
      const snap = (order?.customerSnapshot || {}) as { total?: string; paymentMethod?: string; paymentMethodId?: string | null };
      return {
        confirmationId: line.confirmationId,
        wooOrderNumber: line.wooOrderNumber,
        customerName: customerNameOf(order?.customerSnapshot),
        productNames: productNamesOf(order?.customerSnapshot),
        cashAmount: Number(line.cashAmount),
        depositAmount: order ? settlementSplit(order, overrides.get(line.confirmationId) ?? null, false).deposit : 0,
        orderTotal: money(snap.total),
        fawry: isFawryMethod(snap.paymentMethod, snap.paymentMethodId),
        disposition: line.disposition as TemimaDisposition,
        isLarge: line.isLarge,
        carried: Boolean(line.resolvesLineId),
        postponeLineId: line.resolvesLineId,
      };
    });
    return {
      ok: true as const,
      weekStart: sunday,
      weekEnd: cairoYmdFromIso(week.weekEnd.toISOString()) || saturday,
      status: "closed" as const,
      cashDue: Number(week.cashDue),
      cashPaid: Number(week.cashPaid),
      monthId: week.monthId,
      rows,
      history: historyOf(weeks),
    };
  }

  const periodEnd = clampWeekEnd(sunday, weekEndInput);
  const sheetIds = await listUnifiedSayedSheetIds(sunday, periodEnd);
  const carryIds = openPostpones.map((row) => row.confirmationId).filter((id) => !sheetIds.includes(id));
  const orderIds = [...sheetIds, ...carryIds];
  const orders = orderIds.length
    ? await prisma.csOrderConfirmation.findMany({
        where: { id: { in: orderIds } },
        select: {
          id: true,
          wooOrderNumber: true,
          customerSnapshot: true,
          depositAmount: true,
          depositPaid: true,
          depositApprovalStatus: true,
          shippingAssignedAt: true,
          createdAt: true,
        },
      })
    : [];

  const postponeIds = new Set(openPostpones.map((row) => row.confirmationId));
  const draft = new Map((week?.lines || []).map((line) => [line.confirmationId, line]));
  const overrides = await depositOverrides(orderIds);

  const rows: TemimaSheetRow[] = [];
  const sheetIdSet = new Set(sheetIds);
  for (const order of orders) {
    if (!sheetIdSet.has(order.id)) continue;
    if (settledIds.has(order.id) || postponeIds.has(order.id)) continue;
    const saved = draft.get(order.id);
    const snap = (order.customerSnapshot || {}) as { total?: string; paymentMethod?: string; paymentMethodId?: string | null };
    const split = settlementSplit(order, overrides.get(order.id) ?? null, true);
    rows.push({
      confirmationId: order.id,
      wooOrderNumber: order.wooOrderNumber,
      customerName: customerNameOf(order.customerSnapshot),
      productNames: productNamesOf(order.customerSnapshot),
      cashAmount: split.net,
      depositAmount: split.deposit,
      orderTotal: money(snap.total),
      fawry: isFawryMethod(snap.paymentMethod, snap.paymentMethodId),
      disposition: (saved?.disposition as TemimaDisposition) || "collect",
      isLarge: saved?.isLarge || false,
      carried: false,
      postponeLineId: null,
    });
  }

  for (const carried of openPostpones) {
    const saved = draft.get(carried.confirmationId);
    const order = orders.find((row) => row.id === carried.confirmationId);
    const snap = (order?.customerSnapshot || {}) as { total?: string; paymentMethod?: string; paymentMethodId?: string | null };
    rows.push({
      confirmationId: carried.confirmationId,
      wooOrderNumber: carried.wooOrderNumber,
      customerName: order ? customerNameOf(order.customerSnapshot) : "—",
      productNames: order ? productNamesOf(order.customerSnapshot) : "—",
      cashAmount: carried.cashAmount,
      depositAmount: order ? settlementSplit(order, overrides.get(carried.confirmationId) ?? null, true).deposit : 0,
      orderTotal: money(snap.total),
      fawry: isFawryMethod(snap.paymentMethod, snap.paymentMethodId),
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
    weekEnd: periodEnd,
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

async function upsertOpenWeek(sunday: string, endYmd: string, agentId: number) {
  const prisma = getPrismaClient();
  if (!prisma) return null;
  const start = cairoYmdBounds(sunday)?.start;
  const end = cairoYmdBounds(endYmd)?.start;
  if (!start || !end) return null;
  const existing = await prisma.csCarrierWeek.findUnique({
    where: { carrierCompany_weekStart: { carrierCompany: TEMIMA_COMPANY, weekStart: start } },
  });
  if (existing?.status === "closed") return existing;
  if (existing) {
    if (cairoYmdFromIso(existing.weekEnd.toISOString()) === endYmd) return existing;
    return prisma.csCarrierWeek.update({ where: { id: existing.id }, data: { weekEnd: end } });
  }
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
  weekEnd?: string;
  cashPaid: number;
  rows: TemimaSheetRow[];
  agentId: number;
  close: boolean;
}) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureCsTables();

  const sunday = sundayOnOrBefore(input.weekStart);
  const periodEnd = clampWeekEnd(sunday, input.weekEnd);
  const week = await upsertOpenWeek(sunday, periodEnd, input.agentId);
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

export async function setFawrySettlementDeposit(input: { confirmationId: number; amount: number | null }) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  if (!Number.isInteger(input.confirmationId)) return { ok: false as const, message: "الأوردر غير موجود." };
  await ensureCsTables();
  const row = await prisma.csOrderConfirmation.findUnique({
    where: { id: input.confirmationId },
    select: { id: true, customerSnapshot: true },
  });
  if (!row) return { ok: false as const, message: "الأوردر غير موجود." };
  const snap = (row.customerSnapshot || {}) as { paymentMethod?: string; paymentMethodId?: string | null; total?: string };
  if (!isFawryMethod(snap.paymentMethod, snap.paymentMethodId)) {
    return { ok: false as const, message: "التعديل لأوردرات فوري فقط." };
  }
  const closed = await prisma.$queryRaw<Array<{ id: number }>>`
    SELECT l.id AS id
    FROM CsCarrierWeekLine l
    INNER JOIN CsCarrierWeek w ON w.id = l.weekId
    WHERE l.confirmationId = ${input.confirmationId}
      AND w.status = 'closed'
      AND w.carrierCompany = ${TEMIMA_COMPANY}
    LIMIT 1
  `;
  if (closed.length) return { ok: false as const, message: "الأسبوع مقفل." };
  const total = money(snap.total);
  const amount =
    input.amount == null || !Number.isFinite(input.amount) ? null : Math.min(total, Math.max(0, input.amount));
  if (amount == null) {
    await prisma.$executeRaw`
      UPDATE CsOrderConfirmation SET settlementDepositOverride = NULL WHERE id = ${input.confirmationId}
    `;
  } else {
    await prisma.$executeRaw`
      UPDATE CsOrderConfirmation SET settlementDepositOverride = ${amount} WHERE id = ${input.confirmationId}
    `;
  }
  const deposit = amount == null ? null : amount;
  return { ok: true as const, depositAmount: deposit, cashAmount: deposit == null ? null : Math.max(0, total - deposit) };
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
