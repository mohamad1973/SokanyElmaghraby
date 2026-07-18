import { NextResponse } from "next/server";

import { markOrderPaidFromFawry, verifyFawryCallbackSignature } from "@/lib/fawry";
import { getWooOrderByNumberOrId } from "@/lib/woocommerce-orders";

export const dynamic = "force-dynamic";

async function handleCallback(payload: Record<string, unknown>) {
  const status = String(payload.orderStatus || payload.paymentStatus || "").toUpperCase();
  const merchantRef = String(payload.merchantRefNumber || payload.merchantRefNum || payload.merchantRefNo || "");
  const referenceNumber = String(payload.fawryRefNumber || payload.referenceNumber || "");

  const paidStatuses = new Set(["PAID", "SUCCESS", "NEW", "DELIVERED"]);
  const isPaid = paidStatuses.has(status);

  if (!merchantRef) {
    return NextResponse.json({ ok: false, message: "merchant reference missing." }, { status: 400 });
  }

  if (process.env.FAWRY_SECURITY_KEY && !verifyFawryCallbackSignature(payload)) {
    return NextResponse.json({ ok: false, message: "Invalid Fawry signature." }, { status: 401 });
  }

  if (!isPaid) {
    return NextResponse.json({
      ok: true,
      received: true,
      updated: false,
      status,
      referenceNumber: referenceNumber || null,
    });
  }

  const order = await getWooOrderByNumberOrId(merchantRef);
  const orderId = Number(order?.id);

  if (!Number.isFinite(orderId) || orderId < 1) {
    return NextResponse.json({ ok: false, message: "Order not found." }, { status: 404 });
  }

  const note = `تم تأكيد دفع فوري. المرجع: ${referenceNumber || "—"}. الحالة: ${status || "PAID"}.`;
  const update = await markOrderPaidFromFawry(orderId, note);

  return NextResponse.json({
    ok: update.ok,
    received: true,
    updated: update.ok,
    orderId,
    referenceNumber: referenceNumber || null,
    message: update.ok ? "Order marked processing." : update.message,
  });
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  let payload: Record<string, unknown> = {};

  if (contentType.includes("application/json")) {
    payload = ((await request.json().catch(() => null)) as Record<string, unknown> | null) || {};
  } else {
    const form = await request.formData().catch(() => null);
    if (form) {
      payload = Object.fromEntries(Array.from(form.entries()).map(([key, value]) => [key, String(value)]));
    }
  }

  return handleCallback(payload);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const payload = Object.fromEntries(searchParams.entries());
  return handleCallback(payload);
}
