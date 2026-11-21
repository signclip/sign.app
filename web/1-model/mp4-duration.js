// mp4-duration.js — a fragmented MP4 says how long it is (21.11., user: Nextcloud did not play the visual).
//
// Purpose:   the browser records fragmented MP4 (Chrome, Safari): ftyp, moov with the tracks but no frames, then
//            moof + mdat pieces of about a second each. Its moov says duration 0 and has no mehd, so a player
//            that reads only the moov (Nextcloud's viewer in some browsers, Safari, the Nextcloud apps) shows 0:00,
//            does not start or cannot seek. Here, after the recording and before head and seal, the real length
//            is written in: mvhd, tkhd and mdhd get their duration where it stands, mvex gets a mehd box (16 bytes).
//            The video stays fragmented (good for live later), nothing is encoded again.
//            An mfra at the end (some recorders write one) points at every moof by its offset in the file: moved by 16 too.
//            Classic MP4, for comparison: one moov with a table of every frame (time, size, offset) and one mdat;
//            it can only be written when the recording has ended. Fragmented: each moof carries the table of its
//            own second, so the file can be written and sent while recording.
// Depends:   nothing
// Test:      tests/model.test.mjs (with tests/fragmented.mp4, 2 s made by ffmpeg like a browser recording)
// Limits:    moov and mvex with 32-bit sizes (a moov ≤ 4 GB); track fragments whose offsets count from their moof
//            (default-base-is-moof or no base offset: every browser recording); otherwise, and for a classic MP4
//            or one that knows its length already, the bytes come back unchanged · reads every moof once
//            (~1 µs each; a 10 min take has ~600).

const u32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u64 = (b, o) => u32(b, o) * 2 ** 32 + u32(b, o + 4);
const put32 = (b, o, v) => { b[o] = (v >>> 24) & 255; b[o + 1] = (v >>> 16) & 255; b[o + 2] = (v >>> 8) & 255; b[o + 3] = v & 255; };
const put64 = (b, o, v) => { put32(b, o, Math.floor(v / 2 ** 32)); put32(b, o + 4, v % 2 ** 32); };
const type = (b, o) => String.fromCharCode(b[o + 4], b[o + 5], b[o + 6], b[o + 7]);

/** The boxes between start and end: [{ type, at, size }] (size 0 = to the end; null when a box is 64-bit). */
function boxes(b, start, end) {
  const found = [];
  for (let o = start; o + 8 <= end;) {
    let size = u32(b, o);
    if (size === 1) return null; // 64-bit size: leave the file as it is
    if (size === 0) size = end - o;
    if (size < 8 || o + size > end) break;
    found.push({ type: type(b, o), at: o, size });
    o += size;
  }
  return found;
}
const inside = (b, box) => boxes(b, box.at + 8, box.at + box.size) ?? [];
const child = (b, box, name) => inside(b, box).find((c) => c.type === name);

/** Where the duration of a mvhd / tkhd / mdhd sits, and how wide it is. */
function durationField(b, box) {
  const v1 = b[box.at + 8] === 1, start = box.at + 12; // after size, type, version and flags
  if (box.type === 'tkhd') return v1 ? { at: start + 24, wide: true } : { at: start + 16, wide: false }; // times, track id, reserved
  return v1 ? { at: start + 20, wide: true } : { at: start + 12, wide: false }; // mvhd, mdhd: two times, the timescale, then the duration
}
const timescaleOf = (b, box) => u32(b, durationField(b, box).at - 4);
const readDuration = (b, box) => { const f = durationField(b, box); return f.wide ? u64(b, f.at) : u32(b, f.at); };
const writeDuration = (b, box, value) => { const f = durationField(b, box); if (f.wide) put64(b, f.at, value); else put32(b, f.at, Math.min(value, 2 ** 32 - 1)); };
const trackIdOf = (b, tkhd) => u32(b, tkhd.at + 12 + (b[tkhd.at + 8] === 1 ? 16 : 8)); // after the two times

