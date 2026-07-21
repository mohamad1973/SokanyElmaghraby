"use client";

import { useState } from "react";

type ImportButtonProps = {
  endpoint: "/api/admin/import/products" | "/api/admin/import/categories";
  label: string;
};

export function ImportButton({ endpoint, label }: ImportButtonProps) {
  const [isImporting, setIsImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function runImport() {
    setIsImporting(true);
    setMessage("");
    setError("");

    const response = await fetch(endpoint, { method: "POST" });
    const payload = (await response.json().catch(() => null)) as {
      count?: number;
      message?: string;
    } | null;

    setIsImporting(false);

    if (!response.ok) {
      setError(payload?.message || "تعذر تنفيذ الاستيراد.");
      return;
    }

    setMessage(`تم استيراد ${payload?.count || 0} عنصر إلى MySQL.`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={runImport}
        disabled={isImporting}
        className="rounded-md bg-[#2271b1] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#135e96] disabled:cursor-not-allowed disabled:bg-zinc-300"
      >
        {isImporting ? "جار الاستيراد..." : label}
      </button>
      {message ? <span className="text-sm font-bold text-emerald-700">{message}</span> : null}
      {error ? <span className="text-sm font-bold text-red-700">{error}</span> : null}
    </div>
  );
}
