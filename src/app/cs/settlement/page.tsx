import { redirect } from "next/navigation";

import { ensureCsTables, isShippingRole } from "@/lib/cs/agents";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import { requireCsSession } from "@/lib/session-guards";

import { SettlementTabs } from "./settlement-tabs";

export default async function CsSettlementPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) redirect("/cs/login");
  await ensureCsTables();
  const viewer = await resolveCsViewer(session.user.csAgentId);
  const shipping = viewer.isAdmin || viewer.isShipping || isShippingRole(viewer.role) || isShippingRole(session.user.csRole);
  const follow = viewer.isSupervisor || viewer.isAdmin || Boolean(session.user.csIsSupervisor);
  if (!shipping && !follow) redirect("/cs");
  const params = (await searchParams) || {};
  const tab = params.tab === "returns" ? "returns" : "settlement";
  return (
    <SettlementTabs
      tab={tab}
      canEdit={shipping}
      canEditDeposit={viewer.isAdmin || Boolean(session.user.csIsAdmin)}
    />
  );
}
