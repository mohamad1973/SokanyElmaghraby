import "server-only";

import { getPrismaClient } from "@/lib/db";
import { markCourierOutcome } from "@/lib/cs/courier-dispatch";
import { cairoTodayYmd } from "@/lib/cs/order-window";
import { listTemimaCutoffs } from "@/lib/cs/temima-cutoff";
import { listTemimaSheetEdits, listUnifiedSayedSheet } from "@/lib/cs/temima-sheet-edits";
import { resolveHandedToCarrierAt } from "@/lib/cs/temima-sheet";

const TEMIMA = "sayed_temima";

function normalizeTracking(value: string) {
  return value.trim().replace(/\s+/g, "");
}

function customerName(snapshot: unknown) {
  const snap = (snapshot || {}) as { customerName?: string };
  return String(snap.customerName || "").trim();
}

async function findConfirmedByTracking(trackingNumber: string) {
  const prisma = getPrismaClient();
  if (!prisma) return { prisma: null, order: null };
  const order = await prisma.csOrderConfirmation.findFirst({
    where: {
      status: "CONFIRMED",
      shippingCompany: TEMIMA,
      trackingNumber,
    },
    orderBy: { confirmedAt: "desc" },
    select: {
      id: true,
      wooOrderNumber: true,
      customerSnapshot: true,
      handedToCarrier: true,
      handedToCarrierAt: true,
      confirmedAt: true,
      courierOutcome: true,
      courierAgentId: true,
    },
  });
  return { prisma, order };
}

async function todayReceiptTally() {
  const today = cairoTodayYmd();
  const rows = await listUnifiedSayedSheet(today, today);
  const received = rows.filter((row) => row.handedToCarrier).length;
  const expected = rows.length;
  return { received, expected, matched: expected > 0 && received === expected };
}

function tallyMessage(tally: { received: number; expected: number; matched: boolean }) {
  const remaining = Math.max(0, tally.expected - tally.received);
  if (tally.expected > 0 && remaining === 0) return `تم التسليم بالكامل — ${tally.received}`;
  return `الأصل ${tally.expected} — الباقي ${remaining}`;
}

export async function loadTemimaReceiptTally() {
  const prisma = getPrismaClient();
  if (!prisma) return { received: 0, expected: 0, matched: false };
  return todayReceiptTally();
}

export async function scanTemimaHandoff(rawTracking: string) {
  const trackingNumber = normalizeTracking(rawTracking);
  if (!trackingNumber) return { ok: false as const, message: "اكتب رقم التراك." };
  const { prisma, order } = await findConfirmedByTracking(trackingNumber);
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  if (!order) return { ok: false as const, message: "مش موجود." };
  const name = customerName(order.customerSnapshot);
  const label = `#${order.wooOrderNumber}${name ? ` ${name}` : ""}`;
  const cutoffs = await listTemimaCutoffs();
  const edits = await listTemimaSheetEdits();
  const today = cairoTodayYmd();
  if (edits.some((row) => row.confirmationId === order.id && row.dayYmd === today && row.kind === "exclude")) {
    return { ok: false as const, message: "مش في شيت النهاردة." };
  }
  const now = new Date();
  const handedAt = resolveHandedToCarrierAt(order.handedToCarrierAt, order.confirmedAt, now, cutoffs);
  const moved = !order.handedToCarrierAt || handedAt.getTime() !== new Date(order.handedToCarrierAt).getTime();
  if (!order.handedToCarrier || moved) {
    await prisma.csOrderConfirmation.update({
      where: { id: order.id },
      data: { handedToCarrier: true, handedToCarrierAt: handedAt },
    });
  }
  const tally = await todayReceiptTally();
  const note = tallyMessage(tally);
  if (order.handedToCarrier && !moved) {
    return {
      ok: true as const,
      already: true,
      wooOrderNumber: order.wooOrderNumber,
      customerName: name,
      receipt: tally,
      message: `اتسجل قبل كده — ${label}. ${note}`,
    };
  }
  return {
    ok: true as const,
    already: false,
    wooOrderNumber: order.wooOrderNumber,
    customerName: name,
    receipt: tally,
    message: `السكان سليم — ${label}. ${note}`,
  };
}

export async function scanTemimaDeliver(rawTracking: string, courierId: number) {
  const trackingNumber = normalizeTracking(rawTracking);
  if (!trackingNumber) return { ok: false as const, message: "اكتب رقم التراك." };
  if (!courierId) return { ok: false as const, message: "اختار المندوب." };
  const { prisma, order } = await findConfirmedByTracking(trackingNumber);
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  if (!order || order.courierAgentId !== courierId) return { ok: false as const, message: "مش موجود." };
  const name = customerName(order.customerSnapshot);
  const label = `#${order.wooOrderNumber}${name ? ` ${name}` : ""}`;
  if (order.courierOutcome === "delivered") {
    return { ok: true as const, already: true, wooOrderNumber: order.wooOrderNumber, customerName: name, message: `اتسجل قبل كده — ${label}` };
  }
  const saved = await markCourierOutcome(order.id, courierId, "delivered");
  if (!saved.ok) return saved;
  return { ok: true as const, already: false, wooOrderNumber: order.wooOrderNumber, customerName: name, message: `تم التسليم — ${label}` };
}
