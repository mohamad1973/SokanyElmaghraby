import { redirect } from "next/navigation";

import { ensureCsTables, ensureDefaultCsAgent } from "@/lib/cs/agents";
import { listCsConfirmationsForViewer, resolveCsViewer, serializeCsQueueItem } from "@/lib/cs/confirmations";
import { listCourierAgents } from "@/lib/cs/courier-dispatch";
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
  const couriers = await listCourierAgents();

  return (
    <CsQueueClient
      initialItems={rows.map(serializeCsQueueItem)}
      isSupervisor={false}
      isAccounting={false}
      agents={[]}
      couriers={couriers}
      isCourierSupervisor
    />
  );
}
