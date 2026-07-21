import { listDistrictsWithAreas } from "@/lib/dispatch/zones";
import { DistrictCard } from "./district-card";
import { DistrictForm } from "./district-form";

export const dynamic = "force-dynamic";

export default async function ZonesAdminPage() {
  const districts = await listDistrictsWithAreas();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">أحياء التوصيل</h1>
        <p className="mt-2 text-sm text-zinc-600">
          أضف أحياء القاهرة والجيزة، ثم أضف المناطق الفرعية داخل كل حي.
        </p>
      </div>

      <DistrictForm />

      <section className="rounded-md border border-black/10 bg-white">
        <div className="border-b px-4 py-3 font-bold">الأحياء ({districts.length})</div>
        <div className="grid gap-3 p-4 lg:grid-cols-2">
          {districts.length === 0 ? (
            <p className="text-sm text-zinc-500">لا توجد أحياء بعد.</p>
          ) : (
            districts.map((district) => (
              <DistrictCard
                key={district.id}
                district={{
                  id: district.id,
                  name: district.name,
                  governorate: district.governorate,
                  children: district.children.map((child) => ({ id: child.id, name: child.name })),
                }}
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
}
