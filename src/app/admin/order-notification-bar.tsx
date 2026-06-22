"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type LatestOrderResponse = {
  orders?: Array<{
    id: number;
    number: string;
    customerName: string;
    phone: string;
    total: string;
    currency: string;
    dateCreated: string;
  }>;
};

type NotificationOrder = NonNullable<LatestOrderResponse["orders"]>[number];

const lastSeenOrderKey = "sokany:last-seen-order-id";

export function OrderNotificationBar() {
  const [order, setOrder] = useState<NotificationOrder | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function checkLatestOrder() {
      const response = await fetch("/api/admin/orders?per_page=1", { cache: "no-store" });

      if (!response.ok) {
        return;
      }

      const payload = (await response.json().catch(() => null)) as LatestOrderResponse | null;
      const latestOrder = payload?.orders?.[0];

      if (!latestOrder || !isMounted) {
        return;
      }

      const previousOrderId = window.localStorage.getItem(lastSeenOrderKey);

      if (!previousOrderId) {
        window.localStorage.setItem(lastSeenOrderKey, String(latestOrder.id));
        return;
      }

      if (previousOrderId !== String(latestOrder.id)) {
        setOrder(latestOrder);
        window.localStorage.setItem(lastSeenOrderKey, String(latestOrder.id));
      }
    }

    void checkLatestOrder();
    const interval = window.setInterval(() => {
      void checkLatestOrder();
    }, 30000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, []);

  if (!order) {
    return null;
  }

  return (
    <div className="border-b border-brand-gold/40 bg-brand-gold px-4 py-3 text-sm text-black" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-bold">
          طلب جديد #{order.number} من {order.customerName} - {order.total} {order.currency}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/admin/orders" className="rounded-md bg-black px-3 py-2 text-xs font-bold text-white">
            عرض الطلبات
          </Link>
          <button
            type="button"
            onClick={() => setOrder(null)}
            className="rounded-md border border-black/20 px-3 py-2 text-xs font-bold"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
