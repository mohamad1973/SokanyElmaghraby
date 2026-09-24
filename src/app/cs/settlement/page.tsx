import { redirect } from "next/navigation";

import { ensureCsTables, isShippingRole } from "@/lib/cs/agents";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import { requireCsSession } from "@/lib/session-guards";

import { TemimaSettlementClient } from "./temima-settlement-client";

export default async function CsSettlementPage() {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) redirect("/cs/login");
  await ensureCsTables();
  const viewer = await resolveCsViewer(session.user.csAgentId);
  const shipping = isShippingRole(viewer.role) || isShippingRole(session.user.csRole);
  const follow = viewer.isSupervisor || viewer.isAdmin || Boolean(session.user.csIsSupervisor);
  if (!shipping && !follow) redirect("/cs");
  return <TemimaSettlementClient canEdit={shipping} />;
}
