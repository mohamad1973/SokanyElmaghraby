import { NextResponse } from "next/server";

import { listPendingDepositApprovals } from "@/lib/cs/deposit-approvals";
import { requireAdminSession } from "@/lib/session-guards";

export async function GET() {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }

  try {
    const items = await listPendingDepositApprovals();
    return NextResponse.json({ items, count: items.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر تحميل طلبات الديبوزت.";
    console.error("[admin/deposit-approvals]", message);
    return NextResponse.json({ message: "تعذر تحميل إشعارات الديبوزت.", detail: message.slice(0, 200) }, { status: 500 });
  }
}
