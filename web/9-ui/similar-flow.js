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
import { accountTakes } from '../8-join/known.js';

export function similarFlow(A) {
  const s = { look: null, entries: [], loading: new Set(), playing: null, cmp: null };

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
    if (s.look) { choices(s.look); return ordered(s.look.filter((e) => passes(e, f)), f); }
    const hits = similar(A.index, { words: f.on.x ? words() : [], limit: MANY });
    const list = hits.map((h) => {
      const head = h.entry.head ?? {};
      const old = s.entries.find((e) => e.key === h.key);
      return old ?? { key: h.key, words: [], t: (() => { try { return msOf(String(head["'t"] ?? '')) || 0; } catch { return 0; } })(), person: head['@'] ?? '', sharing: [h.entry.from?.store].filter(Boolean), spot: head.o ?? null, thumb: null, chain: chainOf(h.key) };
    });
    const seen = new Set(), one = list.filter((e) => { const k = e.chain?.key ?? e.key; if (seen.has(k)) return false; seen.add(k); return true; }); // a take once, however many of its strands matched
    const own = (c) => !c || [...c.defs.values()].some((d) => ['v', 'a', 'x', 'l'].includes(d.kind)); // a line (only references to takes) is no result of its own (17.11.: every take showed twice)
    const takes = one.filter((e) => own(e.chain));
    choices(takes);
    return ordered(takes.filter((e) => passes(e, f)), f);
  }

  /**
   * What the selection views offer to choose (17.11., they were empty): every name, sharing point and spot among the
   * results before the selection narrows them, so a choice can always be taken back. ≤ 12 each (the strip).
   */
  function choices(all) {
    const uniq = (xs) => [...new Set(xs.filter(Boolean))].slice(0, 12).map((x) => ({ id: x, label: x }));
    const stores = (A.sources ?? []).map((x) => x.name);
    A.data.similarLists = { ...(A.data.similarLists ?? {}), names: uniq(all.map((e) => e.person)), sharing: uniq([...stores, ...all.flatMap((e) => e.sharing ?? [])]), spots: uniq(all.map((e) => e.spot)) };
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
    s.entries = compute(); A.data.entries = s.entries; // the tiles are there before one is picked
    const known = s.look.findIndex((e) => e.pieces.some((p) => p.pair || p.candidates?.length));
    if (known >= 0) pick(s.look[known].key);
  }

  /**
   * A tile tapped: the double view, it plays (a person's pieces one after another, from the first).
   * A hello whose person may be known already (her ID, or her name: known.js candidates), 16.11./17.11.: the account that
   * exists plays above (its first name sign and password gestures), the new device's takes play below in the take window.
   * ← → above = the next account of that name · ↑ on the button = the same person (her account, a new app password) ·
   * the double view squeezed away, then ↑ = a new account.
   */
  async function pick(key) {
    A.dispatch({ type: 'pick', key });
    const e = s.entries.find((x) => x.key === key);
    const mine = e?.pieces ? e.pieces.map((p) => ({ store: p.from, path: p.path })) : e?.at ? [e.at] : [];
    const folders = e?.pieces?.[0]?.pile === 'hello' ? e.pieces[0].candidates ?? [] : [];
    s.cmp = folders.length ? { key, folders, i: 0, from: e.pieces[0].from, mine } : null;
    if (s.cmp) { playBelow(mine); return showCandidate(); }
    stopBelow();
    tell();
    s.playing = { key, queue: mine, i: 0 };
    A.paint();
    await play();
  }
  /** The account above: its takes from within/, oldest first. */
  async function showCandidate() {
    const c = s.cmp;
    if (!c) return;
    const folder = c.folders[c.i];
    const takes = await accountTakes(c.from, folder).catch(() => []);
    if (s.cmp !== c || c.folders[c.i] !== folder) return; // moved on meanwhile
    s.playing = { key: c.key, queue: takes.map((path) => ({ store: c.from, path })), i: 0 };
    tell();
    A.paint();
    await play();
  }
  /** ← → on the double view: the next / the one before of the accounts that may be hers. → true if there is another */
  function step(dir) {
    const c = s.cmp;
    if (!c || c.folders.length < 2) return false;
    c.i = (c.i + (dir === 'left' ? 1 : -1) + c.folders.length) % c.folders.length;
    navigator.vibrate?.(8);
    showCandidate();
    return true;
  }
  /** What the view shows about the comparison: the account's name, which of how many. */
  function tell() {
    const c = s.cmp;
    A.data.similarLists = { ...(A.data.similarLists ?? {}), compare: c ? { label: /^@\(([^)]*)\)/.exec(c.folders[c.i])?.[1] ?? '', id: /!\(([^()]*)\)$/.exec(c.folders[c.i])?.[1]?.slice(2, 6) ?? '', i: c.i, n: c.folders.length } : null };
  }
  const below = () => document.querySelector('#replay');
  /** The new takes in the take window, one after another, round and round (muted: two videos at once). */
  async function playBelow(queue, i = 0) {
    const v = below();
    if (!v || !queue.length) return;
    const { url, picture } = await A.media.playable(queue[i % queue.length]).catch(() => ({}));
    if (!s.cmp || s.cmp.mine !== queue) return;
    if (!url || picture) { if (queue.length > 1) setTimeout(() => playBelow(queue, i + 1), 1200); return; }
    v.src = url; v.muted = true; v.hidden = false; v.dataset.take = 'compare'; v.loop = queue.length === 1;
    v.onended = () => playBelow(queue, i + 1);
    v.play().catch(() => {});
  }
  function stopBelow() {
    const v = below();
    if (v?.dataset.take === 'compare') { v.onended = null; v.pause(); v.hidden = true; delete v.dataset.take; }
  }
  async function play() {
    const v = document.querySelector('#pickvideo'), p = s.playing;
    if (!v || !p?.queue.length) return;
    const one = p.queue[p.i % p.queue.length];
    const { url, picture } = await A.media.playable(one).catch(() => ({}));
    if (s.playing !== p) return;
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
    // whose account (16.11.): the one above confirmed by ↑ · the double view squeezed away = a new one · nobody known = by her ID
    const into = s.cmp?.key === e.key ? (A.st.similar === 'double' ? { into: s.cmp.folders[s.cmp.i] } : { into: null }) : {};
    if (dir === 'up' && pile === 'hello') { A.engine.show(true); A.engine.hold({ pile, up: () => at.up(into), down: () => at.down({}) }); A.dispatch({ type: 'share', open: true }); return true; }
    const go = dir === 'up' ? at.up : at.down;
    if (!go) return false;
    try { await go(dir === 'down' ? {} : undefined); navigator.vibrate?.(dir === 'up' ? 20 : [12, 50, 12]); } catch (err) { navigator.vibrate?.([40, 40, 40]); A.say(String(err?.message ?? err).slice(0, 60)); }
    s.look = s.look.filter((x) => x !== e);
    s.cmp = null; stopBelow(); tell();
    A.dispatch({ type: 'pick', key: null });
    refresh();
    return true;
  }

  const close = () => { s.look = null; s.playing = null; s.cmp = null; stopBelow(); tell(); };
  return { refresh, lookAt, pick, decide, close, step, get looking() { return Boolean(s.look); }, get comparing() { return Boolean(s.cmp); } };
}
