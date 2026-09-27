import { redirect } from "next/navigation";

import { ensureCsTables, ensureDefaultCsAgent, isAccountingRole, isShippingRole, listActiveCsAgents } from "@/lib/cs/agents";
import { listCsConfirmationsForViewer, resolveCsViewer, serializeCsQueueItem } from "@/lib/cs/confirmations";
import { listCourierAgents } from "@/lib/cs/courier-dispatch";
import { listTemimaCutoffs } from "@/lib/cs/temima-cutoff";
import { mergeIncludedConfirmations } from "@/lib/cs/temima-sheet-edits";
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
  const seesTemimaSheet = isCourierSupervisor || isSupervisor;
  const merged = seesTemimaSheet
    ? await mergeIncludedConfirmations(rows.map(serializeCsQueueItem))
    : { items: rows.map(serializeCsQueueItem), edits: [] };
  const initialItems = merged.items;
  const agents = isSupervisor
    ? (await listActiveCsAgents()).map((a) => ({ id: a.id, name: a.name }))
    : [];
  const couriers = isCourierSupervisor ? await listCourierAgents() : [];
  const temimaCutoffs = isCourierSupervisor || isSupervisor ? await listTemimaCutoffs() : [];

  return (
    <CsQueueClient
      initialItems={initialItems}
      isSupervisor={isSupervisor}
      isAccounting={isAccounting}
      agents={agents}
      couriers={couriers}
      isCourierSupervisor={isCourierSupervisor}
      canOpenOrders={!isCourierSupervisor || viewer.isAdmin}
      canSetTemimaCutoff={isSupervisor && !isCourierSupervisor}
      temimaCutoffs={temimaCutoffs}
      temimaSheetEdits={merged.edits}
    />
  );
}
