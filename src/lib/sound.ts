/** Simple alert tone via Web Audio API — no external assets */

let lastPlayed = 0;

export function playOrefTone(force = false): void {
  const now = Date.now();
  if (!force && now - lastPlayed < 8000) return;
  lastPlayed = now;

  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.35);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.7);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 1.25);
    osc.onended = () => void ctx.close();
  } catch {
    /* ignore autoplay blocks */
  }
}
