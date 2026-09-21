import { NextResponse } from "next/server";

import {
  createAssignment,
  deleteAssignment,
  fairSplitAssign,
  listAssignmentsDetailed,
  ruleBasedAssign,
} from "@/lib/cs/assignments";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import { requireCsSession } from "@/lib/session-guards";

export async function GET() {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }
  const viewer = await resolveCsViewer(session.user.csAgentId);
  if (!viewer.isSupervisor && !session.user.csIsSupervisor) {
    return NextResponse.json({ message: "للمشرفة فقط." }, { status: 403 });
  }
  const assignments = await listAssignmentsDetailed();
  return NextResponse.json({ ok: true, assignments });
}

export async function POST(request: Request) {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }
  const viewer = await resolveCsViewer(session.user.csAgentId);
  if (!viewer.isSupervisor && !session.user.csIsSupervisor) {
    return NextResponse.json({ message: "للمشرفة فقط." }, { status: 403 });
  }

  let body: {
    mode?: "range" | "fair" | "rules";
    agentId?: number;
    from?: number;
    to?: number;
    agentIds?: number[];
    confirmationIds?: number[];
    governorate?: string;
    area?: string;
    ruleMode?: "shipping" | "paid" | "region_agent" | "region_shipping";
    rules?: Array<{
      agentId?: number;
      shippingCompany?: "bosta" | "sayed_temima";
      paidOnline?: boolean;
      governorate?: string;
      area?: string;
    }>;
  } = {};

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ message: "طلب غير صالح." }, { status: 400 });
  }

  const mode = body.mode || "range";

  if (mode === "fair") {
    const result = await fairSplitAssign({
      agentIds: body.agentIds || [],
      confirmationIds: body.confirmationIds,
      governorate: body.governorate || undefined,
      area: body.area || undefined,
      createdById: session.user.csAgentId,
    });
    if (!result.ok) return NextResponse.json({ message: result.message }, { status: 400 });
    return NextResponse.json({ ok: true, assigned: result.assigned, perAgent: result.perAgent });
  }

  if (mode === "rules") {
    if (!body.ruleMode) {
      return NextResponse.json({ message: "نوع القاعدة مطلوب." }, { status: 400 });
    }
    const result = await ruleBasedAssign({
      mode: body.ruleMode,
      rules: body.rules || [],
      governorate: body.governorate || undefined,
      area: body.area || undefined,
      createdById: session.user.csAgentId,
    });
    if (!result.ok) return NextResponse.json({ message: result.message }, { status: 400 });
    return NextResponse.json({ ok: true, updated: result.updated });
  }

  const result = await createAssignment({
    agentId: Number(body.agentId),
    wooOrderNumberFrom: Number(body.from),
    wooOrderNumberTo: Number(body.to),
    createdById: session.user.csAgentId,
  });

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, assignment: result.assignment });
}

export async function DELETE(request: Request) {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }
  const viewer = await resolveCsViewer(session.user.csAgentId);
  if (!viewer.isSupervisor && !session.user.csIsSupervisor) {
    return NextResponse.json({ message: "للمشرفة فقط." }, { status: 403 });
  }

  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id)) {
    return NextResponse.json({ message: "معرف غير صالح." }, { status: 400 });
  }
  const result = await deleteAssignment(id);
  if (!result.ok) return NextResponse.json({ message: result.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
