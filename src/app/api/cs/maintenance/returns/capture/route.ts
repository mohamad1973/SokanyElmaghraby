import { NextResponse } from "next/server";

import { captureBostaHeadingReturns } from "@/lib/cs/bosta-return-capture";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import { requireCsSession } from "@/lib/session-guards";

export async function POST() {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }
  const viewer = await resolveCsViewer(session.user.csAgentId);
  if (!viewer.isMaintenance) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
  }
  const result = await captureBostaHeadingReturns();
  if (!result.ok) return NextResponse.json({ message: result.message, found: result.found, saved: result.saved }, { status: 502 });
  return NextResponse.json(result);
}
