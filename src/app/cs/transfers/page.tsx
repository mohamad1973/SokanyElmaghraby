import { Suspense } from "react";
import { redirect } from "next/navigation";

import { canAccessTransfers } from "@/lib/cs/agents";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import { requireCsSession } from "@/lib/session-guards";

import { CsTransfersClient } from "./transfers-client";

export default async function CsTransfersPage() {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) redirect("/cs/login");

  const viewer = await resolveCsViewer(session.user.csAgentId);
  if (!viewer.canAccessTransfers && !canAccessTransfers(session.user.csRole)) {
    redirect("/cs");
  }

  return (
    <Suspense
      fallback={
        <div className="rounded-2xl bg-white p-6 text-center font-bold text-[#14213D]" dir="rtl">
          جاري تحميل المخزون…
        </div>
      }
    >
      <CsTransfersClient />
    </Suspense>
  );
}
