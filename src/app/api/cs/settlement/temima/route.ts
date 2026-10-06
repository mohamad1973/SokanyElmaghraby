import { NextResponse } from "next/server";

import { isShippingRole } from "@/lib/cs/agents";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import {
  closeTemimaMonth,
  getTemimaWeekSheet,
  markTemimaLarge,
  previewTemimaMonth,
  saveTemimaWeek,
  searchTemimaSettlementOrders,
  setFawrySettlementDeposit,
  type TemimaSheetRow,
} from "@/lib/cs/temima-settlement";
import { requireCsSession } from "@/lib/session-guards";

async function viewerOf(requestAgentId: number, sessionRole: string | undefined) {
  const viewer = await resolveCsViewer(requestAgentId);
  const shipping = viewer.isAdmin || viewer.isShipping || isShippingRole(viewer.role) || isShippingRole(sessionRole);
  const follow = viewer.isSupervisor || viewer.isAdmin;
  return { viewer, shipping, follow };
}

export async function GET(request: Request) {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }
  const access = await viewerOf(session.user.csAgentId, session.user.csRole);
  if (!access.shipping && !access.follow) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
  }

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || "").trim();
  if (query) {
    const found = await searchTemimaSettlementOrders(query);
    if (!found.ok) return NextResponse.json({ message: found.message }, { status: 503 });
    return NextResponse.json({ matches: found.matches });
  }
  const week = url.searchParams.get("week") || undefined;
  const weekEnd = url.searchParams.get("weekEnd") || undefined;
  const closeDate = url.searchParams.get("closeDate") || undefined;
  const sheet = await getTemimaWeekSheet(week, weekEnd);
  if (!sheet.ok) return NextResponse.json({ message: sheet.message }, { status: 503 });
  const month = await previewTemimaMonth(closeDate);
  return NextResponse.json({
    ...sheet,
    ok: true,
    canEdit: access.shipping,
    month: month.ok ? month : null,
  });
}

export async function POST(request: Request) {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }
  const access = await viewerOf(session.user.csAgentId, session.user.csRole);
  if (!access.shipping) {
    return NextResponse.json({ message: "التسجيل لحساب الشحن فقط. المشرفة متابعة." }, { status: 403 });
  }

  let body: {
    action?: "save" | "close-week" | "close-month" | "fawry-deposit" | "large";
    isLarge?: boolean;
    weekStart?: string;
    confirmationId?: number;
    amount?: number | null;
    weekEnd?: string;
    cashPaid?: number;
    rows?: TemimaSheetRow[];
    closeDate?: string;
    shippingPaid?: number;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ message: "طلب غير صالح." }, { status: 400 });
  }

  if (body.action === "large") {
    const saved = await markTemimaLarge(Number(body.confirmationId), Boolean(body.isLarge));
    if (!saved.ok) return NextResponse.json({ message: saved.message }, { status: 400 });
    return NextResponse.json(saved);
  }

  if (body.action === "fawry-deposit") {
    if (!access.viewer.isAdmin && !session.user.csIsAdmin) {
      return NextResponse.json({ message: "تعديل ديبوزت فوري للأدمن فقط." }, { status: 403 });
    }
    const result = await setFawrySettlementDeposit({
      confirmationId: Number(body.confirmationId),
      amount: body.amount == null ? null : Number(body.amount),
    });
    if (!result.ok) return NextResponse.json({ message: result.message }, { status: 400 });
    return NextResponse.json(result);
  }

  if (body.action === "close-month") {
    const result = await closeTemimaMonth({
      closeDate: String(body.closeDate || ""),
      shippingPaid: Number(body.shippingPaid) || 0,
      agentId: session.user.csAgentId,
    });
    if (!result.ok) return NextResponse.json({ message: result.message }, { status: 400 });
    return NextResponse.json({ ...result, ok: true });
  }

  const result = await saveTemimaWeek({
    weekStart: String(body.weekStart || ""),
    weekEnd: String(body.weekEnd || ""),
    cashPaid: Number(body.cashPaid) || 0,
    rows: body.rows || [],
    agentId: session.user.csAgentId,
    close: body.action === "close-week",
  });
  if (!result.ok) return NextResponse.json({ message: result.message }, { status: 400 });
  return NextResponse.json({ ok: true, cashDue: result.cashDue });
}
