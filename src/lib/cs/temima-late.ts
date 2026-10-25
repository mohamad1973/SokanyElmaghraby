import "server-only";

import { ensureCsTables } from "@/lib/cs/agents";
import { getPrismaClient } from "@/lib/db";
import { cairoTodayYmd, cairoYmdBounds, cairoYmdFromIso } from "@/lib/cs/order-window";
import { ensureTemimaFreezeTables } from "@/lib/cs/temima-sheet-freeze";

export const LATE_AFTER_MS = 65 * 60 * 60 * 1000;
export const LATE_FROM_YMD = "2026-09-27";
const ID_CHUNK = 400;

export type TemimaLateDelivery = {
  confirmationId: number;
  wooOrderNumber: string;
  customerName: string;
  phone: string;
  freezeDay: string;
  freezeAt: string;
  daysSinceFreeze: number;
  sinceLabel: string;
  statusLabel: "لم يسجل" | "مؤجل";
};

function chunkIds(ids: number[]) {
  const out: number[][] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) out.push(ids.slice(i, i + ID_CHUNK));
  return out;
}

function snapshotText(value: string | null | undefined) {
  const text = String(value || "").trim();
  return text === "null" ? "" : text;
}

export function temimaSinceFreezeLabel(days: number) {
  const n = Math.max(1, Math.floor(days));
  if (n === 1) return "منذ يوم";
  if (n === 2) return "منذ يومين";
  if (n >= 3 && n <= 10) return `منذ ${n} أيام`;
  return `منذ ${n} يوم`;
}

export function cairoDaysSinceFreeze(freezeAt: Date, now = new Date()) {
  const fromYmd = cairoYmdFromIso(freezeAt.toISOString());
  const toYmd = cairoYmdFromIso(now.toISOString()) || cairoTodayYmd();
  const from = cairoYmdBounds(fromYmd);
  const to = cairoYmdBounds(toYmd);
  if (!from || !to) return 0;
  return Math.max(0, Math.round((to.start.getTime() - from.start.getTime()) / 86400000));
}

function isFinalOutcome(supervisor: string | null | undefined, courier: string | null | undefined, delivered: unknown) {
  const result = String(supervisor || "");
  const outcome = String(courier || "");
  if (result === "collect" || result === "return") return true;
  if (outcome === "delivered" || outcome === "refused") return true;
  return Boolean(delivered);
}

function lateStatusLabel(supervisor: string | null | undefined, courier: string | null | undefined): "لم يسجل" | "مؤجل" {
  if (String(supervisor || "") === "postpone" || String(courier || "") === "postponed") return "مؤجل";
  return "لم يسجل";
}

export async function markTemimaSheetHandedToCarrier(confirmationIds: number[]) {
  const prisma = getPrismaClient();
  const ids = [...new Set(confirmationIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (!prisma || !ids.length) return;
  for (const group of chunkIds(ids)) {
    await prisma.$executeRawUnsafe(
      `UPDATE CsOrderConfirmation
       SET handedToCarrier = 1,
           handedToCarrierAt = COALESCE(handedToCarrierAt, CURRENT_TIMESTAMP(3))
       WHERE id IN (${group.map(() => "?").join(", ")})
         AND (handedToCarrier = 0 OR handedToCarrier IS NULL)`,
      ...group,
    );
  }
}

export async function listTemimaLateDeliveries(now = new Date()): Promise<TemimaLateDelivery[]> {
  const prisma = getPrismaClient();
  if (!prisma) return [];
  await ensureCsTables();
  await ensureTemimaFreezeTables();
  const cutoff = new Date(now.getTime() - LATE_AFTER_MS);
  const cutoffYmd = cairoYmdFromIso(cutoff.toISOString());
  if (!cutoffYmd || cutoffYmd < LATE_FROM_YMD) return [];
  const pairs = await prisma.$queryRawUnsafe<
    Array<{ dayYmd: string; confirmationId: number | bigint }>
  >(
    `SELECT d.dayYmd, f.confirmationId
     FROM CsTemimaSheetFreezeDay d
     INNER JOIN CsTemimaSheetFreeze f ON f.dayYmd = d.dayYmd
     WHERE d.dayYmd >= ?
       AND d.dayYmd <= ?
     ORDER BY d.dayYmd ASC`,
    LATE_FROM_YMD,
    cutoffYmd,
  );
  if (!pairs.length) return [];

  const freezeById = new Map<number, { dayYmd: string; freezeAt: Date }>();
  for (const row of pairs) {
    const id = Number(row.confirmationId);
    const dayYmd = String(row.dayYmd);
    if (!Number.isInteger(id) || id <= 0 || freezeById.has(id) || dayYmd < LATE_FROM_YMD) continue;
    const freezeAt = cairoYmdBounds(dayYmd)?.start ?? null;
    if (!freezeAt || freezeAt.getTime() > cutoff.getTime()) continue;
    freezeById.set(id, { dayYmd, freezeAt });
  }
  const ids = [...freezeById.keys()];
  if (!ids.length) return [];

  type OrderRow = {
    id: number | bigint;
    wooOrderNumber: string | null;
    temimaSupervisorResult: string | null;
    courierOutcome: string | null;
    deliveredToCustomer: number | boolean | null;
    customerName: string | null;
    phone: string | null;
  };
  const orders = new Map<number, OrderRow>();
  for (const group of chunkIds(ids)) {
    const rows = await prisma.$queryRawUnsafe<OrderRow[]>(
      `SELECT id, wooOrderNumber, temimaSupervisorResult, courierOutcome, deliveredToCustomer,
        JSON_UNQUOTE(JSON_EXTRACT(customerSnapshot, '$.customerName')) AS customerName,
        JSON_UNQUOTE(JSON_EXTRACT(customerSnapshot, '$.phone')) AS phone
       FROM CsOrderConfirmation
       WHERE id IN (${group.map(() => "?").join(", ")})
         AND status = 'CONFIRMED'`,
      ...group,
    );
    for (const row of rows) orders.set(Number(row.id), row);
  }

  const settled = new Set<number>();
  for (const group of chunkIds(ids)) {
    const lines = await prisma.csCarrierWeekLine.findMany({
      where: { confirmationId: { in: group }, disposition: { in: ["collect", "return"] } },
      select: { confirmationId: true },
    });
    for (const line of lines) settled.add(line.confirmationId);
  }

  const items: TemimaLateDelivery[] = [];
  for (const [id, freeze] of freezeById) {
    const order = orders.get(id);
    if (!order) continue;
    if (settled.has(id)) continue;
    if (isFinalOutcome(order.temimaSupervisorResult, order.courierOutcome, order.deliveredToCustomer)) continue;
    const daysSinceFreeze = Math.max(1, cairoDaysSinceFreeze(freeze.freezeAt, now));
    items.push({
      confirmationId: id,
      wooOrderNumber: String(order.wooOrderNumber || ""),
      customerName: snapshotText(order.customerName),
      phone: snapshotText(order.phone),
      freezeDay: freeze.dayYmd,
      freezeAt: freeze.freezeAt.toISOString(),
      daysSinceFreeze,
      sinceLabel: temimaSinceFreezeLabel(daysSinceFreeze),
      statusLabel: lateStatusLabel(order.temimaSupervisorResult, order.courierOutcome),
    });
  }

  items.sort((a, b) => {
    if (a.freezeAt !== b.freezeAt) return a.freezeAt.localeCompare(b.freezeAt);
    return a.wooOrderNumber.localeCompare(b.wooOrderNumber, "en", { numeric: true });
  });
  return items;
}
