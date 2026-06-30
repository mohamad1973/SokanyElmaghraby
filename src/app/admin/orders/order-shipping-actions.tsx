"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type DriverOption = {
  id: number;
  name: string;
};

type OrderShippingActionsProps = {
  orderId: number;
  orderNumber: string;
  fulfillmentMode: "internal" | "bosta";
  trackingNumber?: string;
  shippingStatus?: string;
  shippingStatusLabel?: string;
  drivers: DriverOption[];
};

export function OrderShippingActions({
  orderId,
  orderNumber,
  fulfillmentMode,
  trackingNumber,
  shippingStatus,
  shippingStatusLabel,
  drivers,
}: OrderShippingActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [selectedDriver, setSelectedDriver] = useState("");

  async function createBostaShipment() {
    setLoading("bosta");
    setMessage("");

    const response = await fetch("/api/admin/shipping/bosta/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId }),
    });

    const data = await response.json();
    setLoading(null);
    setMessage(data.message || (response.ok ? "تم إنشاء شحنة Bosta." : "تعذر إنشاء الشحنة."));
    router.refresh();
  }

  async function assignDriver() {
    if (!selectedDriver) {
      setMessage("اختر مندوباً أولاً.");
      return;
    }

    setLoading("assign");
    setMessage("");

    const response = await fetch("/api/admin/dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "assign",
        orderId,
        driverId: Number.parseInt(selectedDriver, 10),
        sendOtp: true,
      }),
    });

    const data = await response.json();
    setLoading(null);
    setMessage(data.message || (response.ok ? "تم تعيين المندوب." : "تعذر التعيين."));
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded px-2 py-1 text-xs font-bold ${
            fulfillmentMode === "internal" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"
          }`}
        >
          {fulfillmentMode === "internal" ? "توصيل داخلي" : "Bosta"}
        </span>
        {trackingNumber ? (
          <span className="text-xs font-bold text-zinc-600" dir="ltr">
            {trackingNumber}
          </span>
        ) : null}
        {shippingStatus ? (
          <span className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-700">
            {shippingStatusLabel || shippingStatus}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/admin/orders/${orderId}`}
          className="rounded border border-black/10 px-2 py-1 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
        >
          تفاصيل
        </Link>

        {fulfillmentMode === "bosta" && !trackingNumber ? (
          <button
            type="button"
            disabled={loading === "bosta"}
            onClick={createBostaShipment}
            className="rounded bg-orange-600 px-2 py-1 text-xs font-bold text-white disabled:opacity-60"
          >
            {loading === "bosta" ? "..." : "إنشاء Bosta"}
          </button>
        ) : null}

        {fulfillmentMode === "internal" && !shippingStatus?.includes("assigned") && !shippingStatus?.includes("delivered") ? (
          <>
            <select
              value={selectedDriver}
              onChange={(event) => setSelectedDriver(event.target.value)}
              className="rounded border border-black/10 px-2 py-1 text-xs"
            >
              <option value="">اختر مندوب</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={loading === "assign"}
              onClick={assignDriver}
              className="rounded bg-blue-600 px-2 py-1 text-xs font-bold text-white disabled:opacity-60"
            >
              {loading === "assign" ? "..." : "تعيين مندوب"}
            </button>
          </>
        ) : null}
      </div>

      {message ? <p className="text-xs text-zinc-600">{message}</p> : null}
      <p className="text-[10px] text-zinc-400">#{orderNumber}</p>
    </div>
  );
}
