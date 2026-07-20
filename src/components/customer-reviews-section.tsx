"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { CustomerReviewItem, CustomerReviewsSectionSettings } from "@/lib/theme-settings";

import { VisualEditableText } from "./visual-editable-text";

function AudioReviewPlayer({
  src,
  tone,
}: {
  src: string;
  tone: CustomerReviewItem["cardTone"];
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const isGold = tone === "gold";

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    function onTime() {
      if (!audio || !audio.duration) {
        return;
      }
      setProgress((audio.currentTime / audio.duration) * 100);
    }

    function onEnded() {
      setPlaying(false);
      setProgress(0);
    }

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnded);
    };
  }, [src]);

  async function toggle() {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }

    await audio.play();
    setPlaying(true);
  }

  return (
    <div className="mt-4">
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-bold transition ${
            isGold
              ? "bg-black/15 text-black hover:bg-black/25"
              : "bg-[#E8C547]/25 text-[#E8C547] hover:bg-[#E8C547]/40"
          }`}
          aria-label={playing ? "إيقاف" : "تشغيل الرأي الصوتي"}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <div className={`h-2 flex-1 overflow-hidden rounded-full ${isGold ? "bg-black/20" : "bg-white/20"}`}>
          <div
            className={`h-full rounded-full transition-all ${isGold ? "bg-black" : "bg-[#E8C547]"}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function ReviewCard({
  item,
  guaranteeText,
  verifiedBadgeLabel,
}: {
  item: CustomerReviewItem;
  guaranteeText: string;
  verifiedBadgeLabel: string;
}) {
  const isGold = item.cardTone === "gold";
  const initial = item.name.trim().slice(0, 1) || "ع";
  const hasAudio = Boolean(item.audioUrl);
  const hasProduct = Boolean(item.productName || item.productImage);

  return (
    <article
      className={`flex h-full w-full flex-col rounded-[1.75rem] p-5 shadow-lg ${
        isGold ? "bg-[#E8C547] text-black" : "bg-[#0a0a0a] text-[#E8C547]"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-bold ${
            isGold ? "bg-black/15 text-black" : "bg-[#E8C547]/20 text-[#E8C547]"
          }`}
        >
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold">{item.name}</p>
          <p className={`mt-1 text-sm tracking-wide ${isGold ? "text-black/80" : "text-[#E8C547]/90"}`}>
            {"★".repeat(Math.max(1, item.rating))}
          </p>
          {(item.verified || hasAudio) && (
            <div className="mt-2 flex items-center justify-between gap-2">
              {item.verified ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-gold px-2.5 py-1 text-[11px] font-bold text-black">
                  ✓ {verifiedBadgeLabel}
                </span>
              ) : (
                <span />
              )}
              {hasAudio ? (
                <Image
                  src="/reviews/studio-mic.png"
                  alt=""
                  width={80}
                  height={80}
                  className="h-20 w-20 object-contain"
                  unoptimized
                />
              ) : null}
            </div>
          )}
        </div>
      </div>

      {hasAudio ? (
        <AudioReviewPlayer src={item.audioUrl} tone={item.cardTone} />
      ) : item.text ? (
        <p className={`mt-4 text-sm leading-7 ${isGold ? "text-black/90" : "text-[#E8C547]/95"}`}>{item.text}</p>
      ) : (
        <p className={`mt-4 text-sm ${isGold ? "text-black/60" : "text-[#E8C547]/60"}`}>رأي صوتي / نصي قريباً</p>
      )}

      {hasProduct ? (
        <div
          className={`mt-5 flex items-center gap-3 rounded-2xl p-3 ${
            isGold ? "bg-black text-[#E8C547]" : "bg-white text-zinc-950"
          }`}
        >
          <div className="relative h-20 w-20 shrink-0">
            <div
              className={`relative h-full w-full overflow-hidden rounded-xl ${
                isGold ? "bg-white/10" : "bg-zinc-100"
              }`}
            >
              {item.productImage ? (
                <Image
                  src={item.productImage}
                  alt={item.productName || ""}
                  fill
                  className="object-contain p-1"
                  sizes="80px"
                  unoptimized
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-xs font-bold opacity-50">
                  منتج
                </span>
              )}
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{item.productName || "منتج سوكاني"}</p>
            <Link
              href={item.productUrl || "/shop"}
              className={`mt-1 inline-flex text-xs font-bold hover:underline ${
                isGold ? "text-[#DAFF00]" : "text-sky-700"
              }`}
            >
              احصل عليه ←
            </Link>
          </div>
        </div>
      ) : null}

      <p className={`mt-4 text-center text-xs font-semibold ${isGold ? "text-black/75" : "text-[#E8C547]/85"}`}>
        {guaranteeText}
      </p>
    </article>
  );
}

