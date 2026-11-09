import { NextResponse } from "next/server";

import { listOrderActivity } from "@/lib/cs/order-activity";
import { requireCsSession } from "@/lib/session-guards";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Ctx) {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }

  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ message: "معرف غير صالح." }, { status: 400 });
  }

  try {
    const events = await listOrderActivity(id);
    return NextResponse.json({ ok: true, events });
  } catch (error) {
    console.error("[cs] activity GET failed", error);
    return NextResponse.json({ message: "تعذر تحميل سجل الصلاحية." }, { status: 500 });
  }
}
