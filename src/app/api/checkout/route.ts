import { NextResponse } from "next/server";

import { getCustomerSession } from "@/lib/customer-account";
import { createFawryPaymentRedirect } from "@/lib/fawry";
import { createWooStoreOrder } from "@/lib/woocommerce-orders";

export const dynamic = "force-dynamic";

type CheckoutPayload = {
  customer?: {
    name?: string;
    phone?: string;
    email?: string;
    governorate?: string;
    area?: string;
    address?: string;
    note?: string;
  };
  paymentMethod?: "fawry" | "cod";
  items?: Array<{
    productId: number;
    quantity: number;
    price?: string;
  }>;
};

function parseCartSubtotal(items: Array<{ quantity: number; price?: string }>) {
  return items.reduce((sum, item) => {
    const unit = Number(String(item.price || "0").replace(/,/g, ""));
    const qty = Number(item.quantity) || 0;
    if (!Number.isFinite(unit) || qty < 1) {
      return sum;
    }

    return sum + unit * qty;
  }, 0);
}

export async function POST(request: Request) {
  const session = await getCustomerSession();

  if (!session) {
    return NextResponse.json(
      { message: "يجب تسجيل الدخول لإتمام الطلب.", redirectUrl: "/account/login?next=/checkout" },
      { status: 401 },
    );
  }

  const payload = (await request.json().catch(() => null)) as CheckoutPayload | null;
  const customer = payload?.customer;
  const paymentMethod = payload?.paymentMethod === "fawry" ? "fawry" : "cod";
  const items = Array.isArray(payload?.items)
    ? payload!.items!
        .map((item) => ({
          productId: Number(item.productId),
          quantity: Math.max(1, Math.floor(Number(item.quantity) || 0)),
          price: item.price,
        }))
        .filter((item) => Number.isFinite(item.productId) && item.productId > 0 && item.quantity > 0)
    : [];

  if (!customer?.name?.trim() || !customer.phone?.trim() || !customer.governorate?.trim() || !customer.area?.trim() || !customer.address?.trim()) {
    return NextResponse.json({ message: "أكمل الاسم والهاتف والمحافظة والمنطقة والعنوان." }, { status: 400 });
  }

  if (!items.length) {
    return NextResponse.json({ message: "السلة فارغة. أضف منتجات قبل إتمام الطلب." }, { status: 400 });
  }

  const orderResult = await createWooStoreOrder({
    customerId: session.customerId,
    customerEmail: customer.email || session.email,
    name: customer.name.trim(),
    phone: customer.phone.trim(),
    governorate: customer.governorate.trim(),
    area: customer.area.trim(),
    address: customer.address.trim(),
    customerNote: customer.note?.trim() || "",
    paymentMethod,
    items: items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
  });

  if (!orderResult.ok) {
    return NextResponse.json({ message: orderResult.message }, { status: 502 });
  }

  const { order } = orderResult;

  if (paymentMethod === "cod") {
    return NextResponse.json({
      ok: true,
      paymentMethod: "cod",
      orderId: order.id,
      orderNumber: order.number,
      total: order.total,
      redirectUrl: `/checkout/thank-you?order=${encodeURIComponent(order.number)}`,
    });
  }

  if (order.paymentUrl) {
    return NextResponse.json({
      ok: true,
      paymentMethod: "fawry",
      orderId: order.id,
      orderNumber: order.number,
      total: order.total,
      redirectUrl: order.paymentUrl,
    });
  }

  const amountFromOrder = Number(String(order.total).replace(/,/g, ""));
  const amount = Number.isFinite(amountFromOrder) && amountFromOrder > 0 ? amountFromOrder : parseCartSubtotal(items);
  const fawry = createFawryPaymentRedirect({
    orderId: order.id,
    orderNumber: order.number,
    amount,
    customerName: customer.name.trim(),
    customerPhone: customer.phone.trim(),
    customerEmail: customer.email || session.email || "customer@sokany-eg.com",
  });

  if (!fawry.ok) {
    return NextResponse.json(
      {
        ok: true,
        paymentMethod: "fawry",
        orderId: order.id,
        orderNumber: order.number,
        total: order.total,
        message: `${fawry.message} تم إنشاء الطلب #${order.number} ويمكن إكمال الدفع من حسابك أو لوحة ووردبريس.`,
        redirectUrl: `/checkout/thank-you?order=${encodeURIComponent(order.number)}&payment=fawry-pending`,
      },
      { status: 200 },
    );
  }

  return NextResponse.json({
    ok: true,
    paymentMethod: "fawry",
    orderId: order.id,
    orderNumber: order.number,
    total: order.total,
    redirectUrl: fawry.redirectUrl,
  });
}
