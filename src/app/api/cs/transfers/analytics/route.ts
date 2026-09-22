import { NextResponse } from "next/server";

import { canAccessTransfers } from "@/lib/cs/agents";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import { getTransfersAnalytics } from "@/lib/cs/transfers-analytics";
import { requireCsSession } from "@/lib/session-guards";

async function requireTransfersAccess() {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) return null;
  const viewer = await resolveCsViewer(session.user.csAgentId);
  if (!viewer.canAccessTransfers && !canAccessTransfers(session.user.csRole)) return null;
  return session;
}

export async function GET(request: Request) {
  const session = await requireTransfersAccess();
  if (!session) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const bypass = searchParams.get("refresh") === "1";

  try {
    const data = await getTransfersAnalytics({ bypassCache: bypass });
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر جلب التحليلات.";
    return NextResponse.json({ message }, { status: 502 });
  }
}
