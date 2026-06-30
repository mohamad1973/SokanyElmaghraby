import Link from "next/link";

import { getAdminOrder } from "@/lib/orders";
import { listDrivers } from "@/lib/dispatch/drivers";
import { getShipmentByOrderId } from "@/lib/shipping/shipments";
import { OrderShippingActions } from "../order-shipping-actions";

export const dynamic = "force-dynamic";

type OrderDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminOrderDetailPage({ params }: OrderDetailPageProps) {
  const { id } = await params;
  const order = await getAdminOrder(id);
  const shipment = order ? await getShipmentByOrderId(order.id) : null;
  const drivers = await listDrivers();

  if (!order) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-6 text-red-700">
        الطلب غير موجود.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">طلب #{order.number}</h1>
          <p className="mt-2 text-sm text-zinc-600">تفاصيل الطلب والشحن والعميل</p>
        </div>
        <Link href="/admin/orders" className="rounded-md border border-black/10 px-4 py-2 text-sm font-bold">
          رجوع للطلبات
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-md border border-black/10 bg-white p-5">
          <h2 className="text-lg font-bold">بيانات العميل</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div><dt className="font-bold">الاسم</dt><dd>{order.customerName}</dd></div>
            <div><dt className="font-bold">الهاتف</dt><dd dir="ltr">{order.phone}</dd></div>
            <div><dt className="font-bold">العنوان</dt><dd>{order.address}</dd></div>
            <div><dt className="font-bold">المحافظة</dt><dd>{order.governorate}</dd></div>
            <div><dt className="font-bold">المنطقة</dt><dd>{order.area}</dd></div>
          </dl>
        </section>

        <section className="rounded-md border border-black/10 bg-white p-5">
          <h2 className="text-lg font-bold">الشحن والدفع</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div><dt className="font-bold">نوع التوصيل</dt><dd>{order.fulfillmentMode === "internal" ? "مندوب داخلي" : "Bosta"}</dd></div>
            <div><dt className="font-bold">الإجمالي</dt><dd>{order.total} {order.currency}</dd></div>
            <div><dt className="font-bold">طريقة الدفع</dt><dd>{order.paymentMethod}</dd></div>
            <div><dt className="font-bold">حالة الطلب</dt><dd>{order.status}</dd></div>
            {shipment ? (
              <>
                <div><dt className="font-bold">حالة الشحن</dt><dd>{shipment.statusLabelAr}</dd></div>
                <div><dt className="font-bold">رقم التتبع</dt><dd dir="ltr">{shipment.trackingNumber || "-"}</dd></div>
              </>
            ) : null}
          </dl>

          <div className="mt-4">
            <OrderShippingActions
              orderId={order.id}
              orderNumber={order.number}
              fulfillmentMode={order.fulfillmentMode}
              trackingNumber={order.shipping?.trackingNumber}
              shippingStatus={order.shipping?.status}
              shippingStatusLabel={order.shipping?.statusLabelAr}
              drivers={drivers.filter((driver) => driver.isActive).map((driver) => ({ id: driver.id, name: driver.name }))}
            />
          </div>
        </section>
      </div>

      <section className="rounded-md border border-black/10 bg-white p-5">
        <h2 className="text-lg font-bold">الأصناف</h2>
        <div className="mt-4 space-y-3">
          {order.items.map((item) => (
            <div key={item.id} className="rounded bg-zinc-50 p-3 text-sm">
              <p className="font-bold">{item.name}</p>
              <p className="text-zinc-600">SKU: {item.sku || "-"} | الكمية: {item.quantity} | {item.total} {order.currency}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
