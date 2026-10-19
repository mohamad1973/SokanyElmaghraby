import { redirect } from "next/navigation";

import { resolveCsViewer } from "@/lib/cs/confirmations";
import { requireCsSession } from "@/lib/session-guards";

import { MaintenanceClient } from "./maintenance-client";

export default async function CsMaintenancePage() {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) redirect("/cs/login");
  const viewer = await resolveCsViewer(session.user.csAgentId);
  if (!viewer.canAccessMaintenanceHub && !viewer.isMaintenance) redirect("/cs");
  return (
    <MaintenanceClient
      canInspect={Boolean(viewer.isMaintenance || viewer.isAdmin)}
      canTech={Boolean(viewer.isMaintenanceTech || viewer.isAdmin)}
      canAccounting={Boolean(viewer.isMaintenanceAccounting || viewer.isAdmin)}
    />
  );
}
