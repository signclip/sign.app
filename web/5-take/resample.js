// resample.js — a copy of the sound for Whisper: mono, 16 kHz. The stored .a.wav is never touched.
//
// Purpose:   Whisper reads 16 kHz mono (decision 07.11.); the original stays as the browser
//            delivered it (e.g. 48 kHz float). This makes the copy, on the fly, never stored.
// Depends:   nothing.
// Test:      tests/take.test.mjs
// Limits:    averaging over the step as a simple low-pass, then linear interpolation: good enough
//            for speech (Whisper is robust), ~1 ms per second of sound.

/** Channels → one channel (mean). */
export function toMono(channels) {
  if (channels.length === 1) return channels[0];
  const out = new Float32Array(channels[0].length);
  for (const ch of channels) for (let i = 0; i < out.length; i++) out[i] += ch[i] / channels.length;
  return out;
}

/** Samples at `from` Hz → samples at `to` Hz. */
export function resample(samples, from, to = 16000) {
  if (from === to) return samples;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(samples.length / ratio));
  const half = Math.max(0, Math.floor(ratio / 2));
  for (let i = 0; i < out.length; i++) {
    const at = i * ratio;
    let sum = 0;
    let n = 0;
    for (let k = Math.floor(at) - half; k <= Math.floor(at) + half; k++) {
      if (k >= 0 && k < samples.length) { sum += samples[k]; n++; }
    }
    out[i] = n ? sum / n : 0;
  }
  return out;
}
