import { redirect } from "next/navigation";

import { ensureCsTables, ensureDefaultCsAgent } from "@/lib/cs/agents";
import { listCsConfirmationsForViewer, resolveCsViewer, serializeCsQueueItem } from "@/lib/cs/confirmations";
import { listCourierAgents } from "@/lib/cs/courier-dispatch";
import { listTemimaCutoffs } from "@/lib/cs/temima-cutoff";
import { mergeIncludedConfirmations } from "@/lib/cs/temima-sheet-edits";
import { requireCsSession } from "@/lib/session-guards";

import { CsQueueClient } from "../cs-queue-client";

export default async function CsTemimaSheetPage() {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) redirect("/cs/login");

  await ensureCsTables();
  await ensureDefaultCsAgent();

  const viewer = await resolveCsViewer(session.user.csAgentId);
  if (!viewer.isAdmin && !viewer.isCourierSupervisor) redirect("/cs");

  const rows = await listCsConfirmationsForViewer({
    agentId: session.user.csAgentId,
    isSupervisor: true,
    seeAll: true,
  });
  const merged = await mergeIncludedConfirmations(rows.map(serializeCsQueueItem));
  const couriers = await listCourierAgents();
  const temimaCutoffs = await listTemimaCutoffs();

  return (
    <CsQueueClient
      initialItems={merged.items}
      isSupervisor={false}
      isAccounting={false}
      agents={[]}
      couriers={couriers}
      isCourierSupervisor
      canOpenOrders={viewer.isAdmin}
      canEditTemimaSheet={viewer.isAdmin}
      temimaCutoffs={temimaCutoffs}
      temimaSheetEdits={merged.edits}
    />
  );
}
