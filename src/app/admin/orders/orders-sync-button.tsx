"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type SyncPayload = {
  ok?: boolean;
  count?: number;
  message?: string;
};

export function OrdersSyncButton() {
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function syncOrders() {
    setIsSyncing(true);
    setMessage("");
    setError("");

    const response = await fetch("/api/admin/orders/sync", { method: "POST" });
    const payload = (await response.json().catch(() => null)) as SyncPayload | null;

    setIsSyncing(false);

    if (!response.ok || !payload?.ok) {
      setError(payload?.message || "تعذر تحديث الطلبات من WooCommerce.");
      router.refresh();
      return;
    }

    setMessage(payload.message || `تم تحديث ${payload.count || 0} طلب.`);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={syncOrders}
        disabled={isSyncing}
        className="rounded-md bg-[#2271b1] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#135e96] disabled:cursor-not-allowed disabled:bg-zinc-300"
      >
        {isSyncing ? "جاري تحديث الطلبات..." : "تحديث الطلبات من WooCommerce"}
      </button>
      {message ? <span className="text-sm font-bold text-emerald-700">{message}</span> : null}
      {error ? <span className="text-sm font-bold text-red-700">{error}</span> : null}
    </div>
  );
}
