// heard.js — words from the sound of a take, by Whisper (26.11., user: "Whisper einbauen"): the flow sound → context.
//
// Purpose:   the audio arc dragged onto the context arc switches the flow on (settings.flows 'a>x', kept on the device;
//            the same drag or a tap on its wave switches it off). Then:
//              load    the model is fetched once when the flow is switched on (≈ 250 MB, then from the browser's
//                      cache); the wave across the seam of the two arcs fills while it loads
//              live    while a take records, every full piece of 8 s (1 s overlap) is read at once – its words appear
//                      in the window with a wave under them, 2–5 s after they were said
//              keep    ← keeps the take: the rest of its sound is read, the words get their time in the take
//                      ('t(from_to) in ms) and are written as an echo :~x (G10: ~ = computed) – a new .x.sign in echo/ and
//                      a chain on top of the take's chain (4-save/add-echo.js, :~x.1~(whisper small q8 HASH :a.1)!(…));
//                      the typed context stays as it is
//              show    the take on the line carries them as `heard` (its context is not changed): the window shows them
//                      with a wave, each lights up while the take plays there; Similar finds the take by them
//            Silence is not read (5-take/whisper.js voiced: Whisper invents words there – a take of signs is mostly
//            silent), nor what Whisper writes from its training credits (INVENTED).
// In / out:  heardOf(A, { load }) → { on, toggle, state, begin(tap), cut(), finish(session, audio, out), words(take) }
// Depends:   5-take (whisper, whisper-engine, resample), 4-save/add-echo, 1-model/file
// Test:      tests/ui.test.mjs (with a fake engine: live pieces, the tail on keep, the echo on top)
// Limits:    model ≈ 250 MB once, not loaded while the phone saves data · a piece of 8 s takes ≈ 1–3 s on a phone
//            (WebGPU faster) · word times ±0.1–0.3 s · one take is read at a time, takes kept meanwhile wait in turn.

import { pieces, placeWords, joinWords, contextOf, readPiece } from '../5-take/whisper.js';
import { loadWhisper } from '../5-take/whisper-engine.js';
import { toMono, resample } from '../5-take/resample.js';
import { addEcho } from '../4-save/add-echo.js';
import { readFile } from '../1-model/file.js';
import { allowed } from './ahead.js';

export const FLOW = 'a>x';
const RATE = 16000, PIECE_MS = 8000, STEP_MS = 7000, LIVE_SHOWN = 4;

