// sharing-engine.js — what the sharing menu does, without drawing it (16.11., taken over from share-mount.js of the
// version until 16.11., done/4-first-ui/): the list in force, its rules, the opened sharing points, upkeep,
// join and the admin's door. paint-sharing.js draws the snapshot it hands to onDraw and calls its handlers with the
// same roles as before ('sp:N', 'account:i', 'person:id', 'hello:i', 'own:N', 'app:i', 'add:new', 'sp-kind:N:k', 'bridge:a:b').
//
//
// Purpose:   keeps the list in force, its rules and the opened sharing points together; after every change
//            of the list it reopens them and hands Similar its sources (show rules). What a gesture means
//            is in share-menu.js, how it looks in view/points.js; this file only listens and calls.
//            A folder or disk that comes back (checked every 30 s) gets its rules run at once: backup and
//            copies catch up by themselves. Upkeep (2-storage/upkeep.js): a new rule runs right after it
//            is made, copies every hour, backups every 7 days; a sharing point offline at start is opened
//            again; each tile shows how its last run went; a tile dropped on this device (0) brings its
//            files home (a backup is restored).
// Depends:   browser; 2-storage (list, sharing-point, sharing-points), 4-save/share-take,
//            9-ui (share-menu, share-add, folders, touch, view/points, view/ring)
// Test:      needs a browser; the parts are tested in tests/list.test.mjs and tests/ui.test.mjs.
// Limits:    one list per device store; 30 s until a plugged-in disk is noticed (browser: only while the
//            app is open, and after one tap on its tile per session for permission); upkeep runs only while
//            the app is open (native app: EXTEND(S10, background) a background task).

import { connect } from '../2-storage/connect.js';
import { note as debugNote } from './debug.js';
import { doorPart } from './share-door.js';
import { accountPart } from './share-accounts.js';
import { pilesOf, roleOf, accountsOf } from '../8-join/flow.js';
import { findList, changeList, rulesOf } from '../2-storage/list.js';
import { readList } from '../2-storage/sharing-point.js';
import { openAll, afterTake, sources, runRules, reconnect } from '../2-storage/sharing-points.js';
import { dueRules, remember, retry, backupKey, summary, reopen, bringHome, sealPaper, PAPER_ID } from '../2-storage/upkeep.js';
import { newPaperPassword } from '../2-storage/backup-key.js';
import { readFile } from '../1-model/file.js';
import { sheetPdf, sheetData, sheetName, paperChoice } from './emergency.js';

const SIGNER_PAPER_ID = 'paper-signer'; // the signer code on the sheet and the path of its certificate in the door
import { partsOf } from '../2-storage/layout.js';
import { quietIds } from '../4-save/remove.js';
import { deviceKeys, joins, accessKey } from './device-keys.js';
import { readPaste } from '../2-storage/spec.js';
import { copyRoute } from '../2-storage/routes.js';
import { send, filesOf, targets, sendTo, defaults, printFile, saveFiles, copy } from './system-share.js';
import { shareTake } from '../4-save/share-take.js';
import { timeLabel, readName } from '../1-model/filename.js';
import { shown } from '../1-model/time.js'; // the surface shows local time
import { tiles, gestureOn, targetFor, KINDS } from './share-menu.js';
import { writeMove, readMove } from '../2-storage/move-note.js';
import { addNew, bringIn, peek, pickFolder, loginAt, resumeLogin, giveOut, giveToAccount, cloudIdOf, browseChips, waitingShares, acceptWaiting, openPage, askAccount, expectedOf } from './share-add.js';
import { readHello, devicesOf, quietDevice, takeFiles } from '../8-join/join.js';
import { helloTakes, accountTakes, firstPieces, knownFolder } from '../8-join/known.js';
import { doorView, toWithin, backToHello, moveAccount, deleteFolder } from '../8-join/door.js';
import { makeOrRenew, hellosToWelcome, welcome, followJoins, joinProject, helloToDoor, checkKey, withdrawHello, ensureGroupsHere } from './share-group.js';
import { askRemove } from '../8-join/remove-request.js';
import { folders, canPick } from './folders.js';

import { revokeAppPassword, setDisplayName } from '../8-join/provision.js';
import { renames, adoptRename, declineRename } from '../8-join/rename.js';
import { nameSignOf } from '../8-join/join.js';
import { findPeople, isAdmin, doorFolder, listAccounts, setQuota, nextQuota, sharedWithMe, shareFolder, makeFolder, setEnabled, deleteAccount, groupsOf, setGroup, matchAccounts } from '../8-join/provision.js';
import { summarize, readSummary, SUMMARY, EVERY_MS } from '../3-index/atlas.js';
import { WebDavStore } from '../2-storage/webdav.js';
import { confirmAdmin } from './confirm-admin.js';
import { webdavUrl } from '../2-storage/nextcloud.js';
import { newSource } from '../1-model/ids.js';



const dec = new TextDecoder();

/** Small things this device remembers about its own runs (never shared). */
function kept(key) { try { return JSON.parse(localStorage.getItem(key) ?? '{}'); } catch { return {}; } }
function keep(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } }

async function clipboardText() {
  try {
    const cap = globalThis.Capacitor?.Plugins?.Clipboard;
    const read = cap ? cap.read().then((r) => r.value) : navigator.clipboard.readText();
    return await Promise.race([read, new Promise((_, no) => setTimeout(() => no(new Error('clipboard')), 1000))]); // at most 1 s
  } catch {
    return '';
  }
}

/**
 * panel: element over the screen · own: the device store · keychain: { get, set } · person: { id, label } ·
 * device: q_ · t: translator · lastChain(): newest take chain · selection(): kinds on in the ring ·
 * once(): kinds for this share only (a strand held on the screen while ↑ on the point) or null ·
 * onSources(list): new sources for Similar · nameSign(): bytes of the name sign video or null (goes with each hello) ·
 * project: { label, read, drop } the project's door (project.json): the first join, without a group text.
 * → { show(on), afterTake(paths), runRules(), dropKind(n, kind) }
 */
/** Where a person looked at may go by a tap on a pile (16.11.): on and back. within ↓ quiet goes by carry (it asks first), quiet ↓ never by tap. */
const HELD_UP = { hello: 'join', join: 'within', quiet: 'within' };
const HELD_DOWN = { hello: 'quiet', join: 'hello' };

