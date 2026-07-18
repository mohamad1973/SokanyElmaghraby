"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { CustomerReviewItem, CustomerReviewsSectionSettings } from "@/lib/theme-settings";

import { VisualEditableText } from "./visual-editable-text";

function MicBadge({ onGold }: { onGold?: boolean }) {
  return (
    <span
      className={`absolute -bottom-1 -left-1 z-10 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold shadow-md ${
        onGold ? "bg-black text-[#C9A227]" : "bg-[#C9A227] text-black"
      }`}
      title="تقييم صوتي"
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
        <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1A7 7 0 0 0 19 11h-2Z" />
      </svg>
      صوت
    </span>
  );
}

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
            isGold ? "bg-black/15 text-black hover:bg-black/25" : "bg-[#C9A227]/25 text-[#C9A227] hover:bg-[#C9A227]/40"
          }`}
          aria-label={playing ? "إيقاف" : "تشغيل الرأي الصوتي"}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <div className={`h-2 flex-1 overflow-hidden rounded-full ${isGold ? "bg-black/20" : "bg-white/20"}`}>
          <div
            className={`h-full rounded-full transition-all ${isGold ? "bg-black" : "bg-[#C9A227]"}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function ReviewCard({ item, guaranteeText }: { item: CustomerReviewItem; guaranteeText: string }) {
  const isGold = item.cardTone === "gold";
  const initial = item.name.trim().slice(0, 1) || "ع";
  const hasAudio = Boolean(item.audioUrl);

  return (
    <article
      className={`flex min-w-[280px] max-w-[320px] shrink-0 flex-col rounded-[1.75rem] p-5 shadow-lg sm:min-w-[300px] ${
        isGold ? "bg-[#C9A227] text-black" : "bg-[#0a0a0a] text-[#C9A227]"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-bold ${
            isGold ? "bg-black/15 text-black" : "bg-[#C9A227]/20 text-[#C9A227]"
          }`}
        >
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold">{item.name}</p>
          <p className={`mt-1 text-sm tracking-wide ${isGold ? "text-black/80" : "text-[#C9A227]/90"}`}>
            {"★".repeat(Math.max(1, item.rating))}
          </p>
          {item.verified ? (
            <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white">
              ✓ شراء مؤكد
            </span>
          ) : null}
        </div>
      </div>

      {hasAudio ? (
        <AudioReviewPlayer src={item.audioUrl} tone={item.cardTone} />
      ) : item.text ? (
        <p className={`mt-4 text-sm leading-7 ${isGold ? "text-black/90" : "text-[#C9A227]/95"}`}>{item.text}</p>
      ) : (
        <p className={`mt-4 text-sm ${isGold ? "text-black/60" : "text-[#C9A227]/60"}`}>رأي صوتي / نصي قريباً</p>
      )}

      {(item.productName || item.productImage || hasAudio) && (
        <div className={`mt-5 flex items-center gap-3 rounded-2xl p-3 ${isGold ? "bg-black text-[#C9A227]" : "bg-white text-zinc-950"}`}>
          <div className="relative h-14 w-14 shrink-0">
            <div className={`relative h-full w-full overflow-hidden rounded-xl ${isGold ? "bg-white/10" : "bg-zinc-100"}`}>
              {item.productImage ? (
                <Image
                  src={item.productImage}
                  alt={item.productName || ""}
                  fill
                  className="object-contain p-1"
                  sizes="56px"
                  unoptimized
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-xs font-bold opacity-50">منتج</span>
              )}
            </div>
            {hasAudio ? <MicBadge onGold={isGold} /> : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{item.productName || "منتج سوكاني"}</p>
            {hasAudio ? (
              <p className={`mt-1 text-[11px] font-bold ${isGold ? "text-[#C9A227]/80" : "text-zinc-500"}`}>تقييم صوتي</p>
            ) : null}
            <Link
              href={item.productUrl || "/shop"}
              className={`mt-1 inline-flex text-xs font-bold hover:underline ${isGold ? "text-[#DAFF00]" : "text-sky-700"}`}
            >
              أطلبه الآن ←
            </Link>
          </div>
        </div>
      )}

      <p className={`mt-4 text-center text-xs font-semibold ${isGold ? "text-black/75" : "text-[#C9A227]/85"}`}>
        {guaranteeText}
      </p>
    </article>
  );
}

export function CustomerReviewsSection({ settings }: { settings: CustomerReviewsSectionSettings }) {
  if (!settings.enabled || !settings.items.length) {
    return null;
  }

  return (
    <section className="bg-[#f6f7f4] py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-wrap items-center justify-center gap-4">
          <div className="rounded-full border-2 border-[#C9A227] bg-[#0a0a0a] px-6 py-2 text-base font-bold text-[#C9A227] shadow-sm">
            <VisualEditableText textKey="home.customerReviews.title">{settings.title}</VisualEditableText>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-[#C9A227]/40 bg-white px-4 py-2 text-sm font-bold text-zinc-800 shadow-sm">
            <span className="text-[#C9A227]">★</span>
            <span>{settings.ratingValue}</span>
            <span className="font-medium text-zinc-600">{settings.trustText}</span>
          </div>
        </div>

        <div className="flex gap-4 overflow-x-auto pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {settings.items.map((item) => (
            <ReviewCard key={item.id} item={item} guaranteeText={settings.guaranteeText} />
          ))}
        </div>
      </div>
    </section>
  );
}
