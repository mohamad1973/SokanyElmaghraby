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

export default async function DriverTodayPage() {
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

  const total = run?.assignments.length || 0;
  const delivered = run?.assignments.filter((item) => item.status === "delivered").length || 0;
  const pending = total - delivered;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">ملخص اليوم</h1>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-xs text-zinc-500">الطلبات</p>
          <p className="text-2xl font-bold">{total}</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-xs text-zinc-500">COD</p>
          <p className="text-2xl font-bold">{run ? String(run.totalCod) : 0}</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-xs text-zinc-500">تم التسليم</p>
          <p className="text-2xl font-bold text-green-700">{delivered}</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-xs text-zinc-500">متبقي</p>
          <p className="text-2xl font-bold text-orange-600">{pending}</p>
        </div>
      </div>

      <Link href="/driver/route" className="block rounded-xl bg-brand-gold px-4 py-4 text-center font-bold text-black">
        فتح المسار ({total} محطة)
      </Link>

      {!run || total === 0 ? (
        <p className="text-center text-sm text-zinc-500">لا توجد طلبات مُعيّنة لك اليوم.</p>
      ) : null}
    </div>
  );
}
