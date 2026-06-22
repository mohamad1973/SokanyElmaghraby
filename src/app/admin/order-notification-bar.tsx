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
const pollIntervalMs = 15000;

type NotificationState = {
  count: number;
  latestOrder: NotificationOrder;
};

function getTodayStartIso() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  return todayStart.toISOString();
}

export function OrderNotificationBar() {
  const [notification, setNotification] = useState<NotificationState | null>(null);

  function markAsRead(latestOrder: NotificationOrder) {
    window.localStorage.setItem(lastSeenOrderKey, String(latestOrder.id));
    setNotification(null);
  }

  useEffect(() => {
    let isMounted = true;

    async function checkLatestOrder() {
      const params = new URLSearchParams({
        per_page: "100",
        after: getTodayStartIso(),
      });
      const response = await fetch(`/api/admin/orders?${params.toString()}`, { cache: "no-store" });

      if (!response.ok) {
        return;
      }

      const payload = (await response.json().catch(() => null)) as LatestOrderResponse | null;
      const todayOrders = payload?.orders || [];
      const latestOrder = todayOrders[0];

      if (!latestOrder || !isMounted) {
        return;
      }

      const previousOrderId = window.localStorage.getItem(lastSeenOrderKey);

      if (!previousOrderId) {
        window.localStorage.setItem(lastSeenOrderKey, String(latestOrder.id));
        return;
      }

      const previousOrderIndex = todayOrders.findIndex((order) => String(order.id) === previousOrderId);
      const newOrders = previousOrderIndex === -1
        ? todayOrders
        : todayOrders.slice(0, previousOrderIndex);

      if (newOrders.length > 0) {
        setNotification({
          count: newOrders.length,
          latestOrder,
        });
      }
    }

    void checkLatestOrder();
    const interval = window.setInterval(() => {
      void checkLatestOrder();
    }, pollIntervalMs);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, []);

  if (!notification) {
    return null;
  }

  const { count, latestOrder } = notification;
  const notificationText = count === 1
    ? `طلب جديد #${latestOrder.number} من ${latestOrder.customerName} - ${latestOrder.total} ${latestOrder.currency}`
    : `لديك ${count} طلبات جديدة اليوم، أحدثها #${latestOrder.number} من ${latestOrder.customerName} - ${latestOrder.total} ${latestOrder.currency}`;

  return (
    <div className="border-b border-brand-gold/40 bg-brand-gold px-4 py-3 text-sm text-black" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-bold">{notificationText}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/orders"
            onClick={() => markAsRead(latestOrder)}
            className="rounded-md bg-black px-3 py-2 text-xs font-bold text-white"
          >
            عرض الطلبات
          </Link>
          <button
            type="button"
            onClick={() => markAsRead(latestOrder)}
            className="rounded-md border border-black/20 px-3 py-2 text-xs font-bold"
          >
            تمت القراءة
          </button>
        </div>
      </div>
    </div>
  );
}
