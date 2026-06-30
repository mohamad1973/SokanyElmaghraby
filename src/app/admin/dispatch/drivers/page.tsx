import { listDrivers, listZones } from "@/lib/dispatch/drivers";
import { DriverForm } from "./driver-form";

export const dynamic = "force-dynamic";

export default async function DriversAdminPage() {
  const [drivers, zones] = await Promise.all([listDrivers(), listZones()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">إدارة المندوبين</h1>
        <p className="mt-2 text-sm text-zinc-600">مندوبو القاهرة والجيزة — الحدود اليومية والمناطق.</p>
      </div>

      <DriverForm zones={zones.map((zone) => ({ id: zone.id, name: zone.name, governorate: zone.governorate }))} />

      <section className="rounded-md border border-black/10 bg-white">
        <div className="border-b px-4 py-3 font-bold">قائمة المندوبين ({drivers.length})</div>
        <div className="divide-y">
          {drivers.map((driver) => (
            <div key={driver.id} className="grid gap-4 p-4 lg:grid-cols-[1fr_auto]">
              <div className="text-sm">
                <p className="font-bold">{driver.name} {driver.isActive ? "" : "(معطّل)"}</p>
                <p dir="ltr">{driver.phone}</p>
                <p className="text-zinc-600">
                  حد الطلبات: {driver.maxOrders} | COD: {String(driver.maxCodValue)} |
                  المناطق: {driver.zones.map((item) => item.zone.name).join("، ") || "كل المناطق"}
                </p>
              </div>
              <DriverForm
                zones={zones.map((zone) => ({ id: zone.id, name: zone.name, governorate: zone.governorate }))}
                initial={{
                  id: driver.id,
                  name: driver.name,
                  phone: driver.phone,
                  email: driver.email,
                  maxOrders: driver.maxOrders,
                  maxCodValue: Number(driver.maxCodValue),
                  isActive: driver.isActive,
                  zoneIds: driver.zones.map((item) => item.zoneId),
                }}
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
