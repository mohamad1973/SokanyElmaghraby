import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/session-guards";
import { getAdminOrder } from "@/lib/orders";
import { createBostaShipmentForOrder } from "@/lib/shipping/shipments";

export async function POST(request: Request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { orderId?: number };

  if (!body.orderId) {
    return NextResponse.json({ message: "orderId is required." }, { status: 400 });
  }

  const order = await getAdminOrder(String(body.orderId));

  if (!order) {
    return NextResponse.json({ message: "Order not found." }, { status: 404 });
  }

  const result = await createBostaShipmentForOrder(order);

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, shipment: result.shipment, trackingNumber: result.trackingNumber });
}
