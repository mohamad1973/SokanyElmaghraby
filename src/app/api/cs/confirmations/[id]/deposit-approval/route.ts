import { NextResponse } from "next/server";

import { requestDepositApproval } from "@/lib/cs/deposit-approvals";
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

  const result = await requestDepositApproval({
    id: numericId,
    agentId: session.user.csAgentId,
    depositAmount: body.depositAmount as string | number | null | undefined,
    depositPayMethod: (body.depositPayMethod as string | null) ?? null,
    depositFromNumber: (body.depositFromNumber as string | null) ?? null,
    depositInstapayName: (body.depositInstapayName as string | null) ?? null,
    depositToPhone: (body.depositToPhone as string | null) ?? null,
    depositToMethod: (body.depositToMethod as string | null) ?? null,
    depositPaidAt: (body.depositPaidAt as string | null) ?? null,
    depositProofUrl: (body.depositProofUrl as string | null) ?? null,
  });

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, status: result.status });
}
