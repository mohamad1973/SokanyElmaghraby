import { NextResponse } from "next/server";

import {
  listCsConfirmationsForViewer,
  resolveCsViewer,
  serializeCsQueueItem,
  syncRecentOrdersForCs,
} from "@/lib/cs/confirmations";
import { isAccountingRole } from "@/lib/cs/agents";
import { requireCsSession } from "@/lib/session-guards";

export async function POST() {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }

  const result = await syncRecentOrdersForCs({ perPage: 100 });
  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 503 });
  }

  const viewer = await resolveCsViewer(session.user.csAgentId);
  const rows = await listCsConfirmationsForViewer({
    agentId: session.user.csAgentId,
    isSupervisor: viewer.isSupervisor || Boolean(session.user.csIsSupervisor),
    seeAll: viewer.isAccounting || isAccountingRole(session.user.csRole),
  });

  return NextResponse.json({
    ok: true,
    imported: result.imported,
    totalFetched: result.totalFetched,
    items: rows.map(serializeCsQueueItem),
    message: `تمت المزامنة (${result.imported} جديد من ${result.totalFetched}).`,
  });
}
