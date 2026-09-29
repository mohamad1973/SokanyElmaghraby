import { NextResponse } from "next/server";

import { isAccountingRole } from "@/lib/cs/agents";
import { CS_QUEUE_PAGE_SIZE, listCsQueuePage, resolveCsViewer } from "@/lib/cs/confirmations";
import { listVisibleSayedSheet } from "@/lib/cs/temima-sheet-edits";
import { requireCsSession } from "@/lib/session-guards";

export async function GET(request: Request) {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }

  const viewer = await resolveCsViewer(session.user.csAgentId);
  const url = new URL(request.url);
  if (url.searchParams.get("sheet") === "temima") {
    const canSeeSheet = viewer.isAdmin || viewer.isSupervisor || viewer.isCourierSupervisor;
    if (!canSeeSheet) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
    const from = url.searchParams.get("from") || "";
    const to = url.searchParams.get("to") || "";
    const items = await listVisibleSayedSheet(from, to);
    return NextResponse.json({ items, total: items.length, hasMore: false, nextCursor: null });
  }
  const pageRaw = Number(url.searchParams.get("page") || "1");
  const canPrintAll = viewer.isAdmin || (viewer.isSupervisor && !viewer.isCourierSupervisor);
  const agentRaw = Number(url.searchParams.get("agent") || "");
  const page = await listCsQueuePage({
    agentId: session.user.csAgentId,
    isSupervisor: viewer.isSupervisor || Boolean(session.user.csIsSupervisor),
    seeAll: viewer.isAccounting || isAccountingRole(session.user.csRole),
    query: url.searchParams.get("q") || "",
    dateFrom: url.searchParams.get("from") || "",
    dateTo: url.searchParams.get("to") || "",
    dateBasis: url.searchParams.get("basis") || "",
    status: url.searchParams.get("status") || "",
    shipping: url.searchParams.get("shipping") || "",
    agentFilterId: Number.isInteger(agentRaw) && agentRaw > 0 ? agentRaw : null,
    payment: url.searchParams.get("payment") || "",
    followUp: url.searchParams.get("follow") || "",
    tracking: url.searchParams.get("tracking") || "",
    waybill: url.searchParams.get("waybill") || "",
    page: Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1,
    limit: CS_QUEUE_PAGE_SIZE,
    all: canPrintAll && url.searchParams.get("all") === "1",
  });

  return NextResponse.json(page);
}
