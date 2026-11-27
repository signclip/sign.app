// share-accounts.js — what Admin, Atlas and Groups do in the sharing menu (15.11., out of share-mount.js).
//
// Purpose:   Atlas counts every account's Sign/ and writes only the summary (shared with the admin) · Admin: the
//            accounts with their space (↓ rests, ↑ wakes, apart/together = more/less space), one account with its
//            devices and groups · Groups: a new group folder named by the context words.
//            Given (27.11., user: B): in an account looked at, every group where this person gave the admin her view
//            (2-storage/sealed-keys.js giveView) as a tile "(Kino) ✓"; tap = her files of that group come into Similar
//            like any sharing point (read only), tap again = out. The admin account's bubble shows how many persons gave
//            the admin something. Looked through: ≤ 30 group folders, one listing of e2e/key/ each, at most every 5 min.
// Depends:   8-join (provision, join, known), 3-index/atlas.js, share-group.js (makeOrRenew)
// Test:      tests/ui.test.mjs
// Limits:    ≤ once an hour counted (EVERY_MS) · the accounts of one group (project.json group).

import { devicesOf, quietDevice } from '../8-join/join.js';
import { accountTakes } from '../8-join/known.js';
import { nextQuota, sharedWithMe, shareFolder, makeFolder, matchAccounts, sharesOf, unshare, findPeople } from '../8-join/provision.js';
import { listAccounts, setQuota, setEnabled, groupsOf, setGroup, held, quietDeviceThere } from '../8-join/accounts.js'; // Nextcloud, the object storage, or both (27.11.)
import { summarize, readSummary, SUMMARY, EVERY_MS } from '../3-index/atlas.js';
import { makeOrRenew, groupOf, signerOf } from './share-group.js';
import { answerFor, withHello } from '../8-join/join.js';
import { readName } from '../1-model/filename.js';
import { WebDavStore } from '../2-storage/webdav.js';
import { webdavUrl } from '../2-storage/nextcloud.js';
import { shown } from '../1-model/time.js';
import { openKeys } from '../2-storage/sealed-keys.js';
import { SealedStore } from '../2-storage/sealed-store.js';
import { signerKeys } from '../2-storage/sharing-point.js';
import { descriptionNow } from './share-swarm.js';
import { deviceKeys } from './device-keys.js';
import { readHello } from '../8-join/join.js';
import { ReadOnlyStore } from '../2-storage/connect.js';

export const GIVEN_GROUPS = 30, GIVEN_MS = 5 * 60_000; // groups looked through for views given to the admin; how often

const dec = new TextDecoder();

