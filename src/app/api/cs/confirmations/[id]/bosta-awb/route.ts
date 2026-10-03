import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/db";
import { fetchBostaAwbPdf } from "@/lib/shipping/bosta-client";
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
  const prisma = getPrismaClient();
  if (!prisma) {
    return NextResponse.json({ message: "قاعدة البيانات غير متاحة." }, { status: 503 });
  }
  const row = await prisma.csOrderConfirmation.findUnique({
    where: { id: numericId },
    select: { trackingNumber: true },
  });
  if (!row) {
    return NextResponse.json({ message: "الطلب غير موجود." }, { status: 404 });
  }
  const printed = await fetchBostaAwbPdf(String(row.trackingNumber || ""));
  if (!printed.ok) {
    return NextResponse.json({ message: printed.message }, { status: 400 });
  }
  return new NextResponse(Buffer.from(printed.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="bosta-${row.trackingNumber}.pdf"`,
    },
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
