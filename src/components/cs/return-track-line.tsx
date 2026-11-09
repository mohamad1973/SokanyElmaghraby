"use client";

import { useEffect, useState } from "react";

import { formatCairoOrderDateTime } from "@/lib/cs/order-window";

export type ReturnTrackPointClient = {
  stage: string;
  label: string;
  at: string | null;
  state: "done" | "current" | "upcoming";
  detail?: string;
};

type TrackPayload = {
  ok: boolean;
  applicable?: boolean;
  message?: string;
  trackingNumber?: string;
  currentLabel?: string;
  points?: ReturnTrackPointClient[];
};

export function ReturnTrackLine({
  trackingNumber,
  confirmationId,
  compact = false,
  className = "",
  /** When false, skip fetch (normal sale orders). When true/undefined, let API decide. */
  forceShow,
}: {
  trackingNumber?: string | null;
  confirmationId?: number | null;
  compact?: boolean;
  className?: string;
  forceShow?: boolean;
}) {
  const tracking = String(trackingNumber || "").trim();
  const confId = confirmationId && confirmationId > 0 ? confirmationId : 0;
  const [payload, setPayload] = useState<TrackPayload | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (forceShow === false) {
      setPayload({ ok: false, applicable: false });
      return;
    }
    if (!tracking && !confId) {
      setPayload(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    if (tracking) params.set("trackingNumber", tracking);
    if (confId) params.set("confirmationId", String(confId));
    void fetch(`/api/cs/returns/track?${params}`)
      .then(async (response) => {
        const body = (await response.json()) as TrackPayload;
        if (!cancelled) setPayload(body);
      })
      .catch(() => {
        if (!cancelled) setPayload({ ok: false, applicable: true, message: "تعذر تحميل مسار المرتجع." });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tracking, confId, forceShow]);

  if (forceShow === false) return null;
  if (!tracking && !confId) return null;
  if (!loading && payload && payload.applicable === false) return null;

  const points = payload?.points || [];

  return (
    <section
      className={`rounded-2xl bg-white p-3 shadow ring-1 ring-[#14213D]/15 ${className}`}
      dir="rtl"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-extrabold text-[#14213D]">مسار المرتجع</p>
        {payload?.trackingNumber || tracking ? (
          <p className="text-xs font-bold text-[#14213D]/70" dir="ltr">
            {payload?.trackingNumber || tracking}
          </p>
        ) : null}
      </div>
      {loading ? (
        <p className="mt-2 text-xs font-bold text-[#14213D]/50">جارٍ التحميل…</p>
      ) : !payload?.ok ? (
        <p className="mt-2 text-xs font-bold text-[#14213D]/60">
          {payload?.message || "مفيش مسار مرتجع لهذا الأوردر."}
        </p>
      ) : (
        <>
          {payload.currentLabel ? (
            <p className="mt-1 text-xs font-bold text-[#14213D]/70">الآن: {payload.currentLabel}</p>
          ) : null}
          <div className="relative mt-3 overflow-x-auto pb-1">
            <div className="pointer-events-none absolute inset-x-6 top-3.5 h-0.5 bg-[#14213D]/15" />
            <ol className="relative flex gap-1">
              {points.map((point, index) => {
                const done = point.state === "done";
                const current = point.state === "current";
                return (
                  <li key={`${point.stage}-${index}`} className="flex min-w-[5.5rem] flex-1 flex-col items-center text-center">
                    <span
                      className={`relative z-10 grid size-7 place-items-center rounded-full text-[11px] font-extrabold ${
                        current
                          ? "bg-[#FCA311] text-black ring-2 ring-[#14213D]"
                          : done
                            ? "bg-[#14213D] text-white"
                            : "bg-[#E5E5E5] text-[#14213D]/40"
                      }`}
                    >
                      {done ? "✓" : index + 1}
                    </span>
                    <span
                      className={`mt-1 text-[10px] font-extrabold leading-4 ${
                        current || done ? "text-[#14213D]" : "text-[#14213D]/40"
                      }`}
                    >
                      {point.label}
                    </span>
                    {point.detail ? (
                      <span className="mt-0.5 text-[9px] font-bold text-[#14213D]/55">{point.detail}</span>
                    ) : null}
                    {point.at ? (
                      <span className="mt-0.5 text-[9px] font-bold text-[#14213D]/55">
                        {formatCairoOrderDateTime(point.at).absolute}
                      </span>
                    ) : current ? (
                      <span className="mt-0.5 text-[9px] font-bold text-[#14213D]">الآن</span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </div>
        </>
      )}
    </section>
  );
}

/** Compact toggle used in maintenance tables. */
export function ReturnTrackDrawer({
  trackingNumber,
  confirmationId,
}: {
  trackingNumber: string;
  confirmationId?: number | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-full bg-[#F5F5F0] px-2.5 py-1 text-[10px] font-extrabold text-[#14213D] ring-1 ring-black/10"
      >
        {open ? "إخفاء المسار" : "مسار"}
      </button>
      {open ? (
        <ReturnTrackLine
          trackingNumber={trackingNumber}
          confirmationId={confirmationId}
          compact
          forceShow
        />
      ) : null}
    </div>
  );
}
