import { listActiveGroupBuyOpportunities } from "@/lib/group-buy/opportunities";
import { Link } from "@/i18n/navigation";

export async function GroupBuyHomeSection() {
  const items = await listActiveGroupBuyOpportunities(8);
  if (!items.length) {
    return null;
  }

  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-brand-gold">شراء جماعي</p>
          <h2 className="mt-2 text-3xl font-bold text-zinc-950">فرص من الفيندور</h2>
        </div>
        <Link href="/vendor/register" className="text-sm font-bold underline">
          سجّل كفيندور
        </Link>
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/campaign/offer/${item.id}`}
            className="overflow-hidden rounded-[1.75rem] bg-white shadow-sm transition hover:-translate-y-0.5"
          >
            <div className="aspect-square bg-zinc-100">
              {item.productImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.productImageUrl}
                  alt={item.productName}
                  className="h-full w-full object-cover"
                />
              ) : null}
            </div>
            <div className="space-y-2 p-4">
              <h3 className="line-clamp-2 text-sm font-bold text-zinc-950">{item.productName}</h3>
              <p className="text-xs text-zinc-500">{item.vendorCompanyName}</p>
              <p className="text-base font-bold">{item.suggestedGroupPrice ?? "-"} ج.م</p>
              <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
                <div className="h-full bg-brand-gold" style={{ width: `${item.progressPercent}%` }} />
              </div>
              <p className="text-xs text-zinc-500">
                {item.reservedQuantity}/{item.suggestedQuantity} ({item.progressPercent}%)
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
