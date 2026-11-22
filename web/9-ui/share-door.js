// share-door.js — the admin's door in the sharing menu (15.11., out of share-mount.js): the four piles
// hello · join · within · quiet, each as Similar tiles; in the single view ↑ = on, ↓ = back (8-join/flow.js ADMIN_MOVES).
//
// Purpose:   where the door lies: its folder found from its links (provision.doorFolder → ctx.door), else the admin's
//            tile · hello: every signer's waiting hellos and the renames · join, within, quiet: the admin's door ·
//            an empty pile shakes and says 0; a door not found says so (and sign-debug.txt has 'door') · an admin device
//            that is not project.json's signer says so in the menu and welcomes nobody (21.11.).
// Depends:   8-join (door, join, known, rename, provision), share-group.js (welcome, hellosToWelcome)
// Test:      tests/flow.test.mjs (the way through, without screen), tests/ui.test.mjs
// Limits:    40 tiles per look · the piles are looked at again every 20 s while the menu is open.

import { readHello, withHello } from '../8-join/join.js';
import { helloTakes, firstPieces, knownFolder } from '../8-join/known.js';
import { doorView, toWithin, backToHello, moveAccount, deleteFolder } from '../8-join/door.js';
import { renames, adoptRename, declineRename } from '../8-join/rename.js';
import { setDisplayName, setEnabled, deleteAccount, sharedWithMe, makeFolder } from '../8-join/provision.js';
import { hellosToWelcome, welcome, choices, trustedHere, signerOfText } from './share-group.js';
import { certificatesIn, pendingSigners, verdict } from '../8-join/signers.js';
import { deviceKeys } from './device-keys.js';
import { copyRoute } from '../2-storage/routes.js';
import { WebDavStore } from '../2-storage/webdav.js';
import { webdavUrl } from '../2-storage/nextcloud.js';

const dec = new TextDecoder();

