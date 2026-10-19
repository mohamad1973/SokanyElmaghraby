import { NextResponse } from "next/server";

import { decideDepositApproval, getDepositApprovalById } from "@/lib/cs/deposit-approvals";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import { requireCsSession } from "@/lib/session-guards";

type Context = { params: Promise<{ id: string }> };

function isCsAdminSession(session: NonNullable<Awaited<ReturnType<typeof requireCsSession>>>, viewerRole: string) {
  return Boolean(session.user.csIsAdmin) || session.user.csRole === "admin" || viewerRole === "admin";
}

export async function GET(_request: Request, context: Context) {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }

  const viewer = await resolveCsViewer(session.user.csAgentId);
  if (!isCsAdminSession(session, viewer.role)) {
    return NextResponse.json({ message: "غير مصرح — لأدمن CS فقط." }, { status: 403 });
  }

  const { id } = await context.params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) {
    return NextResponse.json({ message: "معرف غير صالح." }, { status: 400 });
  }

  const item = await getDepositApprovalById(numericId);
  if (!item) {
    return NextResponse.json({ message: "الطلب غير موجود." }, { status: 404 });
  }

  return NextResponse.json({ item });
}

export async function POST(request: Request, context: Context) {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }

  const viewer = await resolveCsViewer(session.user.csAgentId);
  if (!isCsAdminSession(session, viewer.role)) {
    return NextResponse.json({ message: "غير مصرح — لأدمن CS فقط." }, { status: 403 });
  }

  const { id } = await context.params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) {
    return NextResponse.json({ message: "معرف غير صالح." }, { status: 400 });
  }

  let body: { decision?: string } = {};
  try {
    body = (await request.json()) as { decision?: string };
  } catch {
    return NextResponse.json({ message: "طلب غير صالح." }, { status: 400 });
  }

  const decision = body.decision === "approved" || body.decision === "rejected" ? body.decision : null;
  if (!decision) {
    return NextResponse.json({ message: "قرار غير صالح." }, { status: 400 });
  }

  try {
    const result = await decideDepositApproval({ id: numericId, decision });
    if (!result.ok) {
      return NextResponse.json(
        { message: result.message, detail: "detail" in result ? result.detail : undefined },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true, status: result.status });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[cs/deposit-approvals] decide", detail);
    return NextResponse.json(
      { message: "تعذر حفظ القرار بسبب خطأ في السيرفر. حاول مرة أخرى.", detail: detail.slice(0, 200) },
      { status: 500 },
    );
  }
}
