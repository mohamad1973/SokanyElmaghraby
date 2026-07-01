import { NextResponse } from "next/server";

import { getBostaWebhookSecret } from "@/lib/shipping/bosta-client";
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
    state?: { value?: string };
    businessReference?: string;
  };

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ message: "Invalid JSON." }, { status: 400 });
  }

  const result = await updateShipmentFromBostaWebhook(payload);

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 404 });
  }

  if (payload.state?.value === "delivered" && result.shipment) {
    await markWooOrderDelivered(
      result.shipment.wooOrderId,
      `تم التسليم عبر Bosta — ${result.shipment.trackingNumber || ""}`,
    );
  }

  return NextResponse.json({ ok: true });
}
