import { NextResponse } from "next/server";

import { isAccountingRole } from "@/lib/cs/agents";
import { listCsQueuePage, resolveCsViewer } from "@/lib/cs/confirmations";
import { listSayedSheetOrders } from "@/lib/cs/temima-sheet-edits";
import { requireCsSession } from "@/lib/session-guards";

export async function GET(request: Request) {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }

  const viewer = await resolveCsViewer(session.user.csAgentId);
  const url = new URL(request.url);
  if (url.searchParams.get("sheet") === "temima") {
    const canPrint = viewer.isSupervisor || viewer.isCourierSupervisor || viewer.isAdmin || viewer.isAccounting || isAccountingRole(session.user.csRole);
    if (!canPrint) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
    const items = await listSayedSheetOrders(url.searchParams.get("from") || "", url.searchParams.get("to") || "");
    return NextResponse.json({ items, hasMore: false, nextCursor: null });
  }
  const cursorRaw = Number(url.searchParams.get("cursor") || "");
  const page = await listCsQueuePage({
    agentId: session.user.csAgentId,
    isSupervisor: viewer.isSupervisor || Boolean(session.user.csIsSupervisor),
    seeAll: viewer.isAccounting || isAccountingRole(session.user.csRole),
    query: url.searchParams.get("q") || "",
    dateFrom: url.searchParams.get("from") || "",
    dateTo: url.searchParams.get("to") || "",
    cursorId: Number.isFinite(cursorRaw) && cursorRaw > 0 ? cursorRaw : null,
    limit: 150,
  });

  return NextResponse.json(page);
}
