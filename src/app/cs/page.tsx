import { redirect } from "next/navigation";

import { restampTodayAssignmentsOnce } from "@/lib/cs/assignments";
import { ensureCsTables, ensureDefaultCsAgent, isAccountingRole, isShippingRole, listActiveCsAgents } from "@/lib/cs/agents";
import { listCsQueuePage, resolveCsViewer } from "@/lib/cs/confirmations";
import { cairoTodayYmd, cairoYesterdayYmd } from "@/lib/cs/order-window";
import { listCourierAgents } from "@/lib/cs/courier-dispatch";
import { listTemimaCutoffs } from "@/lib/cs/temima-cutoff";
import { listTemimaSheetEdits, listUnifiedSayedSheet } from "@/lib/cs/temima-sheet-edits";
import { openSettlementMarks } from "@/lib/cs/temima-settlement";
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
  if (!viewer.canSeeOrders && viewer.isMonaCourier) {
    redirect("/cs/mona");
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
  let temimaSheetEdits: Awaited<ReturnType<typeof listTemimaSheetEdits>> = [];
  if (isCourierSupervisor) {
    const today = cairoTodayYmd();
    const sheet = await listUnifiedSayedSheet(today, today);
    const marks = await openSettlementMarks(sheet.map((item) => item.id));
    initialItems = sheet.map((item) => ({
      ...item,
      settlementDisposition: (marks.get(item.id) || "") as "" | "collect" | "return" | "postpone",
    }));
    temimaSheetEdits = await listTemimaSheetEdits();
  } else {
    const queue = await listCsQueuePage({
      agentId: session.user.csAgentId,
      isSupervisor,
      seeAll: isAccounting,
      dateFrom: cairoYesterdayYmd(),
      dateTo: cairoTodayYmd(),
      limit: 200,
    });
    const marks = await openSettlementMarks(queue.items.map((item) => item.id));
    initialItems = queue.items.map((item) => ({
      ...item,
      settlementDisposition: (marks.get(item.id) || "") as "" | "collect" | "return" | "postpone",
    }));
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
      showOfficialMarks={isCourierSupervisor || viewer.isAdmin || isAccounting}
      canPressOfficial={isCourierSupervisor || viewer.isAdmin}
      canOpenOrders={!isCourierSupervisor || viewer.isAdmin}
      canSetTemimaCutoff={isSupervisor && !isCourierSupervisor}
      canPrintQueue={isSupervisor && !isCourierSupervisor}
      canHandToCarrier={viewer.isAdmin || (isSupervisor && !isCourierSupervisor)}
      temimaCutoffs={temimaCutoffs}
      temimaSheetEdits={temimaSheetEdits}
      initialHasMore={initialHasMore}
      initialTotal={initialTotal}
    />
  );
}
