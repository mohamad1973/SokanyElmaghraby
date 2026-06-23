import Link from "next/link";
import { redirect } from "next/navigation";

import { AccountLogoutButton } from "@/components/account-logout-button";
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
            <h1 className="text-4xl font-bold text-zinc-950">حسابي</h1>
            <p className="mt-2 text-sm text-zinc-600">{session.name} - {session.phone || session.email}</p>
          </div>
          <AccountLogoutButton />
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <article className="rounded-[2rem] bg-zinc-950 p-6 text-white shadow-sm">
            <p className="text-sm font-bold text-brand-gold">محفظة الولاء</p>
            <p className="mt-4 text-4xl font-bold">{loyalty.points.toLocaleString("ar-EG")} نقطة</p>
            <p className="mt-2 text-sm leading-7 text-zinc-300">
              قيمة خصم تقريبية: {loyalty.discountValue.toLocaleString("ar-EG")} جنيه.
            </p>
          </article>
          <article className="rounded-[2rem] bg-white p-6 shadow-sm">
            <p className="text-sm font-bold text-zinc-500">إجمالي مشتريات مكتملة</p>
            <p className="mt-4 text-3xl font-bold text-zinc-950">{loyalty.completedOrdersTotal.toLocaleString("ar-EG")} جنيه</p>
          </article>
          <article className="rounded-[2rem] bg-white p-6 shadow-sm">
            <p className="text-sm font-bold text-zinc-500">عدد الطلبات</p>
            <p className="mt-4 text-3xl font-bold text-zinc-950">{orders.length.toLocaleString("ar-EG")}</p>
          </article>
        </div>

        {activeOrder ? (
          <section className="rounded-[2rem] bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold text-zinc-950">الطلب الحالي #{activeOrder.number}</h2>
                <p className="mt-1 text-sm text-zinc-500">آخر تحديث: {formatDate(activeOrder.dateCreated)}</p>
              </div>
              <Link href={`/account/orders/${activeOrder.id}`} className="rounded-full bg-brand-gold px-5 py-3 text-sm font-bold text-black">
                تفاصيل الطلب
              </Link>
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
            لا توجد طلبات حتى الآن.
          </section>
        )}

        <section className="rounded-[2rem] bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-zinc-950">طلباتي السابقة</h2>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[720px] text-right text-sm">
              <thead className="bg-zinc-50 text-zinc-500">
                <tr>
                  <th className="px-4 py-3">رقم الطلب</th>
                  <th className="px-4 py-3">التاريخ</th>
                  <th className="px-4 py-3">الحالة</th>
                  <th className="px-4 py-3">الإجمالي</th>
                  <th className="px-4 py-3">النقاط</th>
                  <th className="px-4 py-3">التفاصيل</th>
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
                          عرض
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