export function heardOf(A, { load = loadWhisper } = {}) {
  const s = { status: 'off', progress: 0, bytes: 0, engine: null, label: '', loading: null, queue: Promise.resolve() };
  const on = () => (A.settings.flows ?? []).includes(FLOW);

  /** The model, loaded once. → engine or null (could not load: offline, saving data, no worker) */
  function ensure() {
    if (s.engine) return Promise.resolve(s.engine);
    if (!allowed()) { s.status = 'failed'; A.paint(); return Promise.resolve(null); } // 250 MB: not while the phone saves data
    s.loading ??= (async () => {
      s.status = 'loading'; s.progress = 0; A.paint();
      try {
        const e = await load({ language: A.lang ?? null, onProgress: (f, bytes) => { s.progress = f; s.bytes = bytes; A.paint(); } });
        s.engine = e; s.label = e.label; s.status = 'ready';
      } catch (err) { console.warn('whisper', err); s.status = 'failed'; }
      s.loading = null; A.paint();
      return s.engine;
    })();
    return s.loading;
  }

  /** The flow switched (the audio arc dragged onto the context arc, or its wave tapped). */
  function toggle() {
    const flows = new Set(A.settings.flows ?? []);
    if (flows.has(FLOW)) flows.delete(FLOW); else flows.add(FLOW);
    A.settings.flows = [...flows];
    A.keepSettings();
    navigator.vibrate?.(on() ? 20 : [12, 50, 12]);
    if (on()) ensure(); else if (s.status !== 'ready') s.status = 'off';
    A.paint();
    return on();
  }

  /** Read one stretch of the sound (channels at their rate) whose start lies at fromMs in the take. → words with ms */
  async function read(channels, rate, fromMs) {
    const samples = resample(toMono(channels), rate, RATE), out = [];
    for (const p of pieces(samples.length, RATE, { pieceMs: PIECE_MS, overlapMs: PIECE_MS - STEP_MS })) {
      const words = await readPiece(s.engine, samples.subarray(p.from, p.to), RATE);
      out.push(...placeWords(words, p.from + Math.round((fromMs * RATE) / 1000), RATE));
    }
    return out;
  }
  /** One job after the other: the model reads one stretch at a time. */
  const inTurn = (job) => { const run = s.queue.then(job, job); s.queue = run.catch(() => {}); return run; };

  // ---------- live, while the take records ----------
  let live = null; // { tap, words, fromMs, busy, timer }
  function begin(tap) {
    if (!on() || !tap || !A.st.strands.a) return;
    ensure();
    live = { tap, words: [], fromMs: 0, busy: false, timer: null };
    const me = live;
    me.timer = setInterval(() => {
      if (me.busy || !s.engine || live !== me) return;
      const rate = me.tap.sampleRate, have = (me.tap.length / rate) * 1000;
      if (have - me.fromMs < PIECE_MS) return; // a whole piece is not there yet
      me.busy = true;
      const from = me.fromMs, a = me.tap.range(Math.round((from * rate) / 1000), Math.round(((from + PIECE_MS) * rate) / 1000));
      inTurn(() => read(a.channels, a.sampleRate, from)).then((words) => {
        me.words = joinWords([...me.words, ...words]); me.fromMs = from + STEP_MS;
        if (live === me) { A.data.heardNow = me.words.slice(-LIVE_SHOWN); A.paint(); }
      }, () => {}).finally(() => { me.busy = false; });
    }, 1000);
  }
  /** The take ends (kept or dropped): the live reading stops; what it read so far goes with the take. → session or null */
  function cut() {
    const me = live;
    live = null; A.data.heardNow = null;
    if (me) clearInterval(me.timer);
    return me ?? (on() ? { words: [], fromMs: 0, busy: false } : null);
  }

  /**
   * The take is kept: the rest of its sound is read, the words written as an echo on top of its chain, and the take on
   * the line gets them. session: from cut() · audio: { channels, sampleRate } · out: { saved, take } (take-flow.js save)
   */
  async function finish(session, audio, out) {
    if (!session || !audio?.channels?.length || !out?.saved) return null;
    if (!(await ensure())) return null;
    while (session.busy) await new Promise((done) => setTimeout(done, 100)); // a live piece is still being read
    const rate = audio.sampleRate, from = session.fromMs, start = Math.round((from * rate) / 1000);
    const rest = audio.channels.map((c) => c.subarray(Math.min(c.length, start)));
    const words = joinWords([...session.words, ...(rest[0]?.length ? await inTurn(() => read(rest, rate, from)) : [])]);
    if (!words.length) return null;
    const chainPath = out.saved.chain.path;
    try {
      const file = readFile(new TextDecoder().decode(await A.store.read(chainPath)));
      const sound = [...file.defs.entries()].find(([, d]) => d.kind === 'a' && !d.echo)?.[0];
      if (!sound) return null;
      const r = await addEcho({ own: A.store, chainPath, from: sound, kind: 'x', row: contextOf(words), echo: s.label, device: A.device, person: A.person, deviceKey: await A.sealKey?.() });
      const heard = contextOf(words);
      const mark = (t) => (t.id === chainPath || (t.parts ?? []).some((p) => p.id === chainPath) ? { ...t, heard } : t);
      A.dispatch({ type: 'lines', lines: A.st.lines.map((l) => ({ ...l, takes: l.takes.map(mark) })) });
      A.keepLines();
      A.engine?.afterTake([r.echo, r.chain]).catch(() => {});
      A.reindex();
      return words;
    } catch (err) { console.warn('heard', err); return null; }
  }

  return {
    on, toggle, ensure, begin, cut, finish,
    get state() { return { on: on(), status: s.status, progress: s.progress, bytes: s.bytes }; },
    /** For tests and the harness: a ready engine instead of the model. */
    useEngine(engine, label = 'whisper test 00000000') { s.engine = engine; s.label = label; s.status = 'ready'; },
  };
}
