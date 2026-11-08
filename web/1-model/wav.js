// wav.js — audio as the browser computes it: 32-bit float, any rate, with our head inside.
//
// Purpose:   write and read .a.wav (decision 07.11.): samples unchanged, no resampling;
//            the head line (:a!(…)@(…)'t(…)) lives in a chunk "sign" that players skip.
// Depends:   nothing.
// Origin:    RIFF/WAVE, WAVE_FORMAT_IEEE_FLOAT (3) with "fact" chunk (Microsoft RIFF spec).
// Test:      tests/model.test.mjs
// Limits:    RIFF sizes are 32 bit: ≤ 4 GB per file = ~6 h mono at 48 kHz (11.5 MB/min) ·
//            the file is written in one piece at the end of a Take (10 min ≈ 115 MB in memory).

const enc = new TextEncoder();

/** channels: Float32Array per channel (same length). Returns Uint8Array. */
export function encodeWav(channels, sampleRate, head = '') {
  const count = channels.length;
  const frames = channels[0]?.length ?? 0;
  const headBytes = enc.encode(head);
  const headPad = headBytes.length % 2;
  const dataBytes = frames * count * 4;
  const size = 12 + 26 + 12 + (8 + headBytes.length + headPad) + 8 + dataBytes;
  const buf = new ArrayBuffer(size);
  const v = new DataView(buf);
  const u8 = new Uint8Array(buf);
  let o = 0;
  const tag = (s) => { u8.set(enc.encode(s), o); o += 4; };
  const u32 = (x) => { v.setUint32(o, x, true); o += 4; };
  const u16 = (x) => { v.setUint16(o, x, true); o += 2; };
  tag('RIFF'); u32(size - 8); tag('WAVE');
  tag('fmt '); u32(18); u16(3); u16(count); u32(sampleRate); u32(sampleRate * count * 4); u16(count * 4); u16(32); u16(0);
  tag('fact'); u32(4); u32(frames);
  tag('sign'); u32(headBytes.length); u8.set(headBytes, o); o += headBytes.length + headPad;
  tag('data'); u32(dataBytes);
  for (let i = 0; i < frames; i++) for (let c = 0; c < count; c++) { v.setFloat32(o, channels[c][i], true); o += 4; }
  return u8;
}

/** Read rate, channels and head; samples only if asked. */
export function readWav(bytes, { samples = false } = {}) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o) => String.fromCharCode(...bytes.subarray(o, o + 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('not a WAVE file');
  const out = { head: '', sampleRate: 0, channels: 0, frames: 0 };
  let o = 12;
  while (o + 8 <= bytes.length) {
    const id = tag(o);
    const len = v.getUint32(o + 4, true);
    const at = o + 8;
    if (id === 'fmt ') { out.channels = v.getUint16(at + 2, true); out.sampleRate = v.getUint32(at + 4, true); }
    if (id === 'sign') out.head = new TextDecoder().decode(bytes.subarray(at, at + len));
    if (id === 'data') {
      out.frames = len / (4 * out.channels);
      if (samples) {
        out.data = Array.from({ length: out.channels }, () => new Float32Array(out.frames));
        for (let i = 0; i < out.frames; i++) for (let c = 0; c < out.channels; c++) out.data[c][i] = v.getFloat32(at + (i * out.channels + c) * 4, true);
      }
    }
    o = at + len + (len % 2);
  }
  return out;
}
