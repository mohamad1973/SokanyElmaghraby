import { redirect } from "next/navigation";

import { ensureCsTables } from "@/lib/cs/agents";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import { resolveScAccess } from "@/lib/cs/sc-centers";
import { requireCsSession } from "@/lib/session-guards";

import { ScCentersClient } from "./centers-client";

export default async function ScCentersPage() {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) redirect("/cs/login");
  await ensureCsTables();
  const viewer = await resolveCsViewer(session.user.csAgentId);
  const access = await resolveScAccess(session.user.csAgentId);
  if (!access.canOpen && !viewer.isAdmin) redirect("/cs");
  return <ScCentersClient />;
}
