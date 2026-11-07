import { NextResponse } from "next/server";

import { isShippingRole } from "@/lib/cs/agents";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import { getTemimaReturnsReport } from "@/lib/cs/temima-returns-report";
import { requireCsSession } from "@/lib/session-guards";

export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const session = await requireCsSession();
    if (!session?.user.csAgentId) {
      return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
    }
    const viewer = await resolveCsViewer(session.user.csAgentId);
    const shipping =
      viewer.isAdmin || viewer.isShipping || isShippingRole(viewer.role) || isShippingRole(session.user.csRole);
    const follow = viewer.isSupervisor || viewer.isAdmin;
    if (!shipping && !follow) {
      return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
    }

    const url = new URL(request.url);
    const week = url.searchParams.get("week") || undefined;
    const report = await getTemimaReturnsReport(week);
    if (!report.ok) return NextResponse.json({ message: report.message }, { status: 503 });
    return NextResponse.json(report);
  } catch (error) {
    console.error("[temima-returns] GET failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ message: "تعذر تحميل تقرير المرتجعات." }, { status: 500 });
  }
}
