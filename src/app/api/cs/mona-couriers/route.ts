import { NextResponse } from "next/server";

import { ensureCsTables } from "@/lib/cs/agents";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import { assignMonaOrder, loadMonaDesk, markMonaLarge, markMonaOutcome, markMonaSupervisorResult, recordMonaRemit, saveMonaCourierAdjust } from "@/lib/cs/mona-courier";
import { requireCsSession } from "@/lib/session-guards";

async function accessOrNull() {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) return null;
  await ensureCsTables();
  const viewer = await resolveCsViewer(session.user.csAgentId);
  const supervisor = (viewer.isSupervisor || viewer.isAdmin) && !viewer.isCourierSupervisor;
  if (!supervisor && !viewer.isMonaCourier) return null;
  return { session, viewer, supervisor };
}

export async function GET(request: Request) {
  const access = await accessOrNull();
  if (!access) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
  const own = new URL(request.url).searchParams.get("scope") === "own" || !access.supervisor;
  const desk = await loadMonaDesk(own ? access.session.user.csAgentId! : undefined);
  return NextResponse.json({
    mode: access.supervisor ? "supervisor" : "courier",
    canEditMoney: Boolean(access.supervisor && access.viewer.isAdmin),
    ...desk,
  });
}

export async function POST(request: Request) {
  const access = await accessOrNull();
  if (!access) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
  const body = (await request.json().catch(() => null)) as {
    action?: string;
    orderNumber?: string;
    courierId?: number;
    confirmationId?: number;
    outcome?: string;
    reason?: string;
    isLarge?: boolean;
    amount?: number;
    collected?: number;
    shipping?: number;
    remitted?: number;
  } | null;
  if (!body?.action) return NextResponse.json({ message: "الطلب ناقص." }, { status: 400 });

  if (body.action === "assign") {
    if (!access.supervisor) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
    const result = await assignMonaOrder(String(body.orderNumber || ""), Number(body.courierId));
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  if (body.action === "official") {
    if (!access.supervisor) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
    const result =
      body.outcome === "delivered" || body.outcome === "refused" || body.outcome === "postponed"
        ? body.outcome
        : body.outcome === "" || body.outcome === "clear"
          ? null
          : undefined;
    if (result === undefined) return NextResponse.json({ message: "النتيجة ناقصة." }, { status: 400 });
    const saved = await markMonaSupervisorResult(Number(body.confirmationId), result);
    return NextResponse.json(saved, { status: saved.ok ? 200 : 400 });
  }

  if (body.action === "large") {
    if (!access.supervisor) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
    const saved = await markMonaLarge(Number(body.confirmationId), Boolean(body.isLarge));
    return NextResponse.json(saved, { status: saved.ok ? 200 : 400 });
  }

  if (body.action === "outcome") {
    if (!access.viewer.isMonaCourier) {
      return NextResponse.json({ message: "التسليم من موبايل المندوب." }, { status: 403 });
    }
    const outcome = body.outcome === "delivered" || body.outcome === "refused" || body.outcome === "postponed" ? body.outcome : null;
    if (!outcome) return NextResponse.json({ message: "النتيجة ناقصة." }, { status: 400 });
    const result = await markMonaOutcome({
      confirmationId: Number(body.confirmationId),
      courierId: access.session.user.csAgentId!,
      outcome,
      reason: body.reason,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  if (body.action === "remit") {
    if (!access.viewer.isAdmin) return NextResponse.json({ message: "التوريد من حساب الأدمن." }, { status: 403 });
    const result = await recordMonaRemit(Number(body.courierId), Number(body.amount));
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  if (body.action === "adjust") {
    if (!access.viewer.isAdmin) return NextResponse.json({ message: "التعديل من حساب الأدمن." }, { status: 403 });
    const result = await saveMonaCourierAdjust(Number(body.courierId), {
      collected: Number(body.collected),
      shipping: Number(body.shipping),
      remitted: Number(body.remitted),
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  return NextResponse.json({ message: "إجراء غير معروف." }, { status: 400 });
}
