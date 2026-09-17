import "server-only";

import { getPrismaClient } from "@/lib/db";
import {
  GB_APPROVAL_STATUS,
  GB_CAMPAIGN_OUTCOME,
} from "@/lib/group-buy/constants";
import {
  applyCampaignDecision,
  GB_CAMPAIGN_DECISION,
  isCampaignExpired,
} from "@/lib/group-buy/campaign-decision";

/**
 * كرون مبسّط:
 * - لو الكمية تحققت → EXECUTE تلقائي
 * - وإلا → AWAITING_DECISION (قرار يدوي: تمديد / تنفيذ / إلغاء)
 */
export async function syncExpiredCampaigns(): Promise<{
  awaiting: number;
  succeeded: number;
}> {
  const prisma = getPrismaClient();
  if (!prisma) {
    return { awaiting: 0, succeeded: 0 };
  }

  const now = new Date();
  const ended = await prisma.gbProductSubmission.findMany({
    where: {
      status: GB_APPROVAL_STATUS.APPROVED,
      campaignOutcome: {
        in: [GB_CAMPAIGN_OUTCOME.ACTIVE, GB_CAMPAIGN_OUTCOME.AWAITING_DECISION],
      },
      campaignEndsAt: { lte: now },
    },
    select: {
      id: true,
      suggestedQuantity: true,
      reservedQuantity: true,
      campaignOutcome: true,
      campaignEndsAt: true,
    },
  });

  let awaiting = 0;
  let succeeded = 0;

  for (const sub of ended) {
    if (!isCampaignExpired(sub.campaignEndsAt, now)) continue;

    try {
      if (sub.reservedQuantity >= sub.suggestedQuantity) {
        const result = await applyCampaignDecision(
          sub.id,
          GB_CAMPAIGN_DECISION.EXECUTE,
        );
        if (result.ok) succeeded += 1;
        continue;
      }

      if (sub.campaignOutcome === GB_CAMPAIGN_OUTCOME.ACTIVE) {
        await prisma.gbProductSubmission.update({
          where: { id: sub.id },
          data: { campaignOutcome: GB_CAMPAIGN_OUTCOME.AWAITING_DECISION },
        });
        awaiting += 1;
      }
    } catch (err) {
      console.error(`[syncExpiredCampaigns] ${sub.id}:`, err);
    }
  }

  return { awaiting, succeeded };
}
