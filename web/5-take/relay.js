// relay.js — the picture of a take passes through a canvas, so the camera can change during the take (14.11.).
//
// Purpose:   MediaRecorder keeps the tracks it started with; a new camera would end it. The recorder takes the
//            canvas instead, and the canvas draws whatever the live picture shows: one .v.mp4, front and back.
// Depends:   browser: canvas.captureStream, requestVideoFrameCallback (else requestAnimationFrame).
// Test:      tests/take.test.mjs (cover) · on real phones: CPU and fps with 1080 × 1080.
// Limits:    the canvas keeps the size of the first picture (a new size mid-stream would upset the encoder);
//            a camera with another size is drawn to fill it (cover), centred · at most the camera's fps.

/** Where a picture of w × h is drawn to cover W × H, centred → [x, y, width, height]. */
export function cover(w, h, W, H) {
  if (!w || !h) return [0, 0, W, H];
  const s = Math.max(W / w, H / h);
  return [(W - w * s) / 2, (H - h * s) / 2, w * s, h * s];
}

/** relay(video, fps) → { track, stop() }: a video track that shows what the element shows, frame by frame. */
export function relay(video, fps = 60) {
  const W = video.videoWidth || 1080, H = video.videoHeight || 1080;
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const g = canvas.getContext('2d', { alpha: false });
  const track = canvas.captureStream(fps).getVideoTracks()[0];
  let on = true;
  const byFrame = typeof video.requestVideoFrameCallback === 'function';
  const draw = () => {
    if (!on) return;
    if (video.videoWidth) g.drawImage(video, ...cover(video.videoWidth, video.videoHeight, W, H));
    if (byFrame) video.requestVideoFrameCallback(draw); else requestAnimationFrame(draw);
  };
  draw();
  return { track, stop() { on = false; track.stop(); } };
}
