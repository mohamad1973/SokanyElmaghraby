import { NextResponse } from "next/server";

import { refreshCsBostaWaybill } from "@/lib/cs/bosta-waybill";
import { requireCsSession } from "@/lib/session-guards";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }

  const { id } = await context.params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) {
    return NextResponse.json({ message: "معرف غير صالح." }, { status: 400 });
  }

  const state = await refreshCsBostaWaybill(numericId);
  if (!state) {
    return NextResponse.json({ message: "الطلب غير موجود." }, { status: 404 });
  }

  return NextResponse.json(state);
}
