import { redirect } from "next/navigation";

import { listCsAgents } from "@/lib/cs/agents";
import { listCsConfirmationsForViewer, resolveCsViewer, serializeCsQueueItem } from "@/lib/cs/confirmations";
import { ensureDefaultCsAgent } from "@/lib/cs/agents";
import { requireCsSession } from "@/lib/session-guards";

import { CsQueueClient } from "./cs-queue-client";

export default async function CsHomePage() {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) redirect("/cs/login");

  await ensureDefaultCsAgent();
  const viewer = await resolveCsViewer(session.user.csAgentId);
  const isSupervisor = viewer.isSupervisor || Boolean(session.user.csIsSupervisor);

  const rows = await listCsConfirmationsForViewer({
    agentId: session.user.csAgentId,
    isSupervisor,
  });
  const initialItems = rows.map(serializeCsQueueItem);
  const agents = isSupervisor
    ? (await listCsAgents()).map((a) => ({ id: a.id, name: a.name }))
    : [];

  return <CsQueueClient initialItems={initialItems} isSupervisor={isSupervisor} agents={agents} />;
}
