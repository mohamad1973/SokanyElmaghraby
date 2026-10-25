import { NextResponse } from "next/server";

import { isAccountingRole } from "@/lib/cs/agents";
import { CS_QUEUE_PAGE_SIZE, listCsQueuePage, resolveCsViewer } from "@/lib/cs/confirmations";
import { listSayedSheetByIds, listVisibleSayedSheet } from "@/lib/cs/temima-sheet-edits";
import { listTemimaFrozenDays } from "@/lib/cs/temima-sheet-freeze";
import {
  closedTemimaWeekIds,
  listTemimaCarryForward,
  openSettlementMarks,
  temimaCarrySheetTitle,
} from "@/lib/cs/temima-settlement";
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
    if (url.searchParams.get("carry") === "1") {
      const carry = await listTemimaCarryForward();
      const items = await listSayedSheetByIds(carry.confirmationIds);
      const ids = items.map((item) => item.id);
      const marks = await openSettlementMarks(ids);
      return NextResponse.json({
        items: items.map((item) => ({
          ...item,
          settlementDisposition: (marks.get(item.id) || "postpone") as "" | "collect" | "return" | "postpone",
          temimaWeekClosed: false,
          temimaCarrySheet: true,
          carryFromStart: carry.fromYmd,
          carryFromEnd: carry.toYmd,
        })),
        carryFromStart: carry.fromYmd,
        carryFromEnd: carry.toYmd,
        carryTitle: temimaCarrySheetTitle(carry.fromYmd, carry.toYmd),
        frozenDays: [],
        total: items.length,
        hasMore: false,
        nextCursor: null,
      });
    }
    const from = url.searchParams.get("from") || "";
    const to = url.searchParams.get("to") || "";
    const items = await listVisibleSayedSheet(from, to);
    const ids = items.map((item) => item.id);
    const [marks, closedWeeks, frozenDays] = await Promise.all([
      openSettlementMarks(ids),
      closedTemimaWeekIds(ids),
      listTemimaFrozenDays(from, to),
    ]);
    return NextResponse.json({
      items: items.map((item) => ({
        ...item,
        settlementDisposition: marks.get(item.id) || "",
        temimaWeekClosed: closedWeeks.has(item.id),
      })),
      frozenDays: [...frozenDays],
      total: items.length,
      hasMore: false,
      nextCursor: null,
    });
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

  const ids = page.items.map((item) => item.id);
  const [marks, closedWeeks] = await Promise.all([openSettlementMarks(ids), closedTemimaWeekIds(ids)]);
  return NextResponse.json({
    ...page,
    items: page.items.map((item) => ({
      ...item,
      settlementDisposition: marks.get(item.id) || "",
      temimaWeekClosed: closedWeeks.has(item.id),
    })),
  });
}
