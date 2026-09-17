import { getPrismaClient, isDatabaseConfigured } from "@/lib/db";
import { GB_APPROVAL_STATUS, GB_CAMPAIGN_OUTCOME } from "@/lib/group-buy/constants";

export type GroupBuyOpportunity = {
  id: string;
  productName: string;
  productType: string;
  productImageUrl: string | null;
  suggestedQuantity: number;
  reservedQuantity: number;
  suggestedGroupPrice: number | null;
  suggestedRetailPrice: number | null;
  campaignEndsAt: string | null;
  vendorCompanyName: string;
  progressPercent: number;
};

export async function listActiveGroupBuyOpportunities(
  limit = 12,
): Promise<GroupBuyOpportunity[]> {
  if (!isDatabaseConfigured()) {
    return [];
  }

  const prisma = getPrismaClient();
  if (!prisma) {
    return [];
  }

  const rows = await prisma.gbProductSubmission.findMany({
    where: {
      status: GB_APPROVAL_STATUS.APPROVED,
      publishedOnStore: true,
      adminHidden: false,
      campaignOutcome: {
        in: [GB_CAMPAIGN_OUTCOME.ACTIVE, GB_CAMPAIGN_OUTCOME.AWAITING_DECISION],
      },
    },
    include: {
      vendor: { include: { vendorProfile: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows.map((row) => {
    const target = Math.max(1, row.suggestedQuantity);
    const reserved = Math.max(0, row.reservedQuantity);
    return {
      id: row.id,
      productName: row.productName,
      productType: row.productType,
      productImageUrl: row.productImageUrl,
      suggestedQuantity: row.suggestedQuantity,
      reservedQuantity: row.reservedQuantity,
      suggestedGroupPrice: row.suggestedGroupPrice,
      suggestedRetailPrice: row.suggestedRetailPrice,
      campaignEndsAt: row.campaignEndsAt?.toISOString() ?? null,
      vendorCompanyName:
        row.vendor.vendorProfile?.companyName ?? row.vendor.username,
      progressPercent: Math.min(100, Math.round((reserved / target) * 100)),
    };
  });
}
