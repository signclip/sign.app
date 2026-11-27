// similar-flow.js — what Similar shows: results for what the take window holds now, or a sharing point's content
// (a tile tapped in the sharing menu, the admin's piles), with pictures and chips filled in as they load.
//
// Purpose:   results = 7-similar/filter.js similar() over the index, for the words of the take now (sticky, the series'
//            element, what is being typed), then the selection views (similar-view.js passes / ordered). A pile of the
//            admin's door comes as items from the sharing engine (onLookAll): grouped by person (a hello is one line per
//            person: name sign, password gestures), a tap opens the single view and plays her pieces from the first;
//            a known person on a new device shows her original beside it. The button then decides (16.11.):
//              hello  ↑ = the sharing menu opens, join pulses, a tap on it = account + answer · ↓ = quiet
//              join   ↑ = within · ↓ = back to hello        within ↓ = quiet        quiet ↑ = within
// Depends:   browser; 1-model (ids), 7-similar/filter.js, similar-view.js, chips.js, media.js
// Test:      the filters in tests/ui.test.mjs and tests/similar.test.mjs; pictures need a browser.
// Limits:    40 results per look (MANY); pictures and chips load one after another (≈ 10 ms each from the device).

import { idKey } from '../1-model/ids.js';
import { similar } from '../7-similar/filter.js';
import { passes, ordered, byPerson, MANY, EARLIER_MAX } from './similar-view.js';
import { inBundle, sortedBy } from './similar-zoom.js';
import { areasOf, aroundOf } from './spot-map.js';
import { baseOf } from './basemap.js';
import { wideOpen, widenWords, applyRange } from './similar-range.js';
import { nowWords, seriesRow } from './chips.js';
import { saveSimilar, readSimilar } from '../4-save/save-similar.js';
import { deviceKeys } from './device-keys.js';
import { writeId as writeIdOf } from '../1-model/ids.js';

const sealKey = async () => (await deviceKeys().catch(() => null))?.device ?? null;
import { readContext } from '../1-model/context.js';
import { takeWords } from '../1-model/context-edit.js';
import { msOf } from '../1-model/time.js';
import { BLACK } from './player.js';
import { accountTakes } from '../8-join/known.js';
import { note as debugNote } from './debug.js';
import { firstOf, fadeOver, shown } from './ahead.js';
import { isEcho } from './media.js';

