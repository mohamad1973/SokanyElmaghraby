import { NextResponse } from "next/server";

import { getCsNotificationsForAgent } from "@/lib/cs/notifications";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import { requireCsSession } from "@/lib/session-guards";

export async function GET() {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }

  const viewer = await resolveCsViewer(session.user.csAgentId);
  const isSupervisor = viewer.isSupervisor || Boolean(session.user.csIsSupervisor);
  const data = await getCsNotificationsForAgent({
    agentId: session.user.csAgentId,
    isSupervisor,
  });

  return NextResponse.json(data);
}
