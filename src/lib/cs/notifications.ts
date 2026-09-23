import "server-only";

import { CS_CONFIRMATION_STATUS } from "@/lib/cs/checklist";
import { listCsConfirmationsForViewer } from "@/lib/cs/confirmations";
import { listUnseenDepositDecisionsForAgent } from "@/lib/cs/deposit-approvals";
import { getPrismaClient } from "@/lib/db";
import { ensureCsTables } from "@/lib/cs/agents";

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

function isCarrierPickedUp(status: string | null | undefined) {
  const s = (status || "").toLowerCase();
  return /picked|pickup|in_transit|out_for_delivery|delivering|shipped|received/.test(s);
}

function isDeliveredStatus(status: string | null | undefined) {
  const s = (status || "").toLowerCase();
  return s === "delivered" || s.includes("delivered");
}

export async function getCsNotificationsForAgent(opts: {
  agentId: number;
  isSupervisor: boolean;
}) {
  const rows = await listCsConfirmationsForViewer(opts);
  const prisma = getPrismaClient();

  const wooIds = rows.map((r) => r.wooOrderId);
  const shipmentByWoo = new Map<number, { status: string; trackingNumber: string | null }>();
  if (prisma && wooIds.length) {
    try {
      const shipments = await prisma.shipment.findMany({
        where: { wooOrderId: { in: wooIds } },
        select: { wooOrderId: true, status: true, trackingNumber: true },
      });
      for (const s of shipments) {
        shipmentByWoo.set(s.wooOrderId, { status: s.status, trackingNumber: s.trackingNumber });
      }
    } catch {
      // shipping tables may be absent
    }
  }

  const handedToCarrier: Array<{ id: number; wooOrderNumber: string }> = [];
  const confirmDelivery: Array<{ id: number; wooOrderNumber: string }> = [];
  const followUpDue: Array<{ id: number; wooOrderNumber: string }> = [];

  const now = Date.now();

  for (const row of rows) {
    if (row.status !== CS_CONFIRMATION_STATUS.CONFIRMED) continue;
    const ship = shipmentByWoo.get(row.wooOrderId);
    const snap = row.customerSnapshot as { trackingNumber?: string | null } | null;
    const hasTracking = Boolean(ship?.trackingNumber || snap?.trackingNumber);
    const carrierActive = Boolean(ship && isCarrierPickedUp(ship.status));
    const deliveredShip = Boolean(ship && isDeliveredStatus(ship.status));

    if (!row.handedToCarrier && (hasTracking || carrierActive)) {
      handedToCarrier.push({ id: row.id, wooOrderNumber: row.wooOrderNumber });
    }

    if (!row.deliveredToCustomer && (deliveredShip || row.handedToCarrier)) {
      confirmDelivery.push({ id: row.id, wooOrderNumber: row.wooOrderNumber });
    }

    const deliveredAt = (row as { deliveredToCustomerAt?: Date | null }).deliveredToCustomerAt;
    if (
      row.deliveredToCustomer &&
      !row.customerFollowUp &&
      deliveredAt &&
      now - new Date(deliveredAt).getTime() >= FIVE_DAYS_MS
    ) {
      followUpDue.push({ id: row.id, wooOrderNumber: row.wooOrderNumber });
    }
  }

  const depositDecisions = await listUnseenDepositDecisionsForAgent(opts);

  return {
    handedToCarrier,
    confirmDelivery,
    followUpDue,
    depositDecisions,
    totals: {
      handedToCarrier: handedToCarrier.length,
      confirmDelivery: confirmDelivery.length,
      followUpDue: followUpDue.length,
      depositDecisions: depositDecisions.length,
      all: handedToCarrier.length + confirmDelivery.length + followUpDue.length + depositDecisions.length,
    },
  };
}

/** Sync CS follow-up flags from Bosta shipment status when possible. */
export async function applyBostaStatusToCsConfirmation(input: {
  wooOrderId: number;
  status: string;
  trackingNumber?: string | null;
}) {
  const prisma = getPrismaClient();
  if (!prisma) return;
  await ensureCsTables();

  try {
    const row = await prisma.csOrderConfirmation.findFirst({
      where: { wooOrderId: input.wooOrderId },
    });
    if (!row || row.status !== CS_CONFIRMATION_STATUS.CONFIRMED) return;

    const now = new Date();
    const data: {
      handedToCarrier?: boolean;
      handedToCarrierAt?: Date | null;
      deliveredToCustomer?: boolean;
      deliveredToCustomerAt?: Date | null;
      customerSnapshot?: object;
    } = {};

    if (!row.handedToCarrier && (isCarrierPickedUp(input.status) || input.trackingNumber)) {
      data.handedToCarrier = true;
      data.handedToCarrierAt = now;
    }
    if (!row.deliveredToCustomer && isDeliveredStatus(input.status)) {
      data.deliveredToCustomer = true;
      data.deliveredToCustomerAt = now;
      data.handedToCarrier = true;
      data.handedToCarrierAt = row.handedToCarrierAt || now;
    }

    if (input.trackingNumber) {
      const snap = (row.customerSnapshot as Record<string, unknown> | null) || {};
      data.customerSnapshot = { ...snap, trackingNumber: input.trackingNumber };
    }

    if (Object.keys(data).length === 0) return;

    await prisma.csOrderConfirmation.update({
      where: { id: row.id },
      data,
    });
  } catch (error) {
    console.warn("[cs] applyBostaStatusToCsConfirmation:", error);
  }
}
