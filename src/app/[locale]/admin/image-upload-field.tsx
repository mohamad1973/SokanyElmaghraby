"use client";

import Image from "next/image";
import { ChangeEvent, useState } from "react";

type ImageUploadFieldProps = {
  label: string;
  value: string;
  purpose: string;
  recommendation: string;
  aspectRatio: string;
  onUploaded: (url: string) => void;
};

const supportedFormats = "JPG, PNG, WEBP, SVG, GIF, AVIF";

function extractMediaId(url: string): number | null {
  const match = url.match(/\/api\/media\/(\d+)(?:\?|$)/);
  if (!match) {
    return null;
  }

  const id = Number(match[1]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function ImageUploadField({
  label,
  value,
  purpose,
  recommendation,
  aspectRatio,
  onUploaded,
}: ImageUploadFieldProps) {
  const [status, setStatus] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setStatus("");
    setIsUploading(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("purpose", purpose);

    const response = await fetch("/api/admin/upload", {
      method: "POST",
      body: formData,
    });

    setIsUploading(false);

    if (!response.ok) {
      const error = (await response.json()) as { message?: string };
      setStatus(error.message || "تعذر رفع الصورة.");
      return;
    }

    const result = (await response.json()) as { url: string };
    onUploaded(result.url);
    setStatus("تم رفع الصورة بنجاح.");
  }

  async function handleClear() {
    if (!value || isClearing) {
      return;
    }

    setIsClearing(true);
    setStatus("");

    const mediaId = extractMediaId(value);
    if (mediaId) {
      try {
        const response = await fetch(`/api/admin/media/${mediaId}`, { method: "DELETE" });
        if (!response.ok && response.status !== 404) {
          const error = (await response.json().catch(() => null)) as { message?: string } | null;
          setStatus(error?.message || "تعذر حذف الملف من قاعدة البيانات، لكن تم مسح الحقل.");
        }
      } catch {
        setStatus("تعذر حذف الملف من قاعدة البيانات، لكن تم مسح الحقل.");
      }
    }

    onUploaded("");
    setIsClearing(false);
    setStatus((prev) => prev || "تم مسح الملف. احفظ البنر لتثبيت التغيير.");
  }

  return (
    <div className="rounded-xl border border-black/10 bg-white p-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_180px]">
        <div className="space-y-3">
          <div>
            <p className="text-sm font-bold text-zinc-900">{label}</p>
            <p className="mt-1 text-xs leading-6 text-zinc-500">
              المقاس المقترح: {recommendation} | Aspect ratio: {aspectRatio}
            </p>
            <p className="text-xs text-zinc-500">الصيغ المتاحة: {supportedFormats}</p>
          </div>

          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/svg+xml,image/gif,image/avif"
            onChange={handleChange}
            className="block w-full rounded-xl border border-black/10 bg-zinc-50 px-4 py-3 text-sm"
          />

          <input
            value={value}
            onChange={(event) => onUploaded(event.target.value)}
            placeholder="/uploads/admin/image.webp"
            className="w-full rounded-xl border border-black/10 px-4 py-3 text-sm outline-none focus:border-brand-gold"
          />

          {isUploading ? <p className="text-xs text-zinc-500">جاري رفع الصورة...</p> : null}
          {isClearing ? <p className="text-xs text-zinc-500">جاري المسح...</p> : null}
          {status ? <p className="text-xs text-zinc-600">{status}</p> : null}
        </div>

        <div className="relative min-h-32 overflow-hidden rounded-xl bg-zinc-100">
          {value ? (
            <>
              <Image src={value} alt={label} fill sizes="180px" className="object-contain p-3" unoptimized />
              <button
                type="button"
                onClick={() => void handleClear()}
                disabled={isClearing}
                aria-label="مسح الصورة"
                className="absolute end-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/75 text-sm font-bold text-white transition hover:bg-red-600 disabled:opacity-60"
              >
                ×
              </button>
            </>
          ) : (
            <div className="flex h-full min-h-32 items-center justify-center p-4 text-center text-xs text-zinc-400">
              لا توجد صورة
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
