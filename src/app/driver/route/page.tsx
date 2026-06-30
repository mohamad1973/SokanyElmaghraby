import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { getPrismaClient } from "@/lib/db";

export const dynamic = "force-dynamic";

function todayDateOnly() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function mapsUrl(lat?: number | null, lng?: number | null, address?: string) {
  if (lat && lng) {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address || "")}`;
}

export default async function DriverRoutePage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.driverId) {
    redirect("/driver/login");
  }

  const prisma = getPrismaClient();
  const run = prisma
    ? await prisma.deliveryRun.findUnique({
        where: {
          driverId_runDate: {
            driverId: session.user.driverId,
            runDate: todayDateOnly(),
          },
        },
        include: {
          assignments: {
            include: { shipment: true },
            orderBy: { sequence: "asc" },
          },
        },
      })
    : null;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">مسار اليوم</h1>

      {!run || run.assignments.length === 0 ? (
        <p className="text-sm text-zinc-500">لا توجد محطات في المسار.</p>
      ) : (
        <ol className="space-y-3">
          {run.assignments.map((assignment) => {
            const shipment = assignment.shipment;
            const lat = assignment.lat ? Number(assignment.lat) : shipment.lat ? Number(shipment.lat) : null;
            const lng = assignment.lng ? Number(assignment.lng) : shipment.lng ? Number(shipment.lng) : null;

            return (
              <li key={assignment.id} className="rounded-xl border border-black/10 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-zinc-500">#{assignment.sequence}</p>
                    <p className="font-bold">{shipment.receiverName}</p>
                    <p className="text-sm text-zinc-600">{shipment.area} — {shipment.governorate}</p>
                    <p className="mt-1 text-sm">{shipment.addressLine}</p>
                    <p className="mt-1 text-xs text-zinc-500">COD: {String(shipment.codAmount)} | {assignment.status}</p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <a
                    href={mapsUrl(lat, lng, shipment.addressLine)}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg bg-zinc-900 px-3 py-2 text-center text-xs font-bold text-white"
                  >
                    Google Maps
                  </a>
                  <Link
                    href={`/driver/order/${assignment.id}`}
                    className="rounded-lg bg-brand-gold px-3 py-2 text-center text-xs font-bold text-black"
                  >
                    تفاصيل الطلب
                  </Link>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
