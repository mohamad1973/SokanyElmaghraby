"use client";

import { useEffect, useRef, useState } from "react";

type Receipt = { received: number; expected: number; matched: boolean };
type ScanResult = { ok: boolean; already?: boolean; message: string; receipt?: Receipt };

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
    gain.gain.exponentialRampToValueAtTime(0.4, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.2);
    navigator.vibrate?.(120);
  } catch {
    // The scan button unlocks audio on Android.
  }
}

function stopStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((track) => track.stop());
}

type DetectedBarcode = { rawValue?: string };
type BarcodeDetectorLike = { detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]> };

function createAndroidDetector(): BarcodeDetectorLike | null {
  const Ctor = (window as unknown as { BarcodeDetector?: new (opts: { formats: string[] }) => BarcodeDetectorLike }).BarcodeDetector;
  if (!Ctor) return null;
  try {
    return new Ctor({ formats: ["code_128", "code_39", "qr_code"] });
  } catch {
    return null;
  }
}

async function openBackCamera() {
  const attempts: MediaStreamConstraints[] = [
    { audio: false, video: { facingMode: { exact: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } },
    { audio: false, video: { facingMode: "environment" } },
  ];
  let lastError: unknown;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      lastError = error;
    }
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  const back = devices.find((device) => device.kind === "videoinput" && /back|rear|environment|wide/i.test(device.label));
  if (!back) throw lastError;
  return navigator.mediaDevices.getUserMedia({ audio: false, video: { deviceId: { exact: back.deviceId } } });
}

export function TrackingScanBox({
  action,
  courierId,
  title,
  hint,
  initialReceipt,
  autoStart = false,
}: {
  action: "handoff" | "deliver";
  courierId?: number | null;
  title: string;
  hint: string;
  initialReceipt?: Receipt | null;
  autoStart?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const busyRef = useRef(false);
  const actionRef = useRef(action);
  const courierRef = useRef(courierId);
  const acceptRef = useRef<(raw: string) => void>(() => undefined);
  const openedByTap = useRef(false);
  actionRef.current = action;
  courierRef.current = courierId;
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [manual, setManual] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(initialReceipt || null);

  async function submit(raw: string) {
    const code = raw.trim().replace(/\s+/g, "");
    if (!code || busyRef.current) return;
    const now = Date.now();
    if (lastRef.current.code === code && now - lastRef.current.at < 2500) return;
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
      const ok = res.ok && data.ok !== false;
      if (!ok) lastRef.current = { code: "", at: 0 };
      else playScanBeep();
      if (data.receipt) setReceipt(data.receipt);
      setResult({
        ok,
        already: Boolean(data.already),
        message: data.message || (ok ? "السكان سليم." : "تعذر المسح."),
        receipt: data.receipt,
      });
    } catch {
      setResult({ ok: false, message: "تعذر الاتصال." });
    } finally {
      busyRef.current = false;
    }
  }

  acceptRef.current = (raw: string) => {
    void submit(raw);
  };

  function startCamera(fromTap: boolean) {
    if (fromTap) openedByTap.current = true;
    unlockScanAudio();
    setCameraError("");
    setCameraOn(true);
  }

  useEffect(() => {
    if (!autoStart) return;
    startCamera(false);
  }, [autoStart]);

  useEffect(() => {
    if (!cameraOn) return;
    const video = videoRef.current;
    if (!video) return;
    let stopped = false;
    let controls: { stop: () => void } | null = null;
    let timer = 0;
    void (async () => {
      try {
        const stream = await openBackCamera();
        if (stopped) {
          stopStream(stream);
          return;
        }
        const track = stream.getVideoTracks()[0];
        try {
          await track?.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] });
        } catch {
          // Some Android cameras ignore continuous focus.
        }
        video.srcObject = stream;
        await video.play();
        const detector = createAndroidDetector();
        if (detector) {
          const tick = async () => {
            if (stopped) return;
            try {
              const codes = await detector.detect(video);
              const text = codes.find((code) => code.rawValue)?.rawValue;
              if (text) acceptRef.current(text);
            } catch {
              // Keep the camera open and try the next frame.
            }
            timer = window.setTimeout(() => void tick(), 180);
          };
          void tick();
          controls = { stop: () => stopStream(stream) };
          return;
        }
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const { BarcodeFormat, DecodeHintType } = await import("@zxing/library");
        if (stopped) {
          stopStream(stream);
          return;
        }
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.QR_CODE]);
        hints.set(DecodeHintType.TRY_HARDER, true);
        const reader = new BrowserMultiFormatReader(hints);
        controls = await reader.decodeFromStream(stream, video, (found) => {
          const text = found?.getText?.();
          if (text) acceptRef.current(text);
        });
        if (stopped) controls?.stop();
      } catch {
        if (!stopped) {
          setCameraOn(false);
          if (openedByTap.current) setCameraError("الكاميرا مش متاحة. اكتب رقم التراك.");
        }
      }
    })();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      controls?.stop();
      stopStream(video.srcObject instanceof MediaStream ? video.srcObject : null);
    };
  }, [cameraOn]);

  const remaining = receipt ? Math.max(0, receipt.expected - receipt.received) : null;
  const complete = receipt != null && receipt.expected > 0 && remaining === 0;
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
      {receipt && action === "handoff" ? (
        <div className={`rounded-2xl px-4 py-3 text-center ${complete ? "bg-emerald-600 text-white" : "bg-[#14213D] text-white"}`}>
          <p className="text-sm font-extrabold">{complete ? "تم التسليم بالكامل" : "السكان"}</p>
          <p className="mt-1 text-2xl font-extrabold">الأصل {receipt.expected}</p>
          <p className="text-lg font-extrabold">الباقي {remaining}</p>
        </div>
      ) : null}
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
            startCamera(true);
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
          unlockScanAudio();
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
      {result?.ok && !result.already ? <p className="rounded-xl bg-emerald-600 px-3 py-2 text-center text-sm font-extrabold text-white">السكان سليم</p> : null}
      {result ? <p className={`rounded-xl px-3 py-2 text-sm font-extrabold ${tone}`}>{result.message}</p> : null}
    </section>
  );
}
