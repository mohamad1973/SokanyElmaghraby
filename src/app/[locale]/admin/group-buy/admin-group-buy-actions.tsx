"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminGroupBuyActions({
  id,
  canApprove,
}: {
  id: string;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function run(action: "approve" | "reject") {
    setLoading(true);
    try {
      await fetch(`/api/admin/group-buy/submissions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
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
    <div className="flex gap-2">
      <button
        type="button"
        disabled={loading}
        onClick={() => run("approve")}
        className="rounded-md bg-brand-gold px-3 py-2 text-xs font-bold text-black disabled:opacity-50"
      >
        موافقة
      </button>
      <button
        type="button"
        disabled={loading}
        onClick={() => run("reject")}
        className="rounded-md border border-black/10 px-3 py-2 text-xs font-bold disabled:opacity-50"
      >
        رفض
      </button>
    </div>
  );
}
