// whisper-worker.js — Whisper in its own thread: loads the model once, then answers transcribe requests.
//
// Purpose:   the screen never waits for the model (whisper-engine.js talks to this worker).
//            { load: { model, dtype, library, models? } } → { hash } (the model's commit on Hugging Face, for ~( ))
//            { samples, language }               → { words: [{ text, start, end }] } (s, as whisper.js expects)
// Depends:   browser (module worker), the library at LIBRARY (transformers.js, IMPORTS.md), whisper-engine.js
// Test:      the words are tested through makeEngine in tests/take.test.mjs; this needs a browser.
// Limits:    one model per worker; WebGPU when the browser has it, else WebAssembly.

import { makeEngine } from './whisper-engine.js';

let engine = null;

async function commitOf(model) {
  try { return (await (await fetch(`https://huggingface.co/api/models/${model}/revision/main`)).json()).sha ?? null; } catch { return null; }
}

self.onmessage = async ({ data }) => {
  try {
    if (data.load) {
      const { pipeline, env } = await import(data.load.library);
      if (data.load.models) { // the models from an own folder, nothing from Hugging Face
        Object.assign(env, { localModelPath: data.load.models, allowLocalModels: true, allowRemoteModels: false });
        env.backends.onnx.wasm.wasmPaths = new URL('./', data.load.library).href; // the runtime next to the library
      }
      const gpu = await navigator.gpu?.requestAdapter?.().catch(() => null); // 'gpu' can exist without an adapter
      const make = (device) => pipeline('automatic-speech-recognition', data.load.model, { dtype: data.load.dtype, device });
      const asr = gpu ? await make('webgpu').catch(() => make('wasm')) : await make('wasm');
      engine = asr;
      return self.postMessage({ id: data.id, hash: data.load.models ? 'local000' : await commitOf(data.load.model) });
    }
    if (!engine) throw new Error('whisper not loaded');
    const words = await makeEngine(engine, { language: data.language }).transcribe(data.samples);
    self.postMessage({ id: data.id, words });
  } catch (err) {
    self.postMessage({ id: data.id, error: String(err?.message ?? err) });
  }
};
