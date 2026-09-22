import { redirect } from "next/navigation";

import { ensureCsTables, ensureDefaultCsAgent, listActiveCsAgents } from "@/lib/cs/agents";
import { listCsConfirmationsForViewer, resolveCsViewer } from "@/lib/cs/confirmations";
import { isWithinCairoTodayOrYesterday } from "@/lib/cs/order-window";
import { requireCsSession } from "@/lib/session-guards";

import { CsAssignClient } from "./assign-client";

export default async function CsAssignPage() {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) redirect("/cs/login");

  await ensureCsTables();
  await ensureDefaultCsAgent();
  const viewer = await resolveCsViewer(session.user.csAgentId);
  const isSupervisor = viewer.isSupervisor || Boolean(session.user.csIsSupervisor);
  if (!isSupervisor) redirect("/cs");

  const agents = (await listActiveCsAgents()).map((a) => ({
    id: a.id,
    name: a.name,
    email: a.username || a.email,
  }));
  const rows = await listCsConfirmationsForViewer({
    agentId: session.user.csAgentId,
    isSupervisor: true,
  });
  // Same default visible window as the main queue (today + yesterday)
  const visibleOrderIds = rows
    .filter((row) => {
      const snap = row.customerSnapshot as { dateCreated?: string } | null;
      return isWithinCairoTodayOrYesterday(snap?.dateCreated);
    })
    .map((row) => row.id);

  return <CsAssignClient agents={agents} visibleOrderIds={visibleOrderIds} />;
}
