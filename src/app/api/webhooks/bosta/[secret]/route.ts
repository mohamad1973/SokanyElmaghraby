import { NextResponse } from "next/server";

import { recordBostaWebhookOnConfirmation } from "@/lib/cs/bosta-waybill";
import { getBostaWebhookSecret, readBostaStatus } from "@/lib/shipping/bosta-client";
import { updateShipmentFromBostaWebhook } from "@/lib/shipping/shipments";
import { markWooOrderDelivered } from "@/lib/woocommerce-update";

type RouteContext = {
  params: Promise<{ secret: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { secret } = await context.params;
  const expectedSecret = getBostaWebhookSecret();

  if (secret !== expectedSecret) {
    return NextResponse.json({ message: "Invalid webhook secret." }, { status: 401 });
  }

  let payload: {
    _id?: string;
    trackingNumber?: string;
    state?: { value?: string } | string | number;
    businessReference?: string;
  };

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ message: "Invalid JSON." }, { status: 400 });
  }

  const statusValue =
    readBostaStatus(payload) || (typeof payload.state === "object" && payload.state ? payload.state.value : undefined);
  const result = await updateShipmentFromBostaWebhook({
    ...payload,
    state: { value: statusValue },
  });
  const shipment = result.ok ? result.shipment : null;
  const wooOrderId = shipment?.wooOrderId
    ? shipment.wooOrderId
    : payload.businessReference
      ? Number.parseInt(payload.businessReference, 10)
      : null;

  await recordBostaWebhookOnConfirmation({
    wooOrderId,
    trackingNumber: payload.trackingNumber || shipment?.trackingNumber,
    status: statusValue,
    raw: payload,
  });

  if (!result.ok && !wooOrderId && !payload.trackingNumber) {
    return NextResponse.json({ message: result.message }, { status: 404 });
  }

  if (statusValue === "delivered" && shipment) {
    await markWooOrderDelivered(
      shipment.wooOrderId,
      `تم التسليم عبر Bosta — ${shipment.trackingNumber || ""}`,
    );
  }

  if (shipment) {
    const { applyBostaStatusToCsConfirmation } = await import("@/lib/cs/notifications");
    await applyBostaStatusToCsConfirmation({
      wooOrderId: shipment.wooOrderId,
      status: statusValue || shipment.status,
      trackingNumber: shipment.trackingNumber,
    });
  }

  return NextResponse.json({ ok: true });
}
