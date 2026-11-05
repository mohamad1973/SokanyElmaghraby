import { NextResponse } from "next/server";

import { buildBostaWarehouseReconcile } from "@/lib/cs/bosta-reconcile";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import { requireCsSession } from "@/lib/session-guards";

export async function GET(request: Request) {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }
  const viewer = await resolveCsViewer(session.user.csAgentId);
  const allowed = viewer.isAdmin || (viewer.isSupervisor && !viewer.isCourierSupervisor);
  if (!allowed) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
  }

  const url = new URL(request.url);
  const report = await buildBostaWarehouseReconcile(
    url.searchParams.get("from") || "",
    url.searchParams.get("to") || "",
  );
  return NextResponse.json(report);
}
