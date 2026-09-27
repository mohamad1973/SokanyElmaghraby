"use client";

import { useEffect, useRef, useState } from "react";

type ScanResult = { ok: boolean; already?: boolean; message: string };

let scanAudio: AudioContext | null = null;

function scanAudioContext() {
  if (typeof window === "undefined") return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!scanAudio || scanAudio.state === "closed") scanAudio = new Ctx();
  return scanAudio;
}

function unlockScanAudio() {
  const ctx = scanAudioContext();
  if (!ctx) return;
  void ctx.resume();
}

function playScanBeep() {
  try {
    const ctx = scanAudioContext();
    if (!ctx) return;
    void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = ctx.currentTime;
    osc.type = "square";
    osc.frequency.value = 1800;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.25, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.16);
    navigator.vibrate?.(90);
  } catch {
    // Autoplay stays blocked until the scan button unlocks audio.
  }
}

function stopStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((track) => track.stop());
}

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
  const streamPromiseRef = useRef<Promise<MediaStream> | null>(null);
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

  function acceptScan(raw: string) {
    const code = raw.trim().replace(/\s+/g, "");
    if (!code || busyRef.current) return;
    const now = Date.now();
    if (lastRef.current.code === code && now - lastRef.current.at < 4000) return;
    playScanBeep();
    void submit(raw);
  }

  useEffect(() => {
    if (!cameraOn) return;
    const video = videoRef.current;
    const pending = streamPromiseRef.current;
    if (!video || !pending) return;
    let stopped = false;
    let controls: { stop: () => void } | null = null;
    void (async () => {
      try {
        let stream = await pending;
        if (stopped) {
          stopStream(stream);
          return;
        }
        const facing = stream.getVideoTracks()[0]?.getSettings().facingMode;
        if (facing && facing !== "environment") {
          stopStream(stream);
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: false,
              video: { facingMode: { exact: "environment" } },
            });
          } catch {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const back = devices.find((device) => device.kind === "videoinput" && /back|rear|environment|wide/i.test(device.label));
            stream = await navigator.mediaDevices.getUserMedia({
              audio: false,
              video: back ? { deviceId: { exact: back.deviceId } } : { facingMode: "environment" },
            });
          }
        }
        if (stopped) {
          stopStream(stream);
          return;
        }
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const { BarcodeFormat, DecodeHintType } = await import("@zxing/library");
        if (stopped) {
          stopStream(stream);
          return;
        }
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.QR_CODE,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);
        const reader = new BrowserMultiFormatReader(hints);
        controls = await reader.decodeFromStream(stream, video, (found) => {
          const text = found?.getText?.();
          if (text) acceptScan(text);
        });
        if (stopped) controls?.stop();
      } catch {
        if (!stopped) {
          setCameraError("الكاميرا مش متاحة. اكتب رقم التراك.");
          setCameraOn(false);
        }
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
        <video ref={videoRef} muted autoPlay playsInline className="aspect-[3/4] w-full rounded-xl bg-black object-cover sm:aspect-video" />
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            if (cameraOn) {
              setCameraOn(false);
              return;
            }
            unlockScanAudio();
            setCameraError("");
            streamPromiseRef.current = navigator.mediaDevices.getUserMedia({
              audio: false,
              video: { facingMode: { ideal: "environment" } },
            });
            setCameraOn(true);
          }}
          className="rounded-xl bg-[#14213D] px-3 py-2 text-sm font-extrabold text-white"
        >
          {cameraOn ? "إيقاف" : "سكان"}
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
