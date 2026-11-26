// whisper.js — context from sound: words with their time, as an echo :~x of the Take (G10: ~ = computed).
//
// Purpose:   the same model everywhere (decision 07.11.: Whisper small, quantized) · live in
//            pieces of ~8 s with 1 s overlap, else right after the Take · each word's time is its
//            position in the sound, counted in samples from the start of the Take – never the moment
//            the result arrived · the model file's hash goes into ~( ), so "same model" is checkable.
// Depends:   an engine with transcribe(samples16k) → [{ text, start, end }] in seconds
//            (transformers.js in the PWA, whisper.cpp in the native app; loaded as a module).
// Test:      tests/take.test.mjs (with a fake engine)
// Limits:    word times ±0.1–0.3 s (Whisper) · live results 2–5 s late · model ~180–250 MB once · a piece is read only
//            when ≥ 300 ms of it are louder than −42 dBFS (voiced) – silence makes Whisper invent words.

/** Pieces of a sound: [{ from, to }] in samples, overlapping. */
export function pieces(totalSamples, rate = 16000, { pieceMs = 8000, overlapMs = 1000 } = {}) {
  const size = Math.round((pieceMs * rate) / 1000);
  const step = size - Math.round((overlapMs * rate) / 1000);
  const out = [];
  for (let from = 0; from < totalSamples; from += step) {
    out.push({ from, to: Math.min(totalSamples, from + size) });
    if (from + size >= totalSamples) break;
  }
  return out;
}

/** Words from one piece → ms from the start of the Take. */
export function placeWords(words, pieceFromSamples, rate = 16000) {
  const offset = (pieceFromSamples / rate) * 1000;
  return words.map((w) => ({ text: w.text.trim(), from: Math.round(offset + w.start * 1000), to: Math.round(offset + w.end * 1000) })).filter((w) => w.text);
}

/** Join words of overlapping pieces: the same word at (nearly) the same time counts once. */
export function joinWords(words, toleranceMs = 300) {
  const out = [];
  for (const w of [...words].sort((a, b) => a.from - b.from)) {
    const last = out.at(-1);
    if (last && last.text.toLowerCase() === w.text.toLowerCase() && Math.abs(last.from - w.from) <= toleranceMs) continue;
    out.push(w);
  }
  return out;
}

/** Words → the row of an :x echo: (Kaffee)'t(10200_10650) (danke)'t(…). */
export function contextOf(words) {
  return words.map((w) => `(${w.text.replace(/[()[\]{}]/g, '')})'t(${w.from}_${w.to})`).join(' ');
}

/** "whisper small q8" + first 8 characters of the model file hash, for ~( ). */
export function modelLabel({ name, variant, hash }) {
  return `whisper ${name}${variant ? ` ${variant}` : ''} ${hash.slice(0, 8)}`;
}

/**
 * Is anything said in these samples? (26.11.) Whisper invents words in silence – a take of signs is often silent – so
 * a piece is only read when at least minMs of it, in windows of windowMs, is louder than floorDb.
 * Speech close to a phone ≈ −30…−15 dBFS, a quiet room ≈ −60…−50.
 */
export function voiced(samples, { rate = 16000, windowMs = 100, floorDb = -42, minMs = 300 } = {}) {
  const size = Math.max(1, Math.round((windowMs * rate) / 1000)), need = Math.ceil(minMs / windowMs), floor = 10 ** (floorDb / 20);
  let loud = 0;
  for (let at = 0; at + size <= samples.length; at += size) {
    let sum = 0;
    for (let i = at; i < at + size; i++) sum += samples[i] * samples[i];
    if (Math.sqrt(sum / size) >= floor && ++loud >= need) return true;
  }
  return false;
}

/** What Whisper writes when it hears nothing it knows (credits of its training videos): a piece with these is dropped. */
export const INVENTED = /untertitel|amara\.org|copyright|www\.|\.com\b|abonnier/i;

/** The words of one piece, unless it is silent or one of Whisper's inventions. */
export async function readPiece(engine, samples16k, rate = 16000) {
  if (!voiced(samples16k, { rate })) return [];
  const words = await engine.transcribe(samples16k);
  return INVENTED.test(words.map((w) => w.text).join(' ')) ? [] : words;
}

/** Whole sound at once (after the Take): samples16k → words with ms. */
export async function transcribe(engine, samples16k, rate = 16000) {
  const all = [];
  for (const p of pieces(samples16k.length, rate)) all.push(...placeWords(await readPiece(engine, samples16k.subarray(p.from, p.to), rate), p.from, rate));
  return joinWords(all);
}
