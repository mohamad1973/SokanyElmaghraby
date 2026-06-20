"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DISMISSED_KEY = "sokany-pwa-install-dismissed";

function isStandaloneDisplay() {
  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    navigatorWithStandalone.standalone === true
  );
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // The app remains usable if service worker registration is blocked.
    });
  }, []);

  useEffect(() => {
    if (isStandaloneDisplay() || localStorage.getItem(DISMISSED_KEY) === "true") {
      return;
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setIsVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    if (isIosDevice()) {
      const timer = window.setTimeout(() => {
        setShowIosHelp(true);
        setIsVisible(true);
      }, 1200);

      return () => {
        window.clearTimeout(timer);
        window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      };
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const dismissPrompt = () => {
    localStorage.setItem(DISMISSED_KEY, "true");
    setIsVisible(false);
  };

  const installApp = async () => {
    if (!installEvent) {
      return;
    }

    await installEvent.prompt();
    await installEvent.userChoice;
    localStorage.setItem(DISMISSED_KEY, "true");
    setInstallEvent(null);
    setIsVisible(false);
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-3xl border border-white/10 bg-black/95 p-4 text-white shadow-2xl shadow-black/40 backdrop-blur">
      <div className="flex items-start gap-3">
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-black ring-1 ring-white/10">
          <Image src="/sokany-logo.png" alt="SOKANY" fill className="object-cover" sizes="56px" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[var(--brand-gold)]">ثبت تطبيق SOKANY</p>
          <p className="mt-1 text-sm leading-6 text-white/80">
            افتح الموقع كتطبيق على الموبايل أو الديسكتوب للوصول السريع للمنتجات والعروض.
          </p>
          {showIosHelp ? (
            <p className="mt-2 text-xs leading-5 text-white/65">
              على iPhone اضغط زر المشاركة ثم اختر Add to Home Screen.
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2">
        {installEvent ? (
          <button
            type="button"
            onClick={installApp}
            className="flex-1 rounded-full bg-[var(--brand-gold)] px-4 py-2 text-sm font-bold text-black transition hover:brightness-95"
          >
            تثبيت الآن
          </button>
        ) : null}
        <button
          type="button"
          onClick={dismissPrompt}
          className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-white/75 transition hover:bg-white/10"
        >
          لاحقاً
        </button>
      </div>
    </div>
  );
}
