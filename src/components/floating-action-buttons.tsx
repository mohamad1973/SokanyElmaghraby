"use client";

import { useEffect, useState } from "react";

import type { FloatingActionsSettings } from "@/lib/theme-settings";
import { buildWhatsAppUrl } from "@/lib/whatsapp-link";

const floatingSiteChipClassName =
  "flex items-center justify-center rounded-full bg-brand-gold text-black shadow-lg transition duration-300 hover:translate-x-1 hover:bg-brand-gold-dark";

function ScrollTopIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-6 w-6">
      <path
        d="M12 5v14M12 5l-6 6M12 5l6 6"
        stroke="currentColor"
        strokeWidth="2.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

export function FloatingActionButtons({ settings }: { settings: FloatingActionsSettings }) {
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setShowScrollTop(window.scrollY > 300);
    }

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const whatsappUrl = buildWhatsAppUrl(settings.whatsappPhone);
  const showWhatsApp = settings.whatsappEnabled && Boolean(settings.whatsappPhone.trim());
  const showScrollTopButton = settings.scrollTopEnabled && showScrollTop;

  if (!showWhatsApp && !settings.scrollTopEnabled) {
    return null;
  }

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-center gap-3">
      {showScrollTopButton ? (
        <button
          type="button"
          aria-label="الصعود إلى أعلى الصفحة"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className={`${floatingSiteChipClassName} h-12 w-12`}
        >
          <ScrollTopIcon />
        </button>
      ) : null}

      {showWhatsApp ? (
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="تواصل عبر واتساب"
          className={`${floatingSiteChipClassName} h-14 w-14`}
        >
          <WhatsAppIcon />
        </a>
      ) : null}
    </div>
  );
}
