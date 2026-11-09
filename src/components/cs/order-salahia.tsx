"use client";

import { useCallback, useEffect, useState } from "react";

import { formatCairoOrderDateTime } from "@/lib/cs/order-window";

type ActivityEvent = {
  id: number;
  actorName: string;
  actionLabel: string;
  detail: string;
  at: string;
};

export function OrderSalahiaChip({ confirmationId }: { confirmationId: number }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [events, setEvents] = useState<ActivityEvent[]>([]);

  const load = useCallback(async () => {
    if (!confirmationId) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/cs/confirmations/${confirmationId}/activity`);
      const data = (await res.json()) as { events?: ActivityEvent[]; message?: string };
      if (!res.ok) {
        setError(data.message || "تعذر تحميل السجل.");
        setEvents([]);
        return;
      }
      setEvents(data.events || []);
    } catch {
      setError("تعذر تحميل السجل.");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [confirmationId]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className="rounded px-1.5 py-0.5 text-[10px] font-extrabold text-[#14213D]"
        style={{ backgroundColor: "#FFF200" }}
        title="قصة حياة الأوردر"
      >
        صلاحية
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl"
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#E5E5E5] px-4 py-3">
              <h2 className="text-base font-extrabold text-[#14213D]">صلاحية · قصة حياة الأوردر</h2>
              <button
                type="button"
                className="rounded-lg bg-[#E5E5E5] px-2 py-1 text-xs font-extrabold text-[#14213D]"
                onClick={() => setOpen(false)}
              >
                إغلاق
              </button>
            </div>
            <div className="max-h-[65vh] overflow-y-auto px-4 py-3">
              {loading ? (
                <p className="text-sm font-bold text-[#14213D]/70">جاري التحميل...</p>
              ) : error ? (
                <p className="text-sm font-bold text-red-700">{error}</p>
              ) : events.length === 0 ? (
                <p className="text-sm font-bold text-[#14213D]/70">لسه مفيش سجل نشاط على الأوردر ده.</p>
              ) : (
                <ul className="space-y-2">
                  {events.map((event) => (
                    <li
                      key={event.id}
                      className="rounded-xl bg-[#F5F5F0] px-3 py-2 text-sm font-bold text-[#14213D]"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-extrabold">{event.actorName}</span>
                        <span className="text-[11px] text-[#14213D]/65" dir="ltr">
                          {formatCairoOrderDateTime(event.at).absolute}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-[#14213D]/80">
                        {event.actionLabel}
                        {event.detail ? ` · ${event.detail}` : ""}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
