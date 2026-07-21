import { listDrivers, listDistrictsWithAreas } from "@/lib/dispatch/drivers";
import { DriverForm } from "./driver-form";

export const dynamic = "force-dynamic";

function formatZoneLabel(name: string, parentId: number | null, parentName?: string | null) {
  if (parentId === null) {
    return `${name} (حي)`;
  }

  return parentName ? `${parentName} / ${name}` : name;
}

export default async function DriversAdminPage() {
  const [drivers, districts] = await Promise.all([listDrivers(), listDistrictsWithAreas()]);
  const districtOptions = districts.map((district) => ({
    id: district.id,
    name: district.name,
    governorate: district.governorate,
    children: district.children.map((child) => ({ id: child.id, name: child.name })),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">إدارة المندوبين</h1>
        <p className="mt-2 text-sm text-zinc-600">مندوبو القاهرة والجيزة — الحدود اليومية والأحياء.</p>
      </div>

      <DriverForm districts={districtOptions} />

      <section className="rounded-md border border-black/10 bg-white">
        <div className="border-b px-4 py-3 font-bold">قائمة المندوبين ({drivers.length})</div>
        <div className="divide-y">
          {drivers.map((driver) => (
            <div key={driver.id} className="grid gap-4 p-4 lg:grid-cols-[1fr_auto]">
              <div className="text-sm">
                <p className="font-bold">
                  {driver.name} {driver.isActive ? "" : "(معطّل)"}
                </p>
                <p dir="ltr">{driver.phone}</p>
                <p className="text-zinc-600">
                  حد الطلبات: {driver.maxOrders} | COD: {String(driver.maxCodValue)} | التغطية:{" "}
                  {driver.zones
                    .map((item) => formatZoneLabel(item.zone.name, item.zone.parentId, item.zone.parent?.name))
                    .join("، ") || "كل الأحياء"}
                </p>
              </div>
              <DriverForm
                districts={districtOptions}
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
