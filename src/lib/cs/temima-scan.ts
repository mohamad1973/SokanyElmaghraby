import "server-only";

import { getPrismaClient } from "@/lib/db";
import { markCourierOutcome } from "@/lib/cs/courier-dispatch";
import { cairoTodayYmd, cairoYmdBounds } from "@/lib/cs/order-window";

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
      courierOutcome: true,
      courierAgentId: true,
    },
  });
  return { prisma, order };
}

async function todayReceiptTally(prisma: NonNullable<ReturnType<typeof getPrismaClient>>) {
  const bounds = cairoYmdBounds(cairoTodayYmd());
  if (!bounds) return { received: 0, expected: 0, matched: false };
  const rows = await prisma.csOrderConfirmation.findMany({
    where: {
      status: "CONFIRMED",
      shippingCompany: TEMIMA,
      OR: [
        { confirmedAt: { gte: bounds.start, lt: bounds.endExclusive } },
        { handedToCarrierAt: { gte: bounds.start, lt: bounds.endExclusive } },
      ],
    },
    select: { trackingNumber: true, handedToCarrier: true },
  });
  const withTracking = rows.filter((row) => String(row.trackingNumber || "").trim());
  const received = withTracking.filter((row) => row.handedToCarrier).length;
  const expected = withTracking.length;
  return { received, expected, matched: expected > 0 && received === expected };
}

function tallyMessage(tally: { received: number; expected: number; matched: boolean }) {
  if (tally.matched) return `العدد المستلم مطابق — ${tally.received}`;
  return `المستلم ${tally.received} من ${tally.expected}`;
}

export async function scanTemimaHandoff(rawTracking: string) {
  const trackingNumber = normalizeTracking(rawTracking);
  if (!trackingNumber) return { ok: false as const, message: "اكتب رقم التراك." };
  const { prisma, order } = await findConfirmedByTracking(trackingNumber);
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  if (!order) return { ok: false as const, message: "مش موجود." };
  const name = customerName(order.customerSnapshot);
  const label = `#${order.wooOrderNumber}${name ? ` ${name}` : ""}`;
  if (!order.handedToCarrier) {
    await prisma.csOrderConfirmation.update({
      where: { id: order.id },
      data: { handedToCarrier: true, handedToCarrierAt: new Date() },
    });
  }
  const tally = await todayReceiptTally(prisma);
  const note = tallyMessage(tally);
  if (order.handedToCarrier) {
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
    message: `تم التسليم لتميمة — ${label}. ${note}`,
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
