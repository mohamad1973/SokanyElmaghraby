import Link from "next/link";

import { VisualEditableText } from "@/components/visual-editable-text";

export type TrustBadgeItem = {
  title: string;
  text: string;
  icon: string;
};

type TrustBadgesSectionProps = {
  items: TrustBadgeItem[];
  primaryCtaUrl?: string;
  secondaryCtaUrl?: string;
};

function TrustIcon({ icon }: { icon: string }) {
  const className = "h-8 w-8 shrink-0 text-brand-gold";

  if (icon === "check") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
        <path d="M12 3.2 19.2 6.4v5.4c0 4.1-2.5 6.9-7.2 8.8-4.7-1.9-7.2-4.7-7.2-8.8V6.4L12 3.2Z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8.7 12.1 11 14.4 15.7 9.7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8.4 6.8 12 5.3l3.6 1.5" strokeLinecap="round" opacity="0.55" />
      </svg>
    );
  }

  if (icon === "card") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
        <path d="M4.5 6.8h15A2.2 2.2 0 0 1 21.7 9v7.8a2.2 2.2 0 0 1-2.2 2.2h-15a2.2 2.2 0 0 1-2.2-2.2V9a2.2 2.2 0 0 1 2.2-2.2Z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M2.7 11.1h18.6M6.2 15.8h4.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M16.2 15.7h2.4" strokeLinecap="round" opacity="0.55" />
      </svg>
    );
  }

  if (icon === "truck") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
        <path d="M3 7.2h10.8v8.4H3V7.2ZM13.8 10.2h3.8l3.4 3.2v2.2h-7.2v-5.4Z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6.5 18.6a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8ZM17.7 18.6a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8Z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 4.8h6.8M4 11.3h5.2" strokeLinecap="round" opacity="0.55" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M12 3.3 19 6.7v5.1c0 4.3-2.4 7-7 8.9-4.6-1.9-7-4.6-7-8.9V6.7L12 3.3Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 12.4 11.2 14.6 15.7 10.1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.6 7.7 12 5.6l4.4 2.1" strokeLinecap="round" opacity="0.55" />
    </svg>
  );
}

export function TrustBadgesSection({
  items,
  primaryCtaUrl = "/shop",
  secondaryCtaUrl = "/contact",
}: TrustBadgesSectionProps) {
  return (
    <section className="w-full bg-black py-12 lg:py-20">
      <div
        className="mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:gap-12 lg:px-8"
        dir="ltr"
      >
        <div dir="rtl" className="flex flex-col items-start text-right">
          <p className="mb-6 inline-flex bg-brand-gold px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-black">
            <VisualEditableText textKey="trust.section.badge">لماذا سوكاني؟</VisualEditableText>
          </p>
          <h2 className="max-w-xl text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl lg:text-[2.75rem] lg:leading-[1.15]">
            <VisualEditableText textKey="trust.section.title">تسوق بثقة مع الوكيل الحصري في مصر</VisualEditableText>
          </h2>
          <p className="mt-5 max-w-xl text-base leading-8 text-zinc-400 sm:text-lg">
            <VisualEditableText textKey="trust.section.description">
              منتجات سوكاني الأصلية من مؤسسة المغربي، بضمان رسمي وشحن داخل الجمهورية وخيارات دفع مرنة تناسب
              احتياجك.
            </VisualEditableText>
          </p>
          <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:justify-start">
            <Link
              href={primaryCtaUrl}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/80 px-6 py-3 text-sm font-bold text-white transition hover:border-brand-gold hover:text-brand-gold"
            >
              <VisualEditableText textKey="trust.section.primaryCta">تسوق المنتجات</VisualEditableText>
              <span aria-hidden="true">&gt;</span>
            </Link>
            <Link
              href={secondaryCtaUrl}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/80 px-6 py-3 text-sm font-bold text-white transition hover:border-brand-gold hover:text-brand-gold"
            >
              <VisualEditableText textKey="trust.section.secondaryCta">تواصل معنا</VisualEditableText>
              <span aria-hidden="true">&gt;</span>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          {items.map((item) => (
            <div
              key={item.title}
              className="flex items-center gap-4 rounded-2xl bg-[#181818] px-5 py-6"
              dir="rtl"
            >
              <TrustIcon icon={item.icon} />
              <p className="text-base font-semibold leading-7 text-white">
                <VisualEditableText textKey={`trust.${item.icon}.title`}>{item.title}</VisualEditableText>
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
