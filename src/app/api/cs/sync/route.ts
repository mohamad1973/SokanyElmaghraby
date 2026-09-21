import { NextResponse } from "next/server";

import { syncRecentOrdersForCs } from "@/lib/cs/confirmations";
import { requireCsSession } from "@/lib/session-guards";

export async function POST() {
  const session = await requireCsSession();
  if (!session) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }

  const result = await syncRecentOrdersForCs({ perPage: 40 });
  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    imported: result.imported,
    totalFetched: result.totalFetched,
    message: `تمت المزامنة (${result.imported} جديد من ${result.totalFetched}).`,
  });
}