export function similarFlow(A) {
  const s = { look: null, entries: [], playing: null, cmp: null, carried: null };
  // 20.11.: what a tile shows (picture, chips) is kept per take, not per result: while one types, the results change
  // with every letter (and are empty in between); a take that comes back gets its picture and chips at once. Before,
  // a key loaded once was never loaded again, and a take that came back stayed empty.
  const got = new Map(), loading = new Map(); // take → { thumb, words, at } · take → true while it loads
  const WAIT_MS = 8000, AT_ONCE = 4;
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

  // ---------- chains in the cloud (21.11., user): what lies on top decides where it opens ----------
  /** search: ?( ) on top · template: an empty take _() waiting · series: a line of two takes or more. */
  const kindOf = (c) => { const top = c?.lines?.[0]?.text ?? ''; if (/\{:\?\.\d+\}|\?\(/.test(top)) return 'search'; if (/_\(\)/.test(top)) return 'template'; return (top.match(/:chain\.\d+/g) ?? []).length >= 2 ? 'series' : null; };
  const wordsOfSearch = (c) => (c?.defs.get('?.1')?.body?.items ?? []).filter((i) => i.t === 'value').map((i) => i.text);
  const timeOf = (c) => { try { return msOf(String(c?.head?.["'t"] ?? '')) || 0; } catch { return 0; } };
  /** The series holding the results, and the searches for these words (none typed: the newest six). */
  function chainsBeside(takes, ws) {
    const { index } = A, out = [], seen = new Set(takes.map((e) => e.key));
    const put = (c, kind, extra = {}) => { if (!c || seen.has(c.key)) return; seen.add(c.key); out.push(dress({ key: c.key, kind, chain: c, words: [], t: timeOf(c), person: c.head?.['@'] ?? '', sharing: [c.from?.store].filter(Boolean), thumb: null, ...extra })); };
    for (const e of takes) for (const k of index.tables.weave.get(e.chain?.key) ?? []) { const c = index.tables.chains.get(k); if (kindOf(c) === 'series') put(c, 'series'); }
    const want = new Set(ws.map((w) => w.toLowerCase()));
    const searches = [...index.tables.similar].map((k) => index.tables.chains.get(k)).filter(Boolean).sort((a, b) => timeOf(b) - timeOf(a));
    for (const c of want.size ? searches.filter((c) => wordsOfSearch(c).some((w) => want.has(w.toLowerCase()))) : searches.slice(0, 6)) put(c, 'search', { words: wordsOfSearch(c) });
    return out.slice(0, 40);
  }
  /**
   * A saved similar opened (21.11., G4c): its words and choices, its Weite – and what its top line shows: the take
   * window with its take or line (as a guest), the cloud with its elements exactly so, the element shown single.
   */
  async function openSearch(e) {
    const at = fileOf(e.chain);
    let r = null;
    try { r = at ? readSimilar(new TextDecoder().decode(await at.store.read(at.path))) : null; } catch { r = null; }
    s.search = { key: e.key, words: r?.words ?? wordsOfSearch(e.chain) };
    A.data.search = s.search; A.data.kindCloud = null;
    navigator.vibrate?.(8);
    if (r) {
      const f = A.st.filters, value = { ...f.value }, on = { ...f.on };
      const put = (k, list) => { if (list?.length) { value[k] = list; on[k] = true; } };
      put('initial', r.letters); put('spot', r.spot ? [r.spot] : []); put('sharing', [...(r.persons ?? []), ...r.sharingPoints.map((x) => x.label)]); // who and sharing point are one (27.11.)
      A.dispatch({ type: 'filters', filters: { ...f, value, on, range: Object.keys(r.weite).length ? { ...wideOpen(), ...r.weite } : f.range } });
      const v = r.view, chainNamed = (name) => { const d = e.chain?.defs.get(name); return d?.id ? A.index.chain(writeIdOf(d.id)) : null; };
      const focus = v.focus ? chainNamed(v.focus) : null;
      if (focus) { const refs = kindOf(focus) === 'series' ? [...new Set((focus.lines?.[0]?.text ?? '').match(/:chain\.\d+/g) ?? [])].map((n) => focus.defs.get(n.slice(1))?.id).filter(Boolean).map((id) => A.index.chain(writeIdOf(id))).filter(Boolean) : [focus]; guestLine(refs, false); }
      s.look = v.elements.length ? v.elements.map(chainNamed).filter(Boolean).map((c) => dress({ key: c.key, chain: c, words: [], t: timeOf(c), person: c.head?.['@'] ?? '', sharing: [c.from?.store].filter(Boolean), thumb: null })) : null;
      A.dispatch({ type: 'similar', level: !focus && !v.empty ? 'full' : 'many' });
      refresh();
      if (v.pick) { const target = s.entries[v.pick - 1]; if (target) pick(target.key); }
      return true;
    }
    return refresh();
  }
  function closeSearch() { s.search = null; A.data.search = null; s.look = null; refresh(); }
  /** A kind's bubble spread or tapped: its own cloud in Similar (21.11.); pulled down = the cloud of takes again. */
  function openKind(k) { A.data.kindCloud = k; navigator.vibrate?.(8); if (A.st.similar === 'closed') A.dispatch({ type: 'similar', level: 'many' }); refresh(); }
  function closeKind() { A.data.kindCloud = null; refresh(); }
  /** Where a chain's file lies: { store, path } (the sharing point by its name). */
  const fileOf = (c) => { const f = c?.from; const src = (A.sources ?? []).find((x) => x.name === f?.store); return src && f?.path ? { store: src.store, path: f.path } : null; };
  /** A series tile: its takes into the line (an earlier sequence taken over, 21.11.), as someone else's (a guest line) until changed. */
  async function seriesToLine(e) {
    const c = e.chain, top = c?.lines?.[0]?.text ?? '';
    const names = [...new Set(top.match(/:chain\.\d+/g) ?? [])].map((n) => n.slice(1));
    const chains = names.map((n) => c.defs.get(n)?.id).filter(Boolean).map((id) => A.index.chain(writeIdOf(id))).filter(Boolean);
    return guestLine(chains, true);
  }
  /** Chains (takes) into the line as someone else's (a guest line) until changed; close: Similar goes. */
  function guestLine(chains, close) {
    if (!chains.length) return false;
    A.data.guestAt ??= {};
    const takes = chains.map((tc, i) => {
      const at = A.media.visualOf(tc), lies = fileOf(tc), id = `guest:${lies?.path ?? tc.key}`;
      A.data.guestAt[id] = { ...(at ?? {}), chainStore: lies?.store ?? null, chainPath: lies?.path ?? null };
      if (at) A.media.picOf(at).then((url) => { if (url) { A.data.thumbs[id] = url; A.paint(); } }, () => {});
      return { id, ms: 0, t: i, context: '', kinds: [...tc.defs.values()].map((d) => d.kind).filter((k) => ['v', 'a', 'x'].includes(k)) };
    });
    for (const [i, tc] of chains.entries()) A.media.contextTextOf(tc).then((text) => { if (!text) return; A.dispatch({ type: 'lines', lines: A.st.lines.map((l) => (l.guest ? { ...l, takes: l.takes.map((x, k) => (k === i ? { ...x, context: text } : x)) } : l)) }); }, () => {});
    navigator.vibrate?.(15);
    A.dispatch({ type: 'lines', lines: [...A.st.lines.filter((l) => !l.guest), { id: 'guest', guest: true, sticky: '', takes }] });
    A.dispatch({ type: 'at', at: 0 });
    if (close) A.dispatch({ type: 'similar', level: 'closed' });
    return true;
  }
  /** A template tile: its context becomes one's own series – the takes are taken one after another (21.11.). */
  async function takeOver(e) {
    const text = await A.media.contextTextOf(e.chain).catch(() => '');
    if (!text) return A.shake('context');
    navigator.vibrate?.(15);
    A.dispatch({ type: 'context', text });
    return A.dispatch({ type: 'similar', level: 'closed' });
  }
  /** Spread on a template tile: the cloud bundled by its elements, in its order. */
  async function bundleBy(e) {
    const text = await A.media.contextTextOf(e.chain).catch(() => '');
    const elements = seriesRow(text ?? '', '').flatMap(function flat(n) { return n.take ? [n.words.map((w) => w.text)] : n.children.flatMap(flat); });
    if (!elements.length) return null;
    return A.dispatch({ type: 'filters', filters: { ...A.st.filters, group: { by: 'template', level: 0 }, value: { ...A.st.filters.value, template: elements }, open: null } });
  }
  /**
   * ↑ with Similar open (21.11., G4c): the take window and the cloud as they are, as a similar chain to share – the
   * take in the window (the chosen line, an earlier take) or empty, the element shown single, and – the cloud chosen –
   * its elements exactly so; words, strands, choices and the Weite as its meta. → path
   */
  /**
   * The cloud chosen, ↑ (21.11., user: what goes over is the choice): its question – words, kinds, sharing points, who,
   * time, letters, spot, how far – opening as it is seen (full or many, the take window empty for her own take); no
   * line of mine, no results: she sees what she may see (G4c).
   */
  async function shareCloud() {
    const st = A.st, f = st.filters;
    const ws = s.search ? s.search.words : st.strands.x ? words() : [];
    const day = (ms) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, '.');
    const meta = { words: ws, kinds: ['v', 'x', 'a'].filter((k) => st.strands[k]), persons: f.value.name ?? [], sharingPoints: (f.value.sharing ?? []).map((label) => ({ label })), // persons chosen are sharing points now (27.11.)
      time: f.on.date && f.value.date ? `${day(f.value.date[0])}_${day(f.value.date[1])}` : null, letters: f.value.initial ?? [], spot: f.value.spot?.[0] ?? null, weite: f.range ?? null };
    const saved = await saveSimilar(A.store, meta, { device: A.device, person: A.person, deviceKey: await sealKey(), empty: st.similar !== 'full' }).catch((err) => { console.warn('cloud', err); return null; });
    if (!saved) return null;
    A.data.shareChain = saved.path;
    A.reindex();
    return saved.path;
  }
  /** The element shown single, ↑ (21.11.): it goes over as a line of mine pointing to it; her name offered (foreign: G4a). */
  async function shareElement() {
    const e = A.data.picked ?? (A.data.entries ?? []).find((x) => x.key === A.st.pick);
    return e ? A.take.shareElement(e) : null;
  }
  /** The single view plays the cloud's elements one after another when they were kept (21.11.): the next after this one. */
  function playOn() {
    if (A.st.similar !== 'single' || !s.look) return;
    const i = s.entries.findIndex((e) => e.key === A.st.pick), next = s.entries[i + 1];
    if (next) setTimeout(() => { if (A.st.similar === 'single') pick(next.key); }, 500);
  }

  /** Results now, as view entries (pictures and chips fill in later). */
  function compute() {
    const f = A.st.filters;
    if (s.look) { choices(s.look); const shown = s.look.filter((e) => passes(e, f) && inBundle(e, f.value.bundle, f)); return f.group ? sortedBy(shown, f, { near: A.take?.here?.() }) : ordered(shown, f); }
    const range = { ...wideOpen(), ...f.range }; // how far it looks in each respect (21.11., similar-range.js)
    // the earlier ones of a strand (27.11., user: zoomed open on the context, the picture, the sound = what came before,
    // by date, chosen by the rails): one's own takes with that strand, newest first – only what is being typed narrows them
    const back = f.earlier ?? null;
    const written = back ? String(A.data.typing ?? '').split(/\s+/).filter(Boolean) : s.search ? s.search.words : A.st.strands.x ? words() : []; // the take's context strand on = its words count (21.11., user); a search chain opened: its words
    const ws = range.x > 0 && written.length ? widenWords(written, range.x, A.index.tables.context) : written;
    const hits = similar(A.index, { words: ws, limit: back ? EARLIER_MAX : MANY });
    const list = hits.map((h) => {
      let chain = chainOf(h.key), heardBy = false;
      if (isEcho(chain) && A.index.tables.chains.has(chain.below)) { chain = A.index.tables.chains.get(chain.below); heardBy = true; } // found by what was said in it (Whisper, 26.11.): the take itself
      const head = (heardBy ? chain.head : h.entry.head) ?? {};
      const old = s.entries.find((e) => e.key === h.key);
      return old ?? dress({ key: h.key, words: [], t: (() => { try { return msOf(String(head["'t"] ?? '')) || 0; } catch { return 0; } })(), person: head['@'] ?? '', sharing: [h.entry.from?.store].filter(Boolean), spot: head.id?.o ?? null, where: head['°'] ?? null, thumb: null, chain, heardBy });
    });
    const seen = new Set(), one = list.filter((e) => { const k = e.chain?.key ?? e.key; if (seen.has(k)) return false; seen.add(k); return true; }); // a take once, however many of its strands matched
    const own = (c) => !c || [...c.defs.values()].some((d) => ['v', 'a', 'x', 'l'].includes(d.kind)); // a line (only references to takes) is no result of its own (17.11.: every take showed twice)
    const earlier = A.st.at < (A.st.lines.at(-1)?.takes.length ?? 0) ? A.st.lines.at(-1).takes[A.st.at] : null;
    const focus = { t: earlier?.t ?? Date.now(), cell: A.take?.here?.() ?? null, person: A.person?.label ?? '' }; // round the take in the button, else now
    const reach = { own: ['own'], write: (A.sources ?? []).filter((x) => x.write && x.name !== 'own').map((x) => x.name) };
    const strandOf = (e, k) => (k === 'x' ? Boolean(e.words?.length) || [...(e.chain?.defs?.values() ?? [])].some((d) => d.kind === 'x') : [...(e.chain?.defs?.values() ?? [])].some((d) => d.kind === k));
    const mine = (e) => (e.sharing ?? []).includes('own');
    const found = (back ? one.filter((e) => own(e.chain) && mine(e) && strandOf(e, back)) : applyRange(one.filter((e) => own(e.chain)), range, focus, reach)).map((e) => { const k = kindOf(e.chain); if (k) e.kind = k; return e; });
    const beside = chainsBeside(found, ws);
    // 21.11. (user): the cloud holds takes only; templates, series and saved similar lie as a bubble where they are used
    // (the row, the line, the top of Similar) – spread on it = their own cloud, to choose from
    const kinds = { template: found.filter((e) => e.kind === 'template'), series: beside.filter((e) => e.kind === 'series'), search: beside.filter((e) => e.kind === 'search'), ask: A.pass?.entries(dress) ?? [] }; // ask: requests to pass on my takes (pass-flow.js)
    A.data.kindCounts = Object.fromEntries(Object.entries(kinds).map(([k, list]) => [k, list.length]));
    A.data.kindPics = Object.fromEntries(Object.entries(kinds).map(([k, list]) => [k, list.map((e) => e.thumb).filter(Boolean).slice(0, 4)]));
    const only = A.data.kindCloud; // a kind's own cloud is open
    const takes = only ? kinds[only] ?? [] : found.filter((e) => !e.kind);
    choices(takes);
    const shown = takes.filter((e) => passes(e, f) && inBundle(e, f.value.bundle, f));
    return f.group ? sortedBy(shown, f, { near: A.take?.here?.() }) : ordered(shown, f); // zoomed in a zone: sorted by it (21.11.); Ort: near → far from here (26.11.)
  }

  /**
   * What the selection views offer to choose (17.11., they were empty): every name, sharing point and spot among the
   * results before the selection narrows them, so a choice can always be taken back. ≤ 12 each (the strip).
   */
  function choices(all) {
    const uniq = (xs) => [...new Set(xs.filter(Boolean))].slice(0, 12).map((x) => ({ id: x, label: x }));
    const stores = (A.sources ?? []).map((x) => x.name);
    A.data.similarLists = { ...(A.data.similarLists ?? {}), names: uniq(all.map((e) => e.person)), sharing: uniq([...stores, ...all.flatMap((e) => e.sharing ?? [])]), spots: uniq(all.map((e) => e.spot)) };
    A.data.similarLists.all = all; // what the rails list: every result before a choice narrows them (26.11.)
    const members = {}; // who appears in which sharing point – a sharing point's persons in the who strip (26.11.; rings 21.11.)
    for (const e of all) for (const sp of e.sharing ?? []) if (e.person) (members[sp] ??= new Set()).add(e.person);
    A.data.similarLists.reach = (A.sources ?? []).map((x) => ({ name: x.name, write: Boolean(x.write), own: x.name === 'own', persons: [...(members[x.name] ?? [])].slice(0, 6) }));
    mapOf(all.map((e) => e.spot));
  }

  /** The spots as a map (22.11.): when Ort is open, the areas at its zoom step, their outlines from h3 (loaded once). */
  let mapKey = '';
  function mapOf(spots) {
    const f = A.st.filters;
    if (f.open !== 'spot') return;
    const areas = areasOf(spots, f.group?.by === 'spot' ? f.group.level : 2), key = areas.map((a) => a.id + a.n).join();
    if (key === mapKey) return;
    mapKey = key;
    import('../5-take/where.js').then(async ({ outlineOf }) => {
      const shapes = [];
      for (const a of areas) { const poly = await outlineOf(a.id).catch(() => null); if (poly) shapes.push({ ...a, poly }); }
      if (mapKey !== key) return;
      A.data.spotMap = shapes;
      A.paint();
      const base = await baseOf(aroundOf(shapes)).catch(() => null); // the land under them, from the tiles in the app (26.11.)
      if (mapKey === key && base) { A.data.spotBase = base; A.paint(); }
    }).catch(() => { A.data.spotMap = null; });
  }

  /**
   * Picture and chips of one take (20.11.), each as soon as it is there. Each read has its own time limit, so one
   * slow or hanging file (a sharing point far away) no longer keeps every other tile empty; what is missing is asked
   * again at the next change. → { at, words?, thumb?, sound }
   */
  const limit = (job, ms) => Promise.race([job, new Promise((done) => setTimeout(() => done(null), ms))]);
  async function load(e, put) {
    // 26.11. (user: tiles stayed without picture): what arrives after the limit is still put into its tile – the limit
    // only frees its turn in the queue, it no longer throws the late answer away.
    if (e.chain) {
      const at = A.media.visualOf(e.chain);
      const text = A.media.contextTextOf(e.chain).catch(() => null), pic = A.media.picOf(at).catch(() => null);
      text.then((t) => { if (t != null) put({ at, sound: A.media.soundOf?.(e.chain) ?? null, words: readContext(t).gestures.flatMap((g) => g.chips.map((c) => c.text)).slice(0, 6) }); });
      A.media.heardOf?.(e.chain).then((h) => { if (h) put({ heard: takeWords(h).map((w) => w.text).slice(0, 8) }); }, () => {}); // what was said in it (Whisper, 26.11.)
      pic.then((thumb) => { if (thumb) put({ at, thumb }); });
      await Promise.all([limit(text, WAIT_MS), limit(pic, WAIT_MS)]); // chips and picture each on their own: one that hangs does not hold the other
      return;
    }
    if (e.pieces) { const pic = A.media.picOf({ store: e.pieces[0].from, path: e.pieces[0].path }).catch(() => null); pic.then((thumb) => { if (thumb) put({ thumb }); }); await limit(pic, WAIT_MS); }
  }
  /** Fill the tiles, AT_ONCE takes at a time (before: one after another, and a hanging one stopped all). */
  async function fill(list) {
    const todo = list.filter((e) => { const g = got.get(takeKey(e)); if (g) dress(e); return !(g?.thumb && g?.words) && !loading.has(takeKey(e)); });
    const put = (k) => (g) => {
      got.set(k, { ...got.get(k), ...g });
      for (const x of [...s.entries, ...(s.look ?? [])]) if (takeKey(x) === k) Object.assign(x, x.pieces ? { thumb: g.thumb ?? x.thumb } : g); // every tile of this take, also the one shown now
      if (A.data.picked && takeKey(A.data.picked) === k) { Object.assign(A.data.picked, A.data.picked.pieces ? { thumb: g.thumb ?? A.data.picked.thumb } : g); sound(); }
      A.paint();
    };
    const next = async () => {
      for (let e = todo.shift(); e; e = todo.shift()) {
        const k = takeKey(e);
        if (loading.has(k)) continue;
        loading.set(k, true);
        try { await load(e, put(k)); } finally { loading.delete(k); }
      }
    };
    await Promise.all(Array.from({ length: AT_ONCE }, next));
  }

  /** Refresh after the take or the filters changed. */
  function refresh() {
    if (A.st.similar === 'closed') { if (A.index) { try { compute(); } catch { /* not ready */ } A.paint(); } return; } // closed: only how many templates and series there are, for their bubbles (21.11.)
    s.entries = compute();
    A.data.entries = s.entries;
    fill(s.entries);
    clearTimeout(s.aheadTimer); // the first results are read once they stay for 0.6 s (not at every typed letter), so a tap plays at once (21.11.)
    s.aheadTimer = setTimeout(() => A.media.ahead?.(firstOf(s.entries)), 600);
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
   * A tile tapped: the single view, it plays (a person's pieces one after another, from the first).
   * A hello whose person may be known already (her ID, or her name: known.js candidates), 16.11./17.11.: the account that
   * exists plays above (its first name sign and password gestures), the new device's takes play below in the take window.
   * ← → above = the next account of that name · ↑ on the button = the same person (her account, a new app password) ·
   * the single view squeezed away, then ↑ = a new account.
   */
  async function pick(key) {
    A.dispatch({ type: 'pick', key });
    const e = s.entries.find((x) => x.key === key);
    A.data.picked = e ?? null; // the single view keeps its result while the results change (20.11.)
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
  /** ← → on the single view: the next / the one before of the accounts that may be hers. → true if there is another */
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
    const onward = () => { p.i += 1; if (s.look && p.i >= p.queue.length) return playOn(); return play(); }; // kept elements: the next one plays after (21.11.)
    if (f.picture) { v.removeAttribute('src'); v.poster = f.url; v.load(); if (p.queue.length > 1 || s.look) setTimeout(() => { if (s.playing === p) onward(); }, 1500); return; }
    const release = fadeOver(v); // the last frame of the one before fades into this one (21.11.)
    v.poster = A.data.picked?.thumb || BLACK; // its picture, or black, until the first frame (20.11.: no grey placeholder)
    v.hidden = false; v.src = f.url; v.loop = p.queue.length === 1 && !s.look;
    v.onended = onward;
    start(v, one.path);
    shown(v).then(release);
    A.media.ahead?.([p.queue[(p.i + 1) % p.queue.length]]); // and the next one is read meanwhile
  }

  /**
   * A result carried into the take window (17.11., user): it lies there as a line — each of its takes one element, the
   * first in the button, the picture playing in the window, one after another. For a hello: name sign and password
   * gestures. Then the button decides as before (↑ = on: the sharing menu, join pulses). The line is a guest: it is not
   * kept on the device and goes when the person is decided or a new take starts.
   */
  async function toLine(key) {
    const e = s.entries.find((x) => x.key === key);
    if (e?.kind === 'template') return takeOver(e); // dragged into the take: a template becomes the series (21.11.)
    if (e?.kind === 'series') return seriesToLine(e); // a series lies in the line
    if (e?.kind === 'search') return openSearch(e);
    const files = e?.pieces ? e.pieces.map((p) => ({ store: p.from, path: p.path })) : e?.at ? [e.at] : [];
    if (!files.length) return false;
    A.data.guestAt ??= {};
    const lies = fileOf(e.chain), context = e.words?.length ? `(${e.words.map((w) => `(${w})`).join(' ')})` : ''; // its own context, to change afterwards (21.11.)
    const takes = files.map((at, i) => { const id = `guest:${at.path}`; A.data.guestAt[id] = { ...at, chainStore: lies?.store ?? null, chainPath: lies?.path ?? null }; return { id, ms: 0, t: i, context, kinds: e.chain ? [...e.chain.defs.values()].map((d) => d.kind).filter((k) => ['v', 'a', 'x'].includes(k)) : ['v'] }; });
    for (const t of takes) A.media.picOf(A.data.guestAt[t.id]).then((url) => { if (url) { A.data.thumbs[t.id] = url; A.paint(); } }, () => {});
    s.carried = e; s.cmp = null; stopBelow(); tell();
    navigator.vibrate?.(15);
    A.dispatch({ type: 'lines', lines: [...A.st.lines.filter((l) => !l.guest), { id: 'guest', guest: true, sticky: '', takes }] });
    A.dispatch({ type: 'at', at: 0 });
    // its context as it is written in its file, brackets and all (26.11.): the words of the tile alone lost the nesting,
    // so "Arbeit (Computer Besprechung)" came back as one word "Arbeit Besprechung" when it was changed afterwards
    if (e.chain && takes.length === 1) A.media.contextTextOf(e.chain).then((text) => { if (text && A.st.lines.at(-1)?.guest && A.st.lines.at(-1).takes[0]?.id === takes[0].id) A.dispatch({ type: 'lines', lines: A.st.lines.map((l) => (l.guest ? { ...l, takes: l.takes.map((x, i) => (i === 0 ? { ...x, context: text } : x)) } : l)) }); }, () => {});
    if (A.st.similar === 'single') A.dispatch({ type: 'similar', level: 'many' });
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
    // whose account (16.11.): the one above confirmed by ↑ · the single view squeezed away = a new one · nobody known = by her ID
    const into = s.cmp?.key === e.key ? (A.st.similar === 'single' ? { into: s.cmp.folders[s.cmp.i] } : { into: null }) : {};
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
  /** A person decided: out of the pile looked at, the single view and the window empty again, the rest of the pile anew. */
  function done(e) {
    s.look = (s.look ?? []).filter((x) => x !== e);
    s.cmp = null; stopBelow(); tell(); dropGuest(); A.data.picked = null;
    A.dispatch({ type: 'pick', key: null });
    refresh();
  }

  /**
   * The sound of the result in the single view (20.11.): its own .a.wav, playing along with the picture when the sound
   * strand is on — started, paused and moved with the video, put back in step when they drift (> 0.3 s).
   */
  let soundFor = null, mirrored = false;
  async function sound() {
    const a = document.querySelector('#pickaudio'), v = document.querySelector('#pickvideo'), e = A.data.picked;
    if (!a || !v) return;
    if (!mirrored) {
      mirrored = true;
      const on = () => a.dataset.on === '1';
      v.addEventListener('play', () => { if (on()) { a.currentTime = v.currentTime; a.play().catch(() => {}); } });
      v.addEventListener('pause', () => a.pause());
      v.addEventListener('ended', () => a.pause());
      v.addEventListener('seeked', () => { if (on()) a.currentTime = v.currentTime; });
      v.addEventListener('timeupdate', () => { if (on() && Math.abs(a.currentTime - v.currentTime) > 0.3) a.currentTime = v.currentTime; if (on() && a.paused && !v.paused) a.play().catch(() => {}); });
    }
    const want = A.st.similar === 'single' && A.st.dstrands?.a && e?.sound;
    a.dataset.on = want ? '1' : '';
    if (!want) { a.pause(); return; }
    if (soundFor !== e.sound.path) {
      soundFor = e.sound.path;
      const f = await A.media.playable(e.sound).catch((err) => { debugNote({ method: 'play', where: e.sound.path, error: `sound: ${err?.message ?? err}`, ms: 0 }); return null; });
      if (!f?.url || soundFor !== e.sound.path) return;
      a.src = f.url;
    }
    a.currentTime = v.currentTime || 0;
    if (!v.paused) a.play().catch((err) => debugNote({ method: 'play', where: e.sound.path, error: String(err?.message ?? err).slice(0, 200), ms: 0 }));
  }

  const close = () => { if (s.carried) return; s.look = null; s.playing = null; s.cmp = null; A.data.picked = null; stopBelow(); tell(); }; // someone lies in the window: her pile stays until she is decided
  return { refresh, lookAt, pick, decide, close, step, toLine, dropGuest, sound, openSearch, closeSearch, openKind, closeKind, seriesToLine, takeOver, bundleBy, shareCloud, shareElement, saveSearch: (...a) => shareCloud(...a), playOn, get carried() { return Boolean(s.carried); }, get looking() { return Boolean(s.look); }, get comparing() { return Boolean(s.cmp); } };
}
