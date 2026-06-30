import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";

import { ProductRowScroller } from "@/components/product-row-scroller";
import { ProductSectionGrid } from "@/components/product-section-grid";
import { SectionTitle } from "@/components/section-title";
import { VisualEditableText } from "@/components/visual-editable-text";
import type { CustomHomeSection } from "@/lib/theme-settings";
import type { Product } from "@/lib/types";

type CustomProductSectionProps = {
  section: CustomHomeSection;
  products: Product[];
};

function getSafeColumnCount(value: number | undefined, fallback: number) {
  const parsedValue = Number(value || fallback);

  if (!Number.isFinite(parsedValue)) {
    return fallback;
  }

  return Math.max(1, Math.floor(parsedValue));
}

function SideBanner({ section, desktopColumns }: { section: CustomHomeSection; desktopColumns: number }) {
  if (!section.sideBanner.enabled || !section.sideBanner.image) {
    return null;
  }

  const banner = (
    <div
      className="relative h-[24rem] overflow-hidden bg-white shadow-sm sm:h-[29rem] lg:h-[32rem]"
      style={{
        borderColor: "rgba(0, 0, 0, 0.10)",
        borderRadius: "var(--product-card-border-radius)",
        borderStyle: "solid",
        borderWidth: "var(--product-card-border-width)",
      }}
    >
      <Image
        src={section.sideBanner.image}
        alt={section.title}
        fill
        sizes={`(min-width: 1024px) ${Math.ceil(100 / (desktopColumns + 1))}vw, (min-width: 640px) 100vw, 100vw`}
        className="object-cover"
        unoptimized
      />
    </div>
  );

  if (section.sideBanner.linkUrl) {
    return (
      <Link href={section.sideBanner.linkUrl} className="block">
        {banner}
      </Link>
    );
  }

  return banner;
}

export function CustomProductSection({ section, products }: CustomProductSectionProps) {
  const desktopColumns = getSafeColumnCount(section.desktopColumns, 4);
  const sideBannerWidth = `calc((100% - ${desktopColumns} * 1.5rem) / ${desktopColumns + 1})`;
  const sideBannerStyle = {
    "--side-banner-width": sideBannerWidth,
  } as CSSProperties;
  const sideBanner = <SideBanner section={section} desktopColumns={desktopColumns} />;
  const hasSideBanner = Boolean(section.sideBanner.enabled && section.sideBanner.image);
  const sideBannerOrder = section.sideBanner.position === "left" ? "lg:order-1" : "lg:order-2";
  const productsOrder = section.sideBanner.position === "left" ? "lg:order-2" : "lg:order-1";

  return (
    <div>
      <SectionTitle
        textKeyPrefix={`customSection.${section.id}`}
        title={section.title}
        description={
          section.subtitle ? (
            <VisualEditableText textKey={`customSection.${section.id}.subtitle`}>
              {section.subtitle}
            </VisualEditableText>
          ) : undefined
        }
      />

      <div dir="ltr" className="flex flex-col gap-6 lg:flex-row">
        {hasSideBanner ? (
          <div
            className={`w-full shrink-0 lg:w-[var(--side-banner-width)] lg:basis-[var(--side-banner-width)] ${section.sideBanner.showOnMobile ? "" : "hidden sm:block"} ${sideBannerOrder}`}
            style={sideBannerStyle}
          >
            {sideBanner}
          </div>
        ) : null}

        <div dir="rtl" className={`min-w-0 flex-1 ${productsOrder}`}>
          {section.displayMode === "carousel" ? (
            <ProductRowScroller
              products={products.slice(0, section.productLimit)}
              desktopColumns={section.desktopColumns}
              tabletColumns={section.tabletColumns}
              mobileColumns={section.mobileColumns}
            />
          ) : (
            <ProductSectionGrid
              products={products}
              desktopColumns={section.desktopColumns}
              tabletColumns={section.tabletColumns}
              mobileColumns={section.mobileColumns}
              rowCount={section.rowCount}
            />
          )}
        </div>
      </div>
    </div>
  );
}
