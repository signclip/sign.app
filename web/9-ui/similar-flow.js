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
import { note as debugNote } from './debug.js';

export function similarFlow(A) {
  const s = { look: null, entries: [], playing: null, cmp: null, carried: null };
  // 20.11.: what a tile shows (picture, chips) is kept per take, not per result: while one types, the results change
  // with every letter (and are empty in between); a take that comes back gets its picture and chips at once. Before,
  // a key loaded once was never loaded again, and a take that came back stayed empty.
  const got = new Map(), loading = new Map(); // take → { thumb, words, at } · take → Promise while it loads
  const takeKey = (e) => e.chain?.key ?? e.pieces?.[0]?.path ?? e.key;
  const dress = (e) => { const g = got.get(takeKey(e)); if (g) Object.assign(e, g); return e; };

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
      return old ?? dress({ key: h.key, words: [], t: (() => { try { return msOf(String(head["'t"] ?? '')) || 0; } catch { return 0; } })(), person: head['@'] ?? '', sharing: [h.entry.from?.store].filter(Boolean), spot: head.o ?? null, thumb: null, chain: chainOf(h.key) });
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

  /** Picture and chips of one take (read once, then kept in got). → { thumb, words, at } */
  async function load(e) {
    if (e.chain) {
      const at = A.media.visualOf(e.chain);
      const thumb = await A.media.picOf(at).catch(() => null);
      const text = await A.media.contextTextOf(e.chain).catch(() => '');
      return { at, thumb, words: readContext(text).gestures.flatMap((g) => g.chips.map((c) => c.text)).slice(0, 6) };
    }
    if (e.pieces) return { thumb: await A.media.picOf({ store: e.pieces[0].from, path: e.pieces[0].path }).catch(() => null) };
    return {};
  }
  async function fill(list) {
    for (const e of list) {
      const k = takeKey(e);
      if (got.has(k)) { dress(e); continue; }
      if (!loading.has(k)) loading.set(k, load(e).finally(() => loading.delete(k)));
      const g = await loading.get(k).catch(() => null);
      if (!g) continue;
      if (g.thumb) got.set(k, g); // no picture yet (a take still being written): asked again at the next change
      for (const x of [e, ...s.entries, ...(s.look ?? [])]) if (takeKey(x) === k) Object.assign(x, x.pieces ? { thumb: g.thumb } : g); // every tile of this take, also the one shown now
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
    A.data.picked = e ?? null; // the double view keeps its result while the results change (20.11.)
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
  /** Start a video and say why if it does not run (17.11.: into sign-debug.txt as 'play', a phone showed nothing). */
  function start(v, where) {
    v.muted = true; v.setAttribute('playsinline', ''); v.autoplay = true;
    v.onerror = () => debugNote({ method: 'play', where, error: `media error ${v.error?.code ?? '?'} ${v.error?.message ?? ''}`.trim(), ms: 0 });
    const go = () => v.play().catch((err) => debugNote({ method: 'play', where, error: String(err?.message ?? err).slice(0, 200), ms: 0 }));
    if (v.readyState >= 2) go(); else { v.onloadeddata = go; v.load(); }
  }
  async function play() {
    const v = document.querySelector('#pickvideo'), p = s.playing;
    if (!v || !p?.queue.length) return;
    const one = p.queue[p.i % p.queue.length];
    let f = null;
    try { f = await A.media.playable(one); } catch (err) { debugNote({ method: 'play', where: one.path, error: `read: ${err?.message ?? err}`, ms: 0 }); }
    if (s.playing !== p) return;
    if (!f?.url) return;
    if (f.picture) { v.removeAttribute('src'); v.poster = f.url; v.load(); if (p.queue.length > 1) setTimeout(() => { if (s.playing === p) { p.i += 1; play(); } }, 1500); return; }
    v.hidden = false; v.src = f.url; v.loop = p.queue.length === 1;
    v.onended = () => { p.i += 1; play(); };
    start(v, one.path);
  }

  /**
   * A result carried into the take window (17.11., user): it lies there as a line — each of its takes one element, the
   * first in the button, the picture playing in the window, one after another. For a hello: name sign and password
   * gestures. Then the button decides as before (↑ = on: the sharing menu, join pulses). The line is a guest: it is not
   * kept on the device and goes when the person is decided or a new take starts.
   */
  async function toLine(key) {
    const e = s.entries.find((x) => x.key === key);
    const files = e?.pieces ? e.pieces.map((p) => ({ store: p.from, path: p.path })) : e?.at ? [e.at] : [];
    if (!files.length) return false;
    A.data.guestAt ??= {};
    const takes = files.map((at, i) => { const id = `guest:${at.path}`; A.data.guestAt[id] = at; return { id, ms: 0, t: i, context: e.person ? `(${e.person})` : '', kinds: ['v'] }; });
    for (const t of takes) A.media.picOf(A.data.guestAt[t.id]).then((url) => { if (url) { A.data.thumbs[t.id] = url; A.paint(); } }, () => {});
    s.carried = e; s.cmp = null; stopBelow(); tell();
    navigator.vibrate?.(15);
    A.dispatch({ type: 'lines', lines: [...A.st.lines.filter((l) => !l.guest), { id: 'guest', guest: true, sticky: '', takes }] });
    A.dispatch({ type: 'at', at: 0 });
    if (A.st.similar === 'double') A.dispatch({ type: 'similar', level: 'many' });
    runLine(0);
    return true;
  }
  /** The guest line plays through, take after take, and begins again. */
  function runLine(i) {
    const line = A.st.lines.at(-1);
    if (!line?.guest || !s.carried) return;
    const take = line.takes[i % line.takes.length];
    if (A.st.at !== i % line.takes.length) A.dispatch({ type: 'at', at: i % line.takes.length });
    A.player.show(take, 0, { play: true, muted: true, onEnd: () => setTimeout(() => runLine(i + 1), 250) });
  }
  /** The guest line goes (decided, or a new take starts). */
  function dropGuest() {
    if (!s.carried && !A.st.lines.some((l) => l.guest)) return;
    s.carried = null;
    const rest = A.st.lines.filter((l) => !l.guest);
    A.player.stop();
    A.dispatch({ type: 'lines', lines: rest.length ? rest : [{ id: 'l0', takes: [], sticky: '' }] });
    A.dispatch({ type: 'at', at: A.st.lines.at(-1).takes.length });
  }

  /** The button decides about the person looked at (admin). → true if it did something */
  async function decide(dir) {
    const e = s.carried ?? s.entries.find((x) => x.key === A.st.pick); // the one carried into the window, else the one picked
    const at = e?.pieces?.[0];
    if (!at) return false;
    const pile = at.pile;
    // whose account (16.11.): the one above confirmed by ↑ · the double view squeezed away = a new one · nobody known = by her ID
    const into = s.cmp?.key === e.key ? (A.st.similar === 'double' ? { into: s.cmp.folders[s.cmp.i] } : { into: null }) : {};
    // ↑ on a hello: the sharing menu opens, join breathes; the account is made when join is tapped there. Only then is
    // she decided (17.11.: the line carried into the window stayed after the account was made).
    const decided = async (run) => { const r = await run(); done(e); return r; };
    if (dir === 'up' && pile === 'hello') { A.engine.show(true); A.engine.hold({ pile, up: () => decided(() => at.up(into)), down: () => decided(() => at.down({})) }); A.dispatch({ type: 'share', open: true }); return true; }
    const go = dir === 'up' ? at.up : at.down;
    if (!go) return false;
    try { await go(dir === 'down' ? {} : undefined); navigator.vibrate?.(dir === 'up' ? 20 : [12, 50, 12]); } catch (err) { navigator.vibrate?.([40, 40, 40]); A.say(String(err?.message ?? err).slice(0, 60)); }
    done(e);
    return true;
  }
  /** A person decided: out of the pile looked at, the double view and the window empty again, the rest of the pile anew. */
  function done(e) {
    s.look = (s.look ?? []).filter((x) => x !== e);
    s.cmp = null; stopBelow(); tell(); dropGuest(); A.data.picked = null;
    A.dispatch({ type: 'pick', key: null });
    refresh();
  }

  const close = () => { if (s.carried) return; s.look = null; s.playing = null; s.cmp = null; A.data.picked = null; stopBelow(); tell(); }; // someone lies in the window: her pile stays until she is decided
  return { refresh, lookAt, pick, decide, close, step, toLine, dropGuest, get carried() { return Boolean(s.carried); }, get looking() { return Boolean(s.look); }, get comparing() { return Boolean(s.cmp); } };
}
