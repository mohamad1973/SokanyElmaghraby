import Image from "next/image";
import Link from "next/link";

import type { MainGroupsSectionSettings } from "@/lib/theme-settings";

type MainGroupsSectionProps = {
  section: MainGroupsSectionSettings;
};

function MainGroupCard({
  image,
  linkUrl,
  alt,
  index,
}: {
  image: string;
  linkUrl: string;
  alt: string;
  index: number;
}) {
  const label = alt || `المجموعة الرئيسية ${index + 1}`;
  const content = (
    <Image
      src={image}
      alt={label}
      fill
      sizes="(max-width: 1023px) 100vw, 33vw"
      className="object-cover"
      unoptimized
    />
  );

  if (linkUrl) {
    return (
      <Link href={linkUrl} className="main-groups-card block">
        {content}
      </Link>
    );
  }

  return <div className="main-groups-card">{content}</div>;
}

export function MainGroupsSection({ section }: MainGroupsSectionProps) {
  const visibleItems = section.items.filter((item) => item.image);

  if (!section.enabled || visibleItems.length === 0) {
    return null;
  }

  return (
    <section className="main-groups-section home-edge-padding">
      <div className="main-groups-grid">
        {section.items.map((item, index) => {
          if (!item.image) {
            return null;
          }

          return (
            <MainGroupCard
              key={item.id}
              image={item.image}
              linkUrl={item.linkUrl}
              alt={item.alt}
              index={index}
            />
          );
        })}
      </div>
    </section>
  );
}
