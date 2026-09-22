import { redirect } from "next/navigation";

import { ensureCsTables, ensureDefaultCsAgent } from "@/lib/cs/agents";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import { requireCsSession } from "@/lib/session-guards";

import { CsUsersClient } from "./users-client";

export default async function CsUsersPage() {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) redirect("/cs/login");

  await ensureCsTables();
  await ensureDefaultCsAgent();
  const viewer = await resolveCsViewer(session.user.csAgentId);
  if (!viewer.isAdmin && !session.user.csIsAdmin) redirect("/cs");

  return <CsUsersClient />;
}
