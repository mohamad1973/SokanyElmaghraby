"use client";

import { useEffect, useRef, useState } from "react";

import { formatSocialProofMessage } from "@/lib/social-proof-format";

type SocialProofEvent = {
  id: number;
  productName: string;
  productCode: string;
  createdAt: string;
};

type SocialProofProduct = {
  name: string;
  code: string;
};

type SocialProofPayload = {
  events?: SocialProofEvent[];
  products?: SocialProofProduct[];
};

function randomBetween(minMs: number, maxMs: number) {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

export function OrderSocialProofToast() {
  const [message, setMessage] = useState<string | null>(null);
  const productsRef = useRef<SocialProofProduct[]>([]);
  const lastSeenEventIdRef = useRef<number | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const randomTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    function clearHideTimer() {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    }

    function showMessage(nextMessage: string) {
      if (cancelled || !nextMessage.trim()) {
        return;
      }

      setMessage(nextMessage);
      clearHideTimer();
      hideTimerRef.current = setTimeout(() => {
        if (!cancelled) {
          setMessage(null);
        }
      }, 5000);
    }

    function showRandomProduct() {
      const products = productsRef.current;
      if (!products.length) {
        return;
      }

      const product = products[Math.floor(Math.random() * products.length)];
      showMessage(formatSocialProofMessage(product.name, product.code));
    }

    function scheduleRandom() {
      if (randomTimerRef.current) {
        clearTimeout(randomTimerRef.current);
      }

      randomTimerRef.current = setTimeout(() => {
        if (cancelled) {
          return;
        }

        showRandomProduct();
        scheduleRandom();
      }, randomBetween(45000, 90000));
    }

    async function fetchSocialProof() {
      try {
        const response = await fetch("/api/social-proof", { cache: "no-store" });
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as SocialProofPayload;
        const events = Array.isArray(payload.events) ? payload.events : [];
        const products = Array.isArray(payload.products) ? payload.products : [];

        productsRef.current = products;

        if (!initializedRef.current) {
          initializedRef.current = true;
          lastSeenEventIdRef.current = events[0]?.id ?? null;
          scheduleRandom();
          return;
        }

        const newest = events[0];
        if (newest && newest.id !== lastSeenEventIdRef.current) {
          lastSeenEventIdRef.current = newest.id;
          showMessage(formatSocialProofMessage(newest.productName, newest.productCode));
        }
      } catch {
        // Ignore transient network errors.
      }
    }

    void fetchSocialProof();
    const pollId = window.setInterval(() => {
      void fetchSocialProof();
    }, 25000);

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
      clearHideTimer();
      if (randomTimerRef.current) {
        clearTimeout(randomTimerRef.current);
      }
    };
  }, []);

  if (!message) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-6 left-6 z-[70] hidden max-w-sm lg:block" dir="rtl">
      <div className="pointer-events-auto rounded-2xl border border-black/8 bg-white/95 px-4 py-3 text-sm font-semibold leading-6 text-zinc-800 shadow-[0_10px_30px_rgba(0,0,0,0.12)] backdrop-blur">
        <p className="text-[11px] font-bold tracking-wide text-brand-gold">طلب جديد</p>
        <p className="mt-1">{message}</p>
      </div>
    </div>
  );
}
