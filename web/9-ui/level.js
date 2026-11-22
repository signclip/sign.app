// level.js — the sound level on the audio arc (21.11., user: bring the level back; 15.11.: audio on = the level shows,
// also before a take).
//
// Purpose:   every 100 ms the loudness of the camera's sound, on a dB scale, as the width of 20 short pieces along the
//            audio arc: the newest at the arc's upper end, older ones flowing down and fading. Only those pieces change;
//            nothing is painted again (paint.js draws them, `soundSvg`).
// In / out:  levelOf(rms) → 0…1 · levelMeter(A) → stop()
// Limits:    −60 dB = 0, −12 dB = 1 · 20 pieces = the last 2 s · one AudioContext · runs only while the audio strand is on
//            and the camera has a sound track; otherwise the pieces are not seen.
// Depends:   browser (Web Audio); A.take.camera, A.st.strands, A.L

export const PIECES = 20;
const FLOOR = -60, TOP = -12;

/** Loudness (RMS of samples −1…1) → 0…1 on a dB scale. */
export function levelOf(rms) {
  if (!(rms > 0)) return 0;
  return Math.max(0, Math.min(1, (20 * Math.log10(rms) - FLOOR) / (TOP - FLOOR)));
}

/** Watches the camera's sound while the audio strand is on and sets the pieces on the arc. → stop() */
export function levelMeter(A, { every = 100 } = {}) {
  let ctx = null, analyser = null, source = null, stream = null, samples = null;
  const levels = new Array(PIECES).fill(0);
  function hook(s) {
    source?.disconnect(); source = null; stream = s;
    if (!s?.getAudioTracks?.().length) return;
    ctx ??= new AudioContext();
    analyser ??= Object.assign(ctx.createAnalyser(), { fftSize: 1024 });
    samples ??= new Float32Array(analyser.fftSize);
    source = ctx.createMediaStreamSource(s); source.connect(analyser);
  }
  const timer = setInterval(() => {
    const s = A.st.strands.a ? A.take?.camera ?? null : null;
    if (s !== stream) hook(s);
    let level = 0;
    if (source) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      analyser.getFloatTimeDomainData(samples);
      level = levelOf(Math.sqrt(samples.reduce((n, v) => n + v * v, 0) / samples.length));
    }
    levels.pop(); levels.unshift(level);
    const k = A.L?.k ?? 1;
    document.querySelectorAll('#take .sound path').forEach((p, i) => {
      const v = levels[i] ?? 0;
      p.style.strokeWidth = `${((4 + 12 * v) * k).toFixed(1)}px`;
      p.style.opacity = v > 0.02 ? (1 - i / (PIECES + 4)).toFixed(2) : '0';
    });
  }, every);
  return () => { clearInterval(timer); source?.disconnect(); ctx?.close().catch(() => {}); };
}
