import { redirect } from "next/navigation";

import { resolveCsViewer } from "@/lib/cs/confirmations";
import { requireCsSession } from "@/lib/session-guards";

import { BostaBoardClient } from "./bosta-board-client";

export default async function CsBostaBoardPage() {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) redirect("/cs/login");
  const viewer = await resolveCsViewer(session.user.csAgentId);
  if (!viewer.isAdmin && !(viewer.isSupervisor && !viewer.isCourierSupervisor)) redirect("/cs");
  return <BostaBoardClient />;
}