const REVIEW_CAROUSEL_INTERVAL_MS = 10_000;
const REVIEW_GAP_REM = 1;

function useReviewVisibleCount() {
  const [visibleCount, setVisibleCount] = useState(4);

  useEffect(() => {
    function update() {
      if (window.matchMedia("(min-width: 1024px)").matches) {
        setVisibleCount(4);
        return;
      }
      if (window.matchMedia("(min-width: 640px)").matches) {
        setVisibleCount(2);
        return;
      }
      setVisibleCount(2);
    }

    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return visibleCount;
}

export function CustomerReviewsSection({ settings }: { settings: CustomerReviewsSectionSettings }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeIndexRef = useRef(0);
  const [paused, setPaused] = useState(false);
  const visibleCount = useReviewVisibleCount();
  const items = settings.items;
  const shouldAutoScroll = items.length > 4;
  const columns = Math.min(visibleCount, Math.max(1, items.length));
  const itemBasis = `calc((100% - (${columns} - 1) * ${REVIEW_GAP_REM}rem) / ${columns})`;

  useEffect(() => {
    activeIndexRef.current = 0;
    scrollerRef.current?.scrollTo({ left: 0, behavior: "auto" });
  }, [columns, items.length]);

  useEffect(() => {
    if (!shouldAutoScroll || paused) {
      return;
    }

    const interval = window.setInterval(() => {
      const scroller = scrollerRef.current;
      if (!scroller) {
        return;
      }

      const maxIndex = Math.max(0, items.length - columns);
      activeIndexRef.current = activeIndexRef.current >= maxIndex ? 0 : activeIndexRef.current + 1;
      const target = scroller.children[activeIndexRef.current] as HTMLElement | undefined;

      if (target) {
        scroller.scrollTo({
          left: target.offsetLeft,
          behavior: "smooth",
        });
      }
    }, REVIEW_CAROUSEL_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [shouldAutoScroll, paused, items.length, columns]);

  if (!settings.enabled || !items.length) {
    return null;
  }

  return (
    <section className="bg-[#f6f7f4] py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-wrap items-center justify-center gap-4">
          <div className="rounded-full border-2 border-[#E8C547] bg-[#0a0a0a] px-6 py-2 text-base font-bold text-[#E8C547] shadow-sm">
            <VisualEditableText textKey="home.customerReviews.title">{settings.title}</VisualEditableText>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-[#E8C547]/40 bg-white px-4 py-2 text-sm font-bold text-zinc-800 shadow-sm">
            <span className="text-[#E8C547]">★</span>
            <span>{settings.ratingValue}</span>
            <span className="font-medium text-zinc-600">{settings.trustText}</span>
          </div>
        </div>

        <div
          ref={scrollerRef}
          dir="rtl"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          className="flex snap-x gap-4 overflow-x-auto scroll-smooth pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {items.map((item) => (
            <div
              key={item.id}
              dir="rtl"
              className="shrink-0 snap-start"
              style={{ flexBasis: itemBasis, maxWidth: itemBasis }}
            >
              <ReviewCard
                item={item}
                guaranteeText={settings.guaranteeText}
                verifiedBadgeLabel={settings.verifiedBadgeLabel || "عميل مميز"}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
