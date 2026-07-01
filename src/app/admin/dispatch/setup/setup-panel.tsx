"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type BootstrapStatus = {
  databaseConfigured: boolean;
  databaseConnected: boolean;
  tablesReady: boolean;
  zoneCount: number;
  driverCount: number;
  shipmentCount: number;
  bostaConfigured: boolean;
  bostaWebhookUrl: string;
  message: string;
};

export function ShippingSetupPanel() {
  const router = useRouter();
  const [status, setStatus] = useState<BootstrapStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState("");

  async function loadStatus() {
    setLoading(true);
    const response = await fetch("/api/admin/setup/shipping");
    const data = (await response.json()) as BootstrapStatus;
    setStatus(data);
    setLoading(false);
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  async function initDatabase() {
    setActionMessage("");
    const response = await fetch("/api/admin/setup/shipping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "init-db" }),
    });
    const data = await response.json();
    setActionMessage(data.message || "تم.");
    setStatus(data.status || null);
    router.refresh();
  }

  async function seedZones() {
    setActionMessage("");
    const response = await fetch("/api/admin/setup/shipping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "seed-zones" }),
    });
    const data = await response.json();
    setActionMessage(data.message || "تم.");
    setStatus(data.status || null);
    router.refresh();
  }

  if (loading || !status) {
    return <p className="text-sm text-zinc-500">جاري فحص إعداد الشحن...</p>;
  }

  return (
    <div className="space-y-4 rounded-md border border-black/10 bg-white p-5">
      <div>
        <h2 className="text-lg font-bold">حالة إعداد الشحن والتوصيل</h2>
        <p className="mt-1 text-sm text-zinc-600">{status.message}</p>
      </div>

      <dl className="grid gap-3 text-sm md:grid-cols-2">
        <div className="rounded bg-zinc-50 p-3">
          <dt className="font-bold">قاعدة البيانات</dt>
          <dd>{status.databaseConnected ? "متصلة" : status.databaseConfigured ? "غير متصلة / جداول ناقصة" : "غير مُعرّفة"}</dd>
        </div>
        <div className="rounded bg-zinc-50 p-3">
          <dt className="font-bold">Bosta API</dt>
          <dd>{status.bostaConfigured ? "مُفعّل" : "غير مُفعّل"}</dd>
        </div>
        <div className="rounded bg-zinc-50 p-3">
          <dt className="font-bold">الأحياء / المندوبين / الشحنات</dt>
          <dd>{status.zoneCount} / {status.driverCount} / {status.shipmentCount}</dd>
        </div>
        <div className="rounded bg-zinc-50 p-3">
          <dt className="font-bold">Webhook Bosta</dt>
          <dd className="mt-1 break-all text-xs" dir="ltr">{status.bostaWebhookUrl}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void loadStatus()}
          className="rounded-md border border-black/10 px-4 py-2 text-sm font-bold"
        >
          إعادة الفحص
        </button>
        <button
          type="button"
          onClick={() => void initDatabase()}
          disabled={!status.databaseConfigured}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          تهيئة جداول الشحن
        </button>
        <button
          type="button"
          onClick={() => void seedZones()}
          disabled={!status.databaseConnected || status.zoneCount > 0}
          className="rounded-md bg-[#2271b1] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          إنشاء أحياء القاهرة والجيزة الافتراضية
        </button>
      </div>

      {actionMessage ? <p className="text-sm text-zinc-600">{actionMessage}</p> : null}

      <ol className="list-decimal space-y-2 pr-5 text-sm leading-7 text-zinc-700">
        <li>تأكد أن `DATABASE_URL` و `BOSTA_API_KEY` موجودان في Vercel ثم Redeploy.</li>
        <li>انسخ رابط Webhook أعلاه وسجّله في لوحة Bosta Business.</li>
        <li>أنشئ الأحياء الافتراضية، ثم أضف المندوبين من صفحة المندوبين.</li>
        <li>جرّب «إنشاء Bosta» لطلب خارج القاهرة/الجيزة من صفحة الطلبات.</li>
      </ol>
    </div>
  );
}
