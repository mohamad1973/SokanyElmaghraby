import { NextResponse } from "next/server";

import { getPrismaClient, isDatabaseConfigured } from "@/lib/db";
import {
  GB_APPROVAL_STATUS,
  GB_CAMPAIGN_OUTCOME,
  GB_DEPOSIT_PERCENT,
  GB_ORDER_STATUS,
  GB_ROLES,
} from "@/lib/group-buy/constants";
import bcrypt from "bcryptjs";

type Body = {
  submissionId?: string;
  quantity?: number;
  buyerPhone?: string;
  buyerName?: string;
};

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ message: "DATABASE_URL غير مضبوط." }, { status: 503 });
  }

  const prisma = getPrismaClient();
  if (!prisma) {
    return NextResponse.json({ message: "تعذر الاتصال بقاعدة البيانات." }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ message: "طلب غير صالح." }, { status: 400 });
  }

  const submissionId = body.submissionId?.trim();
  const quantity = Math.floor(Number(body.quantity || 0));
  const buyerPhone = body.buyerPhone?.replace(/\D/g, "") || "";

  if (!submissionId || quantity < 1 || buyerPhone.length < 10) {
    return NextResponse.json(
      { message: "أدخل العرض والكمية ورقم موبايل صحيح." },
      { status: 400 },
    );
  }

  const submission = await prisma.gbProductSubmission.findUnique({
    where: { id: submissionId },
  });

  if (
    !submission ||
    submission.status !== GB_APPROVAL_STATUS.APPROVED ||
    !submission.publishedOnStore ||
    submission.adminHidden ||
    submission.campaignOutcome === GB_CAMPAIGN_OUTCOME.FAILED ||
    submission.campaignOutcome === GB_CAMPAIGN_OUTCOME.SUCCEEDED
  ) {
    return NextResponse.json({ message: "الحملة غير متاحة للحجز." }, { status: 400 });
  }

  if (
    submission.campaignEndsAt &&
    submission.campaignEndsAt.getTime() < Date.now() &&
    submission.campaignOutcome === GB_CAMPAIGN_OUTCOME.ACTIVE
  ) {
    return NextResponse.json({ message: "انتهى وقت الحملة." }, { status: 400 });
  }

  const remaining = submission.suggestedQuantity - submission.reservedQuantity;
  if (quantity > remaining) {
    return NextResponse.json(
      { message: `المتبقي للحجز ${Math.max(0, remaining)} فقط.` },
      { status: 400 },
    );
  }

  const unit = Number(submission.suggestedGroupPrice || 0);
  if (unit <= 0) {
    return NextResponse.json({ message: "سعر المجموعة غير مضبوط." }, { status: 400 });
  }

  const lineTotal = unit * quantity;
  const depositAmount = Math.round(lineTotal * (GB_DEPOSIT_PERCENT / 100));
  const codAmount = Math.max(0, lineTotal - depositAmount);

  const username = `buyer_${buyerPhone}`;
  let buyer = await prisma.gbUser.findUnique({ where: { username } });
  if (!buyer) {
    buyer = await prisma.gbUser.create({
      data: {
        username,
        passwordHash: await bcrypt.hash(buyerPhone.slice(-6) + "_tmp", 10),
        role: GB_ROLES.BUYER,
        phone: buyerPhone,
      },
    });
  }

  const [order] = await prisma.$transaction([
    prisma.gbGroupBuyOrder.create({
      data: {
        buyerId: buyer.id,
        submissionId,
        quantity,
        unitGroupPrice: unit,
        lineTotal,
        depositPercent: GB_DEPOSIT_PERCENT,
        depositAmount,
        codAmount,
        status: GB_ORDER_STATUS.RESERVED_COD,
      },
    }),
    prisma.gbProductSubmission.update({
      where: { id: submissionId },
      data: { reservedQuantity: { increment: quantity } },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    orderId: order.id,
    depositAmount,
    codAmount,
    lineTotal,
    message:
      "تم حجز الكمية. ادفع العربون عند التواصل مع المبيعات أو عند الاستلام حسب السياسة.",
  });
}
