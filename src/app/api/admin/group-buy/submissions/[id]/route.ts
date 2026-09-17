import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { getPrismaClient, isDatabaseConfigured } from "@/lib/db";
import {
  GB_APPROVAL_STATUS,
  GB_CAMPAIGN_OUTCOME,
} from "@/lib/group-buy/constants";

type Body = {
  action?: "approve" | "reject";
  adminNote?: string;
  dealDurationDays?: number;
};

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ message: "DATABASE_URL غير مضبوط." }, { status: 503 });
  }

  const prisma = getPrismaClient();
  if (!prisma) {
    return NextResponse.json({ message: "تعذر الاتصال بقاعدة البيانات." }, { status: 503 });
  }

  const { id } = await context.params;
  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    /* empty */
  }

  const submission = await prisma.gbProductSubmission.findUnique({
    where: { id },
    include: { vendor: { include: { vendorProfile: true } } },
  });

  if (!submission) {
    return NextResponse.json({ message: "العرض غير موجود." }, { status: 404 });
  }

  if (body.action === "reject") {
    await prisma.gbProductSubmission.update({
      where: { id },
      data: {
        status: GB_APPROVAL_STATUS.REJECTED,
        adminNote: body.adminNote?.trim() || null,
        reviewedAt: new Date(),
        publishedOnStore: false,
      },
    });
    return NextResponse.json({ ok: true, status: GB_APPROVAL_STATUS.REJECTED });
  }

  const vendorOk =
    submission.vendor.vendorProfile?.status === GB_APPROVAL_STATUS.APPROVED;
  if (!vendorOk && submission.vendor.vendorProfile) {
    await prisma.gbVendorProfile.update({
      where: { id: submission.vendor.vendorProfile.id },
      data: {
        status: GB_APPROVAL_STATUS.APPROVED,
        reviewedAt: new Date(),
      },
    });
  }

  const days = Math.max(1, Number(body.dealDurationDays || submission.dealDurationDays || 7));
  const campaignEndsAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const updated = await prisma.gbProductSubmission.update({
    where: { id },
    data: {
      status: GB_APPROVAL_STATUS.APPROVED,
      reviewedAt: new Date(),
      publishedOnStore: true,
      adminHidden: false,
      dealDurationDays: days,
      campaignEndsAt,
      campaignOutcome: GB_CAMPAIGN_OUTCOME.ACTIVE,
      adminNote: body.adminNote?.trim() || null,
    },
  });

  return NextResponse.json({
    ok: true,
    status: updated.status,
    campaignEndsAt: updated.campaignEndsAt,
  });
}
