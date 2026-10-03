import { redirect } from "next/navigation";

import { ensureCsTables } from "@/lib/cs/agents";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import { requireCsSession } from "@/lib/session-guards";

import { MonaCourierPanel } from "../mona/mona-client";

export default async function MonaAccountsPage() {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) redirect("/cs/login");
  await ensureCsTables();
  const viewer = await resolveCsViewer(session.user.csAgentId);
  const allowed = (viewer.isSupervisor || viewer.isAdmin) && !viewer.isCourierSupervisor;
  if (!allowed) redirect("/cs");
  return <MonaCourierPanel mode="supervisor" />;
}
