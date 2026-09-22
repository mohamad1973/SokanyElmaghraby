"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DISMISSED_KEY = "cs-pwa-install-dismissed";

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

export function CsPwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // App remains usable if SW registration is blocked.
    });
  }, []);

  useEffect(() => {
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

    if (isIosDevice()) {
      const timer = window.setTimeout(() => {
        setShowIosHelp(true);
        setIsVisible(true);
      }, 800);
      return () => {
        window.clearTimeout(timer);
        window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      };
    }

    // Android/desktop-mobile: show a soft prompt even before bip if user hasn't dismissed
    const softTimer = window.setTimeout(() => {
      setIsVisible(true);
    }, 1500);

    return () => {
      window.clearTimeout(softTimer);
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

  return (
    <div className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-md rounded-2xl border border-[#FCA311]/40 bg-[#14213D] p-4 text-white shadow-2xl">
      <div className="flex items-start gap-3">
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-black ring-1 ring-white/10">
          <Image src="/icon-192.png" alt="Tooliano CS" fill className="object-cover" sizes="48px" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-[#FCA311]">ثبّت تطبيق خدمة العملاء</p>
          <p className="mt-1 text-xs leading-5 text-white/80">
            أضيفيه لشاشة الموبايل الرئيسية لفتح الداشبورد بسرعة كتطبيق مستقل.
          </p>
          {showIosHelp ? (
            <p className="mt-2 text-[11px] leading-4 text-white/65">
              على iPhone: زر المشاركة ثم «إضافة إلى الشاشة الرئيسية».
            </p>
          ) : null}
          {!installEvent && !showIosHelp ? (
            <p className="mt-2 text-[11px] leading-4 text-white/65">
              من قائمة المتصفح اختاري «تثبيت التطبيق» أو «Add to Home screen».
            </p>
          ) : null}
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
        ) : null}
        <button
          type="button"
          onClick={dismissPrompt}
          className="rounded-xl border border-white/20 px-4 py-2.5 text-sm font-bold text-white/80"
        >
          لاحقاً
        </button>
      </div>
    </div>
  );
}
