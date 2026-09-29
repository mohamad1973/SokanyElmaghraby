import { redirect } from "next/navigation";

import { restampTodayAssignmentsOnce } from "@/lib/cs/assignments";
import { ensureCsTables, ensureDefaultCsAgent, isAccountingRole, isShippingRole, listActiveCsAgents } from "@/lib/cs/agents";
import { listCsConfirmationsForViewer, listCsQueuePage, resolveCsViewer, serializeCsQueueItem } from "@/lib/cs/confirmations";
import { cairoTodayYmd, cairoYesterdayYmd } from "@/lib/cs/order-window";
import { listCourierAgents } from "@/lib/cs/courier-dispatch";
import { listTemimaCutoffs } from "@/lib/cs/temima-cutoff";
import { listTemimaSheetEdits, mergeIncludedConfirmations } from "@/lib/cs/temima-sheet-edits";
import { requireCsSession } from "@/lib/session-guards";

import { CsQueueClient } from "./cs-queue-client";

export default async function CsHomePage() {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) redirect("/cs/login");

  await ensureCsTables();
  await ensureDefaultCsAgent();
  await restampTodayAssignmentsOnce();

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

  let initialHasMore = false;
  let initialTotal = 0;
  let initialItems;
  let temimaSheetEdits: Awaited<ReturnType<typeof mergeIncludedConfirmations>>["edits"] = [];
  if (isCourierSupervisor) {
    const rows = await listCsConfirmationsForViewer({
      agentId: session.user.csAgentId,
      isSupervisor,
      seeAll: true,
    });
    const merged = await mergeIncludedConfirmations(rows.map(serializeCsQueueItem));
    initialItems = merged.items;
    temimaSheetEdits = merged.edits;
  } else {
    const queue = await listCsQueuePage({
      agentId: session.user.csAgentId,
      isSupervisor,
      seeAll: isAccounting,
      dateFrom: cairoYesterdayYmd(),
      dateTo: cairoTodayYmd(),
      limit: 200,
    });
    initialItems = queue.items;
    temimaSheetEdits = isSupervisor ? await listTemimaSheetEdits() : [];
    initialHasMore = queue.hasMore;
    initialTotal = queue.total;
  }
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
      temimaSheetEdits={temimaSheetEdits}
      initialHasMore={initialHasMore}
      initialTotal={initialTotal}
    />
  );
}
