// emergency.js — the emergency sheet (Notfallblatt, 14.11.): ↑ on this device's own tile → a PDF in the system
// share sheet (print, save, send). The screen never shows the paper password; only the paper does.
//
// Purpose:   sheetData() turns what share-mount.js holds (list, rules, opened sharing points, index, admin, accounts)
//            into one plain sheet; sheetPages() draws it, in this order:
//              cover     the app as it looks and the roadmap (view/sheet-cover.js)
//              backup    paper password, how backups open, access IDs, password gestures and login by hand
//              points    every sharing point as a tile of the sharing menu, with login and path
//              stock     numbers, strands at their arcs, weeks, the earth with the spots, the index
//              context   every take a point, placed by its words
//              accounts  (admin) hello · join · within · quiet, tiles sized by bytes
//            One colour = one meaning on every page (view/sheet-charts.js INK). The paper password stays the same on every
//            sheet; a new one only with the current one copied as second factor (paperChoice).
// Depends:   1-model/pdf.js, 3-index/tally.js, 3-index/context-map.js, view/sheet-cover.js, view/sheet-pages.js
// Test:      tests/model.test.mjs (emergency sheet)
// Limits:    A4 · paper password 26 Base32 characters (≈ 130 bit) in groups of 4 · no password of a login ever
//            reaches the sheet (only user, server, path) · ≤ 24 sharing points drawn around the device.

import { Page, makePages } from '../1-model/pdf.js';
import { timeLabel } from '../1-model/filename.js';
import { tally } from '../3-index/tally.js';
import { contextMap } from '../3-index/context-map.js';
import { INK, arcs } from './view/sheet-charts.js';
import { cover } from './view/sheet-cover.js';
import { M, W, backupPage, pointPages, stockPage, contextPage, accountPages } from './view/sheet-pages.js';

