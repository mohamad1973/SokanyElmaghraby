import "server-only";

import { getPrismaClient } from "@/lib/db";
import {
  GB_APPROVAL_STATUS,
  GB_CAMPAIGN_OUTCOME,
  GB_ORDER_STATUS,
} from "@/lib/group-buy/constants";

export const GB_CAMPAIGN_DECISION = {
  EXTEND: "EXTEND",
  EXECUTE: "EXECUTE",
  CANCEL: "CANCEL",
} as const;

export type GbCampaignDecisionAction =
  (typeof GB_CAMPAIGN_DECISION)[keyof typeof GB_CAMPAIGN_DECISION];

export type CampaignDurationInput = {
  days?: number;
  hours?: number;
  minutes?: number;
};

function durationToMinutes(duration?: CampaignDurationInput): number {
  const days = Number(duration?.days ?? 0);
  const hours = Number(duration?.hours ?? 0);
  const minutes = Number(duration?.minutes ?? 0);
  return days * 24 * 60 + hours * 60 + minutes;
}

export function isCampaignExpired(
  campaignEndsAt: Date | string | null | undefined,
  now = new Date(),
): boolean {
  if (!campaignEndsAt) return false;
  const ends =
    campaignEndsAt instanceof Date ? campaignEndsAt : new Date(campaignEndsAt);
  return ends.getTime() <= now.getTime();
}

export function canApplyCampaignDecision(
  campaignOutcome: string,
  campaignEndsAt: Date | string | null | undefined,
  now = new Date(),
): boolean {
  if (
    campaignOutcome !== GB_CAMPAIGN_OUTCOME.ACTIVE &&
    campaignOutcome !== GB_CAMPAIGN_OUTCOME.AWAITING_DECISION
  ) {
    return false;
  }
  return isCampaignExpired(campaignEndsAt, now);
}

async function succeedCampaign(submissionId: string) {
  const prisma = getPrismaClient();
  if (!prisma) return;

  await prisma.gbGroupBuyOrder.updateMany({
    where: {
      submissionId,
      status: {
        in: [GB_ORDER_STATUS.RESERVED_COD, GB_ORDER_STATUS.CAMPAIGN_ACTIVE],
      },
    },
    data: { status: GB_ORDER_STATUS.SUCCEEDED },
  });

  await prisma.gbProductSubmission.update({
    where: { id: submissionId },
    data: { campaignOutcome: GB_CAMPAIGN_OUTCOME.SUCCEEDED },
  });
}

async function failCampaign(submissionId: string) {
  const prisma = getPrismaClient();
  if (!prisma) return;

  await prisma.gbGroupBuyOrder.updateMany({
    where: {
      submissionId,
      status: {
        in: [
          GB_ORDER_STATUS.PENDING_PAYMENT,
          GB_ORDER_STATUS.RESERVED_COD,
          GB_ORDER_STATUS.CAMPAIGN_ACTIVE,
        ],
      },
    },
    data: { status: GB_ORDER_STATUS.FAILED },
  });

  await prisma.gbProductSubmission.update({
    where: { id: submissionId },
    data: {
      campaignOutcome: GB_CAMPAIGN_OUTCOME.FAILED,
      reservedQuantity: 0,
      publishedOnStore: false,
    },
  });
}

export async function applyCampaignDecision(
  submissionId: string,
  action: GbCampaignDecisionAction,
  duration?: CampaignDurationInput,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const prisma = getPrismaClient();
  if (!prisma) {
    return { ok: false, error: "قاعدة البيانات غير متصلة." };
  }

  const submission = await prisma.gbProductSubmission.findUnique({
    where: { id: submissionId },
  });

  if (
    !submission ||
    submission.status !== GB_APPROVAL_STATUS.APPROVED ||
    !submission.publishedOnStore
  ) {
    return { ok: false, error: "العرض غير موجود أو غير منشور." };
  }

  if (
    !canApplyCampaignDecision(submission.campaignOutcome, submission.campaignEndsAt)
  ) {
    return {
      ok: false,
      error: "لا يمكن اتخاذ قرار — العرض ما زال نشطاً أو تم إنهاؤه مسبقاً.",
    };
  }

  if (submission.campaignOutcome === GB_CAMPAIGN_OUTCOME.ACTIVE) {
    await prisma.gbProductSubmission.update({
      where: { id: submissionId },
      data: { campaignOutcome: GB_CAMPAIGN_OUTCOME.AWAITING_DECISION },
    });
  }

  switch (action) {
    case GB_CAMPAIGN_DECISION.EXTEND: {
      const totalMinutes = durationToMinutes(duration);
      const minutes =
        Number.isFinite(totalMinutes) && totalMinutes > 0
          ? totalMinutes
          : (submission.dealDurationDays || 7) * 24 * 60;

      const campaignEndsAt = new Date();
      campaignEndsAt.setMinutes(campaignEndsAt.getMinutes() + minutes);

      await prisma.gbProductSubmission.update({
        where: { id: submissionId },
        data: {
          campaignOutcome: GB_CAMPAIGN_OUTCOME.ACTIVE,
          campaignEndsAt,
          publishedOnStore: !submission.adminHidden,
        },
      });

      return { ok: true, message: "تم تمديد مدة العرض." };
    }

    case GB_CAMPAIGN_DECISION.EXECUTE: {
      await succeedCampaign(submissionId);
      return { ok: true, message: "تم تنفيذ الصفقة على حالتها الحالية." };
    }

    case GB_CAMPAIGN_DECISION.CANCEL: {
      await failCampaign(submissionId);
      return { ok: true, message: "تم إنهاء الصفقة دون تنفيذ." };
    }

    default:
      return { ok: false, error: "إجراء غير معروف." };
  }
}
