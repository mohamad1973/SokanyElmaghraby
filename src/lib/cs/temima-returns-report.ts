import "server-only";

import { ensureCsTables } from "@/lib/cs/agents";
import {
  cairoTodayYmd,
  cairoYmdBounds,
  cairoYmdFromIso,
  isFawryMethod,
  sheetCollectedSplit,
  sheetSplitFromConfirmation,
} from "@/lib/cs/order-window";
import { getPrismaClient } from "@/lib/db";
import { listSettlementSheetDayMap } from "@/lib/cs/temima-sheet-edits";
import {
  defaultSettlementWeekStart,
  sundayOnOrBefore,
  TEMIMA_COMPANY,
} from "@/lib/cs/temima-settlement";

export type TemimaReturnsCase =
  | "temima_cancel"
  | "unmarked_prev_thu_sat"
  | "unmarked_curr_sun_wed"
  | "customer_return_exchange";

export type TemimaReturnsReportRow = {
  confirmationId: number;
  wooOrderNumber: string;
  parentWooOrderNumber: string;
  sheetDay: string;
  customerName: string;
  phone: string;
  productNames: string;
  amount: number;
  caseKind: TemimaReturnsCase;
  temimaCancel: boolean;
  unmarkedPrevThuSat: boolean;
  unmarkedCurrSunWed: boolean;
  customerReturnExchange: boolean;
};

export type TemimaReturnsReportCounts = {
  temimaCancel: number;
  unmarkedPrevThuSat: number;
  unmarkedCurrSunWed: number;
  customerReturnExchange: number;
  total: number;
};

function ymdParts(ymd: string) {
  const [year, month, day] = ymd.split("-").map((part) => Number(part));
  if (!year || !month || !day) return null;
  return { year, month, day };
}

function addDaysYmd(ymd: string, days: number) {
  const parts = ymdParts(ymd);
  if (!parts) return ymd;
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return `${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, "0")}-${String(utc.getUTCDate()).padStart(2, "0")}`;
}

