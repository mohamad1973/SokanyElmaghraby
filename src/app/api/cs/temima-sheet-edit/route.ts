import { NextResponse } from "next/server";

import { ensureCsTables } from "@/lib/cs/agents";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import { excludeTemimaOrder, includeTemimaOrders } from "@/lib/cs/temima-sheet-edits";
import { requireCsSession } from "@/lib/session-guards";

export async function POST(request: Request) {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
  await ensureCsTables();
  const viewer = await resolveCsViewer(session.user.csAgentId);
  if (!viewer.isAdmin) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
  const body = (await request.json().catch(() => null)) as {
    action?: string;
    dayYmd?: string;
    orderNumbers?: string;
    confirmationId?: number;
  } | null;
  const dayYmd = String(body?.dayYmd || "");
  if (body?.action === "include") {
    const result = await includeTemimaOrders(dayYmd, String(body.orderNumbers || ""));
    return NextResponse.json(result.ok ? result : { message: result.message }, { status: result.ok ? 200 : 400 });
  }
  if (body?.action === "exclude") {
    const result = await excludeTemimaOrder(dayYmd, Number(body.confirmationId));
    return NextResponse.json(result.ok ? result : { message: result.message }, { status: result.ok ? 200 : 400 });
  }
  return NextResponse.json({ message: "طلب غير صحيح." }, { status: 400 });
}
