import { NextResponse } from "next/server";

import { markDepositDecisionsSeen } from "@/lib/cs/deposit-approvals";
import { requireCsSession } from "@/lib/session-guards";

export async function POST(request: Request) {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }

  let body: { ids?: number[] } = {};
  try {
    body = (await request.json()) as { ids?: number[] };
  } catch {
    return NextResponse.json({ message: "طلب غير صالح." }, { status: 400 });
  }

  const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter((n) => Number.isInteger(n)) : [];
  const result = await markDepositDecisionsSeen({ ids, agentId: session.user.csAgentId });
  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
