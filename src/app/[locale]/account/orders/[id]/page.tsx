import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CancelOrderButton } from "@/components/cancel-order-button";
import { VisualEditableText } from "@/components/visual-editable-text";
import { getCustomerOrders, getCustomerSession, getOrderTimeline } from "@/lib/customer-account";

type OrderDetailsPageProps = {
  params: Promise<{ id: string }>;
};

export const metadata = {
  title: "تفاصيل الطلب",
};

export default async function OrderDetailsPage({ params }: OrderDetailsPageProps) {
  const session = await getCustomerSession();

  if (!session) {
    redirect("/account/login");
  }

  const { id } = await params;
  const orders = await getCustomerOrders(session.customerId);
  const order = orders.find((item) => String(item.id) === id);

  if (!order) {
    notFound();
  }

  const timeline = getOrderTimeline(order);

  return (
    <div className="py-12">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-4xl font-bold text-zinc-950">
              <VisualEditableText textKey="account.orderDetails.orderTitle">طلب</VisualEditableText> #{order.number}
            </h1>
            <p className="mt-2 text-sm text-zinc-600">
              <VisualEditableText textKey="account.orderDetails.currentStatus">الحالة الحالية:</VisualEditableText>{" "}
              {order.status}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CancelOrderButton orderId={order.id} status={order.status} />
            <Link href="/account" className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-bold">
              <VisualEditableText textKey="account.orderDetails.backToAccount">العودة لحسابي</VisualEditableText>
            </Link>
          </div>
        </div>

        <section className="rounded-[2rem] bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-zinc-950">
            <VisualEditableText textKey="account.orderDetails.trackingTitle">تتبع الطلب</VisualEditableText>
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-5">
            {timeline.map((step) => (
              <div key={step.id} className="rounded-2xl bg-zinc-50 p-4 text-center">
                <div className={`mx-auto mb-3 h-4 w-4 rounded-full ${step.isActive ? "bg-brand-gold" : "bg-zinc-300"}`} />
                <p className={`text-sm font-bold ${step.isActive ? "text-zinc-950" : "text-zinc-500"}`}>{step.label}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 rounded-2xl bg-brand-cream p-4 text-sm leading-7 text-zinc-700">
            <VisualEditableText textKey="account.orderDetails.trackingNote">
              موعد الوصول ورقم التتبع سيتم عرضهما هنا عند إضافتهما في بيانات الطلب من ووكومرس أو لوحة الإدارة.
            </VisualEditableText>
          </p>
        </section>

        <section className="rounded-[2rem] bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-zinc-950">
            <VisualEditableText textKey="account.orderDetails.productsTitle">منتجات الطلب</VisualEditableText>
          </h2>
          <div className="mt-5 grid gap-3">
            {order.items.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-zinc-50 p-4">
                <div>
                  <p className="font-bold text-zinc-950">{item.name}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    <VisualEditableText textKey="account.orderDetails.sku">SKU:</VisualEditableText>{" "}
                    {item.sku || <VisualEditableText textKey="account.orderDetails.noSku">غير محدد</VisualEditableText>}
                  </p>
                </div>
                <p className="text-sm font-bold text-zinc-700">
                  <VisualEditableText textKey="account.orderDetails.quantity">الكمية:</VisualEditableText>{" "}
                  {item.quantity}
                </p>
                <p className="text-sm font-bold text-zinc-950">{item.total} {order.currency}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 flex justify-between rounded-2xl bg-zinc-950 p-5 text-white">
            <span className="font-bold">
              <VisualEditableText textKey="account.orderDetails.total">الإجمالي</VisualEditableText>
            </span>
            <span className="font-bold text-brand-gold">{order.total} {order.currency}</span>
          </div>
        </section>
      </div>
    </div>
  );
}
