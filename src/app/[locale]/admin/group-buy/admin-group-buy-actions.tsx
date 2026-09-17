"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminGroupBuyActions({
  id,
  canApprove,
  canDecide,
}: {
  id: string;
  canApprove: boolean;
  canDecide?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run(action: "approve" | "reject") {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/group-buy/submissions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        wooError?: string | null;
        message?: string;
      };
      if (!res.ok) {
        setMessage(data.message || "فشل الطلب");
      } else if (data.wooError) {
        setMessage(`تمت الموافقة — تحذير Woo: ${data.wooError}`);
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function decide(action: "EXTEND" | "EXECUTE" | "CANCEL") {
    if (action === "EXECUTE" && !window.confirm("تنفيذ الصفقة بالحالة الحالية؟")) {
      return;
    }
    if (action === "CANCEL" && !window.confirm("إنهاء الصفقة دون تنفيذ؟")) {
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const body =
        action === "EXTEND"
          ? { action, days: 7 }
          : { action };
      const res = await fetch(`/api/admin/group-buy/submissions/${id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        setMessage(data.message || "فشل القرار");
      } else {
        setMessage(data.message || "تم");
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (canDecide) {
    return (
      <div className="flex flex-col items-end gap-2">
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => void decide("EXTEND")}
            className="rounded-md border border-black/10 px-3 py-2 text-xs font-bold disabled:opacity-50"
          >
            تمديد 7 أيام
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void decide("EXECUTE")}
            className="rounded-md bg-brand-gold px-3 py-2 text-xs font-bold text-black disabled:opacity-50"
          >
            تنفيذ
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void decide("CANCEL")}
            className="rounded-md border border-red-200 px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-50"
          >
            إلغاء
          </button>
        </div>
        <a
          href={`/campaign/offer/${id}`}
          className="text-xs font-bold text-zinc-600 underline"
        >
          فتح الحملة
        </a>
        {message ? <p className="max-w-xs text-xs text-amber-800">{message}</p> : null}
      </div>
    );
  }

  if (!canApprove) {
    return (
      <a
        href={`/campaign/offer/${id}`}
        className="rounded-md border border-black/10 px-3 py-2 text-xs font-bold"
      >
        فتح الحملة
      </a>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={loading}
          onClick={() => void run("approve")}
          className="rounded-md bg-brand-gold px-3 py-2 text-xs font-bold text-black disabled:opacity-50"
        >
          موافقة + نشر Woo
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => void run("reject")}
          className="rounded-md border border-black/10 px-3 py-2 text-xs font-bold disabled:opacity-50"
        >
          رفض
        </button>
      </div>
      {message ? <p className="max-w-xs text-xs text-amber-800">{message}</p> : null}
    </div>
  );
}
