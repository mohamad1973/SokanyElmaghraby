import "server-only";

import { getPrismaClient } from "@/lib/db";
import { markCourierOutcome } from "@/lib/cs/courier-dispatch";

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

export async function scanTemimaHandoff(rawTracking: string) {
  const trackingNumber = normalizeTracking(rawTracking);
  if (!trackingNumber) return { ok: false as const, message: "اكتب رقم التراك." };
  const { prisma, order } = await findConfirmedByTracking(trackingNumber);
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  if (!order) return { ok: false as const, message: "مش موجود." };
  const name = customerName(order.customerSnapshot);
  const label = `#${order.wooOrderNumber}${name ? ` ${name}` : ""}`;
  if (order.handedToCarrier) {
    return { ok: true as const, already: true, wooOrderNumber: order.wooOrderNumber, customerName: name, message: `اتسجل قبل كده — ${label}` };
  }
  await prisma.csOrderConfirmation.update({
    where: { id: order.id },
    data: { handedToCarrier: true, handedToCarrierAt: new Date() },
  });
  return { ok: true as const, already: false, wooOrderNumber: order.wooOrderNumber, customerName: name, message: `تم التسليم لتميمة — ${label}` };
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
