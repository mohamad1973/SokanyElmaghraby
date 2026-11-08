import { NextResponse } from "next/server";

import { resolveCsViewer } from "@/lib/cs/confirmations";
import { getReturnTrackLine } from "@/lib/cs/return-track";
import { requireCsSession } from "@/lib/session-guards";

export async function GET(request: Request) {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }

  try {
    const viewer = await resolveCsViewer(session.user.csAgentId);
    if (!viewer.canSeeOrders && !viewer.canAccessMaintenanceHub && !viewer.isMaintenance && !viewer.isMaintenanceTech) {
      return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
    }

    const url = new URL(request.url);
    const trackingNumber = String(url.searchParams.get("trackingNumber") || "").trim();
    const confirmationId = Number(url.searchParams.get("confirmationId") || 0);
    if (!trackingNumber && !(Number.isInteger(confirmationId) && confirmationId > 0)) {
      return NextResponse.json({ message: "البوليصة أو رقم التأكيد ناقص." }, { status: 400 });
    }

    const line = await getReturnTrackLine({
      trackingNumber: trackingNumber || undefined,
      confirmationId: confirmationId > 0 ? confirmationId : undefined,
    });
    return NextResponse.json(line);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[cs/returns/track]", detail);
    return NextResponse.json({ message: "تعذر تحميل مسار المرتجع.", detail: detail.slice(0, 200) }, { status: 500 });
  }
}
