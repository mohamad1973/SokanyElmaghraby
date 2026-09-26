import { NextResponse } from "next/server";

import { ensureCsTables } from "@/lib/cs/agents";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import { scanTemimaDeliver, scanTemimaHandoff } from "@/lib/cs/temima-scan";
import { requireCsSession } from "@/lib/session-guards";

export async function POST(request: Request) {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  await ensureCsTables();
  const viewer = await resolveCsViewer(session.user.csAgentId);
  const body = (await request.json().catch(() => null)) as {
    trackingNumber?: string;
    action?: string;
    courierId?: number;
  } | null;
  const trackingNumber = String(body?.trackingNumber || "");
  if (body?.action === "handoff") {
    if (!viewer.isCourierSupervisor && !viewer.isAdmin) {
      return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
    }
    const result = await scanTemimaHandoff(trackingNumber);
    return NextResponse.json(result.ok ? result : { message: result.message }, { status: result.ok ? 200 : 400 });
  }
  if (body?.action === "deliver") {
    const courierId = viewer.isAdmin && body.courierId
      ? Number(body.courierId)
      : viewer.isCourier
        ? session.user.csAgentId
        : 0;
    if (!courierId) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
    const result = await scanTemimaDeliver(trackingNumber, courierId);
    return NextResponse.json(result.ok ? result : { message: result.message }, { status: result.ok ? 200 : 400 });
  }
  return NextResponse.json({ message: "طلب ناقص." }, { status: 400 });
}
