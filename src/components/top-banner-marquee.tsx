"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

export type TopBannerIconName = "quality" | "shipping" | "price" | "secure" | "support" | "warranty";

export type TopBannerMarqueeItem = {
  icon: TopBannerIconName;
  label: string;
};

type TopBannerMarqueeProps = {
  items: TopBannerMarqueeItem[];
  durationSeconds: number;
};

function TopBannerIcon({ icon }: { icon: TopBannerIconName }) {
  const className = "top-banner-icon";

  if (icon === "shipping") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
        <path d="M3 7h11v9H3V7ZM14 10h3.6l2.4 3v3h-6v-6Z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
      </svg>
    );
  }

  if (icon === "price") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
        <path d="M4 12V6h6l9.5 9.5-6 6L4 12Z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 9h.01" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "secure") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
        <path d="M6 11V8a6 6 0 0 1 12 0v3" strokeLinecap="round" />
        <path d="M5 11h14v10H5V11Z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 15v2" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "support") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
        <path d="M4 12a8 8 0 1 1 16 0v4a3 3 0 0 1-3 3h-2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 12v3a2 2 0 0 0 2 2h1v-6H6a2 2 0 0 0-2 1ZM20 12v3a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 1Z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (icon === "warranty") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
        <path d="M12 3 19 6v5c0 4.5-2.8 8.5-7 10-4.2-1.5-7-5.5-7-10V6l7-3Z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="m12 3 2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.3 6.7 19l1-5.8-4.2-4.1 5.9-.9L12 3Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TopBannerMarqueeItems({ items }: { items: TopBannerMarqueeItem[] }) {
  return (
    <>
      {items.map((item, itemIndex) => (
        <span key={`${itemIndex}-${item.label}`} className="top-banner-marquee-item">
          <TopBannerIcon icon={item.icon} />
          <span>{item.label}</span>
        </span>
      ))}
    </>
  );
}

export function TopBannerMarquee({ items, durationSeconds }: TopBannerMarqueeProps) {
  const measureRef = useRef<HTMLSpanElement>(null);
  const [shiftPx, setShiftPx] = useState(0);

  useEffect(() => {
    const element = measureRef.current;

    if (!element) {
      return;
    }

    function updateShift() {
      if (!element) {
        return;
      }

      setShiftPx(element.getBoundingClientRect().width);
    }

    updateShift();

    const observer = new ResizeObserver(updateShift);
    observer.observe(element);
    window.addEventListener("resize", updateShift);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateShift);
    };
  }, [items]);

  const trackStyle = {
    "--top-banner-duration": `${durationSeconds}s`,
    "--top-banner-shift": shiftPx > 0 ? `${shiftPx}px` : "50%",
  } as CSSProperties;

  return (
    <span className="top-banner-marquee" aria-label={items.map((item) => item.label).join(" - ")}>
      <span className="top-banner-marquee-track" style={trackStyle}>
        <span ref={measureRef} className="top-banner-marquee-content">
          <TopBannerMarqueeItems items={items} />
        </span>
        <span className="top-banner-marquee-content" aria-hidden="true">
          <TopBannerMarqueeItems items={items} />
        </span>
      </span>
    </span>
  );
}
