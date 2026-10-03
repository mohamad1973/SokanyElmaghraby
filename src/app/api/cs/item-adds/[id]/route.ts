import { NextResponse } from "next/server";

import { ensureCsTables } from "@/lib/cs/agents";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import { decideOrderItemAdd } from "@/lib/cs/order-item-adds";
import { requireCsSession } from "@/lib/session-guards";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Params) {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
  await ensureCsTables();
  const viewer = await resolveCsViewer(session.user.csAgentId);
  const isAdmin = viewer.isAdmin || Boolean(session.user.csIsAdmin) || session.user.csRole === "admin";
  if (!isAdmin) return NextResponse.json({ message: "الموافقة من حساب الأدمن." }, { status: 403 });
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { decision?: string } | null;
  const decision = body?.decision === "approved" || body?.decision === "rejected" ? body.decision : null;
  if (!decision) return NextResponse.json({ message: "القرار ناقص." }, { status: 400 });
  const result = await decideOrderItemAdd(Number(id), decision);
  return NextResponse.json(result.ok ? result : { message: result.message }, { status: result.ok ? 200 : 400 });
}
