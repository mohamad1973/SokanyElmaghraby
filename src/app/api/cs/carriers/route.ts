import { NextResponse } from "next/server";

import { resolveCsViewer } from "@/lib/cs/confirmations";
import { createCsCarrier, listCsCarriers } from "@/lib/cs/sokany-waybill";
import { requireCsSession } from "@/lib/session-guards";

export async function GET() {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }
  const carriers = await listCsCarriers();
  return NextResponse.json({ carriers });
}

export async function POST(request: Request) {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }
  const viewer = await resolveCsViewer(session.user.csAgentId);
  if (!viewer.isAdmin) {
    return NextResponse.json({ message: "للأدمن فقط." }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    code?: string;
    nameAr?: string;
    printHubLabel?: string;
    returnAddress?: string;
  };
  const result = await createCsCarrier({
    code: String(body.code || ""),
    nameAr: String(body.nameAr || ""),
    printHubLabel: body.printHubLabel,
    returnAddress: body.returnAddress,
  });
  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, carrier: result.carrier });
}
