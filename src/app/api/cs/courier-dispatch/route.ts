import { NextResponse } from "next/server";

import {
  assignCourierOrder,
  loadCourierDispatch,
  markCourierDelivered,
  saveCourierAreas,
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
  if (!viewer.isCourierSupervisor && !viewer.isCourier) return null;
  return { session, viewer };
}

export async function GET() {
  const access = await viewerOrNull();
  if (!access) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
  const mode = access.viewer.isCourierSupervisor ? "supervisor" : "courier";
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
  } | null;
  if (!body?.action) return NextResponse.json({ message: "طلب ناقص." }, { status: 400 });

  if (body.action === "deliver") {
    if (!access.viewer.isCourier) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
    const confirmationId = Number(body.confirmationId);
    if (!confirmationId) return NextResponse.json({ message: "الأوردر ناقص." }, { status: 400 });
    const result = await markCourierDelivered(confirmationId, access.session.user.csAgentId!);
    return NextResponse.json(result.ok ? result : { message: result.message }, { status: result.ok ? 200 : 400 });
  }

  if (!access.viewer.isCourierSupervisor) {
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

  if (body.action === "areas") {
    const courierId = Number(body.courierId);
    if (!courierId) return NextResponse.json({ message: "المندوب ناقص." }, { status: 400 });
    const result = await saveCourierAreas(courierId, Array.isArray(body.areas) ? body.areas : []);
    return NextResponse.json(result.ok ? result : { message: result.message }, { status: result.ok ? 200 : 400 });
  }

  return NextResponse.json({ message: "طلب غير معروف." }, { status: 400 });
}
