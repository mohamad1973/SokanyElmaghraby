import { NextResponse } from "next/server";

import {
  assignCourierOrder,
  loadCourierDispatch,
  markCourierOutcome,
  markCourierSupervisorDisposition,
  saveCourierAreas,
  saveCourierCashDay,
  unassignCourierOrder,
} from "@/lib/cs/courier-dispatch";
import { ensureCsTables } from "@/lib/cs/agents";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import { requireCsSession } from "@/lib/session-guards";

async function viewerOrNull() {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) return null;
  await ensureCsTables();
  const viewer = await resolveCsViewer(session.user.csAgentId);
  if (!viewer.isCourierSupervisor && !viewer.isCourier && !viewer.isAdmin) return null;
  return { session, viewer };
}

export async function GET(request: Request) {
  const access = await viewerOrNull();
  if (!access) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
  const courierId = Number(new URL(request.url).searchParams.get("courierId") || "");
  if (courierId && access.viewer.isAdmin) {
    const data = await loadCourierDispatch(courierId, "courier");
    return NextResponse.json(data);
  }
  const mode = access.viewer.isCourierSupervisor || access.viewer.isAdmin ? "supervisor" : "courier";
  const data = await loadCourierDispatch(access.session.user.csAgentId!, mode);
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const access = await viewerOrNull();
  if (!access) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
  const body = (await request.json().catch(() => null)) as {
    action?: string;
    confirmationId?: number;
    orderNumber?: string;
    courierId?: number;
    areas?: string[];
    outcome?: string;
    reason?: string;
    amount?: number;
  } | null;
  if (!body?.action) return NextResponse.json({ message: "طلب ناقص." }, { status: 400 });

  if (body.action === "deliver") {
    const confirmationId = Number(body.confirmationId);
    if (!confirmationId) return NextResponse.json({ message: "الأوردر ناقص." }, { status: 400 });
    const outcome = body.outcome === "refused" || body.outcome === "postponed" ? body.outcome : "delivered";
    const courierId = access.viewer.isAdmin && body.courierId ? Number(body.courierId) : access.viewer.isCourier ? access.session.user.csAgentId : 0;
    if (!courierId) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
    const result = await markCourierOutcome(confirmationId, courierId, outcome, body.reason);
    return NextResponse.json(result.ok ? result : { message: result.message }, { status: result.ok ? 200 : 400 });
  }

  if (!access.viewer.isCourierSupervisor && !access.viewer.isAdmin) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
  }

  if (body.action === "assign") {
    const courierId = Number(body.courierId);
    if (!courierId) return NextResponse.json({ message: "اختار المندوب." }, { status: 400 });
    const result = await assignCourierOrder({
      confirmationId: body.confirmationId ? Number(body.confirmationId) : undefined,
      orderNumber: body.orderNumber,
      courierId,
    });
    return NextResponse.json(result.ok ? result : { message: result.message }, { status: result.ok ? 200 : 400 });
  }

  if (body.action === "unassign") {
    const confirmationId = Number(body.confirmationId);
    if (!confirmationId) return NextResponse.json({ message: "الأوردر ناقص." }, { status: 400 });
    const result = await unassignCourierOrder(confirmationId);
    return NextResponse.json(result.ok ? result : { message: result.message }, { status: result.ok ? 200 : 400 });
  }

  if (body.action === "disposition") {
    const confirmationId = Number(body.confirmationId);
    const courierId = Number(body.courierId);
    const outcome = body.outcome === "refused" || body.outcome === "postponed" ? body.outcome : "";
    if (!confirmationId || !courierId || !outcome) {
      return NextResponse.json({ message: "الطلب ناقص." }, { status: 400 });
    }
    const result = await markCourierSupervisorDisposition(confirmationId, courierId, outcome);
    return NextResponse.json(result.ok ? result : { message: result.message }, { status: result.ok ? 200 : 400 });
  }

  if (body.action === "collect") {
    const courierId = Number(body.courierId);
    if (!courierId) return NextResponse.json({ message: "اختار المندوب." }, { status: 400 });
    const result = await saveCourierCashDay(courierId, Number(body.amount));
    return NextResponse.json(result.ok ? result : { message: result.message }, { status: result.ok ? 200 : 400 });
  }

  if (body.action === "areas") {
    const courierId = Number(body.courierId);
    if (!courierId) return NextResponse.json({ message: "المندوب ناقص." }, { status: 400 });
    const result = await saveCourierAreas(courierId, Array.isArray(body.areas) ? body.areas : []);
    return NextResponse.json(result.ok ? result : { message: result.message }, { status: result.ok ? 200 : 400 });
  }

  return NextResponse.json({ message: "طلب غير معروف." }, { status: 400 });
}
