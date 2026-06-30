import { listZones } from "@/lib/dispatch/drivers";
import { ZoneForm } from "./zone-form";

export const dynamic = "force-dynamic";

export default async function ZonesAdminPage() {
  const zones = await listZones();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">مناطق التوصيل</h1>
        <p className="mt-2 text-sm text-zinc-600">تنظيم مناطق القاهرة والجيزة وربطها بالمندوبين.</p>
      </div>

      <ZoneForm />

      <section className="rounded-md border border-black/10 bg-white">
        <div className="border-b px-4 py-3 font-bold">المناطق ({zones.length})</div>
        <div className="grid gap-3 p-4 md:grid-cols-2 lg:grid-cols-3">
          {zones.map((zone) => (
            <div key={zone.id} className="rounded border border-zinc-200 p-4 text-sm">
              <p className="font-bold">{zone.name}</p>
              <p className="text-zinc-600">{zone.governorate}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
