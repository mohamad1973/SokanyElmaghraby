import { redirect } from "next/navigation";

import { ensureCsTables, ensureDefaultCsAgent, listActiveCsAgents } from "@/lib/cs/agents";
import { listCsConfirmationsForViewer, resolveCsViewer, serializeCsQueueItem } from "@/lib/cs/confirmations";
import { requireCsSession } from "@/lib/session-guards";

import { ReportsHub } from "./reports-hub";

export default async function CsReportsPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) redirect("/cs/login");

  await ensureCsTables();
  await ensureDefaultCsAgent();
  const viewer = await resolveCsViewer(session.user.csAgentId);
  const allowed =
    viewer.isSupervisor ||
    viewer.isAdmin ||
    Boolean(session.user.csIsSupervisor) ||
    Boolean(session.user.csIsAdmin);
  if (!allowed) redirect("/cs");

  const params = (await searchParams) || {};
  const tab = params.tab === "home-confirm" ? "home-confirm" : "overview";

  const agents = await listActiveCsAgents();
  const rows = await listCsConfirmationsForViewer({
    agentId: session.user.csAgentId,
    isSupervisor: true,
  });
  const items = rows.map(serializeCsQueueItem);

  const byStatusMap: Record<string, number> = {};
  const byAgentMap: Record<string, { name: string; count: number; confirmed: number }> = {};

  for (const a of agents) {
    byAgentMap[String(a.id)] = { name: a.name, count: 0, confirmed: 0 };
  }

  for (const item of items) {
    byStatusMap[item.status] = (byStatusMap[item.status] || 0) + 1;
    const aid = item.assignedAgent?.id;
    if (aid != null) {
      const key = String(aid);
      if (!byAgentMap[key]) {
        byAgentMap[key] = { name: item.assignedAgent?.name || `#${aid}`, count: 0, confirmed: 0 };
      }
      byAgentMap[key].count += 1;
      if (item.status === "CONFIRMED") byAgentMap[key].confirmed += 1;
    }
  }

  const isSupervisor = viewer.isSupervisor || Boolean(session.user.csIsSupervisor);
  const isAdmin = viewer.isAdmin || Boolean(session.user.csIsAdmin);

  return (
    <ReportsHub
      tab={tab}
      overview={{
        total: items.length,
        byStatus: Object.entries(byStatusMap).map(([status, count]) => ({ status, count })),
        byAgent: Object.values(byAgentMap),
      }}
      flags={{
        isSupervisor,
        isAdmin,
        canSettlement: Boolean(viewer.isShipping || isSupervisor || isAdmin),
        canTransfers: Boolean(viewer.canAccessTransfers || viewer.isTransfers || isSupervisor || isAdmin),
        canMaintenanceHub: Boolean(
          viewer.canAccessMaintenanceHub || viewer.isMaintenance || viewer.isMaintenanceTech || viewer.isAccounting,
        ),
        canBosta: Boolean(isAdmin || (isSupervisor && !viewer.isCourierSupervisor)),
        canMonaAccounts: Boolean((isSupervisor || isAdmin) && !viewer.isCourierSupervisor),
        isMonaCourier: Boolean(viewer.isMonaCourier),
        isCourierSupervisor: Boolean(viewer.isCourierSupervisor),
        canSeeOrders: Boolean(viewer.canSeeOrders),
      }}
    />
  );
}
