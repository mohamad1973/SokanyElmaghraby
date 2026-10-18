import { NextResponse } from "next/server";

import { saveBostaReturnReview } from "@/lib/cs/bosta-return-review";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import {
  listBostaReceivedReturns,
  listCourierReturns,
  listTemimaReturns,
  maintenanceRange,
} from "@/lib/cs/maintenance-returns";
import { requireCsSession } from "@/lib/session-guards";

export async function GET(request: Request) {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }
  const viewer = await resolveCsViewer(session.user.csAgentId);
  if (!viewer.isMaintenance) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
  }
  const url = new URL(request.url);
  const range = maintenanceRange(url.searchParams.get("from") || "", url.searchParams.get("to") || "");
  const [bosta, temima, couriers] = await Promise.all([
    listBostaReceivedReturns(range.from, range.to),
    listTemimaReturns(range.from, range.to),
    listCourierReturns(range.from, range.to),
  ]);
  return NextResponse.json({
    from: range.from,
    to: range.to,
    bosta: { rows: bosta.rows, error: bosta.error },
    temima: { rows: temima.rows },
    eid: couriers.eid,
    momen: couriers.momen,
  });
}

export async function POST(request: Request) {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }
  const viewer = await resolveCsViewer(session.user.csAgentId);
  if (!viewer.isMaintenance) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as {
    trackingNumber?: string;
    condition?: string;
    defects?: unknown;
    usage?: string;
  } | null;
  const defects = Array.isArray(body?.defects) ? body.defects.filter((item): item is string => typeof item === "string") : [];
  const result = await saveBostaReturnReview({
    trackingNumber: String(body?.trackingNumber || ""),
    condition: String(body?.condition || ""),
    defects,
    usage: String(body?.usage || ""),
  });
  if (!result.ok) return NextResponse.json({ message: result.message }, { status: 400 });
  return NextResponse.json({ review: result.review });
}
