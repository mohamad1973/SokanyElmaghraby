"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const cancellableStatuses = new Set(["pending", "on-hold", "processing"]);

export function canCancelOrderStatus(status: string) {
  return cancellableStatuses.has(status);
}

export function CancelOrderButton({ orderId, status }: { orderId: number; status: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!canCancelOrderStatus(status)) {
    return null;
  }

  async function cancelOrder() {
    const confirmed = window.confirm("هل تريد إلغاء هذا الطلب؟ لا يمكن التراجع بعد التأكيد.");
    if (!confirmed) {
      return;
    }

    setLoading(true);
    setError("");

    const response = await fetch(`/api/account/orders/${orderId}/cancel`, {
      method: "POST",
    });

    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    setLoading(false);

    if (!response.ok) {
      setError(payload?.message || "تعذر إلغاء الطلب.");
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        disabled={loading}
        onClick={cancelOrder}
        className="rounded-full border border-red-200 bg-red-50 px-5 py-3 text-sm font-bold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
      >
        {loading ? "جارٍ الإلغاء..." : "إلغاء الطلب"}
      </button>
      {error ? <p className="text-xs font-semibold text-red-600">{error}</p> : null}
    </div>
  );
}
