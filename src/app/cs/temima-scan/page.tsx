import { redirect } from "next/navigation";

import { ensureCsTables } from "@/lib/cs/agents";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import { requireCsSession } from "@/lib/session-guards";

import { TrackingScanBox } from "../tracking-scan";

export default async function TemimaScanPage() {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) redirect("/cs/login");
  await ensureCsTables();
  const viewer = await resolveCsViewer(session.user.csAgentId);
  if (!viewer.isAdmin && !viewer.isCourierSupervisor) redirect("/cs");
  return (
    <div className="mx-auto grid max-w-lg gap-3">
      <TrackingScanBox
        action="handoff"
        title="استلام تميمة"
        hint="امسح باركود تراك بوسطة على كل أوردر. كل مسح يعلّم تم التسليم لتميمة."
      />
    </div>
  );
}