/** ctx: the sharing menu's · words(): the context words · onLookAll(items) · project. */
export function accountPart(ctx, { words, onLookAll, project }) {
  const { s, say, t } = ctx;
  const draw = () => ctx.draw();
  const adminStore = () => ctx.adminStore?.() ?? null;
  /**
   * atlas (14.11.): every account's Sign/ is shared read only with atlas; atlas counts what lies there and writes
   * only the summary (summary/accounts.json), shared read only with the admin (project.json admin). ≤ once an hour.
   */
  async function atlasCount(login, { now = false } = {}) {
    let last = 0;
    try { last = Number(localStorage.getItem('sign.atlasAt') || 0); } catch { /* private mode */ }
    if (!now && Date.now() - last < EVERY_MS) return; // → on index: count now (15.11.)
    const root = (folder = '') => new WebDavStore({ base: webdavUrl(login.server, login.user, folder), user: login.user, password: login.password, name: 'atlas' });
    const shares = (await sharedWithMe(login)).filter((x) => x.folder !== 'summary').map((x) => ({ ...x, store: root(x.folder) }));
    await makeFolder(login, 'summary');
    const store = root();
    try { await store.remove?.(SUMMARY); } catch { /* first time */ }
    await store.write(SUMMARY, new TextEncoder().encode(await summarize(shares)));
    if (project?.admin) await shareFolder(login, 'summary', project.admin); // only the summary goes to the admin
    try { localStorage.setItem('sign.atlasAt', String(Date.now())); } catch { /* private mode */ }
  }
  /** The admin reads atlas's summary (shared into the admin's files as summary/) → Map(user → counts). */
  async function atlasSummary() {
    try {
      if (!ctx.admin?.server) return new Map(); // the object storage alone: no atlas counts yet
      const store = new WebDavStore({ base: webdavUrl(ctx.admin.server, ctx.admin.user), user: ctx.admin.user, password: ctx.admin.password, name: 'admin' });
      return readSummary(new TextDecoder().decode(await store.read(SUMMARY)));
    } catch { return new Map(); }
  }
  /**
   * Groups (15.11.): group folders live in their own account, so a group outlives the account of any one person. ← on
   * Groups = a new folder there, named by the context words (else the date), with its read and drop links as tiles; the
   * invitation goes to the clipboard. Whoever holds the Groups login welcomes; dragging the group onto a teacher's
   * account shares it there.
   */
  async function newGroup(n) {
    const sp = s.open.get(n), name = words().join(' ').trim() || `Gruppe ${shown(Date.now(), 'day')}`;
    if (!sp?.spec) return say(t('notReachable'));
    s.flash = `sp:${n}`; draw();
    if (sp.spec.kind === 'gateway') { // object storage (22.11.): groups/<name>/ with door grants, sealed under the Groups grant; no folder to make
      try {
        await makeOrRenew({ ...ctx, s: { ...s, open: new Map([...s.open, [n, { ...sp, entry: { ...sp.entry, path: `${sp.entry.path}${name}/`, label: name } }]]) } }, n);
        navigator.vibrate?.(20);
      } catch { navigator.vibrate?.([40, 40, 40]); say(t('notReachable')); }
      s.flash = null; return draw();
    }
    try {
      const folder = [sp.spec.folder, name].filter(Boolean).join('/');
      await makeFolder(ctx.groups, folder);
      await makeOrRenew({ ...ctx, s: { ...s, open: new Map([...s.open, [n, { ...sp, spec: { ...sp.spec, folder }, entry: { ...sp.entry, label: name } }]]) } }, n);
      navigator.vibrate?.(20);
    } catch { navigator.vibrate?.([40, 40, 40]); say(t('notReachable')); }
    s.flash = null; return draw();
  }
  /** Atlas (15.11.): the index — every account with its takes per strand, from atlas's own summary; first tile = back. */
  async function showIndex() {
    say(t('menu.wait'));
    try {
      const store = new WebDavStore({ base: webdavUrl(ctx.atlas.server, ctx.atlas.user), user: ctx.atlas.user, password: ctx.atlas.password, name: 'atlas' });
      s.index = [...readSummary(dec.decode(await store.read(SUMMARY)))].map(([user, c]) => ({ user, c }));
      say('');
    } catch { s.index = null; return say(t('notReachable')); }
    return draw();
  }
  const countedAt = () => { try { const at = Number(localStorage.getItem('sign.atlasAt') || 0); return at ? shown(at).slice(5, 16) : '–'; } catch { return '–'; } };
  const indexTiles = () => [{ label: `← ${countedAt()}`, go: () => { s.index = null; draw(); } }, ...s.index.filter((x) => words().every((w) => (x.c.label ?? x.user).toLowerCase().includes(w.toLowerCase()))).map((x) => ({ label: `@${x.c.label ?? x.user} · ${statsOf(x.c)}` }))];
  /** → on the admin tile: the accounts with their space as tiles; ↓ rests, ↑ wakes, two fingers apart / together = more / less space, the first tile = back (14.11.). */
  async function showAccounts() {
    s.accounts = [];
    say(t('menu.wait'));
    try {
      const [list, counts] = await Promise.all([listAccounts(ctx.admin, { doorThere: ctx.doorThere, group: project?.group, skip: [project?.atlas, project?.admin, project?.groups, ctx.admin?.user] }), atlasSummary()]);
      s.accounts = list.map((a) => ({ ...a, counts: counts.get(a.user) ?? null })); // takes and strands from atlas
      say('');
    } catch { s.accounts = null; return say(t('notReachable')); }
    return draw();
  }
  const gb = (b) => (b < 0 ? '∞' : `${Math.round(b / 2 ** 30)}`);
  function accountTiles() {
    if (!s.accounts) return null;
    if (s.account) return lookTiles(s.account);
    return [{ label: '←', go: () => { s.accounts = null; s.account = null; draw(); } }, ...matchAccounts(s.accounts, words()).map((a) => ({ // the context words find accounts, like Similar
      label: `${a.enabled ? '' : '◌ '}${a.quota > 0 && a.used / a.quota >= 0.9 ? '⚠ ' : ''}@${a.label}${a.lastLogin ? ` · ${shown(a.lastLogin, 'day').slice(5, 10)}` : ''}${a.counts ? ` · ${a.counts.chains} Takes` : ''} · ${gb(a.used)}/${gb(a.quota)} GB`, full: a.quota > 0 ? a.used / a.quota : 0,
      look: () => openAccount(a), // tap = look at it: its devices and groups
      down: () => setEnabled(ctx.admin, a.user, false, only(a)).then(showAccounts, () => say(t('notReachable'))), // ↓ rests (◌)
      up: () => setEnabled(ctx.admin, a.user, true, only(a)).then(showAccounts, () => say(t('notReachable'))), // ↑ wakes
      more: (by) => { const q = nextQuota(a.quota, by, a.used); return q ? setQuota(ctx.admin, a.user, q, only(a)).then(showAccounts, () => say(t('notReachable'))) : null; }, // 10 GB per step, Nextcloud and object storage alike
    }))];
  }
  /** An account that lives only in the object storage (it came through the door there, 27.11.): Nextcloud is not asked; its door is that one. */
  const only = (a) => ({ thereOnly: a.only === 'there' });
  const doorOf = (a) => (a.only === 'there' ? ctx.doorThere ?? null : adminStore());
  /** An account's name signs and password gestures (all its devices), oldest first, as Similar tiles. */
  async function lookAccount(a) {
    const store = doorOf(a), folder = store && (await store.list('within/').catch(() => [])).map((f) => f.path).find((p) => p.toLowerCase().includes(`!(${a.user.toLowerCase()})/`));
    if (!folder) return say(t('notReachable'));
    const paths = await accountTakes(store, folder.slice(7, folder.indexOf('/', 7)));
    return paths.length ? onLookAll(paths.map((path) => ({ path, from: store }))) : null;
  }
  /**
   * Views given to this admin device (27.11.): through every group folder of the Groups login, the key notes there,
   * opened with this device's pickup key. members: { q_: z_ } the devices whose notes count (a person's devices, or
   * every device within). → [{ folder, view: { name, key, at, by } }]
   */
  let givenSeen = null; // { at, list } for the count on the admin account
  async function givenViews(members) {
    if (!ctx.groups || !Object.keys(members).length) return [];
    const folders = (await groupsStore().folders('').catch(() => [])).map((f) => f.replace(/\/$/, '')).filter((f) => f && f !== 'summary').slice(0, GIVEN_GROUPS);
    const { pickup } = await deviceKeys(), out = [];
    for (const folder of folders) {
      const store = folderStore(folder), description = await descriptionNow(store);
      const got = await openKeys({ store, signers: description ? signerKeys(description) : {}, members, device: ctx.device, pickupKey: pickup.privateKey }).catch(() => null);
      for (const view of got?.views ?? []) if (members[view.by]) out.push({ folder, view });
    }
    return out;
  }
  /** How many persons gave this admin device a view: on the admin account's bubble. Read when the menu opens, ≤ every 5 min. */
  async function givenCount() {
    if (givenSeen && Date.now() - givenSeen.at < GIVEN_MS) return givenSeen.n;
    const store = adminStore();
    if (!store || !ctx.groups) return null;
    const paths = (await store.list('within/').catch(() => [])).map((f) => f.path).filter((p) => p.endsWith('.chain.sign'));
    const owner = {}, members = {};
    for (const p of paths) {
      try { const h = readHello(dec.decode(await store.read(p))); members[h.device.id] = h.device.key; owner[h.device.id] = h.person.id; } catch { /* no hello */ }
    }
    const list = await givenViews(members);
    givenSeen = { at: Date.now(), n: new Set(list.map((g) => owner[g.view.by])).size };
    draw();
    return givenSeen.n;
  }
  /** Her files of one group into Similar (read only, like any sharing point) – or out again. */
  function toggleGiven(a, g) {
    const id = `given:${g.view.name}`;
    if (ctx.hasGiven(id)) { ctx.hideGiven(id); return draw(); }
    const view = new SealedStore({ store: folderStore(g.folder), keys: [g.view], view: true, name: `${a.label} · ${g.folder}` });
    ctx.showGiven({ name: `${a.label} · ${g.folder}`, store: new ReadOnlyStore(view), write: false, id });
    return draw();
  }

  /** An account looked at (14.11.): its devices (↓ = quiet, "Gerät sperren") and its groups as context chips (tap a faint one = in, ↓ = out). */
  async function openAccount(a) {
    say(t('menu.wait'));
    const store = doorOf(a);
    const [devices, groups, there] = await Promise.all([store ? devicesOf(store, a.user).catch(() => []) : [], groupsOf(ctx.admin, a.user, only(a)).catch(() => ({ all: [], mine: [] })), a.only ? null : Promise.resolve(held(ctx.admin, a.user)).catch(() => null)]);
    const given = await givenViews(Object.fromEntries(devices.map((d) => [d.device.id, d.device.key]))).catch(() => []);
    s.account = { a, devices, groups, store, there, given };
    say('');
    return draw();
  }
  /** Takes and strands of an account, from atlas: '12 Takes · v 12 · a 9 · x 12 · l 3'. */
  const statsOf = (c) => (c ? [`${c.chains ?? 0} Takes`, ...['v', 'a', 'x', 'l'].map((k) => `${k} ${c[k] ?? 0}`)].join(' · ') : '–');
  function lookTiles({ a, devices, groups, store, there = null, given = [] }) {
    const again = () => openAccount(a), fail = () => say(t('notReachable'));
    return [
      { label: `← @${a.label}`, go: () => { s.account = null; draw(); } },
      { label: statsOf(a.counts), look: () => lookAccount(a) }, // what the account holds (atlas: takes per strand); tap = its gestures
      ...(there ? [{ label: `s3 · ${gb(there.used)}/${there.room ? gb(there.room) : '∞'} GB` }] : []), // the object storage: what it holds of its room
      ...devices.map((d) => ({ label: d.device.label, down: () => Promise.resolve(quietDeviceThere(ctx.admin, d.device.id)).catch(() => {}).then(() => signerOf(ctx)).then((signer) => quietDevice(store, d.helloPath, { signer })).then(again, fail) })), // ↓ = quiet: in the object storage no grant naming this device counts any more, then its files move with a note sealed by the signer (the device follows only its signer)
      ...groups.all.map((g) => (groups.mine.includes(g)
        ? { label: `(${g})`, down: () => setGroup(ctx.admin, a.user, g, false).then(again, fail) } // in this group: ↓ = out
        : { label: `(${g})`, faint: true, look: () => setGroup(ctx.admin, a.user, g, true).then(again, fail) })), // tap = in
      ...given.map((g) => ({ label: `(${g.folder}) ✓`, shown: ctx.hasGiven(`given:${g.view.name}`), look: () => toggleGiven(a, g) })), // what she gave me (27.11.): tap = in Similar / out
    ];
  }
  /**
   * Groups (16.11.): every group folder of the Groups account as a tile; tap = who has access (↓ on one = taken back);
   * + with names written as context = those people get it too (in their menu as a waiting tile, a tap = in).
   */
  const groupsStore = () => ctx.groups && new WebDavStore({ base: webdavUrl(ctx.groups.server, ctx.groups.user), user: ctx.groups.user, password: ctx.groups.password, name: 'groups' });
  async function showGroups() {
    if (!ctx.groups) return say(t('notReachable'));
    say(t('menu.wait'));
    try { s.groupList = (await groupsStore().folders('')).map((f) => f.replace(/\/$/, '')).filter((f) => f && f !== 'summary'); s.group = null; say(''); } catch { s.groupList = null; return say(t('notReachable')); }
    return draw();
  }
  const folderStore = (folder) => new WebDavStore({ base: webdavUrl(ctx.groups.server, ctx.groups.user, folder), user: ctx.groups.user, password: ctx.groups.password, name: folder });
  /** Who is in a group: accounts with access (shares) and devices that joined by its links (a hello with an answer). */
  async function openGroup(folder) {
    say(t('menu.wait'));
    try {
      const paths = (await folderStore(folder).list('hello/').catch(() => [])).map((f) => f.path);
      const joined = paths.filter((p) => p.endsWith('.chain.sign') && answerFor(paths, p)).map((helloPath) => ({ helloPath, label: readName(helloPath.slice(6))?.person ?? '?' }));
      s.group = { folder, access: await sharesOf(ctx.groups, folder), joined };
      say('');
    } catch { return say(t('notReachable')); }
    return draw();
  }
  /**
   * The group got smaller (16.11.): new read and drop links, the old ones stop, and every device still in gets a new sealed
   * join; its app follows the new links by itself (share-group.js followJoins). An account's access ends at once anyway.
   */
  async function leaveGroup(folder, helloPath) { // her records of joining this group go (hello, its takes, answer); her own takes and her account stay
    const store = folderStore(folder), paths = (await store.list().catch(() => [])).map((f) => f.path);
    for (const p of [helloPath, ...(await withHello(store, helloPath).catch(() => [])), answerFor(paths, helloPath)].filter(Boolean)) await store.remove(p).catch(() => {});
  }
  async function renewLinks(folder) {
    const n = s.groupsN, sp = s.open.get(n), label = folder.split('/').pop();
    if (!sp?.spec || !groupOf(ctx, label)) return; // no links made for this group: nothing to renew
    await makeOrRenew({ ...ctx, s: { ...s, open: new Map([...s.open, [n, { ...sp, store: folderStore(folder), spec: { ...sp.spec, folder }, entry: { ...sp.entry, label } }]]) } }, n);
  }
  /** + while a group is open: the names written as context get access (one person each, as on the Nextcloud). → given / asked */
  async function addToGroup(names = words()) {
    if (!s.group || !names.length) return say(t('menu.paste'));
    let given = 0;
    for (const name of names) {
      const found = await findPeople(ctx.groups, name).catch(() => []);
      const one = found.find((x) => x.label.toLowerCase() === name.toLowerCase() || x.id.toLowerCase() === name.toLowerCase()) ?? (found.length === 1 ? found[0] : null);
      if (one && await shareFolder(ctx.groups, s.group.folder, one.id, { permissions: 5 }).then(() => true, () => false)) given++;
    }
    navigator.vibrate?.(given === names.length ? 20 : [40, 40, 40]);
    say(`${s.group.folder} + ${given}/${names.length}`);
    return openGroup(s.group.folder);
  }
  function groupTiles() {
    if (!s.groupList) return null;
    const out = (go) => () => go().then(() => openGroup(s.group.folder), () => say(t('notReachable'))); // ↓ = out of this group only (16.11.): her account stays as it is, no link changes
    if (s.group) return [{ label: `← ${s.group.folder}`, go: () => { s.group = null; draw(); }, up: () => renewLinks(s.group.folder).then(() => openGroup(s.group.folder), () => say(t('notReachable'))) }, // ↑ = new member links (a link given out to view stays)
      ...s.group.access.map((a) => ({ label: `@${a.label}`, down: out(() => unshare(ctx.groups, a.id)) })), // an account with access
      ...s.group.joined.map((j) => ({ label: `@${j.label}`, faint: true, down: out(() => leaveGroup(s.group.folder, j.helloPath).then(() => renewLinks(s.group.folder))) }))]; // a device by the links (faint): ↓ = out, and at once new member links (the others follow; links given out to view stay)
    return [{ label: '←', go: () => { s.groupList = null; draw(); } }, ...s.groupList.filter((g) => words().every((w) => g.toLowerCase().includes(w.toLowerCase()))).map((g) => ({ label: g, look: () => openGroup(g) }))];
  }
  return { atlasCount, atlasSummary, newGroup, showIndex, indexTiles, showAccounts, accountTiles, lookAccount, openAccount, showGroups, groupTiles, addToGroup, givenCount, given: () => givenSeen?.n ?? null };
}
