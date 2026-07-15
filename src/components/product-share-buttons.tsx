"use client";

import { useEffect, useState } from "react";

type ProductShareButtonsProps = {
  productName: string;
  productSlug: string;
};

export function ProductShareButtons({ productName, productSlug }: ProductShareButtonsProps) {
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);

  useEffect(() => {
    setUrl(window.location.href || `${window.location.origin}/product/${productSlug}`);
    setCanNativeShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, [productSlug]);

  const shareText = `${productName} — سوكاني`;
  const encodedUrl = encodeURIComponent(url || `https://sokany-storefront.vercel.app/product/${productSlug}`);
  const encodedText = encodeURIComponent(`${shareText}\n${url}`);

  async function copyLink() {
    if (!url) {
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  async function nativeShare() {
    if (!canNativeShare || !url) {
      return;
    }

    try {
      await navigator.share({ title: productName, text: shareText, url });
    } catch {
      // User cancelled or share failed — ignore.
    }
  }

  const buttonClass =
    "inline-flex h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-white text-zinc-950 transition hover:border-brand-gold hover:bg-brand-gold/15";

  return (
    <div className="mt-6">
      <p className="mb-3 text-sm font-bold text-zinc-950">مشاركة المنتج</p>
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={`https://wa.me/?text=${encodedText}`}
          target="_blank"
          rel="noreferrer"
          aria-label="مشاركة عبر واتساب"
          className={buttonClass}
        >
          <WhatsAppIcon />
        </a>
        <a
          href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`}
          target="_blank"
          rel="noreferrer"
          aria-label="مشاركة عبر فيسبوك"
          className={buttonClass}
        >
          <FacebookIcon />
        </a>
        <button type="button" aria-label="نسخ الرابط" onClick={copyLink} className={buttonClass}>
          <LinkIcon />
        </button>
        {canNativeShare ? (
          <button type="button" aria-label="مشاركة" onClick={nativeShare} className={buttonClass}>
            <ShareIcon />
          </button>
        ) : null}
        {copied ? <span className="text-xs font-medium text-zinc-600">تم نسخ الرابط</span> : null}
      </div>
    </div>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
      <path d="M17.47 14.3c-.28-.14-1.66-.82-1.92-.91-.26-.1-.45-.14-.63.14-.19.28-.72.91-.88 1.1-.16.19-.33.21-.6.07-.28-.14-1.18-.43-2.24-1.38-.83-.74-1.39-1.65-1.55-1.93-.16-.28-.02-.43.12-.57.13-.12.28-.33.42-.49.14-.16.19-.28.28-.47.1-.19.05-.35-.02-.49-.07-.14-.63-1.52-.86-2.08-.23-.55-.46-.47-.63-.48h-.54c-.19 0-.49.07-.74.35-.26.28-.98.96-.98 2.34s1 2.72 1.14 2.91c.14.19 1.97 3 4.76 4.2 1.77.76 2.46.83 3.34.7.51-.08 1.66-.68 1.9-1.34.23-.65.23-1.21.16-1.33-.07-.12-.26-.19-.54-.33Z" />
      <path d="M12.04 2C6.55 2 2.1 6.45 2.1 11.94c0 1.76.46 3.47 1.34 4.98L2 22l5.23-1.37a9.9 9.9 0 0 0 4.81 1.23h.01c5.49 0 9.94-4.45 9.94-9.94C22 6.45 17.53 2 12.04 2Zm0 18.12h-.01a8.18 8.18 0 0 1-4.17-1.14l-.3-.18-3.1.81.83-3.02-.2-.31a8.2 8.2 0 0 1-1.26-4.34c0-4.53 3.69-8.22 8.23-8.22 4.53 0 8.22 3.69 8.22 8.22 0 4.54-3.69 8.18-8.24 8.18Z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
      <path d="M13.5 21v-7.2h2.42l.36-2.8H13.5V9.2c0-.81.22-1.36 1.39-1.36H16.4V5.33c-.24-.03-1.08-.1-2.05-.1-2.03 0-3.42 1.24-3.42 3.52v1.96H8.5v2.8h2.43V21h2.57Z" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 stroke-current" fill="none" aria-hidden>
      <path
        strokeWidth="1.8"
        strokeLinecap="round"
        d="M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0-7.07-7.07L10.5 5.4M14 11a5 5 0 0 0-7.07 0L5.5 12.4a5 5 0 0 0 7.07 7.07L13.5 18.6"
      />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 stroke-current" fill="none" aria-hidden>
      <circle cx="18" cy="5" r="2.5" strokeWidth="1.8" />
      <circle cx="6" cy="12" r="2.5" strokeWidth="1.8" />
      <circle cx="18" cy="19" r="2.5" strokeWidth="1.8" />
      <path strokeWidth="1.8" strokeLinecap="round" d="M8.4 13.2 15.6 17.3M15.6 6.7 8.4 10.8" />
    </svg>
  );
}
