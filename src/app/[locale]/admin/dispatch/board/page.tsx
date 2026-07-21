import { getDispatchBoardData } from "@/lib/dispatch/assign-orders";
import { getShippingBootstrapStatus } from "@/lib/shipping/bootstrap";
import Link from "next/link";
import { DispatchBoardActions, OptimizeRunButton } from "../dispatch-board-actions";

export const dynamic = "force-dynamic";

export default async function DispatchBoardPage() {
  const [boardData, setupStatus] = await Promise.all([getDispatchBoardData(), getShippingBootstrapStatus()]);
  const { unassigned, runs, error } = boardData;

  return (
    <div className="space-y-6">
      {!setupStatus.databaseConnected ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-900">
          {setupStatus.message}
          {" "}
          <Link href="/admin/dispatch/setup" className="font-bold underline">
            افتح صفحة إعداد الشحن
          </Link>
        </div>
      ) : null}
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <h1 className="text-3xl font-bold">لوحة التوزيع اليومية</h1>
          <p className="mt-2 text-sm text-zinc-600">توزيع طلبات القاهرة والجيزة على المندوبين وترتيب المسارات.</p>
        </div>
        <DispatchBoardActions />
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      <section className="rounded-md border border-black/10 bg-white p-5">
        <h2 className="text-lg font-bold">طلبات غير مُعيّنة ({unassigned.length})</h2>
        <div className="mt-4 space-y-3">
          {unassigned.length === 0 ? (
            <p className="text-sm text-zinc-500">لا توجد طلبات داخلية بانتظار التوزيع.</p>
          ) : (
            unassigned.map((shipment) => (
              <div key={shipment.id} className="rounded border border-zinc-200 p-3 text-sm">
                <p className="font-bold">#{shipment.wooOrderNumber} — {shipment.receiverName}</p>
                <p>{shipment.governorate} / {shipment.area}</p>
                <p>{shipment.addressLine}</p>
                <p dir="ltr">{shipment.receiverPhone} | COD: {String(shipment.codAmount)}</p>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-bold">مسارات المندوبين اليوم ({runs.length})</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-zinc-500">لا توجد مسارات اليوم بعد.</p>
        ) : (
          runs.map((run) => (
            <div key={run.id} className="rounded-md border border-black/10 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-bold">{run.driver.name}</p>
                  <p className="text-sm text-zinc-600">
                    {run.assignments.length} طلب | COD: {String(run.totalCod)} | {run.status}
                  </p>
                </div>
                <OptimizeRunButton runId={run.id} />
              </div>

              {run.routePolyline ? (
                <p className="mt-2 truncate text-xs text-zinc-400" dir="ltr">
                  Polyline: {run.routePolyline.slice(0, 80)}...
                </p>
              ) : null}

              <ol className="mt-4 space-y-2">
                {run.assignments.map((assignment) => (
                  <li key={assignment.id} className="rounded bg-zinc-50 p-3 text-sm">
                    <span className="font-bold">#{assignment.sequence}</span> — {assignment.shipment.receiverName} — {assignment.shipment.area} — {assignment.status}
                  </li>
                ))}
              </ol>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
