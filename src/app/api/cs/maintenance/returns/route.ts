import { NextResponse } from "next/server";

import { resolveCsViewer } from "@/lib/cs/confirmations";
import {
  listBostaReceivedReturns,
  listCourierReturns,
  listTemimaReturns,
  maintenanceRange,
} from "@/lib/cs/maintenance-returns";
import { requireCsSession } from "@/lib/session-guards";

export async function GET(request: Request) {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }
  const viewer = await resolveCsViewer(session.user.csAgentId);
  if (!viewer.isMaintenance) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
  }
  const url = new URL(request.url);
  const range = maintenanceRange(url.searchParams.get("from") || "", url.searchParams.get("to") || "");
  const [bosta, temima, couriers] = await Promise.all([
    listBostaReceivedReturns(range.from, range.to),
    listTemimaReturns(range.from, range.to),
    listCourierReturns(range.from, range.to),
  ]);
  return NextResponse.json({
    from: range.from,
    to: range.to,
    bosta: { rows: bosta.rows, error: bosta.error },
    temima: { rows: temima.rows },
    eid: couriers.eid,
    momen: couriers.momen,
  });
}