function weekdayIndex(ymd: string) {
  const parts = ymdParts(ymd);
  if (!parts) return 0;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

function isYmd(value?: string): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function customerNameOf(snapshot: unknown) {
  const snap = snapshot as { customerName?: string } | null;
  return snap?.customerName || "—";
}

function phoneOf(snapshot: unknown) {
  const snap = snapshot as { phone?: string } | null;
  const text = String(snap?.phone || "").trim();
  return text && text !== "null" ? text : "";
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

function amountOf(row: {
  customerSnapshot: unknown;
  depositAmount: unknown;
  depositPaid: boolean | null;
  depositApprovalStatus?: string | null;
  orderTotalDelta?: unknown;
  discountApprovalStatus?: string | null;
  settlementDepositOverride?: unknown;
}) {
  const override =
    row.settlementDepositOverride == null ? null : Number(row.settlementDepositOverride);
  const split = sheetCollectedSplit(
    sheetSplitFromConfirmation({
      ...row,
      settlementDepositOverride: override != null && Number.isFinite(override) ? override : null,
      keepCancelledValue: true,
      freshPaymentState: true,
    }),
  );
  const snap = (row.customerSnapshot || {}) as { paymentMethod?: string; paymentMethodId?: string | null };
  if (isFawryMethod(snap.paymentMethod, snap.paymentMethodId)) return split.deposit + split.net;
  return split.net;
}

function caseFlags(kind: TemimaReturnsCase) {
  return {
    temimaCancel: kind === "temima_cancel",
    unmarkedPrevThuSat: kind === "unmarked_prev_thu_sat",
    unmarkedCurrSunWed: kind === "unmarked_curr_sun_wed",
    customerReturnExchange: kind === "customer_return_exchange",
  };
}

function isMarkedFinal(disposition: string | null | undefined) {
  return disposition === "collect" || disposition === "return";
}

function isUnmarked(disposition: string | null | undefined) {
  return !isMarkedFinal(disposition);
}

async function dispositionsFor(ids: number[]) {
  const map = new Map<number, string>();
  const prisma = getPrismaClient();
  if (!prisma || !ids.length) return map;
  const safe = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
  if (!safe.length) return map;

  const lines = await prisma.csCarrierWeekLine.findMany({
    where: {
      confirmationId: { in: safe },
      week: { carrierCompany: TEMIMA_COMPANY, carryKey: 0 },
    },
    select: { confirmationId: true, disposition: true, resolvesLineId: true, id: true, weekId: true },
    orderBy: { id: "desc" },
  });
  for (const line of lines) {
    if (line.resolvesLineId) continue;
    if (map.has(line.confirmationId)) continue;
    map.set(line.confirmationId, String(line.disposition || ""));
  }

  const missing = safe.filter((id) => !map.has(id));
  if (missing.length) {
    const marks = await prisma.$queryRawUnsafe<Array<{ id: number; disposition: string | null }>>(
      `SELECT id, temimaSupervisorResult AS disposition
       FROM CsOrderConfirmation
       WHERE id IN (${missing.join(",")})`,
    );
    for (const row of marks) {
      if (!map.has(Number(row.id))) map.set(Number(row.id), String(row.disposition || ""));
    }
  }
  return map;
}

async function loadOrders(ids: number[]) {
  const prisma = getPrismaClient();
  const empty = new Map<
    number,
    {
      id: number;
      wooOrderNumber: string;
      customerSnapshot: unknown;
      depositAmount: unknown;
      depositPaid: boolean | null;
      depositApprovalStatus: string | null;
      orderTotalDelta: unknown;
      discountApprovalStatus: string | null;
      parentConfirmationId: number | null;
      fulfillmentKind: string | null;
      settlementDepositOverride: unknown;
    }
  >();
  if (!prisma || !ids.length) return empty;
  const safe = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
  if (!safe.length) return empty;
  const rows = await prisma.csOrderConfirmation.findMany({
    where: { id: { in: safe } },
    select: {
      id: true,
      wooOrderNumber: true,
      customerSnapshot: true,
      depositAmount: true,
      depositPaid: true,
      depositApprovalStatus: true,
      orderTotalDelta: true,
      discountApprovalStatus: true,
      parentConfirmationId: true,
      fulfillmentKind: true,
      settlementDepositOverride: true,
    },
  });
  return new Map(rows.map((row) => [row.id, row]));
}

function pushRow(
  out: TemimaReturnsReportRow[],
  seen: Set<string>,
  order: {
    id: number;
    wooOrderNumber: string;
    customerSnapshot: unknown;
    depositAmount: unknown;
    depositPaid: boolean | null;
    depositApprovalStatus?: string | null;
    orderTotalDelta?: unknown;
    discountApprovalStatus?: string | null;
    settlementDepositOverride?: unknown;
  },
  sheetDay: string,
  kind: TemimaReturnsCase,
  parentWooOrderNumber = "",
) {
  const key = `${order.id}:${kind}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push({
    confirmationId: order.id,
    wooOrderNumber: order.wooOrderNumber,
    parentWooOrderNumber,
    sheetDay,
    customerName: customerNameOf(order.customerSnapshot),
    phone: phoneOf(order.customerSnapshot),
    productNames: productNamesOf(order.customerSnapshot),
    amount: amountOf(order),
    caseKind: kind,
    ...caseFlags(kind),
  });
}

export async function getTemimaReturnsReport(weekStartInput?: string) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureCsTables();

  const sunday = sundayOnOrBefore(isYmd(weekStartInput) ? weekStartInput : defaultSettlementWeekStart());
  const saturday = addDaysYmd(sunday, 6);
  const prevSunday = addDaysYmd(sunday, -7);
  const prevThursday = addDaysYmd(prevSunday, 4);
  const prevSaturday = addDaysYmd(prevSunday, 6);
  const currMonday = addDaysYmd(sunday, 1);
  const currTuesday = addDaysYmd(sunday, 2);
  const currWednesday = addDaysYmd(sunday, 3);

  const [currDays, prevDays] = await Promise.all([
    listSettlementSheetDayMap(sunday, saturday),
    listSettlementSheetDayMap(prevThursday, prevSaturday),
  ]);

  const unmarkedPrev = new Map<number, string>();
  for (const [id, day] of prevDays) {
    if (day === prevThursday || day === prevSaturday) unmarkedPrev.set(id, day);
  }
  const unmarkedCurr = new Map<number, string>();
  for (const [id, day] of currDays) {
    const wd = weekdayIndex(day);
    if (wd >= 0 && wd <= 3 && day >= sunday && day <= currWednesday) unmarkedCurr.set(id, day);
  }
  const cancelIds = new Map<number, string>();
  for (const [id, day] of currDays) {
    if (day >= sunday && day <= saturday) cancelIds.set(id, day);
  }

  const temimaIds = [...new Set([...unmarkedPrev.keys(), ...unmarkedCurr.keys(), ...cancelIds.keys()])];
  const [dispositions, orders] = await Promise.all([dispositionsFor(temimaIds), loadOrders(temimaIds)]);

  const rows: TemimaReturnsReportRow[] = [];
  const seen = new Set<string>();

  for (const [id, day] of cancelIds) {
    const disposition = dispositions.get(id);
    if (disposition !== "return") continue;
    const order = orders.get(id);
    if (!order) continue;
    pushRow(rows, seen, order, day, "temima_cancel");
  }

  for (const [id, day] of unmarkedPrev) {
    if (!isUnmarked(dispositions.get(id))) continue;
    const order = orders.get(id);
    if (!order) continue;
    pushRow(rows, seen, order, day, "unmarked_prev_thu_sat");
  }

  for (const [id, day] of unmarkedCurr) {
    if (!isUnmarked(dispositions.get(id))) continue;
    const order = orders.get(id);
    if (!order) continue;
    pushRow(rows, seen, order, day, "unmarked_curr_sun_wed");
  }

  const weekBounds = cairoYmdBounds(sunday);
  const weekEndBounds = cairoYmdBounds(saturday);
  if (weekBounds && weekEndBounds) {
    const children = await prisma.csOrderConfirmation.findMany({
      where: {
        parentConfirmationId: { not: null },
        fulfillmentKind: { in: ["return", "exchange"] },
        createdAt: { gte: weekBounds.start, lt: weekEndBounds.endExclusive },
      },
      select: {
        id: true,
        wooOrderNumber: true,
        customerSnapshot: true,
        depositAmount: true,
        depositPaid: true,
        depositApprovalStatus: true,
        orderTotalDelta: true,
        discountApprovalStatus: true,
        parentConfirmationId: true,
        fulfillmentKind: true,
        settlementDepositOverride: true,
        createdAt: true,
      },
      take: 2000,
    });
    const parentIds = [
      ...new Set(
        children
          .map((row) => (row.parentConfirmationId == null ? 0 : Number(row.parentConfirmationId)))
          .filter((id) => id > 0),
      ),
    ];
    const parents = parentIds.length
      ? await prisma.csOrderConfirmation.findMany({
          where: { id: { in: parentIds } },
          select: { id: true, wooOrderNumber: true },
        })
      : [];
    const parentNumber = new Map(parents.map((row) => [row.id, row.wooOrderNumber]));
    for (const child of children) {
      const kind =
        child.fulfillmentKind === "exchange" ||
        String((child.customerSnapshot as { fulfillmentKind?: string } | null)?.fulfillmentKind || "") === "exchange"
          ? "exchange"
          : "return";
      if (kind !== "return" && kind !== "exchange") continue;
      const day = cairoYmdFromIso(child.createdAt.toISOString()) || sunday;
      if (day < sunday || day > saturday) continue;
      const parentId = child.parentConfirmationId == null ? 0 : Number(child.parentConfirmationId);
      pushRow(rows, seen, child, day, "customer_return_exchange", parentNumber.get(parentId) || "");
    }
  }

  rows.sort((a, b) => {
    if (a.sheetDay !== b.sheetDay) return a.sheetDay < b.sheetDay ? -1 : 1;
    return Number(String(b.wooOrderNumber).replace(/\D/g, "")) - Number(String(a.wooOrderNumber).replace(/\D/g, ""));
  });

  const counts: TemimaReturnsReportCounts = {
    temimaCancel: rows.filter((row) => row.temimaCancel).length,
    unmarkedPrevThuSat: rows.filter((row) => row.unmarkedPrevThuSat).length,
    unmarkedCurrSunWed: rows.filter((row) => row.unmarkedCurrSunWed).length,
    customerReturnExchange: rows.filter((row) => row.customerReturnExchange).length,
    total: rows.length,
  };

  return {
    ok: true as const,
    weekStart: sunday,
    weekEnd: saturday > cairoTodayYmd() ? cairoTodayYmd() : saturday,
    weekSaturday: saturday,
    prevThursday,
    prevSaturday,
    currSunday: sunday,
    currWednesday,
    counts,
    rows,
  };
}
