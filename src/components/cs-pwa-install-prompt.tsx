"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DISMISSED_KEY = "cs-pwa-install-v2";

function isStandaloneDisplay() {
  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    navigatorWithStandalone.standalone === true
  );
}

function isMobileLike() {
  if (typeof window === "undefined") return false;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const narrow = window.matchMedia("(max-width: 900px)").matches;
  const ua = /android|iphone|ipad|ipod|mobile/i.test(window.navigator.userAgent);
  return coarse || narrow || ua;
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isCsAppHost() {
  const host = window.location.hostname.toLowerCase();
  return host === "cs.tooliano.com" || host.startsWith("cs.");
}

export function CsPwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [onCsHost, setOnCsHost] = useState(false);

  useEffect(() => {
    // Prefer CS-specific SW so install is tied to /cs scope, not the store PWA
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/cs-sw.js", { scope: "/cs/" }).catch(() => {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    });
  }, []);

  useEffect(() => {
    // Ensure CS manifest wins over the store root manifest
    const existing = document.querySelector('link[rel="manifest"]');
    if (existing) {
      existing.setAttribute("href", "/cs-manifest.webmanifest");
    } else {
      const link = document.createElement("link");
      link.rel = "manifest";
      link.href = "/cs-manifest.webmanifest";
      document.head.appendChild(link);
    }
  }, []);

  useEffect(() => {
    setOnCsHost(isCsAppHost());

    if (isStandaloneDisplay() || localStorage.getItem(DISMISSED_KEY) === "true") {
      return;
    }
    if (!isMobileLike()) {
      return;
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setIsVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // Show immediately on mobile — do not wait for bip
    setIsVisible(true);
    if (isIosDevice()) {
      setShowIosHelp(true);
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
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    localStorage.setItem(DISMISSED_KEY, "true");
    setInstallEvent(null);
    setIsVisible(false);
  };

  if (!isVisible) return null;

  const csUrl = "https://cs.tooliano.com/cs/login";

  return (
    <div
      className="fixed inset-x-3 z-[80] mx-auto max-w-md rounded-2xl border-2 border-[#FCA311] bg-[#14213D] p-4 text-white shadow-2xl"
      style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="flex items-start gap-3">
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-black ring-1 ring-white/10">
          <Image src="/icon-192.png" alt="Tooliano CS" fill className="object-cover" sizes="48px" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-[#FCA311]">ثبّت sokany.cs</p>
          <p className="mt-1 text-xs leading-5 text-white/85">
            نفس أيقونة سوكاني — تطبيق خدمة العملاء منفصل عن المتجر.
          </p>
          {!onCsHost ? (
            <p className="mt-2 rounded-lg bg-black/40 px-2 py-1.5 text-[11px] leading-4 text-[#FCA311]">
              للتثبيت كأيقونة مستقلة افتحي من الموبايل:{" "}
              <a href={csUrl} className="underline" dir="ltr">
                cs.tooliano.com
              </a>{" "}
              (وليس أيقونة المتجر القديمة).
            </p>
          ) : null}
          {showIosHelp ? (
            <p className="mt-2 text-[11px] leading-4 text-white/70">
              iPhone: زر المشاركة ← «إضافة إلى الشاشة الرئيسية».
            </p>
          ) : (
            <p className="mt-2 text-[11px] leading-4 text-white/70">
              Android Chrome: القائمة ⋮ ← «تثبيت التطبيق» أو «Add to Home screen».
            </p>
          )}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        {installEvent ? (
          <button
            type="button"
            onClick={() => void installApp()}
            className="flex-1 rounded-xl bg-[#FCA311] px-4 py-2.5 text-sm font-extrabold text-black"
          >
            تثبيت الآن
          </button>
        ) : !onCsHost ? (
          <a
            href={csUrl}
            className="flex-1 rounded-xl bg-[#FCA311] px-4 py-2.5 text-center text-sm font-extrabold text-black"
          >
            فتح رابط التثبيت
          </a>
        ) : null}
        <button
          type="button"
          onClick={dismissPrompt}
          className="rounded-xl border border-white/25 px-4 py-2.5 text-sm font-bold text-white/85"
        >
          لاحقاً
        </button>
      </div>
    </div>
  );
}
