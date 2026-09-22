import { redirect } from "next/navigation";

import { ensureCsTables, ensureDefaultCsAgent, listActiveCsAgents } from "@/lib/cs/agents";
import { listCsConfirmationsForViewer, resolveCsViewer, serializeCsQueueItem } from "@/lib/cs/confirmations";
import { requireCsSession } from "@/lib/session-guards";

export default async function CsReportsPage() {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) redirect("/cs/login");

  await ensureCsTables();
  await ensureDefaultCsAgent();
  const viewer = await resolveCsViewer(session.user.csAgentId);
  if (!viewer.isSupervisor && !session.user.csIsSupervisor) redirect("/cs");

  const agents = await listActiveCsAgents();
  const rows = await listCsConfirmationsForViewer({
    agentId: session.user.csAgentId,
    isSupervisor: true,
  });
  const items = rows.map(serializeCsQueueItem);

  const byStatus: Record<string, number> = {};
  const byAgent: Record<string, { name: string; count: number; confirmed: number }> = {};

  for (const a of agents) {
    byAgent[String(a.id)] = { name: a.name, count: 0, confirmed: 0 };
  }

  for (const item of items) {
    byStatus[item.status] = (byStatus[item.status] || 0) + 1;
    const aid = item.assignedAgent?.id;
    if (aid != null) {
      const key = String(aid);
      if (!byAgent[key]) {
        byAgent[key] = { name: item.assignedAgent?.name || `#${aid}`, count: 0, confirmed: 0 };
      }
      byAgent[key].count += 1;
      if (item.status === "CONFIRMED") byAgent[key].confirmed += 1;
    }
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10">
        <h1 className="text-2xl font-extrabold text-[#14213D]">تقارير الرقابة</h1>
        <p className="mt-1 text-sm font-bold text-[#14213D]/70">
          ملخص أوردرات القائمة الحالية ({items.length}) حسب الحالة والمسؤول.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(byStatus).map(([status, count]) => (
          <div key={status} className="rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10">
            <p className="text-xs font-bold text-[#14213D]/60">{status}</p>
            <p className="mt-1 text-2xl font-extrabold text-[#14213D]">{count}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow ring-1 ring-[#14213D]/10">
        <table className="min-w-full text-sm">
          <thead className="bg-[#E5E5E5] text-right text-[#14213D]">
            <tr>
              <th className="px-3 py-2">المسؤول</th>
              <th className="px-3 py-2">أوردرات معيّنة</th>
              <th className="px-3 py-2">تم الحفظ</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(byAgent).map((row) => (
              <tr key={row.name} className="border-t border-[#E5E5E5]">
                <td className="px-3 py-2 font-bold">{row.name}</td>
                <td className="px-3 py-2">{row.count}</td>
                <td className="px-3 py-2">{row.confirmed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