/** End of every track in its own timescale, from the moofs: { trackId: end } — or null when offsets are absolute. */
function trackEnds(b, top, defaults) {
  const ends = {};
  for (const moof of top.filter((x) => x.type === 'moof')) {
    for (const traf of inside(b, moof).filter((x) => x.type === 'traf')) {
      const tfhd = child(b, traf, 'tfhd'), tfdt = child(b, traf, 'tfdt');
      if (!tfhd) continue;
      const flags = u32(b, tfhd.at + 8) & 0xffffff, id = u32(b, tfhd.at + 12);
      if (flags & 0x1) return null; // base-data-offset: offsets count from the file's start, inserting bytes would break them
      let fallback = defaults[id] ?? 0;
      if (flags & 0x8) fallback = u32(b, tfhd.at + 16 + (flags & 0x2 ? 4 : 0)); // default sample duration
      let t = tfdt ? (b[tfdt.at + 8] === 1 ? u64(b, tfdt.at + 12) : u32(b, tfdt.at + 12)) : (ends[id] ?? 0);
      for (const trun of inside(b, traf).filter((x) => x.type === 'trun')) {
        const tf = u32(b, trun.at + 8) & 0xffffff, count = u32(b, trun.at + 12);
        const step = [0x100, 0x200, 0x400, 0x800].filter((bit) => tf & bit).length * 4;
        let p = trun.at + 16 + (tf & 0x1 ? 4 : 0) + (tf & 0x4 ? 4 : 0);
        for (let i = 0; i < count; i++, p += step) t += tf & 0x100 ? u32(b, p) : fallback;
      }
      ends[id] = Math.max(ends[id] ?? 0, t);
    }
  }
  return ends;
}

/** The recording with its real length written in (see above). bytes: Uint8Array → Uint8Array */
export function withDuration(bytes) {
  const top = boxes(bytes, 0, bytes.length);
  const moov = top?.find((x) => x.type === 'moov');
  if (!moov || !top.some((x) => x.type === 'moof')) return bytes; // classic MP4 (or not MP4): it knows its length
  const parts = boxes(bytes, moov.at + 8, moov.at + moov.size);
  const mvhd = parts?.find((x) => x.type === 'mvhd'), mvex = parts?.find((x) => x.type === 'mvex');
  if (!mvhd || !mvex || readDuration(bytes, mvhd) > 0 || child(bytes, mvex, 'mehd')) return bytes; // knows it already
  const defaults = {};
  for (const trex of inside(bytes, mvex).filter((x) => x.type === 'trex')) defaults[u32(bytes, trex.at + 12)] = u32(bytes, trex.at + 20);
  const ends = trackEnds(bytes, top, defaults);
  if (!ends) return bytes;
  const patched = bytes.slice(), movieScale = timescaleOf(bytes, mvhd); // durations first, at the old offsets
  let movie = 0;
  for (const trak of parts.filter((x) => x.type === 'trak')) {
    const tkhd = child(bytes, trak, 'tkhd'), mdia = child(bytes, trak, 'mdia'), mdhd = mdia && child(bytes, mdia, 'mdhd');
    if (!tkhd || !mdhd) continue;
    const end = ends[trackIdOf(bytes, tkhd)] ?? 0, inMovie = Math.round((end * movieScale) / (timescaleOf(bytes, mdhd) || 1));
    writeDuration(patched, mdhd, end); writeDuration(patched, tkhd, inMovie); movie = Math.max(movie, inMovie);
  }
  writeDuration(patched, mvhd, movie);
  put32(patched, moov.at, moov.size + 16); put32(patched, mvex.at, mvex.size + 16);
  const out = new Uint8Array(bytes.length + 16), cut = mvex.at + 8; // then 16 bytes of room for mehd at the start of mvex
  out.set(patched.subarray(0, cut)); out.set(patched.subarray(cut), cut + 16);
  out.set([0, 0, 0, 16, 0x6d, 0x65, 0x68, 0x64, 0, 0, 0, 0], cut); put32(out, cut + 12, Math.min(movie, 2 ** 32 - 1)); // mehd, version 0
  const mfra = top.find((x) => x.type === 'mfra'); // its tfra names every moof by its offset in the file: 16 bytes later now
  if (mfra) for (const tfra of inside(out, { at: mfra.at + 16, size: mfra.size }).filter((x) => x.type === 'tfra')) {
    const v1 = out[tfra.at + 8] === 1, sizes = u32(out, tfra.at + 16), n = u32(out, tfra.at + 20), w = v1 ? 8 : 4;
    const rest = ((sizes >> 4) & 3) + ((sizes >> 2) & 3) + (sizes & 3) + 3; // traf, trun and sample numbers
    for (let i = 0, p = tfra.at + 24; i < n; i++, p += 2 * w + rest) if (v1) put64(out, p + w, u64(out, p + w) + 16); else put32(out, p + w, u32(out, p + w) + 16);
  }
  return out;
}
