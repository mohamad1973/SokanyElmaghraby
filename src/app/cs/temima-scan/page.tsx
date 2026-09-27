import { redirect } from "next/navigation";

import { ensureCsTables } from "@/lib/cs/agents";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import { loadTemimaReceiptTally } from "@/lib/cs/temima-scan";
import { requireCsSession } from "@/lib/session-guards";

import { TrackingScanBox } from "../tracking-scan";

export default async function TemimaScanPage() {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) redirect("/cs/login");
  await ensureCsTables();
  const viewer = await resolveCsViewer(session.user.csAgentId);
  if (!viewer.isAdmin && !viewer.isCourierSupervisor) redirect("/cs");
  const receipt = await loadTemimaReceiptTally();
  return (
    <div className="mx-auto grid max-w-lg gap-3">
      <TrackingScanBox
        action="handoff"
        title="استلام تميمة"
        hint="وجّه كاميرا الموبايل على باركود التراك. كل قراءة سليمة تنقص الباقي."
        initialReceipt={receipt}
        autoStart
      />
    </div>
  );
}
