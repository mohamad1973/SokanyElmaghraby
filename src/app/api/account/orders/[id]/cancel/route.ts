import { NextResponse } from "next/server";

import { getCustomerOrders, getCustomerSession } from "@/lib/customer-account";
import { updateWooOrderStatus } from "@/lib/woocommerce-update";

export const dynamic = "force-dynamic";

const cancellableStatuses = new Set(["pending", "on-hold", "processing"]);

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const session = await getCustomerSession();

  if (!session) {
    return NextResponse.json({ message: "يجب تسجيل الدخول." }, { status: 401 });
  }

  const { id } = await context.params;
  const orderId = Number(id);

  if (!Number.isInteger(orderId) || orderId < 1) {
    return NextResponse.json({ message: "رقم الطلب غير صالح." }, { status: 400 });
  }

  const orders = await getCustomerOrders(session.customerId);
  const order = orders.find((item) => item.id === orderId);

  if (!order) {
    return NextResponse.json({ message: "الطلب غير موجود أو لا يخص حسابك." }, { status: 404 });
  }

  if (!cancellableStatuses.has(order.status)) {
    return NextResponse.json(
      { message: "لا يمكن إلغاء هذا الطلب في حالته الحالية." },
      { status: 400 },
    );
  }

  const result = await updateWooOrderStatus(
    orderId,
    "cancelled",
    "تم إلغاء الطلب بواسطة العميل من المتجر.",
  );

  if (!result.ok) {
    return NextResponse.json({ message: result.message || "تعذر إلغاء الطلب." }, { status: 502 });
  }

  return NextResponse.json({ ok: true, orderId, status: "cancelled" });
}
