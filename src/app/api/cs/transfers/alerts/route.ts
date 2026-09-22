import { NextResponse } from "next/server";

import { canAccessTransfers } from "@/lib/cs/agents";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import { listOpenStockAlerts } from "@/lib/cs/stock-alerts";
import { requireCsSession } from "@/lib/session-guards";

export async function GET() {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
  }

  const viewer = await resolveCsViewer(session.user.csAgentId);
  if (!viewer.canAccessTransfers && !canAccessTransfers(session.user.csRole)) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
  }

  const alerts = await listOpenStockAlerts();
  return NextResponse.json({
    alerts,
    totals: { open: alerts.length },
  });
}
