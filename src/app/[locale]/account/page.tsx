import Link from "next/link";
import { redirect } from "next/navigation";

import { AccountChangePasswordForm } from "@/components/account-change-password-form";
import { AccountLogoutButton } from "@/components/account-logout-button";
import { CancelOrderButton } from "@/components/cancel-order-button";
import { VisualEditableText } from "@/components/visual-editable-text";
import {
  calculateLoyaltySummary,
  getActiveOrder,
  getCustomerOrders,
  getCustomerSession,
  getOrderTimeline,
} from "@/lib/customer-account";

export const metadata = {
  title: "حسابي",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function AccountPage() {
  const session = await getCustomerSession();

  if (!session) {
    redirect("/account/login");
  }

  const orders = await getCustomerOrders(session.customerId);
  const activeOrder = getActiveOrder(orders);
  const timeline = getOrderTimeline(activeOrder);
  const loyalty = calculateLoyaltySummary(orders);

  return (
    <div className="py-12">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold text-zinc-950">
              <VisualEditableText textKey="account.dashboard.title">حسابي</VisualEditableText>
            </h1>
            <p className="mt-2 text-sm text-zinc-600">{session.name} - {session.phone || session.email}</p>
          </div>
          <AccountLogoutButton />
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <article className="rounded-[2rem] bg-zinc-950 p-6 text-white shadow-sm">
            <p className="text-sm font-bold text-brand-gold">
              <VisualEditableText textKey="account.dashboard.loyaltyTitle">محفظة الولاء</VisualEditableText>
            </p>
            <p className="mt-4 text-4xl font-bold">{loyalty.points.toLocaleString("ar-EG")} نقطة</p>
            <p className="mt-2 text-sm leading-7 text-zinc-300">
              <VisualEditableText textKey="account.dashboard.discountPrefix">قيمة خصم تقريبية:</VisualEditableText>{" "}
              {loyalty.discountValue.toLocaleString("ar-EG")}{" "}
              <VisualEditableText textKey="account.dashboard.currency">جنيه.</VisualEditableText>
            </p>
          </article>
          <article className="rounded-[2rem] bg-white p-6 shadow-sm">
            <p className="text-sm font-bold text-zinc-500">
              <VisualEditableText textKey="account.dashboard.completedTotal">إجمالي مشتريات مكتملة</VisualEditableText>
            </p>
            <p className="mt-4 text-3xl font-bold text-zinc-950">{loyalty.completedOrdersTotal.toLocaleString("ar-EG")} جنيه</p>
          </article>
          <article className="rounded-[2rem] bg-white p-6 shadow-sm">
            <p className="text-sm font-bold text-zinc-500">
              <VisualEditableText textKey="account.dashboard.orderCount">عدد الطلبات</VisualEditableText>
            </p>
            <p className="mt-4 text-3xl font-bold text-zinc-950">{orders.length.toLocaleString("ar-EG")}</p>
          </article>
        </div>

        {activeOrder ? (
          <section className="rounded-[2rem] bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold text-zinc-950">
                  <VisualEditableText textKey="account.dashboard.currentOrder">الطلب الحالي</VisualEditableText> #{activeOrder.number}
                </h2>
                <p className="mt-1 text-sm text-zinc-500">
                  <VisualEditableText textKey="account.dashboard.lastUpdate">آخر تحديث:</VisualEditableText>{" "}
                  {formatDate(activeOrder.dateCreated)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <CancelOrderButton orderId={activeOrder.id} status={activeOrder.status} />
                <Link href={`/account/orders/${activeOrder.id}`} className="rounded-full bg-brand-gold px-5 py-3 text-sm font-bold text-black">
                  <VisualEditableText textKey="account.dashboard.orderDetails">تفاصيل الطلب</VisualEditableText>
                </Link>
              </div>
            </div>
            <div className="mt-8 grid gap-4 md:grid-cols-5">
              {timeline.map((step) => (
                <div key={step.id} className="relative rounded-2xl bg-zinc-50 p-4 text-center">
                  <div className={`mx-auto mb-3 h-4 w-4 rounded-full ${step.isActive ? "bg-brand-gold" : "bg-zinc-300"}`} />
                  <p className={`text-sm font-bold ${step.isActive ? "text-zinc-950" : "text-zinc-500"}`}>{step.label}</p>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <section className="rounded-[2rem] bg-white p-8 text-center text-sm font-bold text-zinc-600 shadow-sm">
            <VisualEditableText textKey="account.dashboard.noOrders">لا توجد طلبات حتى الآن.</VisualEditableText>
          </section>
        )}

        <section className="rounded-[2rem] bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-zinc-950">تغيير كلمة المرور</h2>
          <p className="mt-2 text-sm text-zinc-600">
            غيّر كلمة المرور باستخدام الكلمة الحالية، أو عبر كود واتساب إذا نسيتها.
          </p>
          <AccountChangePasswordForm phone={session.phone || ""} />
        </section>

        <section className="rounded-[2rem] bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-zinc-950">
            <VisualEditableText textKey="account.dashboard.previousOrders">طلباتي السابقة</VisualEditableText>
          </h2>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[720px] text-right text-sm">
              <thead className="bg-zinc-50 text-zinc-500">
                <tr>
                  <th className="px-4 py-3"><VisualEditableText textKey="account.dashboard.table.orderNumber">رقم الطلب</VisualEditableText></th>
                  <th className="px-4 py-3"><VisualEditableText textKey="account.dashboard.table.date">التاريخ</VisualEditableText></th>
                  <th className="px-4 py-3"><VisualEditableText textKey="account.dashboard.table.status">الحالة</VisualEditableText></th>
                  <th className="px-4 py-3"><VisualEditableText textKey="account.dashboard.table.total">الإجمالي</VisualEditableText></th>
                  <th className="px-4 py-3"><VisualEditableText textKey="account.dashboard.table.points">النقاط</VisualEditableText></th>
                  <th className="px-4 py-3"><VisualEditableText textKey="account.dashboard.table.details">التفاصيل</VisualEditableText></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const points = order.status === "completed" ? Math.floor(Number(order.total || 0) / 10) : 0;

                  return (
                    <tr key={order.id} className="border-b border-black/5">
                      <td className="px-4 py-4 font-bold">#{order.number}</td>
                      <td className="px-4 py-4">{formatDate(order.dateCreated)}</td>
                      <td className="px-4 py-4">{order.status}</td>
                      <td className="px-4 py-4">{order.total} {order.currency}</td>
                      <td className="px-4 py-4">{points.toLocaleString("ar-EG")}</td>
                      <td className="px-4 py-4">
                        <Link href={`/account/orders/${order.id}`} className="font-bold text-zinc-950 underline">
                          <VisualEditableText textKey="account.dashboard.table.view">عرض</VisualEditableText>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
