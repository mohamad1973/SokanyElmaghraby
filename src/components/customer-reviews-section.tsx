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

function ReviewCard({ item, guaranteeText }: { item: CustomerReviewItem; guaranteeText: string }) {
  const isGold = item.cardTone === "gold";
  const initial = item.name.trim().slice(0, 1) || "ع";
  const hasAudio = Boolean(item.audioUrl);
  const hasProduct = Boolean(item.productName || item.productImage);

  return (
    <article
      className={`flex min-w-[280px] max-w-[320px] shrink-0 flex-col rounded-[1.75rem] p-5 shadow-lg sm:min-w-[300px] ${
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
                  ✓ شراء مؤكد
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
              أطلبه الآن ←
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

export function CustomerReviewsSection({ settings }: { settings: CustomerReviewsSectionSettings }) {
  if (!settings.enabled || !settings.items.length) {
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

        <div className="flex gap-4 overflow-x-auto pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {settings.items.map((item) => (
            <ReviewCard key={item.id} item={item} guaranteeText={settings.guaranteeText} />
          ))}
        </div>
      </div>
    </section>
  );
}