export async function mountSharing({ panel, onDraw = () => {}, own, keychain, person, device, t, lastChain, selection = () => KINDS, once = () => null, onSources = () => {}, nameSign = async () => null, helloTakes = async () => [], project = null, onHello = () => {}, onDoor = () => {}, onRole = () => {}, onOwnHold = () => {}, onLook = () => {}, onLookAll = () => {}, words = () => [], index = () => null }) {
  const s = {
    entries: [], // the sharing points of the list in force
    rules: [], // its rules (list.js rulesOf)
    open: new Map(), // n → opened sharing point (sharing-points.js openAll)
    focus: null, // the circle shared to last
    waitSecret: null, // q_ of a sharing point that waits for a pasted password
    giveTo: null, // n that waits for a pasted cloud id
    browse: null, // after a login: choosing the folder
    appear: false, fresh: new Set(), // the menu just opened · join states that just changed (their symbols build up)
    incoming: [], // shares waiting for me in my own Nextcloud
    acceptThere: null, // after giving to a cloud id: { url, label } of the other side's page
    hellos: [], // signer: hellos waiting in my group folders
    signersWaiting: [], // signer (22.11.): new signers of the door within their 48 h, as waiting tiles (tap = agree, ↓ = object)
    joinStates: new Map(), // member: label → 'hello' | 'join'
    note: '', // one short line under the circles
    runs: new Map(), // n → how its last run went (upkeep.summary)
    last: kept('sign.upkeep'), // ruleKey → ms of its last run (this device only)
    running: false,
  };
  /** The network log as a file (held on the note line): to find a failure. */
  async function debugFile() { const { logFile } = await import('./debug.js'); const file = logFile(globalThis.SIGN_VERSION ?? ''); await copy(await file.text()).catch(() => null); return file; }

















  let sealWith = null; deviceKeys().then((k) => { sealWith = k.device; }, () => {}); // the list is sealed like every .sign
  const meta = () => ({ device, person, now: Date.now(), time: timeLabel(Date.now()), deviceKey: sealWith });
  // The list is changed by one writer at a time (17.11.): two changes side by side both read the same version and one was lost.
  let writing = Promise.resolve();
  const write = (edit) => { const run = writing.then(() => changeList(own, edit, meta())); writing = run.catch(() => {}); return run; };
  const every = () => tiles(s.entries, s.rules, s.open, s.runs).filter((x) => { const e = s.entries[x.n - 1]; return e && !(e.key && !e.path); }); // also the door after the join: its state is still followed (quiet note, rename)
  const all = () => every()
    .filter((x) => !(x.group && s.joinStates?.get?.(x.label) === 'within' && s.doorLabels?.has(x.label))) // joined (15.11.): the door is no tile any more; my Sign is
    .filter((x) => !(doorLabel && x.label === doorLabel && ['join-own', 'within'].includes(s.joinStates?.get?.(x.label)))) // 17.11.: gone the moment my own Sign came, never both side by side
    .map((x) => { const to = s.moved?.get(s.entries[x.n - 1]?.id); return to ? { ...x, moved: to, label: `→ ${to.replace(/^https?:\/\//, '').split('/')[0]}` } : x; })
    .filter((x) => ![s.adminN, s.atlasN, s.groupsN].includes(x.n)) // Admin, Atlas, Groups (15.11.): a login is an account (the small circle upper left), no storage tile
    .filter((x) => !(ctx.role && doorLabel && x.label === doorLabel)); // a role has no door // Admin and Atlas are no storage (15.11.) // devices (this one and the person's others) are no tiles: their check keys are for the seals // this device is the own tile (0), not a second one

  // ---------- upkeep: what is due runs by itself (2-storage/upkeep.js) ----------
  const host = async () => { const { pickup } = await deviceKeys(); return { id: device, pickup: pickup.public, privateKey: pickup.privateKey }; };
  const paper = async () => { const text = (await clipboardText()).toUpperCase().replace(/[\s-]/g, ''); return /^[0-9A-Z]{26}$/.test(text) ? text : null; }; // as printed: groups of 4 with spaces
  async function skip() { // removed takes never come back through a copy or a restore
    const texts = [];
    for (const { path } of await own.list('chain/')) if (path.includes('quiet') && path.endsWith('.sign')) texts.push(dec.decode(await own.read(path)));
    const ids = quietIds(texts);
    return (path) => ids.has(partsOf(path)?.u);
  }
  /** Run what is due (or, with only = n, everything of that sharing point now). → report */
  const run = async (only = null) => {
    if (s.running) return [];
    const rules = only == null ? dueRules(s.rules, s.last) : s.rules.filter((r) => r.to === only || r.from === only);
    if (!rules.length) return [];
    s.running = true;
    try {
      let key = null;
      for (const r of rules.filter((x) => x.mark === 'backup')) { // one key per device, sealed at every backup target
        const target = s.open.get(r.to)?.store;
        if (target) key = await backupKey(target, { keychain, host: await host(), paper }).catch(() => key);
      }
      const report = await runRules(rules, s.open, { own, backupKey: key, skip: await skip() });
      for (const [n, line] of summary(report)) s.runs.set(n, line);
      s.last = remember(s.last, report);
      keep('sign.upkeep', s.last);
      if (only != null) tell(only);
      if (!panel.hidden) draw();
      return report;
    } finally { s.running = false; }
  };
  /** One line about sharing point n under the tiles. */
  function tell(n) {
    const line = s.runs.get(n), label = s.entries[n - 1]?.label ?? '';
    if (line) say(t(`run.${line.state}`, { label, n: line.copied }));
  }

  /** Why a join stopped (16.11.): into sign-debug.txt and as a short note in the menu, never silent. */
  const joinNote = (why) => {
    debugNote({ method: 'join', where: project?.label ?? 'Sign', error: String(why).slice(0, 300), ms: 0 });
    if (/no name sign yet/.test(String(why)) || ctx.role) return null; // not a failure (17.11.): the onboarding is not there yet, or a role says no hello — only in the log
    s.note = String(why).slice(0, 60); if (!panel.hidden) draw(); return null;
  };
  /**
   * The project's door, then the hello at once (16.11., user: first start = automatic). The door comes into the list
   * (joinProject); if no hello went out yet and the door is open, the hello goes with name sign and password gestures.
   * Tapping or dragging onto the hello bubble stays a second way (a door with a password waits for it first).
   */
  let joining = null; // one at a time (17.11.): every change of the list loads anew and asked again, three hellos went out side by side
  const joinDoor = () => (joining ??= joinDoorOnce().finally(() => { joining = null; }));
  async function joinDoorOnce() {
    const label = project?.label || 'Sign';
    if (await joinProject(ctx, project, { report: joinNote })) await load();
    if (!project?.doors?.length || (await joins.get(label).catch(() => null))) return draw();
    if (!ctx.s.entries.some((e) => e.label === label) || ctx.s.waitSecret) return draw(); // not in the list, or waiting for its password
    const ready = await helloTakes({ door: true }).catch(() => []);
    if (ready.length < 4) return draw(); // name sign + 3 password gestures first (flow.js); until then the bubble waits
    const m = await helloToDoor(ctx, label).catch((err) => joinNote(`hello: ${err?.message ?? err}`));
    if (!m) return joinNote('hello: nothing went out');
    (s.joinStates ??= new Map()).set(label, m.state); s.fresh.add(label); onHello(); onDoor(m.state);
    return draw();
  }
  // One load at a time, each after the one before (17.11.): two side by side left the older one's opened sharing
  // points standing over the newer list, so the door's drop link was missing and no hello went out.
  let loading = Promise.resolve();
  const load = () => (loading = loading.then(loadOnce, loadOnce));
  async function loadOnce() {
    const at = await findList(own, person.label); // my list: several persons may share this device
    const text = at ? dec.decode(await own.read(at)) : '';
    s.entries = text ? readList(text) : [];
    s.rules = text ? rulesOf(text) : [];
    if (!s.entries.some((e) => e.id === device && e.key)) { // this device in my own list with its check key z_ (14.11.):
      const { device: key } = await deviceKeys(); sealWith = key; // whoever reads my list (atlas too) can check my seals
      const added = await write({ add: { label: `${person.label} · ${device.slice(2, 6)}`, path: null, id: device, key: key.public } }).catch(() => null);
      if (added) return loadOnce(); // once; if it cannot be written, the list stays as it was
    }
    if (await takePendingLogin().catch(() => false)) return loadOnce(); // a role login moved here from another account (15.11.)
    s.open = await openAll(s.entries, { keychain, own, folders, access: accessKey }); // access: an object storage through the gateway (21.11.)
    onSources(sources(s.rules, s.open, own));
    waitingShares(ctx).then(async (list) => { // asks in the background
      const expected = expectedOf(ctx, list); // from accounts I brought in: taken in without a tap
      for (const item of expected) await acceptWaiting(ctx, item).catch(() => {});
      s.incoming = [...list.filter((x) => !expected.includes(x)), ...await groupFolders().catch(() => [])]; // and group folders others added me to (16.11.)
      if (!panel.hidden) draw();
    });
    findAdmin().then(refreshDoor); // admin? then the signer: who said hello, and the door's piles
    lookForJoins(); // member: my joins; a state that changed builds its symbol up once
    await roleByName(); // Admin, Atlas, Groups (15.11.): known by the login's name, before the door is asked
    if (!ctx.role) joinDoor().catch((err) => joinNote(`join: ${err?.message ?? err}`)); // the first group: the project's door (also after its password came); a role says no hello
    checkMoves().catch(() => {});
  }
  /** My joins looked at again: on every load, every 15 s while a hello waits, and when the app comes back (17.11.). */
  let looking = null;
  const lookForJoins = () => (looking ??= followJoins(ctx).then(async (states) => {
    for (const [label, st] of states) if (st === 'within' && (await joins.get(label).catch(() => null))?.door) (s.doorLabels ??= new Set()).add(label); // joined doors: no tile
    for (const [label, st] of states) if (s.joinStates?.get?.(label) !== st) s.fresh.add(label);
    const before = doorLabel ? s.joinStates?.get?.(doorLabel) ?? null : null;
    s.joinStates = states;
    const now = doorLabel ? states.get(doorLabel) ?? null : null;
    if (now !== before) { onDoor(now); if (now === 'ready') navigator.vibrate?.([20, 60, 20]); } // the answer is there: felt, and the button shows the way
    if (!panel.hidden) draw();
    return states;
  }, () => s.joinStates).finally(() => { looking = null; }));
  const waitsForAnswer = () => [...(s.joinStates?.values?.() ?? [])].some((st) => st === 'hello');
  setInterval(() => { if (!document.hidden && waitsForAnswer() && navigator.onLine !== false) lookForJoins(); }, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && waitsForAnswer()) lookForJoins(); });

  /** Sealed moves (15.11.): a sharing point that says its content went elsewhere breathes "→ host"; a tap follows it. ≤ 1 look per tile per 10 min. */
  async function checkMoves() {
    s.moved ??= new Map(); s.moveSeen ??= new Map();
    let changed = false;
    for (const [, sp] of s.open) {
      const id = sp.entry?.id;
      if (!sp.store?.read || !id || Date.now() - (s.moveSeen.get(id) ?? 0) < 600000) continue;
      s.moveSeen.set(id, Date.now());
      const m = await readMove(sp.store);
      const to = m && !s.entries.some((e) => e.path === m.to) ? m.to : null;
      if ((s.moved.get(id) ?? null) !== to) { if (to) s.moved.set(id, to); else s.moved.delete(id); changed = true; }
    }
    if (changed && !panel.hidden) draw();
  }
  async function edit(change) {
    if (change?.remove != null) await moveNote(change.remove).catch(() => {}); // taken away right after everything was copied out: a sealed move note stays behind
    if (change?.remove != null) await logoutEntry(change.remove).catch(() => {}); // a login taken away: its app password deletes itself, the keychain forgets it
    if (change?.remove != null && [s.adminN, s.atlasN, s.groupsN].includes(change.remove)) { ctx.admin = undefined; ctx.door = null; s.adminN = s.atlasN = s.groupsN = null; ctx.groups = null; ctx.atlas = null; s.door = null; s.accounts = s.account = s.index = null; } // Admin or Atlas taken away: asked anew
    await write(change);
    await load();
    draw();
    run().catch(() => {}); // a new copy or backup starts now, not at the next start
  }
  /** Log out one tile (15.11.): its app password deletes itself on the Nextcloud unless another tile of the same login still uses it; the keychain forgets it. */
  async function logoutEntry(n) {
    const e = s.entries[n - 1], spec = s.open.get(n)?.spec;
    const secret = e?.id ? await keychain.get(e.id) : null;
    if (!secret) return;
    const others = await Promise.all(s.entries.map(async (x, i) => i + 1 !== n && x.id && (await keychain.get(x.id)) === secret));
    if (spec?.kind === 'nextcloud' && !others.some(Boolean)) await revokeAppPassword({ server: spec.server, user: spec.user, password: secret });
    await keychain.remove?.(e.id);
  }
  /** A tile taken away ≤ 10 min after everything was copied from it to another: the move note in it (before its key goes). */
  async function moveNote(n) {
    const c = s.copiedTo, e = s.entries[n - 1];
    if (!c || !e || c.fromId !== e.id || Date.now() - c.at > 600000 || !c.toPath) return;
    const store = s.open.get(n)?.store, keys = await deviceKeys();
    if (store) await writeMove(store, { to: c.toPath, device: { id: device, key: keys.device.public }, deviceKey: keys.device, person });
    s.copiedTo = null;
  }
  /** Log out every tile of one account (a quiet note from the admin, 15.11.). */
  async function logout(account) {
    if (!account) return;
    for (let i = 0; i < 10; i++) { // ≤ 10 tiles of one account
      const n = [...s.open].find(([, sp]) => sp.spec?.server === account.server && sp.spec?.user === account.user)?.[0];
      if (!n) return;
      await edit({ remove: n });
    }
  }
  const say = (text) => {
    if (text === t('copied')) { // copied: the touched tile flashes green, no word (14.11.)
      s.flash = role ?? 'sp:0';
      s.note = '';
      draw();
      setTimeout(() => { s.flash = null; draw(); }, 700);
      return;
    }
    s.note = text;
    draw();
  };
  const doorLabel = (project?.doors?.length || project?.read) ? project.label || 'Sign' : null; // the project's door, if there is one
  const ctx = { every: () => every(), confirmed: () => confirmed(), project, s, keychain, edit, logout: (a) => logout(a), load, say, t, all, device, person, nameSign, helloTakes, doorLabel, doorSigner: project?.signer ?? null, atlasUser: project?.atlas ?? null, group: project?.group ?? undefined, gateway: project?.gateway || null, tileOf: (n) => all().find((x) => x.n === n), draw: () => draw(), show: (on) => show(on), newPerson: () => onOwnHold() };
  // the admin's door and what Admin, Atlas, Groups do: their own files (15.11., share-door.js, share-accounts.js)
  const { refreshDoor, lookPile, pileList, adminStore, signerVerdict } = doorPart(ctx, { panel, onLookAll });
  const { atlasCount, atlasSummary, newGroup, showIndex, indexTiles, showAccounts, accountTiles, showGroups, groupTiles, addToGroup } = accountPart(ctx, { words, onLookAll, project });
  ctx.showIndex = showIndex;

  // ---------- doing what a gesture says ----------
  async function shareTo(n, kinds = null) {
    const sp = s.open.get(n);
    const chainPath = await lastChain();
    if (!sp?.store || !chainPath) return say(t('notReachable'));
    s.focus = n;
    const tile = ctx.tileOf(n);
    const target = { entry: { ...sp.entry, always: kinds ?? (tile.kinds.length ? tile.kinds : KINDS) }, description: sp.description ?? { kinds: KINDS }, store: sp.store };
    await shareTake({ own, chainPath, device, person, now: Date.now(), targets: [target], once: once(), deviceKey: (await deviceKeys()).device }); // once: a held strand (parallel)
    return say(`${t('share')} → ${sp.entry.label}`);
  }

  /** The last take through the system share sheet (14.11.): video or picture, sound, text as files. */
  async function outside(target = undefined) {
    if (s.pending) { // something prepared (the emergency sheet): it goes, then the sheet closes
      const p = s.pending;
      if (target?.glyph === 'print') return printFile(p.files[0]).then(() => show(false), () => say(t('notReachable')));
      if (target?.glyph === 'save') return saveFiles(p.files).then(() => show(false), () => null);
      const done = target === undefined ? send(p) : sendTo(target, p);
      return done.then(() => show(false), () => say(t('notReachable')));
    }
    const chainPath = await lastChain();
    if (!chainPath) return say(t('notReachable'));
    const defs = [...readFile(dec.decode(await own.read(chainPath))).defs.values()].filter((d) => ['v', 'a', 'x'].includes(d.kind) && d.id);
    const files = await filesOf(own, defs.map((d) => d.id));
    if (!files.length) return say(t('notReachable'));
    if (target === undefined) return send({ title: 'Sign', files }).catch(() => null);
    if (target.glyph === 'save') return saveFiles(files).catch(() => null); // into a folder the person picks
    s.flash = role; draw(); setTimeout(() => { s.flash = null; draw(); }, 700); // seen at once; the app opens after the files are ready
    return sendTo(target, { files }).catch(() => say(t('notReachable')));
  }
  const FIRST_APPS = ['com.whatsapp', 'org.thoughtcrime.securesms', 'org.telegram', 'com.google.android.gm', 'com.google.android.apps.messaging', 'com.google.android.apps.docs', 'com.google.android.documentsui', 'com.google.android.gms', 'com.android.bluetooth', 'com.instagram']; // messenger, mail, Drive, save to files, Nearby Share
  /** Android (14.11.): the apps that take a share, the most used first, loaded once when the menu first opens. */
  async function loadApps() {
    if (s.apps) return;
    let used = {};
    try { used = JSON.parse(localStorage.getItem('sign.apps') || '{}'); } catch { /* private mode */ }
    const [found, mine] = await Promise.all([targets('*/*'), defaults()]);
    const list = found.filter((a, i) => found.findIndex((b) => b.pkg === a.pkg) === i); // one per app
    if (!list.length) { s.apps = { list: [], x: 0 }; return; }
    // fixed in front (15.11.): the person's file manager (saves into a folder), print, the own mail app, WhatsApp, Bluetooth — then the rest
    const take = (test) => { const i = list.findIndex(test); return i < 0 ? [] : list.splice(i, 1); };
    const FILES = ['com.google.android.apps.nbu.files', 'com.sec.android.app.myfiles', 'com.mi.android.globalFileexplorer', 'com.android.fileexplorer', 'com.coloros.filemanager', 'com.huawei.filemanager', 'com.google.android.documentsui'];
    take((a) => FILES.includes(a.pkg) || (mine.files && a.pkg === mine.files.pkg)); // the file manager's own share entry: saving goes through the folder picker below
    const front = [
      { label: mine.files?.label ?? 'Dateien', pkg: '__save', glyph: 'save', icon: mine.files?.icon }, // looks like the own Files app, opens its folder picker
      { label: 'Drucken', pkg: '__print', glyph: 'print' },
      ...take((a) => mine.mail && a.pkg === mine.mail), ...take((a) => a.pkg === 'com.whatsapp'), ...take((a) => /bluetooth/.test(a.pkg)),
    ];
    s.apps = { list: [...front, ...list.sort((a, b) => (used[b.pkg] ?? 0) - (used[a.pkg] ?? 0))], x: 0 };
    if (!panel.hidden) draw();
  }
  /** The row as shown: printing only for a page (the emergency sheet), not for a take. */
  const rowApps = () => (s.apps?.list ?? []).filter((x) => x.glyph !== 'print' || s.pending);
  function usedApp(app) {
    try { const used = JSON.parse(localStorage.getItem('sign.apps') || '{}'); used[app.pkg] = (used[app.pkg] ?? 0) + 1; localStorage.setItem('sign.apps', JSON.stringify(used)); } catch { /* private mode */ }
  }

  /** Admin: a signer code for the paper, certified by this device into the door (lost phone → the code certifies the new one). */
  async function paperForDoor(renew) {
    const kept = JSON.parse((await keychain.get(SIGNER_PAPER_ID)) ?? 'null');
    if (kept && !renew) return kept.code; // the same code as on the sheets already printed
    const { newSignerCode, paperSigner, certify } = await import('../8-join/signers.js');
    const code = newSignerCode(), paper = await paperSigner(code), me = await deviceKeys();
    const cert = await certify({ by: { id: device, label: person.label, privateKey: me.device.privateKey }, signer: paper, person });
    await adminStore().write(cert.path, new TextEncoder().encode(cert.text));
    if (kept?.path) await adminStore().remove(kept.path).catch(() => {}); // the old paper no longer certifies
    await keychain.set(SIGNER_PAPER_ID, JSON.stringify({ code, path: cert.path }));
    return code;
  }
  /** The emergency sheet (14.11.): a paper password for the backups (kept in the keychain, sealed into each backup), with every
   *  sharing point, the access IDs and what the index adds up to, as PDF (emergency.js). */
  async function emergency() {
    const key = await checkKey(ctx), stored = await keychain.get(PAPER_ID);
    const choice = paperChoice(stored, stored ? await clipboardText().catch(() => null) : null); // new only with the current one copied
    const paper = choice === 'keep' ? stored : newPaperPassword();
    if (choice !== 'keep') {
      await keychain.set(PAPER_ID, paper); // 'new': the old paper password stops opening
      for (const r of s.rules.filter((x) => x.mark === 'backup')) {
        const store = s.open.get(r.to)?.store;
        if (!store) continue;
        try { await sealPaper(store, await backupKey(store, { keychain, host: await host() }), paper, { replace: true }); } catch { /* sealed at its next backup */ }
      }
    }
    const admin = await findAdmin().catch(() => null); // only user and server reach the sheet, never the password
    const accounts = admin ? await sheetAccounts().catch(() => []) : [];
    const signerCode = admin && adminStore() ? await paperForDoor(choice !== 'keep').catch(() => null) : null; // admin: the paper becomes a signer too
    const sheet = sheetData({ person, device, key, paper, signerCode, last: s.last ?? {}, joins: await sheetJoins(), services: { admin: s.adminN, atlas: s.atlasN }, date: shown(Date.now(), 'day'), entries: s.entries, rules: s.rules, open: s.open, index: index(), admin, accounts, project, nameSign: Boolean(await nameSign().catch(() => null)) });
    sheet.spots = await spotsOf(sheet.stats.cells); // where the takes were: o_ cells → their middle (h3, loaded once)
    const pdf = sheetPdf(sheet);
    const name = sheetName(sheet); // (Sign Overview)@(Name)'t(…)!(u_…).pdf, as every file name
    const paperKey = signerCode ? await import('../8-join/signers.js').then(({ paperSigner }) => paperSigner(signerCode)).then((x) => `${x.id} z_${x.key}`).catch(() => null) : null;
    const p = { title: 'Sign Overview', text: paperKey ? `${key}\n${paperKey}` : key, files: [new File([pdf], name, { type: 'application/pdf' })] }; // admin (22.11.): both anchors for project.json signer (device + paper, public halves only)
    if (!s.apps?.list?.length) return send(p).catch(() => null); // no row (iOS, browser): the system sheet
    s.pending = p; s.apps.x = 0; return draw(); // the menu folds down to its share row: choose where it goes (14.11.)
  }

  /** o_ cells [[o_, takes, name]] → spots for the earth; without h3 (offline) the earth stays empty. */
  async function spotsOf(cells) {
    const { centre } = await import('../5-take/where.js');
    const out = [];
    for (const [o, n, name] of cells) { const c = await centre(o).catch(() => null); if (c) out.push({ name, ...c, n }); }
    return out;
  }
  /** My joins for the sheet: per group the state and the time labels of my hello and of its answer (from the file names). */
  async function sheetJoins() {
    const timeOf = (path) => (path ? readName(path.slice(path.lastIndexOf('/') + 1))?.time ?? null : null);
    const out = [];
    for (const [label, state] of s.joinStates ?? []) {
      if (state === 'door') continue;
      const mine = await joins.get(label).catch(() => null);
      out.push({ label, state: state === 'join-own' ? 'within' : state, hello: timeOf(mine?.helloPath), join: timeOf(mine?.answer) });
    }
    return out;
  }
  /** Every account for the sheet (admin): quiet = switched off · within = has logged in or atlas counted it · join = made,
   *  not yet in · hello = a request without an account; numbers from atlas, bytes from the Nextcloud quota. */
  async function sheetAccounts() {
    const [list, counts] = await Promise.all([listAccounts(ctx.admin, { group: project?.group, skip: [project?.atlas, project?.admin, project?.groups, ctx.admin?.user] }), atlasSummary()]);
    const made = list.map((a) => { const c = counts.get(a.user) ?? {}; return { user: a.user, label: a.label, state: a.enabled === false ? 'quiet' : a.lastLogin || counts.has(a.user) ? 'within' : 'join', v: c.v ?? 0, a: c.a ?? 0, x: c.x ?? 0, l: c.l ?? 0, chains: c.chains ?? 0, bytes: a.used || c.bytes || 0 }; });
    const asked = (s.hellos ?? []).map((h) => ({ user: h.name ?? 'hello', label: h.name ?? 'hello', state: 'hello', bytes: 0 }));
    return [...made, ...asked];
  }

  // ---------- the first circle (14.11.): the first time something goes to a sharing point, it shows what and how much ----------
  const confirmedPaths = () => { try { return new Set(JSON.parse(localStorage.getItem('sign.confirmed') || '[]')); } catch { return new Set(); } };
  /** What a result would send for the first time: { n, how: 'one' (this take) | 'new' (from now on) | 'all' (and everything so far) } */
  function firstTime(result) {
    const f = result?.action === 'share' ? { n: result.n, how: 'one' } : result?.once ? { n: result.once.n, how: 'all' }
      : result?.edit?.on && result.edit.rule?.mark === 'always' && result.edit.rule.from == null ? { n: result.edit.rule.to, how: 'new' } : null;
    const tile = f && ctx.tileOf(f.n), entry = f && s.entries[f.n - 1];
    return f && f.n !== 0 && tile && !tile.private && entry && !confirmedPaths().has(entry.path) ? f : null;
  }
  async function askFirst(f, result) {
    const tile = ctx.tileOf(f.n);
    const count = f.how === 'one' ? 1 : f.how === 'new' ? null : (await own.list('chain/').catch(() => [])).filter((x) => x.path.endsWith('.chain.sign')).length;
    s.confirm = { ...f, result, label: tile.label, kinds: tile.kinds.length ? [...tile.kinds] : [...KINDS], count };
    return draw();
  }
  /** Tapped in the first circle: a strand on / off, or the middle = yes. */
  async function confirmTap(part) {
    const c = s.confirm;
    if (!c) return null;
    if (part !== 'ok') { c.kinds = c.kinds.includes(part) ? c.kinds.filter((k) => k !== part) : KINDS.filter((k) => [...c.kinds, part].includes(k)); return draw(); }
    s.confirm = null;
    if (!c.kinds.length) return draw();
    const seen = confirmedPaths(); seen.add(s.entries[c.n - 1].path);
    try { localStorage.setItem('sign.confirmed', JSON.stringify([...seen])); } catch { /* private mode */ }
    const r = structuredClone({ ...c.result }); // the chosen strands go into what the gesture does
    if (r.action === 'share') return shareTo(c.n, c.kinds);
    if (r.edit?.rule) r.edit.rule.kinds = c.kinds.length === KINDS.length ? [] : c.kinds;
    if (r.once) r.once.kinds = c.kinds;
    return apply(r, { asked: true });
  }

  async function apply(result, { asked = false } = {}) {
    if (!result) return null;
    const first = !asked && firstTime(result);
    if (first) return askFirst(first, result);
    if (result.once) { // a copy: the connection, and everything so far once, now
      for (const change of result.edits ?? [result.edit]) await edit(change);
      const from = result.once.from == null ? own : s.open.get(result.once.from)?.store;
      const to = s.open.get(result.once.n)?.store;
      if (!from || !to) return say(t('notReachable'));
      const r = await copyRoute(from, to, { kinds: result.once.kinds ? [...result.once.kinds, 'm'] : ['v', 'a', 'x', 'l', 'm'], skip: await skip() }).catch(() => null);
      if (r && result.once.from != null) s.copiedTo = { fromId: s.entries[result.once.from - 1]?.id, toPath: s.entries[result.once.n - 1]?.path, at: Date.now() }; // ↓ on the old one now = a move
      return say(r ? t('run.ok', { label: ctx.tileOf(result.once.n)?.label ?? '', n: r.copied.length }) : t('notReachable'));
    }
    if (result.action === 'share') return shareTo(result.n);
    if (result.deny) { s.shake = `sp:${result.deny}`; draw(); setTimeout(() => { s.shake = null; draw(); }, 400); return null; } // not possible: the tile shakes
    if (result.give) { // my Nextcloud dropped on another account: the line, and the share now
      for (const change of result.edits ?? [result.edit]) await edit(change);
      const entry = s.entries[result.give.n - 1];
      const cloudId = entry?.path?.startsWith('cloud:') ? entry.path.slice(6) : cloudIdOf(readPaste(entry?.path ?? ''));
      return cloudId ? giveOut(ctx, result.give.from, cloudId) : say(t('notReachable'));
    }
    if (result.action === 'give' && ctx.role === 'groups' && words().length) return groupTo(result.n, words()); // Groups (16.11.): ↑ on a group folder with names as context = those people get it
    if (result.action === 'give') return giveOut(ctx, result.n, 'link'); // ↑ = its link to the clipboard (16.11.: giving to an account is drawing a line onto its tile)
    for (const change of result.edits ?? [result.edit]) await edit(change);
    return null;
  }

  async function tapped(role) {
    if (!role) return show(false); // a tap beside the sheet = back
    if (role === 'sheet' || role === 'row-area') return null; // the sheet itself, the row's strip
    const [what, a, b] = role.split(':');
    if (what === 'sp' && a === '0') { // this device (14.11.): a tap chooses a new folder or disk on it
      if (canPick()) return pickFolder(ctx);
      s.shake = 'sp:0'; draw(); setTimeout(() => { s.shake = null; draw(); }, 400); return null; // the phone: with the native app (S4)
    }
    if (what === 'account') { // an account upper left (16.11.): what its role does; my own: its Sign/ tile lights up
      const acc = logins()[Number(a)];
      if (acc?.role === 'admin') return lookPile('hello');
      if (acc?.role === 'atlas') return showIndex();
      if (acc?.role === 'groups') return showGroups(); // Groups (16.11.): tap = all groups; ← = a new one
      const n = acc && [...s.open].find(([, sp]) => sp.spec?.server === acc.server && sp.spec?.user === acc.user && sp.spec?.folder)?.[0];
      if (n) { s.flash = `sp:${n}`; draw(); setTimeout(() => { s.flash = null; draw(); }, 600); }
      return null;
    }
    if (what === 'person' && a === globalThis.signPersons?.current()) return ctx.role === 'admin' ? lookPile('hello') : ctx.role === 'atlas' ? showIndex() : null; // my own account: what my role does
    if (what === 'person') { globalThis.signPersons?.switchTo(a); return location.reload(); } // another person on this device: in
    if (what === 'sp' && ctx.tileOf(Number(a))?.moved) return bringIn(ctx, ctx.tileOf(Number(a)).moved); // moved: a tap follows to the new sharing point
    const svc = what === 'sp' ? ctx.tileOf(Number(a))?.service : null;
    if (svc === 'admin') return lookPile('hello'); // Admin: a tap = the hellos (the piles stand beside it)
    if (svc === 'atlas') return showIndex(); // Atlas: a tap = the index (takes per account)
    if (what === 'sp' && s.joinStates.get(ctx.tileOf(Number(a))?.label) === 'ready') { // join breathes: a tap takes the answer (15.11.)
      const label = ctx.tileOf(Number(a)).label, mine = await joins.get(label);
      await joins.set(label, { ...mine, tapped: true });
      s.sending = role; navigator.vibrate?.(10); draw(); // the answer comes in, the key turns, my Sign is opened
      const states = await followJoins(ctx).catch(() => s.joinStates);
      s.sending = null; navigator.vibrate?.(states.get(label) === 'ready' ? [40, 40, 40] : 20);
      for (const [l, st] of states) if (s.joinStates?.get?.(l) !== st) s.fresh.add(l);
      s.joinStates = states;
      onDoor(states.get(label) ?? null);
      if (states.get(label) === 'ready') { await joins.set(label, { ...(await joins.get(label)), tapped: false }); s.note = t(s.joinWhy ?? 'notReachable'); s.joinWhy = null; s.shake = role; draw(); setTimeout(() => { s.shake = null; draw(); }, 400); return null; } // not taken: it shakes and says why (21.11.) // not taken (seal, network): a tap tries again
      if (states.get(label) === 'join-own') return arrived(label);
      return draw();
    }
    if (what === 'own' && s.joinStates.get(ctx.tileOf(Number(a))?.label) === 'join-own') { // the icon complete: tap my space = on to the consent (15.11.)
      const label = ctx.tileOf(Number(a)).label, mine = await joins.get(label);
      await joins.set(label, { ...mine, state: 'within' });
      (s.leaving ??= new Set()).add(label); draw(); // hello and join go …
      await new Promise((ok) => setTimeout(ok, 700));
      s.leaving.delete(label); (s.doorLabels ??= new Set()).add(label);
      s.joinStates.set(label, 'within');
      const n = s.entries.findIndex((e, i) => s.open.get(i + 1)?.spec?.kind === 'nextcloud' && e.path?.includes('/Sign')) + 1;
      if (n) { s.fresh.add(`sp:${n}`); s.focus = n; } // … my Sign appears beside me: tap = consent (the first circle), carry me onto it = always there
      navigator.vibrate?.(20);
      return draw();
    }
    if (what === 'own') { // my own space still dashed (14.11.): the answer came without an account → ask again (a new hello)
      const label = ctx.tileOf(Number(a))?.label;
      if (!label || s.joinStates.get(label) !== 'join') return null;
      return helloToDoor(ctx, label).then((m) => { if (m) { s.joinStates.set(label, m.state); s.fresh.add(label); } onHello(); draw(); });
    }
    if (what === 'sp' && s.joinStates.get(ctx.tileOf(Number(a))?.label) === 'door') { // onboarding: tap the hello bubble = hello (14.11.)
      const label = ctx.tileOf(Number(a)).label;
      s.sending = role; s.sent = 0; navigator.vibrate?.(10); draw(); // on its way: the line runs, a dot per file (name sign, gestures)
      return helloToDoor(ctx, label).catch(() => null).then((m) => {
        s.sending = null;
        if (m) { s.joinStates.set(label, m.state); s.fresh.add(label); onHello(); navigator.vibrate?.(20); } else { s.shake = role; navigator.vibrate?.([40, 40, 40]); } // sent: the dotted line builds up · nothing went out: it shakes
        draw(); setTimeout(() => { s.shake = null; draw(); }, 400);
      });
    }
    if (what === 'sp') {
      const tile = ctx.tileOf(Number(a));
      if (tile?.state === 'cloud') return askAccount(ctx, tile.n); // my cloud id copied, their server opens
      if (tile?.state === 'error') { // not reachable at start: try again now, then catch up
        const back = await reopen(s.open, s.entries, { keychain, own, folders });
        if (back.length) { onSources(sources(s.rules, s.open, own)); await run(tile.n); }
        return draw();
      }
      if (tile?.state === 'waiting') { // permission needs a tap; then its rules catch up
        const back = await reconnect(s.open, folders, { ask: true, only: tile.n });
        if (back.length) {
          onSources(sources(s.rules, s.open, own));
          await run(tile.n);
        }
        return draw();
      }
      return apply(gestureOn(targetFor(tile, 'tap'), 'tap', s.rules));
    }
    if (what === 'confirm') return confirmTap(a); // the first circle
    if (what === 'sp-kind') return apply(gestureOn(targetFor(ctx.tileOf(Number(a)), 'tap-kind'), 'tap-kind', s.rules, { kind: b }));
    if (what === 'add' && s.group) return addToGroup(); // a group open (Groups, 16.11.): + = the names written as context get access
    if (what === 'add' && s.groupList) return words().length && s.groupsN ? newGroup(s.groupsN).then(showGroups) : say(t('menu.paste')); // all groups open: + with a name written as context = a new group folder (16.11.)
    if (what === 'add') return addNew(ctx); // the one + tile
    if (what === 'out') return outside(); // the share sign: the last take to other apps (the system sheet)
    if (what === 'app') { const app = rowApps()[Number(a)]; if (!app) return null; if (!app.glyph) usedApp(app); return outside(app); } // one app of the row: straight there
    if (what === 'browse') { const x = (s.index ? indexTiles() : s.accounts ? accountTiles() : s.groupList ? groupTiles() : browseChips(ctx))[Number(a)]; return x?.go ? x.go() : x?.look ? x.look() : null; } // an account: tap = look at it
    if (what === 'incoming' && Number(a) >= s.incoming.length) return signerVerdict(s.signersWaiting[Number(a) - s.incoming.length], true); // a new signer waiting (22.11.): tap = agree, it counts at once
    if (what === 'incoming') { const x = s.incoming[Number(a)]; return x?.groupFolder ? takeGroupFolder(x) : acceptWaiting(ctx, x); } // a group folder: one tap = in my menu, like join
    if (what === 'hello' && s.carry && s.piles?.[Number(a)]?.pile === s.carry.to) { // a person carried here (within ↓ → quiet, 16.11.): the tap moves her
      const { go } = s.carry; s.carry = null; s.pulse = null; draw();
      return go().then(() => { navigator.vibrate?.(20); return refreshDoor(); }, () => { navigator.vibrate?.([40, 40, 40]); say(t('notReachable')); });
    }
    if (what === 'hello' && s.held) { // a person looked at, then the menu (16.11., user: hello angesehen → tap on join = account + answer)
      const h = s.held, pile = s.piles?.[Number(a)]?.pile, go = pile === HELD_UP[h.pile] ? h.up : pile === HELD_DOWN[h.pile] ? h.down : null;
      if (go) {
        s.held = null; s.pulse = null; draw();
        return go().then(() => { navigator.vibrate?.(20); return refreshDoor(); }, async (err) => {
          navigator.vibrate?.([40, 40, 40]);
          if (await needsConfirm(err)) { s.held = h; s.pulse = `hello:${a}`; s.retry = () => tapped(`hello:${a}`); return say(t('menu.confirm')); } // the Admin password once, in the browser; then this tap goes on by itself
          const why = String(err?.message ?? err).slice(0, 60);
          debugNote({ method: 'door', where: `${h.pile} → ${pile}`, error: why, ms: 0 });
          say(why);
        });
      }
    }
    if (what === 'hello') return lookPile(s.piles?.[Number(a)]?.pile); // tap = this pile as Similar tiles (15.11.)
    if (what === 'accept-there') {
      const { url } = s.acceptThere;
      s.acceptThere = null;
      draw();
      return openPage(url);
    }
    return null;
  }

  /**
   * My own Sign came with the join (17.11.): the door is gone, my Sign stands beside me and asks at once, in the first
   * circle, what goes there from now on (strands on/off, the middle = yes; pushed away = nothing goes, a tap on the tile
   * asks again). That yes is the consent: only what the person sends lies on the project's Nextcloud.
   */
  async function arrived(label) {
    const mine = await joins.get(label).catch(() => null);
    if (mine) await joins.set(label, { ...mine, state: 'within' });
    (s.doorLabels ??= new Set()).add(label);
    const n = s.entries.findIndex((e, i) => { const sp = s.open.get(i + 1)?.spec; return sp?.kind === 'nextcloud' && mine?.account && sp.server === mine.account.server && sp.user === mine.account.user; }) + 1;
    navigator.vibrate?.(20);
    if (!n) return draw();
    s.fresh.add(`sp:${n}`); s.focus = n;
    const tile = ctx.tileOf(n);
    if (tile && !tile.always) return apply(gestureOn(targetFor(tile, 'hold'), 'hold', s.rules, { selection: selection(), private: tile.private }));
    return draw();
  }

  // ---------- drawing ----------
  /**
   * Is one of my Nextcloud logins an admin of its instance (14.11.)? Then this device is the admin app: hellos in its
   * folders get an account each, and → on that tile shows the accounts. Asked once per login and session.
   */
  // 15.11. (storage review): every load looks again, so a login added later (Admin, Atlas, Groups) counts at once,
  // not only after a restart; a login is asked once whether it may manage accounts, an unreachable one again later.
  const askedAdmin = new Map(); // "server user" → true | false (null = not reachable: not kept)
  async function findAdmin() {
    for (const [n, sp] of s.open) {
      if (sp.spec?.kind !== 'nextcloud') continue;
      const login = { server: sp.spec.server, user: sp.spec.user, password: await keychain.get(sp.entry.id) };
      if (!login.password) continue;
      const user = login.user.toLowerCase(), key = `${login.server} ${user}`;
      if (project?.groups && user === project.groups.toLowerCase() && s.groupsN !== n) { s.groupsN = n; ctx.groups = login; } // the account that holds the group folders (15.11.)
      if (project?.atlas && user === project.atlas.toLowerCase() && s.atlasN !== n) { s.atlasN = n; ctx.atlas = login; atlasCount(login).catch(() => {}); } // this device also holds the atlas login
      if (ctx.admin) continue;
      if (!askedAdmin.has(key)) { const yes = await isAdmin(login, { group: project?.group ?? undefined }); if (yes !== null) askedAdmin.set(key, yes); }
      if (askedAdmin.get(key) || roleOf(login.user, project ?? {}) === 'admin') { // the Admin login of project.json owns the door even without account rights (then welcome says why)
        ctx.admin = login; s.adminN = n; await setRole('admin', n).catch(() => {});
        const at = await doorFolder(login, project?.doors ?? []).catch(() => null); // where hello/ and join/ really lie (15.11.)
        ctx.door = at == null ? null : connect({ kind: 'nextcloud', label: 'door', id: 'door', server: login.server, user: login.user, folder: at }, { secret: login.password }).store;
        debugNote({ method: 'door', where: user, ...(at == null ? { error: 'not found among the shares of this login' } : { status: `at ${at || '/'}` }), ms: 0 }); // in sign-debug.txt
      }
    }
    if (ctx.admin) { const real = await keychain.get(confirmId(ctx.admin)).catch(() => null); if (real && ctx.admin.password !== real) ctx.admin = { ...ctx.admin, password: real }; } // 17.11.: accounts are managed with the account's own password (below)
    if (ctx.admin && project?.gateway) await ensureGroupsHere(ctx, project).catch(() => null); // Groups in the object storage (22.11.): the admin's Groups tile there (a tile; ← = new group folder), sealed by this device for itself
    return ctx.admin ?? null;
  }
  /**
   * Nextcloud asks for the account's own password before it creates, changes or deletes an account ("Password
   * confirmation is required"): the app password from the one-click login opens the files, not the user management.
   * So the admin gives the Admin account's password once: copied, then + (never typed, never shown); it stays in this
   * device's keychain and goes only to the project's Nextcloud, with each of those requests. Limits: an Admin account
   * with a second factor cannot confirm this way.
   */
  const confirmId = (a) => `confirm ${a.server} ${String(a.user).toLowerCase()}`;
  async function needsConfirm(err) {
    const why = String(err?.message ?? err);
    if (!ctx.admin || !/confirm|\b403\b|\b401\b|997/i.test(why)) return false;
    const had = await keychain.get(confirmId(ctx.admin)).catch(() => null);
    if (had && /confirm/i.test(why)) return false; // it was sent and still refused: said as it is
    if (had) await keychain.remove?.(confirmId(ctx.admin)); // a wrong one: asked anew
    if (!had && !/confirm/i.test(why)) return false;
    askPassword();
    return true;
  }
  /** The browser opens with one field for the Admin password (20.11.: it is not on the phone to copy); copied, + still takes it. Only when Nextcloud asks for it. */
  function askPassword() {
    s.waitSecret = confirmId(ctx.admin); s.waitSecretAlso = null; s.clip = 'ready';
    confirm.ask({ id: confirmId(ctx.admin), server: ctx.admin.server, user: ctx.admin.user }).catch(() => {});
  }
  const confirm = confirmAdmin({ web: project?.web || 'https://signclip.github.io/sign.app/', keychain, open: openPage, onDone: () => confirmed() });
  /** The password came back from the browser: kept; the tap that asked goes on by itself. */
  async function confirmed() {
    s.waitSecret = null; s.clip = null; s.note = ''; navigator.vibrate?.(20);
    await load();
    const real = ctx.admin && await keychain.get(confirmId(ctx.admin)).catch(() => null);
    if (real) ctx.admin = { ...ctx.admin, password: real }; // before the tap goes on (20.11.: it went on with the app password and was refused again)
    const again = s.retry; s.retry = null;
    if (again) return again();
    return draw();
  }
  /** The other persons on this device (persons.js), with how each starts. */
  /** The other persons on this device (persons.js), with their roles. */
  const others = () => { const p = globalThis.signPersons; return p ? accountsOf(p.persons(), p.current(), new Map(p.persons().map((x) => [x.id, x.role ?? null]))).filter((x) => !x.current) : []; };
  /**
   * The accounts kept on this device (16.11.): every login (server + user) once, a small circle upper left, as the + is
   * upper right. Role as form and colour (flow.js roleOf); the one in use is ringed. → [{ server, user, label, role, current, n }]
   */
  function logins() {
    const seen = new Map();
    for (const [n, sp] of s.open) {
      const { kind, server, user } = sp.spec ?? {};
      if (!user || !['nextcloud', 'webdav'].includes(kind) || seen.has(`${server} ${user}`)) continue;
      const role = roleOf(user, project ?? {}, { admin: ctx.admin?.server === server && ctx.admin?.user === user });
      seen.set(`${server} ${user}`, { server, user, label: user, role, n });
    }
    const list = [...seen.values()];
    const inUse = list.find((a) => (ctx.role ? a.role === ctx.role : !a.role)) ?? null;
    return list.map((a) => ({ ...a, current: a === inUse }));
  }
  /** This person's role, from her logins' names (project.json); isAdmin may add 'admin' later (findAdmin). */
  async function roleByName() {
    for (const [n, sp] of s.open) {
      const role = sp.spec?.kind === 'nextcloud' ? roleOf(sp.spec.user, project ?? {}) : null;
      if (role) return setRole(role, n).catch(() => {});
    }
  }
  /**
   * A role login came in (15.11.). This person has not said hello yet: she becomes that account (named after the role,
   * ringed upper left; her request at the door goes). She has: the login moves to a new account of its own on this device
   * (its password stays in the keychain by its q_), and the app opens as that account.
   */
  async function setRole(role, n) {
    if (ctx.role === role) return;
    const P = globalThis.signPersons, label = { admin: project?.admin, atlas: project?.atlas, groups: project?.groups }[role] || role;
    const e = s.entries[n - 1], said = doorLabel && (await joins.get(doorLabel).catch(() => null));
    if (said && P && e && !P.persons().some((x) => x.id === P.current() && x.role)) {
      await write({ remove: n }); // out of my list, not logged out
      const id = P.add();
      if (!id) return;
      P.setRole(id, role, label);
      localStorage.setItem('sign.name', label); localStorage.setItem('sign.onboard', '99'); // the new account: its name, no onboarding steps
      localStorage.setItem('sign.pendingLogin', JSON.stringify({ for: id, entry: { label: e.label, path: e.path, id: e.id } }));
      return location.reload();
    }
    ctx.role = role; s.note = ''; onRole(role); // a role says no hello: no onboarding steps, no note about one
    if (role === 'admin') s.adminN ??= n; else if (role === 'atlas') s.atlasN ??= n; else s.groupsN ??= n;
    P?.setRole?.(P.current(), role, label);
    s.fresh.add(`person:${P?.current()}`); // it builds up there: the request disappears into the small circle
    if (!panel.hidden) draw();
  }
  /**
   * Groups (16.11.): a group folder of the Groups account given to people of this Nextcloud, found by the names written
   * as context (the sharing search); they read and add (no deleting). Each gets it as a waiting tile, a tap = in.
   */
  async function groupTo(n, names) {
    const sp = s.open.get(n), login = ctx.groups;
    if (!sp?.spec?.folder || !login || sp.spec.user !== login.user) return say(t('notReachable'));
    s.flash = `sp:${n}`; draw();
    let given = 0;
    for (const name of names) {
      const found = await findPeople(login, name).catch(() => []);
      const one = found.find((x) => x.label.toLowerCase() === name.toLowerCase() || x.id.toLowerCase() === name.toLowerCase()) ?? (found.length === 1 ? found[0] : null);
      if (one && await shareFolder(login, sp.spec.folder, one.id, { permissions: 5 }).then(() => true, () => false)) given++;
    }
    s.flash = null; navigator.vibrate?.(given === names.length ? 20 : [40, 40, 40]);
    return say(`${sp.entry.label} → ${given}/${names.length}`);
  }
  /** Group folders others gave to my own account and not yet in my list → waiting tiles [{ groupFolder, n, folder, owner }]. */
  async function groupFolders() {
    const out = [];
    for (const [n, sp] of s.open) {
      const spec = sp.spec;
      if (spec?.kind !== 'nextcloud' || spec.folder || sp.store?.readOnly || roleOf(spec.user, project ?? {})) continue; // my own account's login, not a role
      const secret = await keychain.get(sp.entry.id);
      for (const x of await sharedWithMe({ server: spec.server, user: spec.user, password: secret }).catch(() => [])) {
        const path = webdavUrl(spec.server, spec.user, x.folder);
        if (!s.entries.some((e) => e.path === path) && !out.some((o) => o.folder === x.folder)) out.push({ groupFolder: true, n, folder: x.folder, owner: x.owner, path });
      }
    }
    return out;
  }
  /** One tap on a waiting group folder: it comes into my menu, reached with my own login (like join). */
  async function takeGroupFolder(x) {
    const login = s.open.get(x.n)?.entry, id = newSource();
    const secret = login && await keychain.get(login.id);
    if (!secret) return say(t('notReachable'));
    await keychain.set(id, secret);
    s.incoming = s.incoming.filter((y) => y !== x);
    await edit({ add: { label: x.folder.split('/').pop(), path: x.path, id }, marks: ['show', 'write'] });
    return say(`${t('share')} ← ${x.owner}`);
  }
  /** A login waiting for this account (setRole moved it here): into my list once. */
  async function takePendingLogin() {
    let p = null; try { p = JSON.parse(localStorage.getItem('sign.pendingLogin') || 'null'); } catch { /* none */ }
    if (!p || p.for !== globalThis.signPersons?.current()) return false;
    localStorage.removeItem('sign.pendingLogin');
    await write({ add: p.entry });
    return true;
  }
  const START = ['direct', 'record', 'choose']; // straight to the take as left · records at once · the persons to choose at start
  /** The project's own Nextcloud (its door's server), where the admin logs in. */
  const projectServer = () => { try { return new URL(project?.doors?.[0]?.read ?? project?.read).origin; } catch { return null; } };
  /**
   * 16.11. (user): a person shows upper left only once her hello went out whole – dashed while it waits, solid once she
   * is taken in. Admin, Atlas, Groups: their login is the account, always solid. No door in project.json: always shown.
   */
  const personStates = new Map(); let statesAt = 0;
  function refreshPersonStates() {
    const P = globalThis.signPersons;
    if (!P || !doorLabel || Date.now() - statesAt < 5000) return;
    statesAt = Date.now();
    Promise.all(P.persons().map(async (p) => [p.id, (await joins.getFor(doorLabel, p.id).catch(() => null))?.state ?? null]))
      .then((list) => { let changed = false; for (const [id, st] of list) if (personStates.get(id) !== st) { personStates.set(id, st); changed = true; } if (changed) draw(); }, () => {});
  }
  const SHOWN = ['hello', 'ready', 'join', 'join-own', 'within'];
  function withState(p) {
    if (p.role || !doorLabel) return { ...p, joined: 'in' };
    const st = p.id === globalThis.signPersons?.current() ? s.joinStates.get(doorLabel) ?? personStates.get(p.id) : personStates.get(p.id);
    return SHOWN.includes(st) ? { ...p, joined: ['hello', 'ready'].includes(st) ? 'waiting' : 'in' } : null;
  }
  function draw() {
    refreshPersonStates();
    const { width: w, height: h } = panel.getBoundingClientRect();
    const browse = s.index ? indexTiles() : s.accounts ? accountTiles() : s.groupList ? groupTiles() : s.browse ? browseChips(ctx) : null;
    const incoming = [...s.incoming.map((x) => ({ label: x.groupFolder ? x.folder.split('/').pop() : x.share.name })), ...(s.signersWaiting ?? []).map((p) => ({ label: `signer: ${p.signer.label}` }))];
    const ws = words().map((w) => w.toLowerCase());
    const found = (x) => ws.every((w) => x.name.toLowerCase().includes(w)); // context words find persons in the piles too
    const count = (p) => pileList(p).filter(found).length;
    s.piles = ctx.admin ? pilesOf(Object.fromEntries(['hello', 'join', 'within', 'quiet'].map((p) => [p, count(p)])), { atlas: Boolean(s.atlasN) }) // the admin: always all four (15.11.), 0 = faint
      : s.hellos.length ? pilesOf({ hello: count('hello') }).slice(0, 1) : []; // a group's signer: its hellos
    s.piles = s.piles.map((p) => ({ ...p, n: s.adminN, label: p.count == null ? p.pile : `${p.pile} ${p.count}` }));
    const hellos = s.piles;
    onDraw({ tiles: all(), confirm: s.confirm ?? null, own: person.label, sent: s.sent ?? 0, admin: s.adminN ?? null, pulse: s.pulse ?? null, flash: s.flash ?? null, appear: s.appear, fresh: new Set(s.fresh), focus: s.focus, waitSecret: Boolean(s.waitSecret), clip: s.clip ?? 'ghost', shake: s.shake ?? null, apps: s.index || s.accounts || s.groupList || s.browse ? [] : rowApps(), outOnly: Boolean(s.pending), persons: others().map(withState).filter(Boolean), self: (() => { const P = globalThis.signPersons, me = P?.persons().find((x) => x.id === P.current()); return me ? withState({ ...me, label: me.label || person.label }) : null; })(), accounts: logins(), choosing: Boolean(s.choosing), browse, incoming, acceptThere: s.acceptThere, hellos, joinStates: new Map(s.joinStates), leaving: new Set(s.leaving ?? []), sending: s.sending ?? null, note: s.note, role: ctx.role ?? null });

    s.appear = false; // only the first drawing after opening builds up
    s.fresh.clear();

  }

  // ---------- touch: the role is read when the finger goes down ----------
  let role = null, pinched = 1;
  const roleAt = (el) => el?.closest?.('[data-role]')?.dataset.role ?? null; // 20.11.: was named roleOf and hid flow.js roleOf — Admin, Atlas, Groups never had a role
  const circleOf = (r) => (r?.startsWith('sp:') ? Number(r.split(':')[1]) : null);
  const handlers = {
    down: (e) => {
      role = roleAt(e.target);
      return role; // touch.js lets the share row slide by it
    },
    slide: (r, dx) => { // the share row follows the finger (14.11.): moved by CSS on every frame, drawn anew only at the end
      if (!s.apps) return null;
      const limit = -Infinity, x = s.apps.x ?? 0; // the row is short now (≤ 5): no sliding limit needed
      s.apps.drag = Math.max(limit - x, Math.min(-x, (s.apps.drag ?? 0) + dx));
      for (const el of panel.querySelectorAll('.row')) el.style.transform = `translateX(${s.apps.drag}px)`;
      return null;
    },
    slideEnd: () => { if (!s.apps?.drag) return null; s.apps.x = (s.apps.x ?? 0) + s.apps.drag; s.apps.drag = 0; return draw(); },
    tap: () => tapped(role), // waits 300 ms: it may become a double-tap
    doubleTap: () => { // 14.11.: on a sharing point = encrypted ↔ readable (the line from this device turns double / single)
      if (role?.startsWith('hello:')) return lookPile(s.piles?.[Number(role.split(':')[1])]?.pile);
      if (role?.startsWith('person:') || role === 'sp:0') { // how a person starts: direct → records at once → chooses
        const P = globalThis.signPersons, id = role === 'sp:0' ? P?.current() : role.slice(7), now = P?.persons().find((x) => x.id === id)?.start ?? 'direct';
        P?.setStart(id, START[(START.indexOf(now) + 1) % START.length]);
        return draw();
      }
      const n = circleOf(role);
      return n ? apply(gestureOn(n, 'double', s.rules, { private: ctx.tileOf(n)?.private })) : null;
    },

    swipe: (dir) => {
      if (s.confirm && (dir === 'down' || dir === 'down-out')) { s.confirm = null; return draw(); } // the first circle pushed away: nothing goes
      if (role === 'sheet' && (dir === 'down' || dir === 'down-out')) return show(false); // pulled down = egal, nothing changes
      if (role?.startsWith('bridge:') && (dir === 'down' || dir === 'down-out')) { // ↓ on a line = cut it
        const [, a, b] = role.split(':');
        return apply(gestureOn(Number(b), 'cut', s.rules, { from: Number(a) }));
      }
      if (role?.startsWith('browse:') && s.group && ['down', 'down-out', 'up'].includes(dir)) { const x = groupTiles()[Number(role.split(':')[1])]; return dir === 'up' ? x?.up?.() : x?.down?.(); } // a member ↓ = out of this group · ↑ on the group = new member links
      if (role?.startsWith('browse:') && s.accounts && ['down', 'down-out', 'up'].includes(dir)) { const x = accountTiles()[Number(role.split(':')[1])]; return dir === 'up' ? x?.up?.() : x?.down?.(); } // account: ↓ rests ↑ wakes · device: ↓ quiet · group: ↓ out (14.11.)
      if (role?.startsWith('person:') && (dir === 'down' || dir === 'down-out')) { // off this device; its files stay, its hello at the door goes back (16.11.)
        const P = globalThis.signPersons, who = P?.persons().find((x) => x.id === role.slice(7));
        if (!who || who.id === P.current()) { s.shake = role; draw(); setTimeout(() => { s.shake = null; draw(); }, 400); return null; }
        return withdrawHello(ctx, who, { own, takeFiles, askRemove }).catch((err) => { debugNote({ method: 'withdraw', where: who.label, error: String(err?.message ?? err) }); return false; })
          .then((sent) => { P.remove(who.id); navigator.vibrate?.(sent ? [15, 60, 15] : 15); return draw(); });
      }
      if ((role?.startsWith('app:') || role === 'out:system' || role === 'row-area') && dir === 'up') return outside(); // ↑ on the row: the system share sheet // ↑ on the row: the classic Android / iOS share sheet
      if (role?.startsWith('hello:') && dir === 'right' && s.piles?.[Number(role.split(':')[1])]?.pile === 'index') { say(t('menu.wait')); return atlasCount(ctx.atlas, { now: true }).then(showIndex, () => say(t('notReachable'))); } // → on index: atlas counts now
      if (role?.startsWith('hello:') && dir === 'right') return refreshDoor(); // → look again; deciding is in the tiles (15.11.)
      if (role?.startsWith('browse:') && s.accounts && dir === 'right') return back(); // → in the accounts: one step back
      if (role?.startsWith('incoming:') && (dir === 'down' || dir === 'down-out') && Number(role.split(':')[1]) >= s.incoming.length) return signerVerdict(s.signersWaiting[Number(role.split(':')[1]) - s.incoming.length], false); // ↓ = object: it never counts
      const n = circleOf(role);
      if (role?.startsWith('account:')) { // ← = what its role opens · ↓ = log out (its app password deletes itself)
        const acc = logins()[Number(role.split(':')[1])];
        if (dir === 'left') return acc?.role === 'admin' ? showAccounts() : acc?.role === 'atlas' ? showIndex() : acc?.role === 'groups' ? newGroup(acc.n) : null;
        if (dir === 'down' || dir === 'down-out') return logout(acc);
      }
      if (role === `person:${globalThis.signPersons?.current()}` && dir === 'left') return ctx.role === 'admin' ? showAccounts() : ctx.role === 'atlas' ? showIndex() : ctx.role === 'groups' ? newGroup(s.groupsN) : null; // ← on my account: what my role opens
      if (n && n === s.adminN && dir === 'left') return showAccounts(); // ← on Admin: the accounts (15.11.: ← = further, → = again)
      if (n && n === s.atlasN && dir === 'left') return showIndex(); // ← on Atlas: the index
      if (n && (n === s.groupsN || /\/s3\/groups\/$/.test(s.entries[n - 1]?.path ?? '')) && dir === 'left') return newGroup(n); // ← on Groups (Nextcloud login or the tile in the object storage): a new group folder, named by the context words
      if (n && dir === 'right') { s.flash = role; draw(); return (n === s.adminN || n === s.atlasN ? refreshDoor() : load()).then(() => { s.flash = null; draw(); }); } // → on a tile = look again
      if ((n === 0 || (n && n === s.adminN)) && dir === 'up') return emergency(); // ↑ on my own tile: the emergency sheet as PDF in the share sheet (the check key goes along as text)
      if (!n) return null;
      const tile = ctx.tileOf(n);
      if (tile?.drop && (dir === 'down' || dir === 'down-out')) { // a group goes with both its links, the higher number first
        return apply({ edits: [Math.max(n, tile.drop), Math.min(n, tile.drop)].map((x) => ({ remove: x })) });
      }
      return apply(gestureOn(n, dir, s.rules));
    },
    pinch: (factor) => { // two fingers on an account: apart = more space, together = less (steps of 25 %)
      if (role?.startsWith('person:') && factor > 1.2) { globalThis.signPersons?.switchTo(role.slice(7)); return location.reload(); } // a small person pulled big = that person (15.11.)
      if (!role?.startsWith('browse:') || !s.accounts) return null;
      s.zoom = { role, scale: Math.max(0.7, Math.min(1.4, (s.zoom?.scale ?? 1) * factor)) }; // seen: the tile follows the fingers
      draw();
      pinched *= factor;
      if (pinched > 0.8 && pinched < 1.25) return null;
      const by = pinched >= 1.25 ? +1 : -1;
      pinched = 1;
      return accountTiles()[Number(role.split(':')[1])]?.more?.(by);
    },
    pinchEnd: () => { // the tile settles back to its size (250 ms)
      if (!s.zoom) return;
      const from = s.zoom.scale, start = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - start) / 250);
        s.zoom = p < 1 ? { ...s.zoom, scale: from + (1 - from) * (1 - (1 - p) ** 3) } : null;
        draw();
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    },
    holdLong: () => { if (circleOf(role) != null) { navigator.vibrate?.(15); s.flash = role; draw(); } }, // held on: now carried = everything so far too (15.11.)
    holdMove: () => null, // the line that follows the finger is drawn by paint-sharing.js








    dragEnd: (el, moved, _r, { long = false } = {}) => {
      if (s.flash === role) s.flash = null;
      if (role === 'add:new' && !moved) return addNew(ctx, { person: false }); // + held: only what is on the clipboard (no new person by holding, 16.11.)
      if (role?.startsWith('person:') && moved) { globalThis.signPersons?.switchTo(role.slice(7)); return location.reload(); } // a small person dragged out = pulled big: that person (15.11.)
      const from = circleOf(role);
      if (!moved && from === 0) return null; // my own tile held still: nothing (16.11.: a new person only by tapping + with nothing fitting on the clipboard)
      if (!moved && ctx.tileOf(from)?.service) return null; // nothing goes into Admin or Atlas
      if (!moved) return from ? apply(gestureOn(targetFor(ctx.tileOf(from), 'hold'), 'hold', s.rules, { selection: selection(), private: ctx.tileOf(from)?.private })) : null; // held still: new goes there
      const onto = circleOf(roleAt(el));
      if (from === 0 && onto && s.joinStates.get(ctx.tileOf(onto)?.label) === 'door') { // me onto the door's hello bubble = hello
        const label = ctx.tileOf(onto).label;
        return helloToDoor(ctx, label).then((m) => { if (m) s.joinStates.set(label, m.state); onHello(); draw(); });
      }
      if (from && onto === 0) return home(from); // onto this device: bring its files here (a backup is restored)
      if (from && ctx.tileOf(from)?.canGive && roleAt(el) === 'add:new') return makeOrRenew(ctx, from); // my Nextcloud onto + = a group (read + drop link)
      const target = onto ? ctx.tileOf(onto) : null;
      const give = Boolean(from && ctx.tileOf(from)?.canGive && target && (target.state === 'cloud' || s.open.get(onto)?.spec?.kind === 'nextcloud')); // my Nextcloud onto another account
      if (give) return apply(gestureOn(onto, 'drop-point', s.rules, { from, give: true }));
      if (target?.service) return null; // nothing goes into Admin or Atlas
      navigator.vibrate?.(long ? [15, 40, 15] : 15); // felt: from now on = one pulse, with everything so far = two
      return from != null && onto ? apply(gestureOn(onto, 'drop-point', s.rules, { from, private: ctx.tileOf(onto)?.private, sofar: long })) : null; // carried onto another: from now on; held on first = everything so far too (encrypted when only I read it)
    },
  };
  // the touches come from paint-sharing.js: it calls handlers with the role under the finger

  /** A tile dropped on this device: its files come here once (no rule); a backup is opened and restored. */
  async function home(n) {
    const store = s.open.get(n)?.store;
    if (!store) return say(t('notReachable'));
    try {
      const r = await bringHome(store, own, { keychain, host: await host(), paper, skip: await skip() });
      say(r.restored ? t('home.restored', { n: r.restored.length }) : t('home.copied', { n: r.copied.length }));
      onSources(sources(s.rules, s.open, own)); // Similar sees what came home
    } catch { say(t('home.key')); } // a backup of another device: the paper password on the clipboard opens it
  }

  await load();
  setInterval(async () => { // every 30 s: a disk plugged in again, a sharing point online again, what is due
    let changed = false;
    for (const n of await reconnect(s.open, folders)) { changed = true; await run(n).catch(() => {}); }
    if (globalThis.navigator?.onLine !== false && [...s.open.values()].some((sp) => sp.error)) {
      if ((await reopen(s.open, s.entries, { keychain, own, folders })).length) changed = true;
    }
    if (changed) onSources(sources(s.rules, s.open, own));
    await run().catch(() => {});
    if (changed && !panel.hidden) draw();
  }, 30e3);

  async function look() { // the + appears when the clipboard holds something it can take (14.11.)
    const now = await peek(s);
    if (now !== s.clip) { s.clip = now; if (now === 'ready') s.fresh.add('add:new'); if (!panel.hidden) draw(); }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !panel.hidden) look(); }); // back after copying a link
  setTimeout(() => resumeLogin(ctx).catch(() => {}), 1500); // a login left open when Android closed the app: it goes on
  function show(on) {
    panel.hidden = !on;
    if (!on) { s.pending = null; s.held = null; if (s.carry) { s.carry = null; s.pulse = null; } } // closed: nothing prepared waits, nobody carried
    if (on) { s.appear = true; draw(); look(); loadApps().catch(() => {}); }
  }
  /** One step back (Android back, → in the accounts): an account → the accounts → closed. → true if it stepped */
  function back() {
    if (s.index) { s.index = null; draw(); return true; }
    if (s.account) { s.account = null; draw(); return true; }
    if (s.accounts) { s.accounts = null; draw(); return true; }
    if (s.group) { s.group = null; draw(); return true; }
    if (s.groupList) { s.groupList = null; draw(); return true; }
    return false;
  }

  return {
    handlers, debugFile, draw, tapped, roleState: () => ({ adminN: s.adminN ?? null, atlasN: s.atlasN ?? null, groupsN: s.groupsN ?? null, piles: s.piles ?? [] }),
    show,
    back,
    /**
     * Admin (16.11.): the person just looked at, when the menu opens: the pile she may go on to breathes, a tap moves her
     * (hello → join = account + answer in join/, join → within, quiet → within; back: hello → quiet, join → hello).
     */
    hold(held) {
      s.held = held?.pile ? held : null;
      const to = s.held && HELD_UP[s.held.pile];
      if (to) s.pulse = `hello:${s.piles?.findIndex((p) => p.pile === to) ?? -1}`;
      return draw();
    },
    /** Admin (16.11.): a person to move by hand – the sharing menu opens, the target pile breathes, a tap on it moves her. */
    carry(to, go) {
      s.carry = { to, go };
      show(true);
      s.pulse = `hello:${s.piles?.findIndex((p) => p.pile === to) ?? -1}`;
      return draw();
    },
    /** Start 'choose' (14.11.): the persons of this device breathe, tap = in. */
    choose: () => { s.choosing = true; show(true); },
    async afterTake(paths) {
      const files = await Promise.all(paths.map(async (path) => ({ path, bytes: await own.read(path) })));
      const result = await afterTake(s.rules, s.open, files);
      if (result.failed.length) { // e.g. offline: the copy rule of that sharing point runs again on the next tick
        s.last = retry(s.last, s.rules, [...new Set(result.failed.map(([n]) => n))]);
        keep('sign.upkeep', s.last);
      }
      return result;
    },
    runRules: () => run(), // what is due (all new rules at the first start)
    /** The open store of the sharing point with this path (a share target named in a chain), or null. */
    storeOf: (path) => [...s.open.values()].find((sp) => sp.entry.path === path)?.store ?? null,
    /** The name sign was just taken: the hello to the project's door goes out now. */
    joinProject: () => (ctx.role ? Promise.resolve(null) : joinDoor().catch((err) => joinNote(`join: ${err?.message ?? err}`))),
    /** A ring arc dropped on tile n (app.js): that strand always goes there. */
    dropKind: (n, kind) => apply(gestureOn(targetFor(ctx.tileOf(n), 'drop-kind'), 'drop-kind', s.rules, { kind })),
  };
}
