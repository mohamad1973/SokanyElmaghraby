import { NextResponse } from "next/server";

import { resolveCsViewer } from "@/lib/cs/confirmations";
import { getHomeConfirmReport } from "@/lib/cs/home-confirm-report";
import { requireCsSession } from "@/lib/session-guards";

export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const session = await requireCsSession();
    if (!session?.user.csAgentId) {
      return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
    }
    const viewer = await resolveCsViewer(session.user.csAgentId);
    const allowed =
      viewer.isAdmin ||
      viewer.isSupervisor ||
      Boolean(session.user.csIsAdmin) ||
      Boolean(session.user.csIsSupervisor);
    if (!allowed) {
      return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
    }

    const url = new URL(request.url);
    const from = url.searchParams.get("from") || undefined;
    const to = url.searchParams.get("to") || undefined;
    const report = await getHomeConfirmReport(from, to);
    if (!report.ok) return NextResponse.json({ message: report.message }, { status: 503 });
    return NextResponse.json(report);
  } catch (error) {
    console.error("[home-confirm-report] GET failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ message: "تعذر تحميل تقرير تأكيدات المنزل." }, { status: 500 });
  }
}
