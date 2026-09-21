import { redirect } from "next/navigation";

import { ensureCsTables, ensureDefaultCsAgent, listCsAgents } from "@/lib/cs/agents";
import { resolveCsViewer } from "@/lib/cs/confirmations";
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

  const agents = (await listCsAgents()).map((a) => ({ id: a.id, name: a.name, email: a.email }));
  return <CsAssignClient agents={agents} />;
}
