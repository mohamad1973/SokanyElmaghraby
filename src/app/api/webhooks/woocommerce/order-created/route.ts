import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

import { mapOrder, type WooOrder } from "@/lib/orders";
import { sendNewOrderWhatsApp } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

function verifyWooCommerceSignature(rawBody: string, signature: string | null) {
  const secret = process.env.WOOCOMMERCE_WEBHOOK_SECRET;

  if (!secret) {
    return true;
  }

  if (!signature) {
    return false;
  }

  const expected = createHmac("sha256", secret).update(rawBody).digest("base64");
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (signatureBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(signatureBuffer, expectedBuffer);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-wc-webhook-signature");

  if (!verifyWooCommerceSignature(rawBody, signature)) {
    return NextResponse.json({ message: "Invalid WooCommerce webhook signature." }, { status: 401 });
  }

  let payload: WooOrder;

  try {
    payload = JSON.parse(rawBody) as WooOrder;
  } catch {
    return NextResponse.json({ message: "Invalid WooCommerce webhook JSON payload." }, { status: 400 });
  }

  const order = mapOrder(payload);
  const whatsappResult = await sendNewOrderWhatsApp(order);

  return NextResponse.json({
    ok: true,
    orderNumber: order.number,
    whatsapp: whatsappResult,
  });
}
