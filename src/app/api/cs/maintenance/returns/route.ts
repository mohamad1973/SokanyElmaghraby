import { NextResponse } from "next/server";

import { resolveCsViewer } from "@/lib/cs/confirmations";
import { listTodayBostaReceivedReturns, listTodayTemimaReturns } from "@/lib/cs/maintenance-returns";
import { requireCsSession } from "@/lib/session-guards";

export async function GET() {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }
  const viewer = await resolveCsViewer(session.user.csAgentId);
  if (!viewer.isMaintenance) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
  }
  const [bosta, temima] = await Promise.all([listTodayBostaReceivedReturns(), listTodayTemimaReturns()]);
  return NextResponse.json({
    day: bosta.day,
    bosta: { rows: bosta.rows, error: bosta.error },
    temima: { rows: temima.rows },
  });
}
