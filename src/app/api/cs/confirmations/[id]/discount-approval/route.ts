import { NextResponse } from "next/server";

import { cancelDiscountApproval, requestDiscountApproval } from "@/lib/cs/discount-approvals";
import { requireCsSession } from "@/lib/session-guards";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }

  const { id } = await context.params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) {
    return NextResponse.json({ message: "معرف غير صالح." }, { status: 400 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: "طلب غير صالح." }, { status: 400 });
  }

  if (body.action === "cancel") {
    const cancelled = await cancelDiscountApproval({
      id: numericId,
      agentId: session.user.csAgentId,
    });
    if (!cancelled.ok) {
      return NextResponse.json({ message: cancelled.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, status: cancelled.status });
  }

  const result = await requestDiscountApproval({
    id: numericId,
    agentId: session.user.csAgentId,
    discountAmount: body.discountAmount as string | number | null | undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, status: result.status, discountAmount: result.discountAmount });
}
