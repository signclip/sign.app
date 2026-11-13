// whisper-engine.js — the engine whisper.js asks for: transcribe(samples16k) → [{ text, start, end }] in seconds.
//
// Purpose:   the PWA runs Whisper with transformers.js (13.11.: connection audio → context). The model runs
//            in its own worker (whisper-worker.js), so the screen never waits; this file only talks to it
//            and turns the library's output into our words. whisper.cpp in the native app = one more engine
//            with the same transcribe(), nothing else changes (EXTEND(S10, native whisper)).
//              model     Xenova/whisper-small, q8 (decision 07.11.: Whisper small everywhere), from Hugging Face
//                        once, then from the browser's cache; its commit goes into ~( ) as the hash
//              language  the person's app language (de), or null = Whisper finds it
//              models    a folder that holds the models instead of Hugging Face (e.g. one day a sharing point;
//                        EXTEND(S6, models)); then nothing goes out to Hugging Face
// Depends:   browser (Worker) for loadWhisper; wordsOf and makeEngine are pure.
// Test:      tests/take.test.mjs (wordsOf, makeEngine with a fake pipeline); checked 13.11. with whisper-tiny q8
//            in Node: 11 s of speech → words with times in 1.2 s.
// Limits:    small q8 ≈ 250 MB once (tiny ≈ 40 MB), ~1–3 s per 8 s piece on a phone (WebGPU faster) ·
//            word times ±0.1–0.3 s · the first take after opening waits for the model to load.

export const MODEL = Object.freeze({ id: 'Xenova/whisper-small', name: 'small', dtype: 'q8' });
export const LIBRARY = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1'; // IMPORTS.md

/** The library's output → words { text, start, end } (s); punctuation at the edges goes, empty words go. */
export function wordsOf(output) {
  return (output?.chunks ?? [])
    .map((c) => ({ text: String(c.text ?? '').trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''), start: c.timestamp?.[0] ?? 0, end: c.timestamp?.[1] ?? c.timestamp?.[0] ?? 0 }))
    .filter((w) => w.text);
}

/** An engine from a transformers.js pipeline (in the worker, or in a test). */
export function makeEngine(asr, { language = null } = {}) {
  return {
    async transcribe(samples16k) {
      const out = await asr(samples16k, { return_timestamps: 'word', task: 'transcribe', ...(language ? { language } : {}) });
      return wordsOf(out);
    },
  };
}

/**
 * Start Whisper in its worker. → Promise<{ transcribe(samples16k), label }> once the model is loaded.
 * label = "whisper small q8 <8 chars of the model's commit>" for ~( ) (whisper.js modelLabel).
 */
export function loadWhisper({ language = null, model = MODEL, library = LIBRARY, models = null, url = new URL('./whisper-worker.js', import.meta.url) } = {}) {
  const worker = new Worker(url, { type: 'module' });
  const waiting = new Map();
  let n = 0;
  worker.onmessage = ({ data }) => {
    const w = waiting.get(data.id);
    if (!w) return;
    waiting.delete(data.id);
    if (data.error) w.reject(new Error(data.error)); else w.resolve(data);
  };
  const ask = (message, transfer = []) => new Promise((resolve, reject) => {
    const id = ++n;
    waiting.set(id, { resolve, reject });
    worker.postMessage({ ...message, id }, transfer);
  });
  return ask({ load: { model: model.id, dtype: model.dtype, library, models } }).then(({ hash }) => ({
    label: `whisper ${model.name} ${model.dtype} ${String(hash ?? 'unknown0').slice(0, 8)}`,
    async transcribe(samples16k) {
      const copy = samples16k.slice(); // the worker gets its own copy
      return (await ask({ samples: copy, language }, [copy.buffer])).words;
    },
  }));
}
