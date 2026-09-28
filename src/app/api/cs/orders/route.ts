import { NextResponse } from "next/server";

import { isAccountingRole } from "@/lib/cs/agents";
import { CS_QUEUE_PAGE_SIZE, listCsQueuePage, resolveCsViewer } from "@/lib/cs/confirmations";
import { listSayedSheetOrders, listVisibleSayedSheet } from "@/lib/cs/temima-sheet-edits";
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
    const from = url.searchParams.get("from") || "";
    const to = url.searchParams.get("to") || "";
    const items =
      url.searchParams.get("match") === "sayed"
        ? await listVisibleSayedSheet(from, to)
        : await listSayedSheetOrders(from, to);
    return NextResponse.json({ items, hasMore: false, nextCursor: null });
  }
  const pageRaw = Number(url.searchParams.get("page") || "1");
  const page = await listCsQueuePage({
    agentId: session.user.csAgentId,
    isSupervisor: viewer.isSupervisor || Boolean(session.user.csIsSupervisor),
    seeAll: viewer.isAccounting || isAccountingRole(session.user.csRole),
    query: url.searchParams.get("q") || "",
    dateFrom: url.searchParams.get("from") || "",
    dateTo: url.searchParams.get("to") || "",
    page: Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1,
    limit: CS_QUEUE_PAGE_SIZE,
  });

  return NextResponse.json(page);
}
