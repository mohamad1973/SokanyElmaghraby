import { Suspense } from "react";
import { redirect } from "next/navigation";

import { ensureCsTables } from "@/lib/cs/agents";
import { resolveScAccess } from "@/lib/cs/sc-centers";
import { requireCsSession } from "@/lib/session-guards";

import { ScDeskClient } from "./desk-client";

export default async function ScDeskPage() {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) redirect("/cs/login");
  await ensureCsTables();
  const access = await resolveScAccess(session.user.csAgentId);
  if (!access.canOpen) redirect("/cs");
  if (!access.canDesk && !access.isManager) redirect("/cs/centers");
  return (
    <Suspense fallback={<p className="p-4 text-sm font-bold">جاري التحميل...</p>}>
      <ScDeskClient />
    </Suspense>
  );
}
