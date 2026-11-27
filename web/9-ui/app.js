// app.js — the web app (rewritten 16.11.): wiring only. What the screen is: take-state.js · where: layout.js · how it
// looks: paint*.js · what a gesture means: gestures-take.js · the devices: take-flow.js · Similar: similar-flow.js ·
// the sharing menu: sharing-engine.js (its logic taken over from the version until 16.11.).
//
// Start (15.11.): the background with the take window centred, then the shapes, then the camera fades in inside it.
// Kept on the device per person (persons.js PERSONAL): the strands (settings.auto), the line, the series, sticky,
// the onboarding (name, name sign, password gestures, the two drawn words).
// Depends:   browser; 0-i18n, 2-storage/local, 3-index, 9-ui
// Test:      every part without a screen in tests/ui.test.mjs; the whole in Chrome and on the phone.
// Limits:    one paint per animation frame at most; what this device writes is in the index at once (26.11.,
//            3-index/follow.js), every sharing point is read again every 5 min while seen (21.11.), one build at a time.

import './persons-boot.js';
import { translator } from '../0-i18n/t.js';
import { LocalStore, lasting } from '../2-storage/local.js';
import { buildIndex, Index } from '../3-index/index.js';
import { followIndex } from '../3-index/follow.js';
import { cachePrefix } from '../3-index/parts.js';
import { openDevice } from '../3-index/sqlite.js';
import { mergedOf } from '../3-index/merged.js';
import { newPerson, newSource } from '../1-model/ids.js';
import { drawWords } from '../1-model/words.js';
import { normalize } from './settings.js';
import { deviceKeys } from './device-keys.js';
import { keychain } from './keychain.js';
import { installDebug, note as debugNote } from './debug.js';
import { initial, next } from './take-state.js';
import { takeLayout, markedButton } from './layout.js';
import { outline } from './form.js';
import { takeSvg, fanRows, nowHtml, rowHtml } from './paint.js';
import { similarHtml } from './paint-similar.js';
import { morph } from './morph.js';
import { overHtml } from './paint-over.js';
import { sharingView } from './paint-sharing.js';
import { seriesRow, nowWords } from './chips.js';
import { takeWords } from '../1-model/context-edit.js';
import { hintOf, onboardingSeries, onboardingView } from './onboarding-steps.js';
import { listen } from './touch.js';
import { takeFlow } from './take-flow.js';
import { similarFlow } from './similar-flow.js';
import { passFlow } from './pass-flow.js';
import { mediaOf } from './media.js';
import { playerOf } from './player.js';
import { live as isLive, count as takesOn } from './take-state.js';
import { thumbKey } from './line.js';
import { gesturesOf, ZW } from './gestures-take.js';
import { calmOf } from './calm.js';
import { levelMeter } from './level.js';
import { heardOf } from './heard.js';
import { mountSharing } from './sharing-engine.js';
import { PASSWORD_PARTS } from '../8-join/flow.js';
import { hintSvg } from './hint.js';
import { installDavFetch } from '../2-storage/dav-fetch.js';

installDavFetch(); // native app: PROPFIND, MKCOL, MOVE through the app's own plugin (17.11.: lost in the rewrite, so the door never answered in the APK)
installDebug();
const $ = (sel) => document.querySelector(sel);
const kept = (key, make) => { try { if (localStorage.getItem(key) == null) localStorage.setItem(key, make()); return localStorage.getItem(key); } catch { return make(); } };
const keep = (key, value) => { try { localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value)); } catch { /* private mode */ } };
const read = (key, d) => { try { const v = localStorage.getItem(key); return v == null ? d : JSON.parse(v); } catch { return d; } };

