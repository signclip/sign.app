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
// EXTEND(S2, live words): onSound(chunk) feeds whisper.js pieces while recording.

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
 * Returns { frame(ts), stop() → { video, ext, audio, lengthMs, fps, delivered } }.
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
  picture.start(1000);
  return {
    frame(ts) { frames.push(ts); },
    stop() {
      return new Promise((resolve) => {
        picture.onstop = async () => {
          const video = new Uint8Array(await new Blob(chunks, { type }).arrayBuffer());
          const fps = measuredFps(frames);
          resolve({ video, ext, audio: sound ? sound.stop() : null, lengthMs: now() - started, fps, delivered: deliveredLabel(videoTrack.getSettings(), fps, ext) });
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
  node.port.onmessage = (e) => blocks.push(e.data);
  ctx.createMediaStreamSource(stream).connect(node);
  return {
    stop() {
      ctx.close();
      const count = blocks[0]?.length ?? 1;
      const length = blocks.reduce((n, b) => n + b[0].length, 0);
      const channels = Array.from({ length: count }, () => new Float32Array(length));
      let at = 0;
      for (const b of blocks) { b.forEach((c, i) => channels[i].set(c, at)); at += b[0].length; }
      return { channels, sampleRate: ctx.sampleRate };
    },
  };
}
