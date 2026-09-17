import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { GroupBuyReserveForm } from "@/components/group-buy-reserve-form";
import { getPrismaClient, isDatabaseConfigured } from "@/lib/db";
import { GB_APPROVAL_STATUS } from "@/lib/group-buy/constants";
import { Link } from "@/i18n/navigation";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `حملة شراء جماعي ${id.slice(0, 6)}` };
}

export default async function GroupBuyOfferPage({ params }: Props) {
  const { id } = await params;

  if (!isDatabaseConfigured()) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <p className="rounded-2xl bg-amber-50 p-6 text-sm leading-7 text-amber-900">
          فعّل DATABASE_URL ثم استورد final/database/group-buy-schema.sql لتشغيل الحملات.
        </p>
      </div>
    );
  }

  const prisma = getPrismaClient();
  if (!prisma) notFound();

  const offer = await prisma.gbProductSubmission.findUnique({
    where: { id },
    include: { vendor: { include: { vendorProfile: true } } },
  });

  if (!offer || offer.status !== GB_APPROVAL_STATUS.APPROVED || offer.adminHidden) {
    notFound();
  }

  const remaining = Math.max(0, offer.suggestedQuantity - offer.reservedQuantity);
  const company = offer.vendor.vendorProfile?.companyName ?? offer.vendor.username;
  const groupPrice = offer.suggestedGroupPrice || 0;

  return (
    <div className="py-12">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
        <div className="overflow-hidden rounded-[2.5rem] bg-zinc-100">
          {offer.productImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={offer.productImageUrl} alt={offer.productName} className="h-full w-full object-cover" />
          ) : (
            <div className="flex min-h-[320px] items-center justify-center text-zinc-400">بدون صورة</div>
          )}
        </div>

        <div>
          <p className="text-sm font-bold text-brand-gold">شراء جماعي</p>
          <h1 className="mt-2 text-4xl font-bold text-zinc-950">{offer.productName}</h1>
          <p className="mt-2 text-sm text-zinc-500">فيندور: {company}</p>
          <p className="mt-5 text-3xl font-bold text-zinc-950">{groupPrice} ج.م</p>
          {offer.suggestedRetailPrice ? (
            <p className="text-sm text-zinc-500 line-through">{offer.suggestedRetailPrice} ج.م</p>
          ) : null}
          <p className="mt-4 leading-8 text-zinc-600 whitespace-pre-wrap">{offer.productDescription}</p>
          <p className="mt-4 text-sm font-bold text-zinc-800">
            محجوز {offer.reservedQuantity} من {offer.suggestedQuantity}
          </p>
          {offer.campaignEndsAt ? (
            <p className="mt-1 text-sm text-zinc-500">
              ينتهي: {offer.campaignEndsAt.toLocaleString("ar-EG")}
            </p>
          ) : null}

          <GroupBuyReserveForm
            submissionId={offer.id}
            remaining={remaining}
            groupPrice={groupPrice}
          />

          <Link href="/vendor/register" className="mt-6 inline-block text-sm font-bold underline">
            هل أنت فيندور؟ سجّل عرضك
          </Link>
        </div>
      </div>
    </div>
  );
}
