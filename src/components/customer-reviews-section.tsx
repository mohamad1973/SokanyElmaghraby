"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { CustomerReviewItem, CustomerReviewsSectionSettings } from "@/lib/theme-settings";

import { VisualEditableText } from "./visual-editable-text";

function AudioReviewPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

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
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/20 text-lg font-bold text-white transition hover:bg-white/30"
          aria-label={playing ? "إيقاف" : "تشغيل الرأي الصوتي"}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/25">
          <div className="h-full rounded-full bg-white transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </div>
  );
}

function ReviewCard({ item, guaranteeText }: { item: CustomerReviewItem; guaranteeText: string }) {
  const bg = item.cardTone === "orange" ? "bg-[#f07a2a]" : "bg-[#1b2a4a]";
  const initial = item.name.trim().slice(0, 1) || "ع";

  return (
    <article className={`flex min-w-[280px] max-w-[320px] shrink-0 flex-col rounded-[1.75rem] p-5 text-white shadow-lg sm:min-w-[300px] ${bg}`}>
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/20 text-lg font-bold">
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold">{item.name}</p>
          <p className="mt-1 text-sm tracking-wide text-white/90">{"★".repeat(Math.max(1, item.rating))}</p>
          {item.verified ? (
            <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-[11px] font-bold">
              ✓ شراء مؤكد
            </span>
          ) : null}
        </div>
      </div>

      {item.audioUrl ? (
        <AudioReviewPlayer src={item.audioUrl} />
      ) : item.text ? (
        <p className="mt-4 text-sm leading-7 text-white/95">{item.text}</p>
      ) : (
        <p className="mt-4 text-sm text-white/70">رأي صوتي / نصي قريباً</p>
      )}

      {(item.productName || item.productImage) && (
        <div className="mt-5 flex items-center gap-3 rounded-2xl bg-white p-3 text-zinc-950">
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-zinc-100">
            {item.productImage ? (
              <Image src={item.productImage} alt={item.productName || ""} fill className="object-contain p-1" sizes="48px" unoptimized />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{item.productName || "منتج سوكاني"}</p>
            <Link href={item.productUrl || "/shop"} className="mt-1 inline-flex text-xs font-bold text-sky-700 hover:underline">
              أطلبه الآن ←
            </Link>
          </div>
        </div>
      )}

      <p className="mt-4 text-center text-xs font-semibold text-white/85">{guaranteeText}</p>
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
          <div className="rounded-full border-2 border-orange-400 bg-white px-6 py-2 text-base font-bold text-zinc-950 shadow-sm">
            <VisualEditableText textKey="home.customerReviews.title">{settings.title}</VisualEditableText>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-zinc-800 shadow-sm">
            <span className="text-amber-500">★</span>
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
