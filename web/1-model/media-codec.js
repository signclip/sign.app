// media-codec.js — what is inside a video file, said the way a browser asks for it (27.11.).
//
// Purpose:   to play a file while it is still coming (9-ui/stream.js) the browser wants to know beforehand what it
//            will be fed: 'video/mp4; codecs="avc1.640028"'. The recorder was asked for a type, but what it really
//            wrote (profile, level, a file brought in from elsewhere with sound) stands only in the file: in an MP4
//            in the moov at its beginning (stsd of every track), in a WebM as the names of its codecs in the head.
//            Read from the first bytes of the file; nothing is decoded.
// Depends:   mp4-duration.js (boxes)
// Test:      tests/stream.test.mjs
// Limits:    MP4: avc1 / avc3 (H.264), hvc1 / hev1 (H.265), vp09, mp4a (AAC), Opus; WebM: VP8, VP9, Opus, Vorbis.
//            Anything else (AV1, a track this does not know) → null: such a file is played whole, as before.
//            The moov must lie in the bytes given (a browser recording: within the first few KB; a classic MP4
//            with its moov at the end → null).

import { boxes } from './mp4-duration.js';

const hex = (n) => n.toString(16).padStart(2, '0').toUpperCase();
const two = (n) => String(n).padStart(2, '0');
const fourcc = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
const inside = (b, box, skip = 0) => boxes(b, box.at + 8 + skip, box.at + box.size) ?? [];
const child = (b, box, name, skip = 0) => inside(b, box, skip).find((c) => c.type === name);

/** H.265 as RFC 6381 / ISO 14496-15 E.3 spell it: hvc1.<space><profile>.<compat, bits turned round>.<tier><level>.<constraints> */
function hevc(name, b, c) {
  const o = c.at + 8, space = ['', 'A', 'B', 'C'][b[o + 1] >> 6], tier = (b[o + 1] >> 5) & 1, profile = b[o + 1] & 31;
  let compat = 0;
  for (let i = 0; i < 32; i++) if ((b[o + 2 + (i >> 3)] >> (7 - (i & 7))) & 1) compat += 2 ** i; // the bits in reverse order
  const rest = [...b.subarray(o + 6, o + 12)];
  while (rest.length && rest.at(-1) === 0) rest.pop();
  return [`${name}.${space}${profile}`, compat.toString(16).toUpperCase(), `${tier ? 'H' : 'L'}${b[o + 12]}`, ...rest.map((x) => x.toString(16).toUpperCase())].join('.');
}

/** One entry of a stsd → its codec as the browser names it, or null. */
function entryCodec(b, e) {
  const name = fourcc(b, e.at + 4);
  if (name === 'avc1' || name === 'avc3') { const c = child(b, e, 'avcC', 78); return c ? `${name}.${hex(b[c.at + 9])}${hex(b[c.at + 10])}${hex(b[c.at + 11])}` : null; }
  if (name === 'hvc1' || name === 'hev1') { const c = child(b, e, 'hvcC', 78); return c ? hevc(name, b, c) : null; }
  if (name === 'vp09') { const c = child(b, e, 'vpcC', 78); return c ? `vp09.${two(b[c.at + 12])}.${two(b[c.at + 13])}.${two(b[c.at + 14] >> 4)}` : null; }
  if (name === 'Opus' || name === 'opus') return 'opus';
  if (name === 'mp4a') { // AAC: the kind of sound stands in the esds, behind the tag 0x05 (its first 5 bits)
    const c = child(b, e, 'esds', 28);
    if (!c) return 'mp4a.40.2';
    for (let o = c.at + 12; o + 2 < c.at + c.size; o++) if (b[o] === 0x05) { let at = o + 1; while (b[at] & 0x80) at++; const kind = b[at + 1] >> 3; if (kind > 0 && kind < 31) return `mp4a.40.${kind}`; }
    return 'mp4a.40.2';
  }
  return null;
}

/** The codecs of an MP4 from its beginning: ['avc1.640028', …] in the order of its tracks; null when not all are known. */
export function mp4Codecs(bytes) {
  const moov = (boxes(bytes, 0, bytes.length) ?? []).find((x) => x.type === 'moov');
  if (!moov) return null;
  const out = [];
  for (const trak of inside(bytes, moov).filter((x) => x.type === 'trak')) {
    const stsd = ['mdia', 'minf', 'stbl', 'stsd'].reduce((box, name) => box && child(bytes, box, name), trak);
    const entry = stsd && (boxes(bytes, stsd.at + 16, stsd.at + stsd.size) ?? [])[0]; // after version, flags and the count
    const codec = entry && entryCodec(bytes, entry);
    if (!codec) return null;
    out.push(codec);
  }
  return out.length ? out : null;
}

/** The codecs of a WebM from its beginning (the names stand in its head as text). */
export function webmCodecs(bytes) {
  const head = String.fromCharCode(...bytes.subarray(0, Math.min(bytes.length, 4096)));
  const out = [];
  if (head.includes('V_VP9')) out.push('vp9'); else if (head.includes('V_VP8')) out.push('vp8'); else return null;
  if (head.includes('A_OPUS')) out.push('opus'); else if (head.includes('A_VORBIS')) out.push('vorbis');
  return out;
}

/** The type to feed a browser with, from the file's first bytes and its ending: 'video/mp4; codecs="avc1.640028"' or null. */
export function feedType(bytes, ext) {
  const codecs = ext === 'mp4' ? mp4Codecs(bytes) : ext === 'webm' ? webmCodecs(bytes) : null;
  return codecs ? `video/${ext}; codecs="${codecs.join(', ')}"` : null;
}
