import { NextResponse } from "next/server";

import { ensureCsTables } from "@/lib/cs/agents";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import { excludeTemimaOrder, freezePreparedTemimaDay, includeTemimaOrders, searchTemimaSheetOrders } from "@/lib/cs/temima-sheet-edits";
import { setTemimaSheetSerial } from "@/lib/cs/temima-sheet-freeze";
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
    query?: string;
    confirmationIds?: number[];
    confirmationId?: number;
    serial?: number;
  } | null;
  const dayYmd = String(body?.dayYmd || "");
  if (body?.action === "freeze") {
    const result = await freezePreparedTemimaDay(dayYmd);
    return NextResponse.json(result.ok ? result : { message: result.message }, { status: result.ok ? 200 : 400 });
  }
  if (body?.action === "serial") {
    const result = await setTemimaSheetSerial(dayYmd, Number(body.confirmationId), Number(body.serial));
    return NextResponse.json(result.ok ? result : { message: result.message }, { status: result.ok ? 200 : 400 });
  }
  if (body?.action === "search") {
    const result = await searchTemimaSheetOrders(String(body.query || ""));
    return NextResponse.json(result.ok ? result : { message: result.message }, { status: result.ok ? 200 : 503 });
  }
  if (body?.action === "include") {
    const ids = Array.isArray(body.confirmationIds) ? body.confirmationIds.map((id) => Number(id)) : [];
    const result = await includeTemimaOrders(dayYmd, ids);
    return NextResponse.json(result.ok ? result : { message: result.message }, { status: result.ok ? 200 : 400 });
  }
  if (body?.action === "exclude") {
    const result = await excludeTemimaOrder(dayYmd, Number(body.confirmationId));
    return NextResponse.json(result.ok ? result : { message: result.message }, { status: result.ok ? 200 : 400 });
  }
  return NextResponse.json({ message: "طلب غير صحيح." }, { status: 400 });
}
