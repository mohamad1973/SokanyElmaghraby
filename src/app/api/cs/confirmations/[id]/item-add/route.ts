import { NextResponse } from "next/server";

import { ensureCsTables } from "@/lib/cs/agents";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import { listOrderItemAdds, requestOrderItemChange } from "@/lib/cs/order-item-adds";
import { requireCsSession } from "@/lib/session-guards";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Params) {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
  await ensureCsTables();
  const { id } = await context.params;
  const confirmationId = Number(id);
  if (!Number.isInteger(confirmationId)) return NextResponse.json({ message: "الأوردر غير صحيح." }, { status: 400 });
  const adds = await listOrderItemAdds(confirmationId);
  return NextResponse.json({ adds });
}

export async function POST(request: Request, context: Params) {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
  await ensureCsTables();
  const viewer = await resolveCsViewer(session.user.csAgentId);
  if (viewer.isMonaCourier || viewer.isCourier) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
  }
  const { id } = await context.params;
  const confirmationId = Number(id);
  const body = (await request.json().catch(() => null)) as {
    kind?: string;
    wooProductId?: number;
    productName?: string;
    quantity?: number;
    unitPrice?: number;
  } | null;
  const kind = body?.kind === "remove" ? "remove" : body?.kind === "add" ? "add" : null;
  if (!kind) return NextResponse.json({ message: "الطلب ناقص." }, { status: 400 });
  const result = await requestOrderItemChange({
    confirmationId,
    kind,
    wooProductId: Number(body?.wooProductId || 0),
    productName: String(body?.productName || ""),
    quantity: Number(body?.quantity || 1),
    unitPrice: Number(body?.unitPrice || 0),
  });
  return NextResponse.json(result.ok ? result : { message: result.message }, { status: result.ok ? 200 : 400 });
}
