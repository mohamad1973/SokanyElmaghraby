import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { getPrismaClient, isDatabaseConfigured } from "@/lib/db";
import { GB_APPROVAL_STATUS, GB_CAMPAIGN_OUTCOME } from "@/lib/group-buy/constants";
import { canApplyCampaignDecision } from "@/lib/group-buy/campaign-decision";

import { AdminGroupBuyActions } from "./admin-group-buy-actions";

export default async function AdminGroupBuyPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "admin") {
    redirect("/admin/login");
  }

  if (!isDatabaseConfigured()) {
    return (
      <div className="rounded-2xl bg-amber-50 p-6 text-sm text-amber-900">
        عيّن DATABASE_URL واستورد final/database/group-buy-schema.sql
      </div>
    );
  }

  const prisma = getPrismaClient();
  if (!prisma) {
    return <p>تعذر الاتصال بقاعدة البيانات.</p>;
  }

  const [vendors, submissions] = await Promise.all([
    prisma.gbVendorProfile.findMany({
      where: { status: GB_APPROVAL_STATUS.PENDING },
      include: { user: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.gbProductSubmission.findMany({
      include: { vendor: { include: { vendorProfile: true } } },
      orderBy: { createdAt: "desc" },
      take: 80,
    }),
  ]);

  return (
    <div className="space-y-8" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold">فيندور والشراء الجماعي</h1>
        <p className="mt-2 text-sm text-zinc-600">
          موافقة العرض تنشر منتجاً على Woo (sokany-eg.com). عند انتهاء المدة: تمديد / تنفيذ / إلغاء.
        </p>
      </div>

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="font-bold">فيندور بانتظار الموافقة ({vendors.length})</h2>
        <ul className="mt-4 space-y-3 text-sm">
          {vendors.length === 0 ? <li className="text-zinc-500">لا يوجد.</li> : null}
          {vendors.map((vendor) => (
            <li key={vendor.id} className="rounded-xl border border-black/5 p-3">
              <p className="font-bold">{vendor.companyName}</p>
              <p className="text-zinc-600">
                {vendor.contactName} — {vendor.phone} — @{vendor.user.username}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="font-bold">عروض المنتجات</h2>
        <div className="mt-4 space-y-4">
          {submissions.map((item) => {
            const canDecide = canApplyCampaignDecision(
              item.campaignOutcome,
              item.campaignEndsAt,
            );
            return (
              <div key={item.id} className="rounded-xl border border-black/5 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-bold">{item.productName}</p>
                    <p className="text-xs text-zinc-500">
                      {item.vendor.vendorProfile?.companyName ?? item.vendor.username} —{" "}
                      {item.status} — {item.campaignOutcome}
                      {item.wooProductId ? ` — Woo #${item.wooProductId}` : ""}
                      {item.wooSyncStatus !== "none" ? ` (${item.wooSyncStatus})` : ""}
                    </p>
                    <p className="mt-1 text-sm">
                      كمية {item.suggestedQuantity} | جماعي {item.suggestedGroupPrice ?? "-"} | محجوز{" "}
                      {item.reservedQuantity}
                    </p>
                    {item.campaignOutcome === GB_CAMPAIGN_OUTCOME.AWAITING_DECISION ? (
                      <p className="mt-1 text-xs font-bold text-amber-700">
                        انتهت المدة — بانتظار قرار
                      </p>
                    ) : null}
                  </div>
                  <AdminGroupBuyActions
                    id={item.id}
                    canApprove={item.status === GB_APPROVAL_STATUS.PENDING}
                    canDecide={canDecide}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
