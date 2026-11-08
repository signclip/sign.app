// ready.js — always ready in the browser: is there motion or sound right now? Every 100 ms one event.
//
// Purpose:   feeds settings.readyStep(): a take starts after waitStartMs of activity and stops after
//            waitStopMs of quiet. Motion = share of changed pixels in a 32×32 copy of the picture;
//            sound = loudness (RMS) of the microphone.
// Depends:   browser (canvas, AudioContext)
// Test:      not in node (needs a camera); readyStep is tested in tests/ui.test.mjs.
// Limits:    ~1 % CPU on a phone; thresholds: motion > 4 % of pixels, sound > RMS 0.02 (to tune on the
//            test day) · pre-roll needs a running recorder and comes with the native app.

const EVERY_MS = 100, SIDE = 32, MOTION = 0.04, SOUND = 0.02;

/** watch(stream, onEvent) → stop(). onEvent({ at, active, motion, sound }). */
export function watch(stream, onEvent, { video } = {}) {
  const canvas = Object.assign(document.createElement('canvas'), { width: SIDE, height: SIDE });
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const audio = new AudioContext();
  const analyser = audio.createAnalyser();
  if (stream.getAudioTracks().length) audio.createMediaStreamSource(stream).connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  let last = null;
  const timer = setInterval(() => {
    let motion = 0;
    if (video?.readyState >= 2) {
      g.drawImage(video, 0, 0, SIDE, SIDE);
      const px = g.getImageData(0, 0, SIDE, SIDE).data;
      if (last) { let changed = 0; for (let i = 0; i < px.length; i += 4) if (Math.abs(px[i] - last[i]) + Math.abs(px[i + 1] - last[i + 1]) > 40) changed++; motion = changed / (SIDE * SIDE); }
      last = px.slice();
    }
    analyser.getFloatTimeDomainData(samples);
    const sound = Math.sqrt(samples.reduce((n, v) => n + v * v, 0) / samples.length);
    onEvent({ at: performance.now(), active: motion > MOTION || sound > SOUND, motion, sound });
  }, EVERY_MS);
  return () => { clearInterval(timer); audio.close(); };
}
