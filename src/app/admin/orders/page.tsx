import { getAdminOrders } from "@/lib/orders";

export const dynamic = "force-dynamic";

type OrdersPageProps = {
  searchParams: Promise<{
    page?: string;
    per_page?: string;
    status?: string;
    search?: string;
  }>;
};

const statuses = [
  { label: "كل الحالات", value: "all" },
  { label: "Processing", value: "processing" },
  { label: "Pending", value: "pending" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Failed", value: "failed" },
];

export default async function AdminOrdersPage({ searchParams }: OrdersPageProps) {
  const params = await searchParams;
  const { orders, error } = await getAdminOrders({
    page: params.page,
    perPage: params.per_page || "50",
    status: params.status,
    search: params.search,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <h1 className="text-3xl font-bold text-zinc-950">Orders</h1>
          <p className="mt-2 text-sm text-zinc-600">
            عرض الطلبات من WooCommerce بنفس بيانات WordPress الأساسية.
          </p>
        </div>

        <form className="flex flex-wrap gap-3" action="/admin/orders">
          <input
            name="search"
            defaultValue={params.search || ""}
            placeholder="بحث برقم الطلب أو الهاتف أو العميل"
            className="min-w-72 rounded-md border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand-gold"
          />
          <select
            name="status"
            defaultValue={params.status || "all"}
            className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand-gold"
          >
            {statuses.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
          <select
            name="per_page"
            defaultValue={params.per_page || "50"}
            className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand-gold"
          >
            <option value="10">آخر 10</option>
            <option value="25">آخر 25</option>
            <option value="50">آخر 50</option>
          </select>
          <button className="rounded-md bg-[#2271b1] px-4 py-2 text-sm font-bold text-white" type="submit">
            Filter
          </button>
        </form>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm leading-7 text-red-700">
          {error}
        </div>
      ) : null}

      {!error && orders.length === 0 ? (
        <div className="rounded-md border border-black/10 bg-white p-8 text-center text-sm text-zinc-600">
          لا توجد طلبات مطابقة حالياً.
        </div>
      ) : null}

      {orders.length > 0 ? <div className="overflow-hidden rounded-md border border-[#c3c4c7] bg-white shadow-sm">
        <div className="border-b border-[#c3c4c7] bg-[#f6f7f7] px-4 py-2 text-xs font-bold text-zinc-600">
          اسحب يمين/شمال لرؤية كل بيانات الطلب، واسحب لأعلى/أسفل عند كثرة الطلبات.
        </div>
        <div className="max-h-[70vh] overflow-auto">
          <table className="min-w-[1700px] border-collapse text-right text-sm">
            <thead className="bg-[#f6f7f7] text-[#1d2327]">
              <tr>
                <th className="border-b border-[#c3c4c7] px-3 py-3">Order #</th>
                <th className="border-b border-[#c3c4c7] px-3 py-3">اسم العميل</th>
                <th className="border-b border-[#c3c4c7] px-3 py-3">رقم التليفون</th>
                <th className="border-b border-[#c3c4c7] px-3 py-3">العنوان بالتفصيل</th>
                <th className="border-b border-[#c3c4c7] px-3 py-3">المحافظة</th>
                <th className="border-b border-[#c3c4c7] px-3 py-3">المنطقة</th>
                <th className="border-b border-[#c3c4c7] px-3 py-3">الأصناف والكميات</th>
                <th className="border-b border-[#c3c4c7] px-3 py-3">Total</th>
                <th className="border-b border-[#c3c4c7] px-3 py-3">Payment</th>
                <th className="border-b border-[#c3c4c7] px-3 py-3">Status</th>
                <th className="border-b border-[#c3c4c7] px-3 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="odd:bg-white even:bg-[#f6f7f7]">
                  <td className="border-b border-[#dcdcde] px-3 py-4 font-bold text-[#2271b1]">
                    #{order.number}
                  </td>
                  <td className="border-b border-[#dcdcde] px-3 py-4">{order.customerName}</td>
                  <td className="border-b border-[#dcdcde] px-3 py-4" dir="ltr">
                    {order.phone}
                  </td>
                  <td className="border-b border-[#dcdcde] px-3 py-4">{order.address}</td>
                  <td className="border-b border-[#dcdcde] px-3 py-4">{order.governorate}</td>
                  <td className="border-b border-[#dcdcde] px-3 py-4">{order.area}</td>
                  <td className="border-b border-[#dcdcde] px-3 py-4">
                    <div className="space-y-2">
                      {order.items.map((item) => (
                        <div key={item.id} className="rounded bg-zinc-50 p-2">
                          <p className="font-bold">{item.name}</p>
                          <p className="text-xs text-zinc-500">
                            SKU: {item.sku || "-"} | Qty: {item.quantity} | Value: {item.total} {order.currency}
                          </p>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="border-b border-[#dcdcde] px-3 py-4 font-bold">
                    {order.total} {order.currency}
                  </td>
                  <td className="border-b border-[#dcdcde] px-3 py-4">{order.paymentMethod}</td>
                  <td className="border-b border-[#dcdcde] px-3 py-4">
                    <span className="rounded bg-green-100 px-2 py-1 text-xs font-bold text-green-700">
                      {order.status}
                    </span>
                  </td>
                  <td className="border-b border-[#dcdcde] px-3 py-4">
                    {new Intl.DateTimeFormat("ar-EG", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(order.dateCreated))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div> : null}
    </div>
  );
}

