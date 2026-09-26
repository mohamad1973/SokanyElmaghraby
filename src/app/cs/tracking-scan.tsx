"use client";

import { useEffect, useRef, useState } from "react";

type ScanResult = { ok: boolean; already?: boolean; message: string };

export function TrackingScanBox({
  action,
  courierId,
  title,
  hint,
}: {
  action: "handoff" | "deliver";
  courierId?: number | null;
  title: string;
  hint: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const busyRef = useRef(false);
  const actionRef = useRef(action);
  const courierRef = useRef(courierId);
  actionRef.current = action;
  courierRef.current = courierId;
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [manual, setManual] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);

  async function submit(raw: string) {
    const code = raw.trim().replace(/\s+/g, "");
    if (!code || busyRef.current) return;
    const now = Date.now();
    if (lastRef.current.code === code && now - lastRef.current.at < 4000) return;
    lastRef.current = { code, at: now };
    busyRef.current = true;
    try {
      const res = await fetch("/api/cs/temima-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackingNumber: code,
          action: actionRef.current,
          courierId: courierRef.current || undefined,
        }),
      });
      const data = (await res.json()) as ScanResult & { message?: string };
      if (!res.ok) lastRef.current = { code: "", at: 0 };
      setResult({
        ok: res.ok && data.ok !== false,
        already: Boolean(data.already),
        message: data.message || (res.ok ? "تم." : "تعذر المسح."),
      });
    } catch {
      setResult({ ok: false, message: "تعذر الاتصال." });
    } finally {
      busyRef.current = false;
    }
  }

  useEffect(() => {
    if (!cameraOn) return;
    const video = videoRef.current;
    if (!video) return;
    let stopped = false;
    let controls: { stop: () => void } | null = null;
    void (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (stopped) return;
        const reader = new BrowserMultiFormatReader();
        controls = await reader.decodeFromVideoDevice(undefined, video, (found) => {
          const text = found?.getText();
          if (text) void submit(text);
        });
        if (stopped) controls.stop();
      } catch {
        if (!stopped) setCameraError("الكاميرا مش متاحة. اكتب رقم التراك.");
        setCameraOn(false);
      }
    })();
    return () => {
      stopped = true;
      controls?.stop();
    };
  }, [cameraOn]);

  const tone = !result
    ? "bg-[#F5F5F0] text-[#14213D]"
    : result.ok && !result.already
      ? "bg-emerald-100 text-emerald-900"
      : result.already
        ? "bg-amber-100 text-amber-950"
        : "bg-red-100 text-red-800";

  return (
    <section className="grid gap-3 rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10">
      <div>
        <h2 className="text-lg font-extrabold text-[#14213D]">{title}</h2>
        <p className="mt-1 text-xs font-bold text-[#14213D]/60">{hint}</p>
      </div>
      {cameraOn ? (
        <video ref={videoRef} muted playsInline className="aspect-[3/4] w-full rounded-xl bg-black object-cover sm:aspect-video" />
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setCameraError("");
            setCameraOn((on) => !on);
          }}
          className="rounded-xl bg-[#14213D] px-3 py-2 text-sm font-extrabold text-white"
        >
          {cameraOn ? "إيقاف الكاميرا" : "فتح الكاميرا"}
        </button>
      </div>
      {cameraError ? <p className="text-sm font-bold text-red-800">{cameraError}</p> : null}
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(manual);
          setManual("");
        }}
      >
        <input
          value={manual}
          onChange={(event) => setManual(event.target.value)}
          placeholder="رقم التراك"
          dir="ltr"
          className="min-w-0 flex-1 rounded-xl border border-[#E5E5E5] px-3 py-2 text-sm font-bold"
        />
        <button type="submit" className="rounded-xl bg-[#FCA311] px-3 py-2 text-sm font-extrabold text-black">
          تسجيل
        </button>
      </form>
      {result ? <p className={`rounded-xl px-3 py-2 text-sm font-extrabold ${tone}`}>{result.message}</p> : null}
    </section>
  );
}
