"use client";

import { useState } from "react";

import type { CustomerReviewItem, CustomerReviewsSectionSettings, ThemeSettings } from "@/lib/theme-settings";

type ReviewsSettingsFormProps = {
  initialSettings: ThemeSettings;
};

const fallbackReviews: CustomerReviewsSectionSettings = {
  enabled: true,
  title: "آراء عملاء سوكاني",
  ratingValue: "4.9",
  trustText: "أكثر من آلاف العملاء وثقوا فينا",
  guaranteeText: "ضمان استبدال واسترجاع 14 يوم",
  items: [],
};

function createEmptyReview(): CustomerReviewItem {
  return {
    id: `review-${Date.now()}`,
    name: "",
    rating: 5,
    text: "",
    audioUrl: "",
    productName: "",
    productUrl: "/shop",
    productImage: "",
    verified: true,
    cardTone: "black",
  };
}

function normalizeCardTone(value: string): CustomerReviewItem["cardTone"] {
  if (value === "gold" || value === "orange") {
    return "gold";
  }
  return "black";
}

export function ReviewsSettingsForm({ initialSettings }: ReviewsSettingsFormProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState("");

  const reviews = settings.sections.customerReviews || fallbackReviews;

  function updateReviews(next: Partial<typeof reviews>) {
    setSettings({
      ...settings,
      sections: {
        ...settings.sections,
        customerReviews: { ...reviews, ...next },
      },
    });
  }

  function updateItem(index: number, patch: Partial<CustomerReviewItem>) {
    const items = reviews.items.map((item, itemIndex) =>
      itemIndex === index ? { ...item, ...patch } : item,
    );
    updateReviews({ items });
  }

  async function uploadFile(file: File, purpose: string): Promise<string | null> {
    setIsUploading(true);
    setMessage("جارٍ رفع الملف…");
    const formData = new FormData();
    formData.set("file", file);
    formData.set("purpose", purpose);
    const response = await fetch("/api/admin/upload", { method: "POST", body: formData });
    const payload = (await response.json().catch(() => null)) as { url?: string; message?: string } | null;
    setIsUploading(false);

    if (!response.ok || !payload?.url) {
      setMessage(payload?.message || "تعذر رفع الملف.");
      return null;
    }

    setMessage(`تم الرفع بنجاح. اضغط «حفظ التغييرات» لتثبيت الرابط: ${payload.url}`);
    return payload.url;
  }

  async function save() {
    setIsSaving(true);
    setMessage("");
    const response = await fetch("/api/admin/theme-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setIsSaving(false);
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      setMessage(payload?.message || "تعذر الحفظ.");
      return;
    }
    setMessage("تم حفظ آراء العملاء بنجاح.");
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-3xl font-bold text-zinc-950">آراء العملاء</h1>
        <p className="mt-2 text-sm text-zinc-600">
          تحكم في سكشن الآراء على الرئيسية — نص أو تسجيل صوتي لكل رأي. بعد رفع صورة/صوت اضغط حفظ التغييرات.
        </p>
      </div>

      <section className="grid gap-4 rounded-xl border border-black/10 bg-white p-6 shadow-sm lg:grid-cols-2">
        <label className="flex items-center gap-3 text-sm font-bold">
          <input
            type="checkbox"
            checked={reviews.enabled}
            onChange={(event) => updateReviews({ enabled: event.target.checked })}
          />
          تفعيل السكشن
        </label>
        <label className="grid gap-1 text-sm font-bold">
          العنوان
          <input
            value={reviews.title}
            onChange={(event) => updateReviews({ title: event.target.value })}
            className="rounded-xl border border-black/10 px-3 py-2"
          />
        </label>
        <label className="grid gap-1 text-sm font-bold">
          التقييم المعروض
          <input
            value={reviews.ratingValue}
            onChange={(event) => updateReviews({ ratingValue: event.target.value })}
            className="rounded-xl border border-black/10 px-3 py-2"
          />
        </label>
        <label className="grid gap-1 text-sm font-bold">
          نص الثقة
          <input
            value={reviews.trustText}
            onChange={(event) => updateReviews({ trustText: event.target.value })}
            className="rounded-xl border border-black/10 px-3 py-2"
          />
        </label>
        <label className="grid gap-1 text-sm font-bold lg:col-span-2">
          نص الضمان أسفل الكارت
          <input
            value={reviews.guaranteeText}
            onChange={(event) => updateReviews({ guaranteeText: event.target.value })}
            className="rounded-xl border border-black/10 px-3 py-2"
          />
        </label>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">قائمة الآراء</h2>
        <button
          type="button"
          onClick={() => updateReviews({ items: [...reviews.items, createEmptyReview()] })}
          className="rounded-full bg-brand-gold px-4 py-2 text-sm font-bold text-black"
        >
          إضافة رأي
        </button>
      </div>

      {reviews.items.map((item, index) => (
        <article key={item.id} className="grid gap-4 rounded-xl border border-black/10 bg-white p-5 shadow-sm lg:grid-cols-2">
          <label className="grid gap-1 text-sm font-bold">
            اسم العميل
            <input
              value={item.name}
              onChange={(event) => updateItem(index, { name: event.target.value })}
              className="rounded-xl border border-black/10 px-3 py-2"
            />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            التقييم (1–5)
            <input
              type="number"
              min={1}
              max={5}
              value={item.rating}
              onChange={(event) => updateItem(index, { rating: Number(event.target.value) || 5 })}
              className="rounded-xl border border-black/10 px-3 py-2"
            />
          </label>
          <label className="grid gap-1 text-sm font-bold lg:col-span-2">
            نص الرأي (يظهر إن لم يوجد صوت)
            <textarea
              value={item.text}
              onChange={(event) => updateItem(index, { text: event.target.value })}
              className="min-h-24 rounded-xl border border-black/10 px-3 py-2"
            />
          </label>
          <label className="grid gap-1 text-sm font-bold lg:col-span-2">
            تسجيل صوتي
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={item.audioUrl}
                onChange={(event) => updateItem(index, { audioUrl: event.target.value })}
                className="min-w-[220px] flex-1 rounded-xl border border-black/10 px-3 py-2"
                placeholder="رابط الصوت أو ارفع ملفاً"
                dir="ltr"
              />
              <label className="cursor-pointer rounded-full bg-zinc-100 px-3 py-2 text-xs font-bold disabled:opacity-50">
                {isUploading ? "جار الرفع…" : "رفع صوت"}
                <input
                  type="file"
                  accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.webm"
                  className="hidden"
                  disabled={isUploading}
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    const url = await uploadFile(file, "review-audio");
                    if (url) updateItem(index, { audioUrl: url });
                  }}
                />
              </label>
            </div>
          </label>
          <label className="grid gap-1 text-sm font-bold">
            اسم المنتج
            <input
              value={item.productName}
              onChange={(event) => updateItem(index, { productName: event.target.value })}
              className="rounded-xl border border-black/10 px-3 py-2"
            />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            رابط المنتج
            <input
              value={item.productUrl}
              onChange={(event) => updateItem(index, { productUrl: event.target.value })}
              className="rounded-xl border border-black/10 px-3 py-2"
              dir="ltr"
            />
          </label>
          <label className="grid gap-1 text-sm font-bold lg:col-span-2">
            صورة المنتج
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={item.productImage}
                onChange={(event) => updateItem(index, { productImage: event.target.value })}
                className="min-w-[220px] flex-1 rounded-xl border border-black/10 px-3 py-2"
                dir="ltr"
              />
              <label className="cursor-pointer rounded-full bg-zinc-100 px-3 py-2 text-xs font-bold">
                {isUploading ? "جار الرفع…" : "رفع صورة"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={isUploading}
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    const url = await uploadFile(file, "review-product");
                    if (url) updateItem(index, { productImage: url });
                  }}
                />
              </label>
            </div>
            {item.productImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.productImage} alt="" className="mt-2 h-16 w-16 rounded-xl object-contain ring-1 ring-black/10" />
            ) : null}
          </label>
          <label className="flex items-center gap-2 text-sm font-bold">
            <input
              type="checkbox"
              checked={item.verified}
              onChange={(event) => updateItem(index, { verified: event.target.checked })}
            />
            شراء مؤكد
          </label>
          <label className="grid gap-1 text-sm font-bold">
            لون الكارت
            <select
              value={normalizeCardTone(item.cardTone)}
              onChange={(event) => updateItem(index, { cardTone: normalizeCardTone(event.target.value) })}
              className="rounded-xl border border-black/10 px-3 py-2"
            >
              <option value="black">أسود بذهبي</option>
              <option value="gold">ذهبي بأسود</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => updateReviews({ items: reviews.items.filter((_, i) => i !== index) })}
            className="text-sm font-bold text-red-600 lg:col-span-2"
          >
            حذف هذا الرأي
          </button>
        </article>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={isSaving || isUploading}
          onClick={save}
          className="rounded-full bg-black px-6 py-3 text-sm font-bold text-white disabled:opacity-50"
        >
          {isSaving ? "جار الحفظ..." : "حفظ التغييرات"}
        </button>
        {message ? <p className="text-sm font-bold text-zinc-700">{message}</p> : null}
      </div>
    </div>
  );
}
