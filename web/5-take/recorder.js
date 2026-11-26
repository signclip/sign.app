// recorder.js — one Take in the browser: picture and sound in parallel, sound raw.
//
// Purpose:   one permission for camera and microphone, then two ways (decision 07.11.):
//              picture → MediaRecorder (MP4/H.264 first) → .v.mp4, no sound in it
//              sound   → AudioWorklet: the browser's own float numbers, untouched → .a.wav
//                        and a copy for Whisper (resample.js), never stored
//            Frame times are counted (requestVideoFrameCallback) to know the real fps.
// Depends:   settings.js, resample.js; browser: MediaRecorder, AudioContext, AudioWorklet.
//            Browser objects are passed in, so the logic runs in tests with fakes.
// Test:      tests/take.test.mjs (fakes) · on real phones: Session 2 test day.
// Limits:    sound is kept in memory until the end: 10 min mono 48 kHz ≈ 115 MB · picture chunks
//            arrive every second (timeslice 1000 ms), so a crash loses at most ~1 s.
// Live words (26.11.): the tap tells its length and gives any range of what it has (9-ui/heard.js reads pieces
//            of it for Whisper while the take runs).

import { constraints, pickVideoType, recorderOptions, measuredFps, deliveredLabel } from './settings.js';

/** Code of the AudioWorklet: passes every block of samples to the page, unchanged. */
export const TAP_WORKLET = `registerProcessor('sign-tap', class extends AudioWorkletProcessor {
  process(inputs) { const i = inputs[0]; if (i && i.length) this.port.postMessage(i.map((c) => c.slice(0))); return true; }
});`;

/** Ask for camera and microphone with the Take settings. */
export function openDevices(mediaDevices, options = {}) {
  return mediaDevices.getUserMedia(constraints(options));
}

/**
 * Start a Take. env: { MediaRecorder, tapAudio, now } – tapAudio(stream) → { stop() → { channels, sampleRate } }.
 * Returns { frame(ts), pause(), resume(), paused, stop() → { video, ext, audio, lengthMs, fps, delivered } };
 * a pause (14.11.) holds picture and sound together; lengthMs counts only the recorded time.
 */
export function startTake(stream, env) {
  const { MediaRecorder, tapAudio, now = () => Date.now() } = env;
  const videoTrack = stream.getVideoTracks()[0];
  const { type, ext } = pickVideoType((t) => MediaRecorder.isTypeSupported(t));
  const picture = new MediaRecorder(new globalThis.MediaStream([videoTrack]), recorderOptions(type));
  const chunks = [];
  picture.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
  const sound = stream.getAudioTracks().length ? tapAudio(stream) : null;
  const frames = [];
  const started = now();
  let pausedAt = null, pausedMs = 0;
  picture.start(1000);
  return {
    get paused() { return pausedAt != null; },
    pause() { if (pausedAt != null) return; pausedAt = now(); picture.pause?.(); sound?.pause?.(); },
    resume() { if (pausedAt == null) return; pausedMs += now() - pausedAt; pausedAt = null; picture.resume?.(); sound?.resume?.(); },
    frame(ts) { if (pausedAt == null) frames.push(ts); },
    stop() {
      return new Promise((resolve) => {
        picture.onstop = async () => {
          const video = new Uint8Array(await new Blob(chunks, { type }).arrayBuffer());
          const fps = measuredFps(frames);
          if (pausedAt != null) { pausedMs += now() - pausedAt; pausedAt = null; }
          resolve({ video, ext, audio: sound ? sound.stop() : null, lengthMs: now() - started - pausedMs, fps, delivered: deliveredLabel(videoTrack.getSettings(), fps, ext) });
        };
        picture.stop();
      });
    },
  };
}

/** Real sound tap in the browser (AudioWorklet). Not used in tests. */
export async function browserTap(stream, AudioContextClass = globalThis.AudioContext) {
  const ctx = new AudioContextClass();
  await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([TAP_WORKLET], { type: 'text/javascript' })));
  const node = new AudioWorkletNode(ctx, 'sign-tap');
  const blocks = [];
  let held = false; // paused: the blocks are let go
  node.port.onmessage = (e) => { if (!held) blocks.push(e.data); };
  ctx.createMediaStreamSource(stream).connect(node);
  /** The samples from `from` to `to` (counted in recorded samples, pauses left out), as channels. */
  const range = (from = 0, to = Infinity) => {
    const count = blocks[0]?.length ?? 1, total = blocks.reduce((n, b) => n + b[0].length, 0), end = Math.min(total, to), start = Math.max(0, Math.min(from, end));
    const channels = Array.from({ length: count }, () => new Float32Array(end - start));
    let at = 0;
    for (const b of blocks) {
      const len = b[0].length;
      if (at + len > start && at < end) { const a = Math.max(start, at), z = Math.min(end, at + len); b.forEach((c, i) => channels[i].set(c.subarray(a - at, z - at), a - start)); }
      at += len;
      if (at >= end) break;
    }
    return { channels, sampleRate: ctx.sampleRate };
  };
  return {
    pause() { held = true; },
    resume() { held = false; },
    /** How many samples are recorded so far (live words, 26.11.: Whisper reads the take while it runs). */
    get length() { return blocks.reduce((n, b) => n + b[0].length, 0); },
    get sampleRate() { return ctx.sampleRate; },
    range,
    stop() { ctx.close(); return range(); },
  };
}
