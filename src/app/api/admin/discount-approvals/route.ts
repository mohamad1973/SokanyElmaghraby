import { NextResponse } from "next/server";

import { listPendingDiscountApprovals } from "@/lib/cs/discount-approvals";
import { requireAdminSession } from "@/lib/session-guards";

export async function GET() {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }

  try {
    const items = await listPendingDiscountApprovals();
    return NextResponse.json({ items, count: items.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر تحميل طلبات الخصم.";
    console.error("[admin/discount-approvals]", message);
    return NextResponse.json({ message: "تعذر تحميل طلبات الخصم.", detail: message.slice(0, 200) }, { status: 500 });
  }
}
