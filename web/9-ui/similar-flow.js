// similar-flow.js — what Similar shows: results for what the take window holds now, or a sharing point's content
// (a tile tapped in the sharing menu, the admin's piles), with pictures and chips filled in as they load.
//
// Purpose:   results = 7-similar/filter.js similar() over the index, for the words of the take now (sticky, the series'
//            element, what is being typed), then the selection views (similar-view.js passes / ordered). A pile of the
//            admin's door comes as items from the sharing engine (onLookAll): grouped by person (a hello is one line per
//            person: name sign, password gestures), a tap opens the double view and plays her pieces from the first;
//            a known person on a new device shows her original beside it. The button then decides (16.11.):
//              hello  ↑ = the sharing menu opens, join pulses, a tap on it = account + answer · ↓ = quiet
//              join   ↑ = within · ↓ = back to hello        within ↓ = quiet        quiet ↑ = within
// Depends:   browser; 1-model (ids), 7-similar/filter.js, similar-view.js, chips.js, media.js
// Test:      the filters in tests/ui.test.mjs and tests/similar.test.mjs; pictures need a browser.
// Limits:    40 results per look (MANY); pictures and chips load one after another (≈ 10 ms each from the device).

import { idKey } from '../1-model/ids.js';
import { similar } from '../7-similar/filter.js';
import { passes, ordered, byPerson, MANY } from './similar-view.js';
import { nowWords } from './chips.js';
import { readContext } from '../1-model/context.js';
import { msOf } from '../1-model/time.js';

export function similarFlow(A) {
  const s = { look: null, entries: [], loading: new Set(), playing: null };

  /** The take chain that holds a strand (x) key, from the index. */
  const chainOf = (key) => {
    const { index } = A;
    if (index.tables.chains.has(key)) return index.tables.chains.get(key);
    for (const c of index.tables.chains.values()) if (c && [...c.defs.values()].some((d) => d.id && idKey(d.id) === key)) return c;
    return null;
  };
  const words = () => [...nowWords(A.st.context, A.st.sticky).map((w) => w.text), ...String(A.data.typing ?? '').split(/\s+/)].filter(Boolean);

  /** Results now, as view entries (pictures and chips fill in later). */
  function compute() {
    const f = A.st.filters;
    if (s.look) return ordered(s.look.filter((e) => passes(e, f)), f);
    const hits = similar(A.index, { words: f.on.x ? words() : [], limit: MANY });
    const list = hits.map((h) => {
      const head = h.entry.head ?? {};
      const old = s.entries.find((e) => e.key === h.key);
      return old ?? { key: h.key, words: [], t: (() => { try { return msOf(String(head["'t"] ?? '')) || 0; } catch { return 0; } })(), person: head['@'] ?? '', sharing: [h.entry.from?.store].filter(Boolean), spot: head.o ?? null, thumb: null, chain: chainOf(h.key) };
    });
    const seen = new Set(), one = list.filter((e) => { const k = e.chain?.key ?? e.key; if (seen.has(k)) return false; seen.add(k); return true; }); // a take once, however many of its strands matched
    return ordered(one.filter((e) => passes(e, f)), f);
  }

  async function fill(list) {
    for (const e of list) {
      if (s.loading.has(e.key) || (e.thumb && e.words.length)) continue;
      s.loading.add(e.key);
      if (e.chain) {
        const v = A.media.visualOf(e.chain);
        e.at = v;
        e.thumb = await A.media.picOf(v).catch(() => null);
        const text = await A.media.contextTextOf(e.chain).catch(() => '');
        e.words = readContext(text).gestures.flatMap((g) => g.chips.map((c) => c.text)).slice(0, 6);
      } else if (e.pieces) {
        e.thumb = await A.media.picOf({ store: e.pieces[0].from, path: e.pieces[0].path }).catch(() => null);
      }
      A.paint();
    }
  }

  /** Refresh after the take or the filters changed. */
  function refresh() {
    if (A.st.similar === 'closed') return;
    s.entries = compute();
    A.data.entries = s.entries;
    fill(s.entries);
    A.paint();
  }

  /** The admin's pile (or any sharing point's files) as Similar, grouped by person. */
  function lookAt(items) {
    s.look = byPerson(items.map((x) => ({ ...x, person: x.name ?? '' }))).map((g, i) => ({ key: `look:${i}`, person: g.person, words: [g.person].filter(Boolean), t: 0, sharing: [], pieces: g.entries, thumb: null }));
    A.dispatch({ type: 'similar', level: 'many' });
    refresh();
    const known = s.look.findIndex((e) => e.pieces.some((p) => p.pair || p.candidates?.length));
    if (known >= 0) pick(s.look[known].key);
  }

  /** A tile tapped: the double view, it plays (a person's pieces one after another, from the first). */
  async function pick(key) {
    A.dispatch({ type: 'pick', key });
    const e = s.entries.find((x) => x.key === key);
    const queue = e?.pieces ? e.pieces.map((p) => ({ store: p.from, path: p.path })) : e?.at ? [e.at] : [];
    s.playing = { key, queue, i: 0 };
    A.paint();
    await play();
  }
  async function play() {
    const v = document.querySelector('#pickvideo'), p = s.playing;
    if (!v || !p?.queue.length) return;
    const one = p.queue[p.i % p.queue.length];
    const { url, picture } = await A.media.playable(one).catch(() => ({}));
    if (!url || picture) return;
    v.src = url; v.loop = p.queue.length === 1;
    v.onended = () => { p.i += 1; play(); };
    v.play().catch(() => {});
  }

  /** The button decides about the person looked at (admin). → true if it did something */
  async function decide(dir) {
    const e = s.entries.find((x) => x.key === A.st.pick);
    const at = e?.pieces?.[0];
    if (!at) return false;
    const pile = at.pile;
    if (dir === 'up' && pile === 'hello') { A.engine.show(true); A.engine.hold({ pile, up: () => at.up(), down: () => at.down({}) }); A.dispatch({ type: 'share', open: true }); return true; }
    const go = dir === 'up' ? at.up : at.down;
    if (!go) return false;
    try { await go(dir === 'down' ? {} : undefined); navigator.vibrate?.(dir === 'up' ? 20 : [12, 50, 12]); } catch (err) { navigator.vibrate?.([40, 40, 40]); A.say(String(err?.message ?? err).slice(0, 60)); }
    s.look = s.look.filter((x) => x !== e);
    A.dispatch({ type: 'pick', key: null });
    refresh();
    return true;
  }

  const close = () => { s.look = null; s.playing = null; };
  return { refresh, lookAt, pick, decide, close, get looking() { return Boolean(s.look); } };
}
