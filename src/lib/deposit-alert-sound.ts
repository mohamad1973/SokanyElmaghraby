/** Soft mobile-like notification chime for deposit bells (admin + CS). */

let audioUnlocked = false;
let sharedCtx: AudioContext | null = null;

function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  return (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ||
    null
  );
}

function getSharedContext(): AudioContext | null {
  const Ctx = getAudioContextCtor();
  if (!Ctx) return null;
  if (!sharedCtx || sharedCtx.state === "closed") {
    sharedCtx = new Ctx();
  }
  return sharedCtx;
}

export function unlockDepositAlertAudio() {
  if (typeof window === "undefined") return;
  audioUnlocked = true;
  try {
    const ctx = getSharedContext();
    if (!ctx) return;
    void ctx.resume();
  } catch {
    // ignore
  }
}

/** Two-tone sine chime similar to a phone notification. */
export function playLoudDepositAlert() {
  if (typeof window === "undefined") return;
  try {
    const ctx = getSharedContext();
    if (!ctx) return;
    void ctx.resume();

    const playTone = (startAt: number, freq: number, duration: number, peak = 0.35) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + duration + 0.05);
    };

    const t0 = ctx.currentTime;
    // Soft ascending chime (mobile-notification style)
    playTone(t0, 880, 0.18, 0.32);
    playTone(t0 + 0.16, 1174.7, 0.28, 0.38);
    playTone(t0 + 0.42, 1318.5, 0.22, 0.22);
  } catch {
    // ignore autoplay blocks until unlock
  }
}

export function ensureDepositAlertUnlockedOnGesture() {
  if (typeof window === "undefined" || audioUnlocked) return;
  const unlock = () => {
    unlockDepositAlertAudio();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
}
