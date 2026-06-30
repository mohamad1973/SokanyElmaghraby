"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type ZoneOption = {
  id: number;
  name: string;
  governorate: string;
};

type DriverFormProps = {
  zones: ZoneOption[];
  initial?: {
    id: number;
    name: string;
    phone: string;
    email: string | null;
    maxOrders: number;
    maxCodValue: number;
    isActive: boolean;
    zoneIds: number[];
  };
};

export function DriverForm({ zones, initial }: DriverFormProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedZones, setSelectedZones] = useState<number[]>(initial?.zoneIds || []);

  function toggleZone(zoneId: number) {
    setSelectedZones((current) =>
      current.includes(zoneId) ? current.filter((id) => id !== zoneId) : [...current, zoneId],
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const formData = new FormData(event.currentTarget);
    const payload = {
      id: initial?.id,
      name: String(formData.get("name") || ""),
      phone: String(formData.get("phone") || ""),
      email: String(formData.get("email") || ""),
      password: String(formData.get("password") || ""),
      maxOrders: Number(formData.get("maxOrders") || 20),
      maxCodValue: Number(formData.get("maxCodValue") || 50000),
      isActive: formData.get("isActive") === "on",
      zoneIds: selectedZones,
    };

    const response = await fetch("/api/admin/dispatch/drivers", {
      method: initial ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    setLoading(false);
    setMessage(data.message || (response.ok ? "تم الحفظ." : "تعذر الحفظ."));
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 rounded-md border border-black/10 bg-white p-5">
      <h2 className="text-lg font-bold">{initial ? "تعديل مندوب" : "إضافة مندوب"}</h2>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1 text-sm font-bold">
          الاسم
          <input name="name" defaultValue={initial?.name || ""} required className="rounded border px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm font-bold">
          الهاتف
          <input name="phone" defaultValue={initial?.phone || ""} required className="rounded border px-3 py-2" dir="ltr" />
        </label>
        <label className="grid gap-1 text-sm font-bold">
          البريد (اختياري)
          <input name="email" type="email" defaultValue={initial?.email || ""} className="rounded border px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm font-bold">
          كلمة المرور {initial ? "(اتركها فارغة للإبقاء)" : ""}
          <input name="password" type="password" required={!initial} className="rounded border px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm font-bold">
          حد الطلبات/اليوم
          <input name="maxOrders" type="number" defaultValue={initial?.maxOrders || 20} className="rounded border px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm font-bold">
          حد COD/اليوم
          <input name="maxCodValue" type="number" defaultValue={Number(initial?.maxCodValue || 50000)} className="rounded border px-3 py-2" />
        </label>
      </div>

      {initial ? (
        <label className="flex items-center gap-2 text-sm font-bold">
          <input name="isActive" type="checkbox" defaultChecked={initial.isActive} />
          نشط
        </label>
      ) : null}

      <div>
        <p className="text-sm font-bold">المناطق</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {zones.map((zone) => (
            <label key={zone.id} className="flex items-center gap-2 rounded border px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={selectedZones.includes(zone.id)}
                onChange={() => toggleZone(zone.id)}
              />
              {zone.name} ({zone.governorate})
            </label>
          ))}
        </div>
      </div>

      {message ? <p className="text-sm text-zinc-600">{message}</p> : null}

      <button type="submit" disabled={loading} className="rounded bg-brand-gold px-4 py-2 text-sm font-bold text-black disabled:opacity-60">
        {loading ? "جاري الحفظ..." : "حفظ"}
      </button>
    </form>
  );
}
