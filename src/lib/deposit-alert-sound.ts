/** Loud multi-beep alert for deposit bells (admin + CS). */

let audioUnlocked = false;

export function unlockDepositAlertAudio() {
  if (typeof window === "undefined") return;
  audioUnlocked = true;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    void ctx.resume();
    void ctx.close();
  } catch {
    // ignore
  }
}

export function playLoudDepositAlert() {
  if (typeof window === "undefined") return;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    void ctx.resume();

    const playBeep = (startAt: number, freq: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.55, startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + duration + 0.02);
    };

    const t0 = ctx.currentTime;
    // Three loud ascending beeps
    playBeep(t0, 880, 0.22);
    playBeep(t0 + 0.28, 1100, 0.22);
    playBeep(t0 + 0.56, 1320, 0.28);

    window.setTimeout(() => {
      void ctx.close();
    }, 1200);
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