/** ctx: the sharing menu's (s, say, t, draw, admin, atlas, door) · panel · onLookAll(items). → { refreshDoor, lookPile, pileList, adminStore, signerVerdict } */
export function doorPart(ctx, { panel, onLookAll }) {
  const { s, say, t } = ctx;
  const draw = () => ctx.draw();
  /** The admin's own folder with hello/ join/ within/ quiet/ (the door), or null. */
  const adminStore = () => ctx.door ?? [...s.open.values()].find((sp) => sp.store && sp.spec?.kind === 'nextcloud' && sp.spec.server === ctx.admin?.server && sp.spec.user === ctx.admin?.user)?.store ?? null; // the door's folder (from its links), else the admin's tile
  ctx.adminStore = adminStore; // share-add.js (another signer) reaches the door through it
  /** Hellos and the door's piles anew (on load, → on a pile, every 20 s while the menu is open). */
  async function refreshDoor() {
    s.hellos = await hellosToWelcome(ctx).catch(() => s.hellos);
    const door = ctx.admin ? adminStore() : null;
    s.door = door ? await doorView(door).catch(() => s.door) : null;
    s.renames = door ? await renames(door).catch(() => s.renames ?? []) : []; // a person renamed herself: in the hello pile
    if (door) { const ok = await trustedHere(ctx, door).catch(() => true); if (!ok) s.note = t('door.notSigner'); else if (s.note === t('door.notSigner')) s.note = ''; } // this admin device is not project.json's signer: said at once, not after a welcome (21.11.)
    s.signersWaiting = door ? await waitingSigners(door).catch(() => s.signersWaiting ?? []) : [];
    if (s.signersWaiting.length) s.note = t('signer.waiting', { name: s.signersWaiting[0].signer.label, date: new Date(s.signersWaiting[0].until).toLocaleString().slice(0, -3) }); // told on every signer device
    if (!panel.hidden) draw();
  }
  setInterval(() => { if (!panel.hidden && (ctx.admin || s.hellos.length)) refreshDoor(); }, 20000);
  /**
   * New signers of the door within their 48 h (22.11., user: "B"), as every other signer device sees them: not the ones
   * this device made itself, not this device. → [{ u, signer, by, until }]
   */
  async function waitingSigners(door) {
    const pinned = signerOfText(ctx.doorSigner);
    if (!pinned) return [];
    return (await pendingSigners(pinned, await certificatesIn(door))).filter((p) => p.by !== ctx.device && p.signer.id !== ctx.device);
  }
  /** A signer device agrees (ok: the new signer counts at once) or objects (it never counts). */
  async function signerVerdict(p, ok) {
    const door = adminStore();
    if (!p || !door) return say(t('notReachable'));
    const me = await deviceKeys();
    const v = await verdict({ by: { id: ctx.device, label: ctx.person?.label ?? '', privateKey: me.device.privateKey }, u: p.u, ok, person: ctx.person });
    await door.write(v.path, new TextEncoder().encode(v.text));
    navigator.vibrate?.(ok ? 20 : [15, 60, 15]);
    s.note = '';
    return refreshDoor();
  }
  const pileList = (name) => (name === 'hello' ? [...s.hellos, ...(s.renames ?? [])] : s.door?.[name] ?? []);
  /**
   * Admin (15.11.): one pile as Similar tiles; each person's name sign and password gestures together, a new device of a
   * known person with the originals (single view: new above, original below). In the single view ↑ = on to the next pile, ↓ = back:
   * hello ↑ join (welcome) ↓ quiet · join ↑ within ↓ hello anew · within ↓ quiet · quiet ↑ within. ← → = the next take.
   */
  async function lookPile(name) {
    if (name === 'index') return ctx.showIndex?.();
    const store = name === 'hello' ? null : adminStore(), items = [], again = () => refreshDoor();
    for (const x of pileList(name)) {
      if (items.length >= 40) break; // the tiles of one look; decided ones make room
      if (x.account && x.old) { // a rename (15.11.): the new name sign above beside the first one; ↑ = the new name, ↓ = not
        const from = adminStore(), first = from && (await firstPieces(from, x.folder).catch(() => new Map())).get('');
        if (!from) continue;
        const sign = (await withHello(from, x.path).catch(() => [])).find((p) => p.endsWith('.v.mp4')); // its new name sign take
        if (!sign) continue;
        items.push({ path: sign, pair: first ?? null, from, group: x.path, pile: 'hello', name: x.name ?? null,
          up: () => adoptRename(from, x).then(() => setDisplayName(ctx.admin, x.account, x.name).catch(() => {})).then(again),
          down: () => declineRename(from, x).then(again) });
        continue;
      }
      const from = store ?? x.store ?? s.open.get(x.n)?.store;
      if (!from) continue;
      const group = x.helloPath ?? x.folder;
      const steps = name === 'hello' ? { up: (pick = {}) => welcome(ctx, x, pick), down: () => backToHello(from, x.helloPath) } // ↑ with the single view's choice (16.11.) · ↓ = quiet, the device says hello anew
        : name === 'join' ? { up: () => toWithin(from, x.helloPath, { into: choices.get(x.helloPath) }), down: () => takeBack(from, x) }
        : name === 'within' ? { down: () => moveAccount(from, x.folder, 'within', 'quiet').then(() => setEnabled(ctx.admin, userOfFolder(x.folder), false).catch(() => {})) }
        : { up: () => moveAccount(from, x.folder, 'quiet', 'within').then(() => setEnabled(ctx.admin, userOfFolder(x.folder), true).catch(() => {})),
          down: async (choices = {}) => { // ↓ = it asks (Backup · Modell as chips); ↓ again within 15 s = deleted for good: account and files (GDPR, 15.11.)
            if (!(s.armed?.folder === x.folder && Date.now() - s.armed.at < 15000)) { s.armed = { folder: x.folder, at: Date.now() }; return 'wait'; }
            s.armed = null;
            await keepCopy(userOfFolder(x.folder), x.folder, choices); // first the copies asked for; if one fails, nothing is deleted
            await deleteAccount(ctx.admin, userOfFolder(x.folder)).catch(() => {});
            return deleteFolder(from, x.folder);
          } };
      const wrap = (f) => f && ((...a) => f(...a).then((r) => (r === 'wait' ? r : again().then(() => r))));
      const seen = x.helloPath ? await helloTakes(from, x).catch(() => ({ takes: [], folder: null })) : null; // known: by her person ID first, else by name
      const takes = seen ? seen.takes : [...(await firstPieces(from, x.folder).catch(() => new Map())).values()].map((path) => ({ path }));
      for (const t of takes) items.push({ ...t, from, group, pile: name, name: x.name ?? null, known: seen?.folder ?? null, candidates: seen?.candidates ?? [], up: wrap(steps.up), down: wrap(steps.down) }); // known: the account folder in within/ to compare with; candidates: ← → in the single view
    }
    if (items.length) return onLookAll(items);
    s.shake = `hello:${s.piles?.findIndex((p) => p.pile === name)}`; draw(); setTimeout(() => { s.shake = null; draw(); }, 400); // empty: it shakes, the count says 0
    return say(ctx.admin && !adminStore() ? t('menu.noDoor') : '');
  }
  /** join ↓ (15.11.): not taken yet → the account made for this hello goes (a known person's account stays), quiet/, hello anew. */
  async function takeBack(store, x) {
    const { person } = readHello(dec.decode(await store.read(x.helloPath)));
    if (ctx.admin && !(await knownFolder(store, person.label, person.id))) await deleteAccount(ctx.admin, person.id.toLowerCase()).catch(() => {}); // gone already = fine
    return backToHello(store, x.helloPath);
  }
  /**
   * Before an account is deleted (15.11.): Backup = its Sign/ copied whole into atlas backup/<account>/ (kept for the
   * person, not counted) · Modell = copied into atlas model/<account>/ (the person allowed modeling). Read through
   * atlas's share of that Sign/; without the atlas login here nothing can be kept, so nothing is deleted (throws).
   */
  async function keepCopy(user, folder, { backup = false, model = false } = {}) {
    if (!backup && !model) return;
    if (!ctx.atlas) throw new Error('atlas login needed to keep a copy');
    const a = ctx.atlas, at = (f = '') => new WebDavStore({ base: webdavUrl(a.server, a.user, f), user: a.user, password: a.password, name: 'atlas' });
    const share = (await sharedWithMe(a)).find((x) => x.owner?.toLowerCase() === user);
    if (!share) throw new Error('no share of that Sign/');
    for (const [want, base] of [[backup, 'backup'], [model, 'model']]) {
      if (!want) continue;
      await makeFolder(a, base).catch(() => {}); await makeFolder(a, `${base}/${folder}`).catch(() => {});
      const r = await copyRoute(at(share.folder), at(`${base}/${folder}`), { kinds: ['v', 'a', 'x', 'l', 'm'] });
      if (r.failed.length) throw new Error(`${r.failed.length} not copied`);
    }
  }
  const userOfFolder = (folder) => /!\(([^()]*)\)$/.exec(folder)?.[1]?.toLowerCase();
  return { refreshDoor, lookPile, pileList, adminStore, signerVerdict };
}
