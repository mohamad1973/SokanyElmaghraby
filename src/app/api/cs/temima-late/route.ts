import { NextResponse } from "next/server";

import { ensureCsTables } from "@/lib/cs/agents";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import { listTemimaLateDeliveries } from "@/lib/cs/temima-late";
import { requireCsSession } from "@/lib/session-guards";

export async function GET() {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }
  await ensureCsTables();
  const viewer = await resolveCsViewer(session.user.csAgentId);
  const canSee = viewer.isAdmin || viewer.isSupervisor || viewer.isCourierSupervisor;
  if (!canSee) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });

  const items = await listTemimaLateDeliveries();
  return NextResponse.json({ items, count: items.length });
}
