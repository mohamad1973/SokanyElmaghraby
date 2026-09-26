import { redirect } from "next/navigation";

import { ensureCsTables } from "@/lib/cs/agents";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import { requireCsSession } from "@/lib/session-guards";

import { CouriersClient } from "./couriers-client";

export default async function CsCouriersPage() {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) redirect("/cs/login");
  await ensureCsTables();
  const viewer = await resolveCsViewer(session.user.csAgentId);
  if (!viewer.isCourierSupervisor && !viewer.isCourier) redirect("/cs");
  return <CouriersClient mode={viewer.isCourierSupervisor ? "supervisor" : "courier"} />;
}
