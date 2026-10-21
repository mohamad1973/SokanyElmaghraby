import { redirect } from "next/navigation";

import { ensureCsTables } from "@/lib/cs/agents";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import { listCsCarriers } from "@/lib/cs/sokany-waybill";
import { requireCsSession } from "@/lib/session-guards";

import { CarriersClient } from "./carriers-client";

export default async function CsCarriersPage() {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) redirect("/cs/login");
  await ensureCsTables();
  const viewer = await resolveCsViewer(session.user.csAgentId);
  if (!viewer.isAdmin) redirect("/cs");
  const carriers = await listCsCarriers();
  return <CarriersClient initialCarriers={carriers} />;
}
