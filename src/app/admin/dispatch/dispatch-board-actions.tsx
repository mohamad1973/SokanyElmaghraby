"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DispatchBoardActions() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function autoAssign() {
    setLoading(true);
    setMessage("");

    const response = await fetch("/api/admin/dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "auto-assign", sendOtp: true }),
    });

    const data = await response.json();
    setLoading(false);
    setMessage(data.message || "تم التوزيع.");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={loading}
        onClick={autoAssign}
        className="rounded-md bg-[#2271b1] px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
      >
        {loading ? "جاري التوزيع..." : "توزيع تلقائي للطلبات"}
      </button>
      {message ? <p className="text-sm text-zinc-600">{message}</p> : null}
    </div>
  );
}

export function OptimizeRunButton({ runId }: { runId: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function optimize() {
    setLoading(true);
    await fetch("/api/admin/dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "optimize", runId }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <button
      type="button"
      disabled={loading}
      onClick={optimize}
      className="rounded bg-zinc-800 px-2 py-1 text-xs font-bold text-white disabled:opacity-60"
    >
      {loading ? "..." : "تحسين المسار"}
    </button>
  );
}