export async function start({ locales, lang = navigator.language.slice(0, 2) }) {
  const t = translator(locales, lang);
  const settings = normalize(read('sign.settings', {}));
  const person = { id: kept('sign.person', newPerson), label: localStorage.getItem('sign.name') || '' };
  const device = kept('sign.device', newSource);
  const store = new LocalStore(await navigator.storage.getDirectory());
  store.lasting = await lasting();
  const A = { t, settings, person, device, store, sources: [{ name: 'own', store, write: true }], index: null, engine: null,
    st: initial(), data: { thumbs: {}, buttonPic: null, entries: [], typing: '', hint: null, sharing: null, drag: null } };
  const ownKeys = await deviceKeys().then((k) => ({ [device]: k.device.public }), () => ({}));
  let indexedAt = Date.now();
  // The index follows this device (26.11., user: the app hung): a take just written is in it when the write returns –
  // no build after every take. A.reindex() after own writes only waits for those; A.reindex({ all: true }) reads every
  // sharing point again (start, every SYNC_MS, new sharing points, something written elsewhere), one build at a time.
  const asked = new Map(); // small pictures asked for (A.thumbOf below)
  const follower = followIndex({
    first: new Index(), // empty until the first build is in: the start does not wait for it
    build: () => { indexedAt = Date.now(); return buildIndex(A.sources, { keys: ownKeys, cache: A.merged?.store ?? store }); },
    onIndex: (index, { all }) => {
      A.index = index;
      A.similar?.refresh();
      if (all) { asked.clear(); A.pass?.scan().catch(() => {}); A.paint?.(); } // pictures that waited for the index are asked again · requests to pass on her takes (21.11.)
    },
  });
  follower.follow(store);
  A.reindex = (how) => follower.reindex(how);
  // All sharing points in one SQLite database on the device (21.11., user; 3-index/merged.js). Opened beside the start,
  // never in its way: until it is there (and if it cannot be: no OPFS, library not loadable) the parts stay as files.
  if (globalThis.Worker && navigator.storage?.getDirectory) {
    const db = openDevice();
    mergedOf(db).then((m) => { A.merged = m; }, (err) => { db.close(); debugNote({ method: 'sqlite', where: 'open', error: String(err?.message ?? err).slice(0, 200), ms: 0 }); });
  }
  // New takes of others also while the app is open (21.11., user): every SYNC_MS when seen, at once when coming back
  // (after ≥ 1 min away); never while recording. Cost: one listing per folder of each sharing point (parts.js).
  const SYNC_MS = 5 * 60 * 1000, freshen = (after) => { if (document.visibilityState === 'visible' && A.st.rec === 'idle' && Date.now() - indexedAt > after) A.reindex({ all: true }).catch(() => {}); };
  setInterval(() => freshen(SYNC_MS), 60 * 1000);
  document.addEventListener('visibilitychange', () => freshen(60 * 1000));
  A.index = follower.index;
  A.reindex({ all: true }).catch(() => {}); // beside the start, never in its way (26.11.)
  A.media = mediaOf(store, () => A);
  /** The chain whose file lies at a path of a sharing point (a take's id on the line), found once per index. */
  const byPath = new WeakMap();
  A.chainAt = (path) => {
    if (!A.index) return null;
    const chains = A.index.tables.chains;
    let m = byPath.get(A.index);
    if (!m || m.count !== chains.size) { // also when chains were added to the same index (26.11.): found anew, ≈ 1 ms per 10,000 chains
      m = { count: chains.size, at: new Map() };
      for (const c of chains.values()) if (c?.from?.path && !m.at.has(c.from.path)) m.at.set(c.from.path, c);
      byPath.set(A.index, m);
    }
    return m.at.get(path) ?? null;
  };
  /**
   * The small picture of a take on the line (26.11., user: they were black after a cut and after a restart). What it
   * shows is said by line.js thumbKey: the frame its first part begins with – a cut's right half the picture at the
   * cut, a join the first take's. One that is not there yet is asked for here, whenever it is painted without one
   * (again after ASK_AGAIN_MS at the earliest), and painted when it arrives. → URL or null
   */
  const ASK_AGAIN_MS = 15_000;
  A.thumbOf = (take) => {
    if (!take) return null;
    const k = thumbKey(take), have = A.data.thumbs[k.key] ?? (k.at ? null : A.data.thumbs[take.id]);
    if (have) return have;
    if (A.data.guestAt?.[take.id]) return A.data.thumbs[take.id] ?? null; // a guest from Similar: similar-flow.js brings its picture
    if (Date.now() - (asked.get(k.key) ?? 0) < ASK_AGAIN_MS) return A.data.thumbs[take.id] ?? null; // meanwhile: the whole take's picture, if there is one
    asked.set(k.key, Date.now());
    const chain = A.chainAt(k.id), where = chain && A.media.visualOf(chain);
    if (where) A.media.picOf(where, k.at).then((url) => { if (url) { A.data.thumbs[k.key] = url; A.paint(); } }, () => {});
    return A.data.thumbs[take.id] ?? null;
  };

  // ---------- state, kept on the device ----------
  let st = { ...A.st, form: settings.shape, strands: { v: settings.auto.includes('v'), a: settings.auto.includes('a'), x: settings.auto.includes('x') } };
  const lines = read('sign.lines', null);
  if (lines?.length) st = { ...st, lines, at: lines.at(-1).takes.length };
  st = { ...st, context: localStorage.getItem('sign.series') ?? '', sticky: localStorage.getItem('sign.sticky') ?? '' };
  const words = read('sign.words', null) ?? drawWords(PASSWORD_PARTS.length - 1);
  keep('sign.words', words);
  const nameSign = Boolean(localStorage.getItem('sign.nameSign')), gestures = read('sign.passwords', []).length;
  st = { ...st, onboard: { ...st.onboard, on: settings.onboarding && (!nameSign || gestures < PASSWORD_PARTS.length), name: person.label, nameSign, gestures, words } };
  if (st.onboard.on) st = { ...st, context: onboardingSeries({ ...st.onboard, own: '' }) };
  A.st = st;
  A.keepLines = () => keep('sign.lines', A.st.lines.filter((l) => !l.guest).map((l) => ({ ...l, takes: l.takes.map(({ thumb, ...x }) => x) })));

  let frame = 0, up = false; // up: the start is through (26.11.: the index or a sharing point may answer before the first paint)
  A.paint = () => { if (up && !frame) frame = requestAnimationFrame(() => { frame = 0; paint(); }); };
  /** Similar full (21.11., user): the take's drawing slides there and back in 0.32 s (layout.js fullOf, t = A.data.fullT). */
  function glideFull(to) {
    const from = A.data.fullT ?? (to ? 0 : 1), t0 = performance.now(), id = t0;
    A.data.gliding = id; document.body.classList.add('gliding');
    const step = (now) => {
      if (A.data.gliding !== id) return;
      const f = Math.min(1, (now - t0) / 320), e = 1 - (1 - f) ** 3;
      A.data.fullT = from + (to - from) * e;
      if (f >= 1) { A.data.gliding = 0; A.data.fullT = to ? 1 : 0; document.body.classList.remove('gliding'); }
      A.paint();
      if (f < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  A.dispatch = (e) => {
    const before = A.st;
    A.st = next(A.st, e);
    if (A.st.strands !== before.strands || A.st.form !== before.form) { settings.auto = Object.keys(A.st.strands).filter((k) => A.st.strands[k]); settings.shape = A.st.form; keep('sign.settings', settings); }
    if (A.st.context !== before.context && !A.st.onboard.on) keep('sign.series', A.st.context);
    if (A.st.similar !== before.similar || A.st.filters !== before.filters || A.st.context !== before.context || A.st.strands !== before.strands) A.similar?.refresh(); // strands on/off = what counts as similar (21.11.)
    if ((A.st.similar === 'full') !== (before.similar === 'full')) glideFull(A.st.similar === 'full' ? 1 : 0); // the button slides down, the arcs to the screen's edges (21.11.)
    if (A.st.similar === 'closed' && before.similar !== 'closed') { A.similar?.close(); A.data.ranging = false; A.data.kindCloud = null; }
    if (!A.st.share && before.share) { A.data.shareChain = null; A.data.suggest = null; } // what was made to share is shared (or not): the next ↑ shares the line again
    if ((A.st.at !== before.at || A.st.rec !== before.rec) && A.st.wide < 0.02 && !A.similar?.comparing) A.showAt?.();
    if (A.st.dstrands !== before.dstrands || A.st.pick !== before.pick || A.st.similar !== before.similar) A.similar?.sound?.(); // the single view's sound (20.11.)
    A.paint();
  };
  A.shake = (role) => { const el = document.querySelector(`[data-role="${role}"]`); el?.classList.add('shake'); setTimeout(() => el?.classList.remove('shake'), 400); navigator.vibrate?.([40, 40, 40]); };
  A.say = (text) => { A.data.note = text; A.paint(); setTimeout(() => { if (A.data.note === text) { A.data.note = ''; A.paint(); } }, 2600); };
  A.keepSettings = () => keep('sign.settings', settings);
  A.lang = lang;
  A.take = takeFlow(A);
  A.heard = heardOf(A); // words from the sound by Whisper (26.11.): the audio arc dragged onto the context arc
  if (A.heard.on()) A.heard.ensure(); // switched on before: the model comes from the browser's cache
  A.pass = passFlow(A); // passing on others' takes: free, or a request to the author (21.11.)
  A.calm = calmOf(A); // the button's times: start when calm, end by itself (20.11.)
  A.level = levelMeter(A); // the sound level on the audio arc while audio is on (21.11.)
  A.player = playerOf(A, $('#replay'));
  /** The window shows what the button holds: live, or the earlier take's picture (17.11.). */
  // 26.11. (user): another take of the line chosen = the window shows that take, also while one's own take waits paused
  // (before, the live picture stayed); back on the take that runs or waits = the camera again, opened anew if it went still (take-flow.js liveAgain).
  A.showAt = () => { const s = A.st; if (isLive(s)) { A.player.stop(); return A.take.liveAgain?.(); } const take = s.lines.at(-1).takes[Math.min(s.at, takesOn(s) - 1)]; return take ? A.player.show(take, 0) : A.player.stop(); };
  A.similar = similarFlow(A);

  // ---------- onboarding: the app teaches itself (onboarding-steps.js) ----------
  A.onboardTook = async (paths) => {
    const o = A.st.onboard;
    if (!o.on) return;
    const visual = paths.find((p) => /\.v\.(mp4|webm|png)$/.test(p)) ?? paths.find((p) => p.endsWith('.x.sign')) ?? paths[0];
    if (!o.nameSign) { keep('sign.nameSign', visual); A.dispatch({ type: 'onboard', patch: { nameSign: true } }); }
    else {
      const list = [...read('sign.passwords', []), visual].slice(-PASSWORD_PARTS.length);
      keep('sign.passwords', list);
      A.dispatch({ type: 'onboard', patch: { gestures: list.length } });
      if (list.length >= PASSWORD_PARTS.length) A.engine?.joinProject().catch(() => {});
    }
    syncOnboardSeries();
  };
  function syncOnboardSeries() {
    const o = A.st.onboard;
    if (!o.on) return;
    A.dispatch({ type: 'context', text: onboardingSeries({ ...o, own: o.own ?? '' }) });
    const h = hintOf({ ...o, takeNow: A.st.rec !== 'idle', shareOpen: A.st.share, join: A.data.sharing?.door?.look });
    if (h.similar && A.st.similar === 'closed') { A.dispatch({ type: 'similar', level: 'many' }); if (!A.data.entries?.length) A.dispatch({ type: 'similar', level: 'closed' }); } // to learn the sign, if Similar knows it
    if (h.step === 'done') { A.dispatch({ type: 'onboard', patch: { on: false } }); keep('sign.series', ''); A.dispatch({ type: 'context', text: '' }); }
  }
  A.syncOnboard = syncOnboardSeries;

  // ---------- the sharing menu ----------
  const panel = $('#sharing');
  const project = await fetch(new URL('../project.json', import.meta.url)).then((r) => r.json()).catch(() => null);
  A.engine = await mountSharing({
    panel, project, own: store, keychain, person, device, t,
    onDraw: (snap) => { A.data.snap = snap; paintSharing(); },
    lastChain: async () => A.take.lastChain(),
    selection: () => Object.keys(A.st.strands).filter((k) => A.st.strands[k]),
    onSources: async (list) => {
      const key = (x) => x.id ?? x.name, gone = A.sources.filter((o) => !list.some((x) => key(x) === key(o)));
      A.sources = list;
      for (const g of gone) A.merged?.forget(cachePrefix(key(g))).catch(() => {}); // access ended: its parts leave the device
      await A.reindex({ all: true });
    },
    words: () => (A.st.onboard.on ? [] : nowWords(A.st.context, A.st.sticky).map((w) => w.text)), // the onboarding's own words ("Name", the drawn ones) find nobody
    onDoor: (state) => { A.data.door = state; A.paint(); },
    onRole: () => { if (A.st.onboard.on) { A.dispatch({ type: 'onboard', patch: { on: false } }); A.dispatch({ type: 'context', text: '' }); keep('sign.series', ''); } }, // Admin, Atlas, Groups: their login is their account, no steps
    index: () => A.index,
    nameSign: async () => { const p = localStorage.getItem('sign.nameSign'); return p ? store.read(p).catch(() => null) : null; },
    helloTakes: async ({ door = false } = {}) => {
      const name = localStorage.getItem('sign.nameSign'), list = read('sign.passwords', []);
      return [...(name ? [{ from: store, visual: name, part: 'name sign', words: ['hello'] }] : []),
        ...(door ? list.slice(0, PASSWORD_PARTS.length).map((visual, i) => ({ from: store, visual, part: PASSWORD_PARTS[i], words: [words[i] ?? A.st.onboard.own ?? ''].filter(Boolean) })) : [])];
    },
    onHello: () => A.syncOnboard(),
    onLook: () => {}, onLookAll: (items) => { A.engine.show(false); A.similar.lookAt(items); },
  }).catch((err) => { console.warn('sharing', err); return null; });
  new MutationObserver(() => { if (A.st.share === panel.hidden) A.dispatch({ type: 'share', open: !panel.hidden }); A.syncOnboard(); }).observe(panel, { attributes: true, attributeFilter: ['hidden'] });

  // ---------- painting ----------
  // The keyboard (17.11.): a browser shrinks only the visual viewport, Android's web view shrinks the whole window. Both
  // count: the tallest window seen at this width is the screen, what is missing below is the keyboard.
  const full = { w: 0, h: 0 };
  const measure = () => {
    if (full.w !== innerWidth) { full.w = innerWidth; full.h = 0; } // turned: measured anew
    const vv = globalThis.visualViewport, seen = Math.min(innerHeight, vv ? vv.height + vv.offsetTop : innerHeight);
    const typing = document.activeElement === $('#say');
    if (!typing || seen > full.h) full.h = Math.max(full.h, innerHeight);
    return Math.max(0, Math.round(full.h - seen), typing ? A.data.nativeKeyboard ?? 0 : 0);
  };
  // The APK (20.11.): with the margins for edge to edge the web view never shrinks for the keyboard; Capacitor's Keyboard
  // plugin says how tall it is (CSS px, with the navigation bar below it: the row sits a little higher, never covered).
  const nativeKeyboard = (px) => { A.data.nativeKeyboard = px; keyboardNow(); };
  globalThis.Capacitor?.Plugins?.Keyboard?.addListener?.('keyboardWillShow', (e) => nativeKeyboard(e?.keyboardHeight ?? 0));
  globalThis.Capacitor?.Plugins?.Keyboard?.addListener?.('keyboardWillHide', () => { nativeKeyboard(0); if (A.st.typing) $('#say').blur(); }); // closed by Android (back, swipe): done writing
  const size = () => ({ w: innerWidth, h: full.h || innerHeight, keyboard: A.st.keyboard });
  /** A take's own context in the row: every word in the colour of the take now (it is one take, 21.11.). */
  const asNow = (n) => (n.take ? { ...n, tone: 'now', words: n.words.map((w) => ({ ...w, tone: 'now' })) } : { ...n, head: (n.head ?? []).map((w) => ({ ...w, tone: 'now' })), children: n.children.map(asNow) });
  /**
   * The take moves as one (26.11., user: the picture ran a little behind the arcs when the keyboard came or Similar
   * opened). Before, the picture slid by CSS (left, top, width, height, clip-path) and the drawing by a transform
   * started beside it: two clocks, and a change in mid-flight began from the wrong spot. Now everything of the take
   * stands where it belongs at once, and one way – counted here, once per frame – carries all of it from where it was
   * seen: #window, #focus, #take and #now by the same translate + scale about the take's middle, #row by its own way
   * up or down. A change that comes while it still moves (the keyboard grows in steps) goes on from where it is.
   * Not when two fingers form the window (it follows them at once), not while Similar full glides (its own frames),
   * not when the screen turned.
   */
  const FLY_MS = 350, calmMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  let fly = null, flew = null; // fly: { dx, dy, sc, row, t0 } what is left to go · flew: the box the take was laid out for last
  const flyAt = (now) => {
    if (!fly) return { dx: 0, dy: 0, sc: 1, row: 0, done: true };
    const f = Math.min(1, Math.max(0, (now - fly.t0) / FLY_MS)), r = (1 - f) ** 3; // slowing down, as the CSS ease did
    return { dx: fly.dx * r, dy: fly.dy * r, sc: 1 + (fly.sc - 1) * r, row: fly.row * r, done: f >= 1 };
  };
  function carry(L, now = performance.now()) {
    const c = flyAt(now), move = c.done ? '' : `translate(${c.dx.toFixed(2)}px, ${c.dy.toFixed(2)}px) scale(${c.sc.toFixed(4)})`;
    for (const el of [$('#take'), $('#now')]) { el.style.transformOrigin = `${L.cx.toFixed(1)}px ${L.cy.toFixed(1)}px`; el.style.transform = move; }
    for (const el of [$('#window'), $('#focus')]) { el.style.transformOrigin = `${(L.cx - parseFloat(el.style.left)).toFixed(1)}px ${(L.cy - parseFloat(el.style.top)).toFixed(1)}px`; el.style.transform = move; }
    $('#row').style.transform = c.done || !c.row ? '' : `translateY(calc(-50% + ${c.row.toFixed(2)}px))`;
    if (c.done) fly = null;
  }
  function slide(L) {
    const box = { x: L.cx, y: L.cy, s: L.rx, row: L.queueY, w: innerWidth }, was = flew, now = performance.now();
    flew = box;
    const direct = !was || was.w !== box.w || A.data.gliding || L.full || document.body.classList.contains('shaping') || calmMotion?.matches;
    if (direct) { fly = null; return carry(L, now); }
    const moved = Math.abs(was.x - box.x) >= 1 || Math.abs(was.y - box.y) >= 1 || Math.abs(was.s / box.s - 1) >= 0.005 || Math.abs(was.row - box.row) >= 1;
    if (!moved) return carry(L, now); // it stands where it stood: what still flies, flies on
    const c = flyAt(now), seen = { x: was.x + c.dx, y: was.y + c.dy, s: was.s * c.sc, row: was.row + c.row }; // where it is seen right now
    const first = !fly;
    fly = { dx: seen.x - box.x, dy: seen.y - box.y, sc: seen.s / box.s, row: seen.row - box.row, t0: now }; // from there to where it belongs now
    carry(L, now);
    if (first) requestAnimationFrame(function step(t) { if (!fly) return; carry(A.L, t); if (fly) requestAnimationFrame(step); });
  }
  // the button moving to the right and back when a line is chosen (26.11.): 300 ms, eased, one frame after another
  let markT = 0, markAt = 0, markFrame = 0;
  const ease = (t) => t * t * (3 - 2 * t);
  function markStep(want) {
    const now = performance.now(), dt = markAt ? Math.min(100, now - markAt) : 0;
    markAt = now;
    if (matchMedia?.('(prefers-reduced-motion: reduce)').matches) markT = want;
    else markT = want > markT ? Math.min(want, markT + dt / 300) : Math.max(want, markT - dt / 300);
    if (markT !== want && !markFrame) markFrame = requestAnimationFrame(() => { markFrame = 0; paint(); });
    if (markT === want) markAt = 0;
    return markT;
  }
  function paint() {
    const st = A.st, L0 = takeLayout(size(), st.similar, st.form, A.data.picture ?? 1, A.data.fullT ?? (st.similar === 'full' ? 1 : 0));
    const mark = markStep(st.chosenLine != null && st.similar !== 'full' && st.wide < 0.02 ? 1 : 0);
    const L = mark > 0 ? markedButton(L0, innerWidth, ease(mark)) : L0; // a line chosen: the button to the right (26.11.)
    A.L = L;
    const win = $('#window'), m = L.media, focus = $('#focus'); // the picture covers the window (form.js cover); only what lies inside the window is seen (20.11., user)
    Object.assign(win.style, { left: `${m.x}px`, top: `${m.y}px`, width: `${m.w}px`, height: `${m.h}px`, clipPath: `path('${outline(L, 0, m.x, m.y)}')` });
    Object.assign(focus.style, { left: `${L.cx - L.rx}px`, top: `${L.cy - L.ry}px`, width: `${2 * L.rx}px`, height: `${2 * L.ry}px`, clipPath: `path('${outline(L, 0, L.cx - L.rx, L.cy - L.ry)}')` });
    focus.classList.toggle('gone', st.similar === 'full');
    win.classList.toggle('off', !st.strands.v);
    win.classList.toggle('gone', st.similar === 'full');
    const svg = takeSvg(st, L, { w: innerWidth, fan: A.data.fan, fanOff: A.data.fanOff, fanShift: A.data.fanShift, playing: Boolean(A.player?.playing), thumbs: A.data.thumbs, thumbOf: A.thumbOf, buttonPic: A.data.buttonPic, cut: A.data.cut, lineShift: A.data.lineShift, split: A.data.split, calm: A.data.calm, timers: A.data.timers, flow: A.heard?.state, auto: A.settings.restartMs != null, meter: A.settings.restartMs != null || A.settings.stillEndMs > 0, range: st.filters.range ?? {}, ranging: A.data.ranging, series: isLive(st) && !st.typing ? A.data.kindCounts?.series ?? 0 : 0 });
    if ($('#take').dataset.svg !== svg) { $('#take').innerHTML = svg; $('#take').dataset.svg = svg; }
    slide(L); // the picture, the drawing, the words and the row: one way, one clock (26.11.)
    A.data.fanRows = fanRows(L); // how many lines the fan shows at once (22.11.) // Similar full glides by itself (glideFull)
    const ob = st.onboard.on ? onboardingView(st.onboard, st.typing ? A.data.typing ?? '' : '') : null; // onboarding: typed into its green chip (21.11.)
    const earlier = !isLive(st) ? st.lines.at(-1)?.takes[st.at] : null; // an earlier take in the button: its own context, in the window and to change (21.11.)
    const edit = earlier && A.data.edit?.id === earlier.id ? A.data.edit : null;
    const ctx = earlier ? (edit?.text ?? earlier.context ?? '') : ob?.series ?? st.context;
    const row = earlier ? (st.typing ? seriesRow(ctx, '').map(asNow) : []) : seriesRow(ctx, st.sticky);
    const rp = $('#replay'), atMs = earlier && rp && !rp.paused ? rp.currentTime * 1000 : null;
    const heardWords = earlier ? takeWords(earlier.heard ?? '') : st.rec !== 'idle' ? (A.data.heardNow ?? []) : []; // from the sound: kept with the take, or read live while it runs (heard.js, 26.11.)
    const shownWords = [...(earlier ? takeWords(ctx).map((w) => ({ ...w, tone: 'now' })) : nowWords(ctx, st.sticky)), ...heardWords.map((w) => ({ ...w, tone: 'now', heard: true, ...(earlier ? {} : { from: null, to: null }) }))];
    A.data.timedWords = shownWords.some((w) => w.from != null);
    const nowText = st.strands.x ? nowHtml(shownWords, L, ob?.green ?? [], { len: earlier?.ms ?? 0, atMs }) : '';
    if ($('#now').dataset.html !== nowText) { $('#now').innerHTML = nowText; $('#now').dataset.html = nowText; } // written only when it changed: the button's arc repaints often (calm.js)
    const rowEl = $('#row');
    rowEl.style.top = `${L.queueY}px`;
    Object.assign(rowEl.style, L.row ? { left: `${L.row.x}px`, right: 'auto', width: `${L.row.w}px`, padding: `0 ${Math.round(L.row.w * 0.4)}px` } : { left: '', right: '', width: '', padding: '' }); // Similar full across: the row under the take's column
    rowEl.classList.toggle('typing', st.typing);
    rowEl.classList.toggle('gone', !st.strands.x);
    const rowText = rowHtml(row, { waiting: ob?.slot === 'own' && !ob.series, all: st.typing, on: st.typing && !ob?.series, caret: st.caret, typing: st.typing && !ob?.series ? A.data.typing : '', offers: ob?.green ?? [], open: A.data.open ?? undefined, join: Boolean(A.data.join), known: A.index ? (w) => A.index.tables.context.has(w.normalize('NFC').toLowerCase()) : null });
    const nTemplates = A.data.kindCounts?.template ?? 0; // the templates' bubble at the end of the row (21.11.): spread or tap = their cloud
    const rowAll = rowText + (!earlier && !ob && !st.typing && nTemplates ? `<span class="kind-bubble" data-role="kinds:template"><em>_</em><b>${nTemplates}</b></span>` : '');
    if (rowEl.dataset.html !== rowAll) { rowEl.innerHTML = rowAll; rowEl.dataset.html = rowAll; }
    const sim = similarHtml(st, A.data.entries ?? [], L, { ...(A.data.similarLists ?? {}), picked: A.data.picked ?? null, search: A.data.search ?? null, lang, kindCloud: A.data.kindCloud ?? null, searches: A.data.kindCounts?.search ?? 0, asks: (A.data.asks ?? []).length, spotMap: A.data.spotMap ?? null, spotBase: A.data.spotBase ?? null, near: A.take?.here?.() ?? null });
    const cloud = $('#similar'), cloudOpen = st.similar !== 'closed';
    if (cloudOpen !== Boolean(A.data.cloudOpen)) { // Similar appears and goes moving (26.11., user): it comes in while the take glides down, fades while it glides back
      A.data.cloudOpen = cloudOpen;
      cloud.classList.toggle('arriving', cloudOpen); cloud.classList.toggle('leaving', !cloudOpen);
      clearTimeout(A.data.cloudTimer);
      A.data.cloudTimer = setTimeout(() => { cloud.classList.remove('arriving', 'leaving'); A.paint(); }, cloudOpen ? 420 : 240);
    }
    if (!cloud.classList.contains('leaving') && cloud.dataset.text !== sim) { morph(cloud, sim); cloud.dataset.text = sim; } // only what differs is changed (morph.js, 26.11.): a tile that stays keeps its element, nothing trembles
    const over = overHtml(st, { w: innerWidth, h: innerHeight }, { ...(A.data.similarLists ?? {}), spotMap: A.data.spotMap ?? null, spotBase: A.data.spotBase ?? null, me: A.person?.label ?? '', lang, k: L.k }); // a respect over everything (26.11.)
    if ($('#over').dataset.text !== over) { morph($('#over'), over); $('#over').dataset.text = over; }
    const cg = $('#carry'), c = A.data.carry; // what is carried follows the finger
    cg.hidden = !c;
    if (c) Object.assign(cg.style, { left: `${c.x - 34}px`, top: `${c.y - 34}px`, backgroundImage: c.pic ? `url("${c.pic}")` : 'none' });
    const pv = $('#pickvideo'), db = st.similar === 'single' ? L.singleBox : null; // the picked result plays in its own element (17.11.): a repaint no longer stops it
    pv.hidden = !db;
    pv.style.visibility = st.dstrands?.v === false ? 'hidden' : ''; // the picture strand of the single view off: only context and sound (20.11.)
    if (db) { Object.assign(pv.style, { left: `${db.x}px`, top: `${db.y}px`, width: `${db.w}px`, height: `${db.h}px`, clipPath: `path('${outline(L.single, 0, db.x, db.y)}')` }); const e = (A.data.picked?.key === st.pick ? A.data.picked : null) ?? (A.data.entries ?? []).find((x) => x.key === st.pick); if (e?.thumb && pv.poster !== e.thumb) pv.poster = e.thumb; }
    else if (pv.src) { pv.pause(); pv.removeAttribute('src'); pv.poster = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; pv.load(); } // transparent: never the WebView's grey placeholder
    $('#note').textContent = A.data.note ?? '';
    const o = st.onboard;
    let h = o.on ? hintOf({ ...o, takeNow: st.rec !== 'idle', shareOpen: st.share, join: A.data.sharing?.door?.look }) : null;
    if (A.data.door === 'ready' && !st.share) h = { step: 'join', role: 'button', gesture: 'swipe-up' }; // the admin answered (17.11.): the button shows the way to join
    if (st.share && h && h.role !== 'hello') h = null; // the menu is open: nothing of the take pulses through it
    const hint = hintSvg(h, { L, sharing: A.data.sharing?.layout ?? null, w: innerWidth, h: innerHeight });
    if ($('#hint').dataset.svg !== hint) { $('#hint').innerHTML = hint; $('#hint').dataset.svg = hint; }
    if (!st.typing && A.data.wasTyping) toStart(rowEl); // done writing: a long row glides back to its start, the next words in sight (20.11.)
    A.data.wasTyping = st.typing;
    if (st.typing) { // the caret stays in sight in a long row (17.11.)
      const c = rowEl.querySelector('.gap.caret') ?? rowEl.querySelector('.chip.typing'); // the caret, behind the word being typed (22.11.)
      if (c) { const a = c.getBoundingClientRect(), mid = a.left + a.width / 2; if (mid < 40 || mid > innerWidth - 40) rowEl.scrollLeft += mid - innerWidth / 2; }
    }
  }
  /** The row glides back to its beginning (≈ 450 ms, slowing down); a finger on it stops the glide. */
  function toStart(el) {
    const from = el.scrollLeft, t0 = performance.now();
    if (from < 1) return;
    const step = (now) => { const f = Math.max(0, Math.min(1, (now - t0) / 450)); if (el.dataset.gliding !== String(t0)) return; el.scrollLeft = from * (1 - f) ** 3; if (f < 1) requestAnimationFrame(step); else delete el.dataset.gliding; };
    el.dataset.gliding = String(t0);
    el.addEventListener('touchstart', () => delete el.dataset.gliding, { once: true });
    requestAnimationFrame(step);
  }
  function paintSharing() {
    if (!A.data.snap) return;
    const v = sharingView(A.data.snap, { w: innerWidth, h: innerHeight }, { drag: A.data.drag });
    A.data.sharing = v;
    if ($('#sharing-svg').dataset.text !== v.svg) { $('#sharing-svg').innerHTML = v.svg; $('#sharing-svg').dataset.text = v.svg; }
    if ($('#sharing-html').dataset.text !== v.html) { // only when something changed: the share row stays where the finger left it, what breathes keeps its beat
      const at = $('#sharing-html .row')?.scrollLeft ?? 0;
      $('#sharing-html').innerHTML = v.html; $('#sharing-html').dataset.text = v.html;
      const row = $('#sharing-html .row'); if (row && at) row.scrollLeft = at;
    }    for (const el of $('#sharing-html').querySelectorAll('.tile')) el.classList.toggle('suggest', Boolean(A.data.suggest) && el.textContent.trim().startsWith(A.data.suggest)); // the person of the single view first in sight (21.11.)

    A.paint();
  }
  A.paintSharing = paintSharing;

  // ---------- touches and keys ----------
  const g = gesturesOf(A);
  // what the window shows decides how the picture covers it (20.11.): the camera (asked 1:1, the device decides), a take, a file
  const picture = () => { const r = $('#replay'), v = r && !r.hidden && r.videoWidth ? r : $('#live'); const a = v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 1; if (Math.abs(a - (A.data.picture ?? 1)) > 0.01) { A.data.picture = a; A.paint(); } };
  for (const v of [$('#live'), $('#replay')]) for (const e of ['loadedmetadata', 'resize', 'play']) v.addEventListener(e, picture);
  for (const e of ['play', 'pause', 'ended']) $('#replay').addEventListener(e, () => A.paint()); // the button shows ▶ or ❚❚ for an earlier take (21.11.)
  $('#replay').addEventListener('timeupdate', () => { if (A.data.timedWords) A.paint(); }); // a word with its own time lights up while it is said (21.11.)
  new MutationObserver(picture).observe($('#replay'), { attributes: true, attributeFilter: ['hidden'] });
  A.pictureAspect = () => A.data.picture ?? 1;
  listen($('#screen'), (ev, e) => { A.calm.poke(); return g.onEvent(ev, e); }); // a touch is input: no start by itself under a finger
  const say = $('#say');
  say.addEventListener('input', () => {
    A.calm.poke();
    if (!say.value.includes(ZW)) { say.value = ZW + say.value; say.setSelectionRange?.(say.value.length, say.value.length); if (say.value === ZW) g.backspace(); } // the mark went: Backspace with nothing typed (21.11.)
    let now = say.value.replace(ZW, '');
    if (!A.st.onboard.on && /[\s()]/.test(now)) { now = g.typed(now); say.value = ZW + now; say.setSelectionRange?.(say.value.length, say.value.length); } // a word ends at a space or bracket: a chip at once (22.11.)
    A.data.typing = now; A.similar.refresh(); A.paint();
  });
  say.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); say.blur(); } }); // Enter = done: the keyboard goes, blur commits
  say.addEventListener('blur', () => { g.commit(); A.dispatch({ type: 'typing', on: false }); g.finish(); });
  const keyboardNow = () => { const px = measure(); if (px !== A.st.keyboard) A.dispatch({ type: 'keyboard', px }); else A.paint(); };
  globalThis.visualViewport?.addEventListener('resize', keyboardNow);
  globalThis.visualViewport?.addEventListener('scroll', keyboardNow);
  say.addEventListener('focus', () => setTimeout(keyboardNow, 300));
  addEventListener('resize', () => { keyboardNow(); paintSharing(); });
  // Android's back button (native app; also lost in the rewrite): one step back — typing, the sharing menu's lists, the menu, Similar — then the app goes to the background
  globalThis.Capacitor?.Plugins?.App?.addListener?.('backButton', () => {
    if (A.st.typing) return say.blur();
    if (A.st.share) return A.engine?.back?.() ? null : A.engine?.show(false);
    if (A.st.filters.full) return A.dispatch({ type: 'filters', filters: { ...A.st.filters, full: null } }); // a respect over everything: back to its rail (26.11.)
    if (A.st.similar !== 'closed' && A.st.similar !== 'single' && A.st.filters.open) return A.dispatch({ type: 'filters', filters: { ...A.st.filters, open: null, group: null, value: { ...A.st.filters.value, bundle: undefined } } }); // an open rail first (26.11.)
    if (A.st.similar !== 'closed') return A.dispatch({ type: 'similar', level: A.st.similar === 'single' ? 'many' : 'closed' });
    if (A.st.wide > 0.02) return A.dispatch({ type: 'wide', spread: 0 });
    return globalThis.Capacitor.Plugins.App.minimizeApp?.();
  });
  addEventListener('hashchange', () => { if (location.hash) return; if (A.st.share) A.engine?.show(false); else if (A.st.similar !== 'closed') A.dispatch({ type: 'similar', level: 'closed' }); });

  // the small pictures of the kept lines are asked for as they are painted (A.thumbOf, 26.11.); the camera after the first paint (15.11.)
  measure();
  up = true;
  paint();
  requestAnimationFrame(() => document.body.classList.add('ready'));
  setTimeout(() => A.take.openCamera(), 350);
  A.engine?.runRules?.().catch(() => {});
  globalThis.SIGN = A; // for the debugging console only
}
