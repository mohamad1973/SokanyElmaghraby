import { NextResponse } from "next/server";

import { isShippingRole } from "@/lib/cs/agents";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import {
  closeTemimaMonth,
  getTemimaWeekSheet,
  previewTemimaMonth,
  saveTemimaWeek,
  type TemimaSheetRow,
} from "@/lib/cs/temima-settlement";
import { requireCsSession } from "@/lib/session-guards";

async function viewerOf(requestAgentId: number, sessionRole: string | undefined) {
  const viewer = await resolveCsViewer(requestAgentId);
  const shipping = isShippingRole(viewer.role) || isShippingRole(sessionRole);
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
  const week = url.searchParams.get("week") || undefined;
  const closeDate = url.searchParams.get("closeDate") || undefined;
  const sheet = await getTemimaWeekSheet(week);
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
    action?: "save" | "close-week" | "close-month";
    weekStart?: string;
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
    cashPaid: Number(body.cashPaid) || 0,
    rows: body.rows || [],
    agentId: session.user.csAgentId,
    close: body.action === "close-week",
  });
  if (!result.ok) return NextResponse.json({ message: result.message }, { status: 400 });
  return NextResponse.json({ ok: true, cashDue: result.cashDue });
}
