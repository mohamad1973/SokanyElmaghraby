import { redirect } from "next/navigation";

import { ensureCsTables, ensureDefaultCsAgent, isAccountingRole, isShippingRole, listActiveCsAgents } from "@/lib/cs/agents";
import { listCsConfirmationsForViewer, resolveCsViewer, serializeCsQueueItem } from "@/lib/cs/confirmations";
import { requireCsSession } from "@/lib/session-guards";

import { CsQueueClient } from "./cs-queue-client";

export default async function CsHomePage() {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) redirect("/cs/login");

  await ensureCsTables();
  await ensureDefaultCsAgent();

  const viewer = await resolveCsViewer(session.user.csAgentId);
  if (!viewer.canSeeOrders && viewer.isCourier && !viewer.isCourierSupervisor) {
    redirect("/cs/couriers");
  }
  if (!viewer.canSeeOrders && (viewer.isTransfers || session.user.csIsTransfers)) {
    redirect("/cs/transfers");
  }
  if (!viewer.canSeeOrders && (viewer.isShipping || isShippingRole(session.user.csRole))) {
    redirect("/cs/settlement");
  }

  const isCourierSupervisor = viewer.isCourierSupervisor;
  const isSupervisor = viewer.isSupervisor || Boolean(session.user.csIsSupervisor);
  const isAccounting = viewer.isAccounting || isAccountingRole(session.user.csRole);

  const rows = await listCsConfirmationsForViewer({
    agentId: session.user.csAgentId,
    isSupervisor,
    seeAll: isAccounting || isCourierSupervisor,
  });
  const initialItems = rows.map(serializeCsQueueItem);
  const agents = isSupervisor
    ? (await listActiveCsAgents()).map((a) => ({ id: a.id, name: a.name }))
    : [];

  return (
    <CsQueueClient
      initialItems={initialItems}
      isSupervisor={isSupervisor}
      isAccounting={isAccounting}
      agents={agents}
      isCourierSupervisor={isCourierSupervisor}
    />
  );
}
