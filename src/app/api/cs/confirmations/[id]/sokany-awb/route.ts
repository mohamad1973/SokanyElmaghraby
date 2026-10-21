import { NextResponse } from "next/server";

import { ensureCsSokanyWaybill } from "@/lib/cs/sokany-waybill";
import { getPrismaClient } from "@/lib/db";
import { requireCsSession } from "@/lib/session-guards";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }
  const { id } = await context.params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) {
    return NextResponse.json({ message: "معرف غير صالح." }, { status: 400 });
  }
  const result = await ensureCsSokanyWaybill(numericId);
  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    tracking: result.waybill.tracking,
    printUrl: `/cs/print/sokany-awb/${numericId}`,
  });
}

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
  const prisma = getPrismaClient();
  if (!prisma) {
    return NextResponse.json({ message: "قاعدة البيانات غير متاحة." }, { status: 503 });
  }
  await prisma.csOrderConfirmation.update({
    where: { id: numericId },
    data: { waybillPrinted: true },
  });
  return NextResponse.json({ ok: true });
}
