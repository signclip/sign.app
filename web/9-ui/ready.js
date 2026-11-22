// ready.js — is there motion or sound right now? Every 100 ms one event.
//
// Purpose:   feeds settings.readyStep() and calm.js (the series: stillness ends a take, motion arms the next start, a ring
//            in the button shows motion now). Motion (21.11., steadier after the phone test): brightness of the middle of
//            the picture (the 1:1 take, inner 80 %) in 40×40, compared with the last frame; the whole picture getting
//            brighter or darker (exposure, light) is taken out; a pixel counts when it changed more than the picture's own
//            noise (its quiet third) – so a dim room and a grainy camera count the same; on above 1.5 % of the pixels, off
//            below 0.6 %, and it stays on 0.3 s after the last motion (slow signs do not flicker into stillness).
//            Sound = loudness (RMS) of the microphone.
// Depends:   browser (canvas, AudioContext)
// Test:      motionOf in tests/ui.test.mjs (pictures as numbers); the camera on a phone.
// Limits:    ~1 % CPU on a phone; thresholds to tune on the phone: ON 1.5 %, OFF 0.6 %, a pixel ≥ 6 brightness levels
//            and ≥ 3× the noise; sound > RMS 0.02 · pre-roll needs a running recorder and comes with the native app.

const EVERY_MS = 100, SIDE = 40, ON = 0.015, OFF = 0.006, HOLD = 3, SOUND = 0.02;

/**
 * How much of a picture changed against the last one (both: brightness per pixel, same length): → 0…1. The mean change
 * (light, exposure) is taken out; a pixel counts above max(6, 3 × the quiet third's change + 2).
 */
export function motionOf(now, last) {
  const n = now.length, d = new Float32Array(n);
  let mean = 0;
  for (let i = 0; i < n; i++) mean += now[i] - last[i];
  mean /= n;
  for (let i = 0; i < n; i++) d[i] = Math.abs(now[i] - last[i] - mean);
  const quiet = Float32Array.from(d).sort()[Math.floor(n / 3)], at = Math.max(6, 3 * quiet + 2);
  let changed = 0;
  for (let i = 0; i < n; i++) if (d[i] > at) changed++;
  return changed / n;
}

/** watch(stream, onEvent) → stop(). onEvent({ at, active, moving, loud, motion, level (0…1 of the way to moving), sound }). */
export function watch(stream, onEvent, { video } = {}) {
  const canvas = Object.assign(document.createElement('canvas'), { width: SIDE, height: SIDE });
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const audio = new AudioContext();
  const analyser = audio.createAnalyser();
  if (stream.getAudioTracks().length) audio.createMediaStreamSource(stream).connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  let last = null, hold = 0;
  const timer = setInterval(() => {
    let motion = 0;
    if (video?.readyState >= 2 && video.videoWidth) {
      const vw = video.videoWidth, vh = video.videoHeight, side = Math.min(vw, vh) * 0.8;
      g.drawImage(video, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, SIDE, SIDE);
      const px = g.getImageData(0, 0, SIDE, SIDE).data, y = new Float32Array(SIDE * SIDE);
      for (let i = 0, j = 0; j < y.length; i += 4, j++) y[j] = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      if (last) motion = motionOf(y, last);
      last = y;
    }
    if (motion > ON) hold = HOLD; else if (motion < OFF) hold = Math.max(0, hold - 1);
    if (audio.state === 'suspended') audio.resume().catch(() => {}); // the browser lets it run after the first touch
    analyser.getFloatTimeDomainData(samples);
    const sound = Math.sqrt(samples.reduce((n, v) => n + v * v, 0) / samples.length);
    const moving = hold > 0;
    onEvent({ at: performance.now(), active: moving || sound > SOUND, moving, loud: sound > SOUND, motion, level: moving ? 1 : Math.min(1, motion / ON), sound });
  }, EVERY_MS);
  return () => { clearInterval(timer); audio.close(); };
}
