import { NextResponse } from "next/server";

import { resolveCsViewer } from "@/lib/cs/confirmations";
import { getMaintenanceTechReport } from "@/lib/cs/maintenance-tech-report";
import { requireCsSession } from "@/lib/session-guards";

export async function GET(request: Request) {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }
  const viewer = await resolveCsViewer(session.user.csAgentId);
  if (!viewer.isMaintenanceTech && !viewer.isAdmin) {
    return NextResponse.json({ message: "لتقرير فني الصيانة فقط." }, { status: 403 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from") || undefined;
  const to = url.searchParams.get("to") || undefined;
  try {
    const result = await getMaintenanceTechReport(from, to);
    if (!result.ok) return NextResponse.json({ message: result.message }, { status: 400 });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[tech-report] GET failed", error);
    return NextResponse.json({ message: "تعذر تحميل التقرير." }, { status: 500 });
  }
}
