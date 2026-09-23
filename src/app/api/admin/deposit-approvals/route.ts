import { NextResponse } from "next/server";

import { listPendingDepositApprovals } from "@/lib/cs/deposit-approvals";
import { requireAdminSession } from "@/lib/session-guards";

export async function GET() {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }

  const items = await listPendingDepositApprovals();
  return NextResponse.json({ items, count: items.length });
}
