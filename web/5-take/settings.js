// settings.js — what a Take asks of camera and microphone, and how to tell what it got.
//
// Purpose:   decisions 06.–07.11.: picture 1:1 1080×1080, 60 fps if the device can, else 30 ·
//            video without sound, H.264 in MP4 first, WebM if not · highest bitrate (~15 Mbit/s) ·
//            sound raw: the browser's own float numbers, no echo cancelling, no noise filter,
//            no automatic gain, rate as delivered, mono (stereo asked, kept if it comes).
//            The device decides; what it really delivered goes into the head of the files.
// Depends:   nothing (pure); the browser objects are passed in.
// Test:      tests/take.test.mjs
// Limits:    Android Chrome may report 60 fps and deliver 30: measuredFps() counts real frames ·
//            iPhone Safari records MP4/H.264; Firefox only WebM.

/** getUserMedia constraints for a Take. */
export function constraints({ fps = 60, size = 1080, facing = 'user', stereo = true } = {}) {
  return {
    video: { width: { ideal: size }, height: { ideal: size }, aspectRatio: { ideal: 1 }, frameRate: { ideal: fps }, facingMode: facing, resizeMode: 'crop-and-scale' },
    audio: { channelCount: { ideal: stereo ? 2 : 1 }, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  };
}

const VIDEO_TYPES = ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];

/** The first video type the browser can record. isTypeSupported: MediaRecorder.isTypeSupported. */
export function pickVideoType(isTypeSupported) {
  const type = VIDEO_TYPES.find((t) => isTypeSupported(t));
  if (!type) throw new Error('this browser cannot record video');
  return { type, ext: type.startsWith('video/mp4') ? 'mp4' : 'webm' };
}

/** Options for the video recorder: highest bitrate, a keyframe every second where the browser allows it. */
export function recorderOptions(type, { bitsPerSecond = 15e6 } = {}) {
  return { mimeType: type, videoBitsPerSecond: bitsPerSecond, videoKeyFrameIntervalDuration: 1000 };
}

/** Frames per second really delivered, from frame timestamps in ms (requestVideoFrameCallback). */
export function measuredFps(timestampsMs) {
  if (timestampsMs.length < 2) return null;
  const span = timestampsMs.at(-1) - timestampsMs[0];
  return span > 0 ? Math.round(((timestampsMs.length - 1) * 1000) / span) : null;
}

/** What the device delivered, for the head of the files: '1080×1080 60fps mp4' etc. */
export function deliveredLabel(videoSettings, fps, ext) {
  return `${videoSettings.width}×${videoSettings.height} ${fps ?? videoSettings.frameRate}fps ${ext}`;
}