const KIND = { nextcloud: 'Nextcloud', webdav: 'WebDAV', link: 'Lese-Link', folder: 'Ordner', local: 'Gerät', cloud: 'Cloud-ID' };
const ORDER = ['always', 'ask', 'show', 'backup', 'consent'];
const host = (server) => String(server ?? '').replace(/^https?:\/\//, '').replace(/\/$/, '');
const EMPTY = { tables: { chains: new Map(), strands: new Map(), sharingPoints: new Map(), context: new Map(), weave: new Map(), takes: new Set(), similar: new Set() } };

/** The login of a sharing point, without its password: user@server, the Cloud-ID, or the path. */
export function loginOf(spec, path) {
  if (spec?.kind === 'nextcloud') return `${spec.user}@${host(spec.server)}${spec.folder ? ` /${spec.folder}` : ''}`;
  if (spec?.kind === 'webdav' && spec.user) return `${spec.user} @ ${spec.url}`;
  if (spec?.kind === 'cloud') return spec.cloudId;
  return path ?? null;
}

/**
 * What share-mount.js holds → the sheet. entries: the list (readList) · rules: rulesOf · open: Map(n → { spec, store,
 * error, waiting }) · index: the Index or null · admin: { user, server } or null · accounts: [{ user, label, state, v, a,
 * x, l, chains, bytes }] · project: project.json · joins: [{ label, state, hello, join }] (time labels of the hello and the
 * answer) · passwordGestures: the words of the gestures one joined with, or null (then fields to write by hand) ·
 * services: { admin: n, atlas: n } (service tiles) · spots: [{ name, lat, lon, n }] (none yet: takes carry no o_).
 */
export function sheetData({ person, device, key, paper, signerCode = null, joins = [], passwordGestures = null, services = {}, spots = [], date, entries = [], rules = [], open = new Map(), index = null, admin = null, accounts = [], project = null, nameSign = false, gestureSlots = 5, now = Date.now() }) {
  const stats = tally(index ?? EMPTY, { now });
  const files = new Map(stats.files);
  const countsOf = (store) => { const k = stats.kinds[store]; return k ? { v: k.v, a: k.a, x: k.x, l: k.l + k.m } : null; };
  const points = entries.map((e, i) => ({ e, n: i + 1 })).filter(({ e }) => e.id !== device).map(({ e, n }) => {
    const sp = open.get(n), spec = sp?.spec, mine = rules.filter((r) => r.to === n && r.from == null);
    const kind = !e.path && e.key ? 'Gerät' : /sciebo/i.test(e.path ?? '') ? 'Sciebo' : KIND[spec?.kind] ?? (e.path ? 'Speicher' : 'Gerät');
    return {
      n, label: e.label, kind, path: e.path ?? null, id: e.id ?? null, login: loginOf(spec, e.path ?? null),
      friend: ['link', 'cloud'].includes(spec?.kind), shown: mine.some((r) => r.mark === 'show'), offline: Boolean(sp?.error || sp?.waiting),
      marks: ORDER.filter((m) => mine.some((r) => r.mark === m)), group: Boolean(e.path && /\/s\//.test(e.path) && !['link', 'cloud'].includes(spec?.kind)),
      consent: [...new Set(mine.filter((r) => r.mark === 'consent').flatMap((r) => (r.kinds?.length ? r.kinds : ['v', 'a', 'x', 'l'])))],
      always: [...new Set(mine.filter((r) => r.mark === 'always').flatMap((r) => r.kinds ?? []))],
      kinds: mine.some((r) => !r.kinds?.length) ? [] : [...new Set(mine.flatMap((r) => r.kinds ?? []))],
      files: files.get(e.label) ?? 0, counts: countsOf(e.label) ?? undefined,
      ...(n === services.admin ? { service: 'admin', label: 'Admin' } : n === services.atlas ? { service: 'atlas', label: 'Atlas' } : {}), // as in the app: no storage, no bars
    };
  });
  const atlas = project?.atlas ? `${project.atlas}${admin?.server ? `@${host(admin.server)}` : ''}` : null;
  const roles = ['signer', ...(admin ? ['admin'] : []), ...(admin && project?.atlas && project.atlas === admin.user ? ['atlas'] : [])];
  const ids = [
    { label: 'Person', value: person.id }, { label: 'Gerät', value: key, small: true }, // q_ and its check key z_ in one line
    ...(admin ? [{ label: 'Konto (Admin)', value: `${admin.user}@${host(admin.server)}` }] : []),
    ...(atlas ? [{ label: 'atlas', value: atlas }] : []),
    ...(project?.signer ? [{ label: 'signer des Projekts', value: project.signer, small: true }] : []),
    ...(signerCode ? [{ label: 'Ersatz-signer (neues Admin-Gerät: kopieren, + antippen)', value: `sign-signer ${signerCode.replace(/(.{4})/g, '$1 ').trim()}` }] : []),
  ];
  const own = countsOf('own') ?? { v: stats.strands.v, a: stats.strands.a, x: stats.strands.x, l: stats.strands.l };
  const flows = rules.filter((r) => ['always', 'ask', 'backup', 'show'].includes(r.mark)).map((r) => ({ from: r.from ?? 0, to: r.to, mark: r.mark }));
  const day = (label) => { const m = /^(\d{4})\.(\d\d)\.(\d\d)/.exec(label ?? ''); return m ? `${Number(m[3])}.${Number(m[2])}.` : null; };
  const joined = joins.map((j) => ({ label: j.label, state: j.state, hello: day(j.hello), join: day(j.join) })).filter((j) => points.some((pt) => pt.label === j.label));
  return { name: person.label, person: person.id, date, now, roles, paper, ids, points, flows, joins: joined, passwordGestures, own, nameSign, gestureSlots, stats, context: contextMap(stats.list), spots,
    accounts: admin ? accounts.map((a) => ({ ...a, label: a.label ?? a.user })) : null, atlas, device };
}

const ROLE = { signer: 'signer', admin: 'Admin', atlas: 'atlas' }; // grey: a role is no colour meaning

function frame(p, sheet, no, of, name) {
  arcs(p, M + 11, 38, 8, { width: 1.8, line: false });
  p.text(M + 28, 43, 'Sign', { size: 16, font: 'bold' });
  p.text(M + 66, 43, name, { size: 9, color: INK.mut });
  p.text(M + W, 36, `${sheet.name}  ·  ${sheet.date}`, { size: 8, align: 'right' });
  let rx = M + W;
  for (const r of [...sheet.roles].reverse()) {
    const label = ROLE[r], w = label.length * 3.6 + 10;
    rx -= w; p.rect(rx, 41, w, 10, { r: 5, stroke: INK.mut, width: 0.6 }); p.text(rx + w / 2, 48.5, label, { size: 6.5, align: 'center' }); rx -= 4;
  }
  p.line(M, 812, M + W, 812, { stroke: INK.line, width: 0.6 });
  p.text(M, 824, 'nicht fotografieren · nicht in eine Cloud · ein neues Blatt ersetzt dieses', { size: 6.5, color: INK.mut });
  p.text(M + W, 824, `'t(${timeLabel(sheet.now)})  ${no} / ${of}`, { size: 6.5, color: INK.mut, align: 'right' });
}

/**
 * Keep the paper password or make a new one (15.11.): every sheet prints the same paper password, so all printed sheets
 * stay valid together. A new one only when asked, with a second factor: the current paper password, copied (from the
 * paper or the PDF), at the moment the sheet is made. Someone holding only the phone cannot shut out the paper.
 * stored: the paper password in the keychain or null · typed: what was copied, or null → 'keep' | 'new' | 'first'.
 */
export function paperChoice(stored, typed) {
  const plain = (t) => String(t ?? '').toUpperCase().replace(/[\s-]/g, '');
  if (!stored) return 'first';
  return typed && plain(typed) === plain(stored) ? 'new' : 'keep';
}

/** sheet (sheetData) → the pages. */
export function sheetPages(sheet) {
  const self = { n: 0, label: sheet.name, kind: 'dieses Gerät', self: true, id: sheet.device ?? null, path: null, login: null, marks: [], always: ['v', 'a', 'x', 'l'], kinds: [], counts: sheet.own, files: sheet.stats.files.find(([s]) => s === 'own')?.[1] ?? 0 };
  const first = new Page();
  cover(first, sheet);
  const named = [[first, 'Sign'], [backupPage(sheet), 'Backup'], ...pointPages(sheet, self).map((p) => [p, 'sharing points']), [stockPage(sheet), 'Bestand'], [contextPage(sheet), 'context'],
    ...(sheet.accounts?.length ? accountPages(sheet).map((p) => [p, 'Konten']) : [])];
  named.forEach(([p, name], i) => (i ? frame(p, sheet, i + 1, named.length, name) : p.text(M + W, 824, `'t(${timeLabel(sheet.now)})  1 / ${named.length}`, { size: 6.5, color: INK.mut, align: 'right' })));
  return named.map(([p]) => p);
}

/**
 * The file name as every file name in SCHEMA B4: readable in front, the identity behind —
 * (Sign Overview)@(Lena)'t(2026.11.15 10.30.00)!(n_…).pdf
 * n_ (the person, never changes) with 't (to the second) tells every sheet apart: one person makes no two sheets in
 * one second. The same 't stands at the foot of every page, so paper and file belong together.
 */
export const sheetName = (sheet) => `(Sign Overview)@(${String(sheet.name).replace(/[()/\\:*?"<>|#%{}]/g, '')})'t(${timeLabel(sheet.now)})!(${sheet.person}).pdf`;

/** The sheet as a PDF file (its title = the file name without .pdf). */
export const sheetPdf = (sheet) => makePages(sheetPages(sheet), { title: sheetName(sheet).slice(0, -4) });
