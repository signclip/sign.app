// emergency.js — the emergency sheet (Notfallblatt, 14.11.): ↑ on this device's own tile → a PDF in the system
// share sheet (print, save, send). The screen never shows the paper password; only the paper does.
//
// Purpose:   page 1 Zugang: paper password (opens every backup when all devices are gone), the access IDs to
//            copy (person, device, check key, accounts), every sharing point with kind, rules, strands, full path
//            and q_, the password gestures and an emergency login — both written by hand, never digital.
//            page 2 Bestand: big numbers, strands by kind, takes per week, trends, rooms, sharing points around
//            this device. page 3 Zusammenhänge: context cluster, special gestures, how the index is built.
//            page 4 (signer of atlas or admin): every account atlas counted. A new sheet = a new paper password.
// Depends:   1-model/pdf.js, 3-index/tally.js, 9-ui/view/sheet-charts.js
// Gathers:   sheetData() turns what share-mount.js holds (list, rules, opened sharing points, index, admin) into
//            the plain sheet; the drawing never reads a store.
// Test:      tests/model.test.mjs (emergency sheet)
// Limits:    A4 · paper password 26 Base32 characters (≈ 130 bit) in groups of 4 · 8 sharing points on page 1,
//            each further 19 on an extra page · paths ≤ 115 characters print whole (≥ 5 pt), longer ones are cut · ≤ 40 accounts on the atlas page · password gestures: 3–8 fields.

import { Page, makePages, fit, textWidth } from '../1-model/pdf.js';
import { tally } from '../3-index/tally.js';
import { INK, KIND, RULE, ring, title, tiles, stack, weeks, trend, rooms, around, cluster, indexMap, hours } from './view/sheet-charts.js';

const M = 40, W = 515, FIRST = 8, MORE = 19; // 36 pt per sharing point: 8 fit page 1 (≈ 290 pt), 19 an extra page
const groups = (s) => s.replace(/(.{4})/g, '$1 ').trim();
const n0 = (n) => Math.round(n ?? 0).toLocaleString('de-DE');
const gb = (bytes) => (bytes / 1e9).toLocaleString('de-DE', { maximumFractionDigits: 1 });
const ROLE = { signer: 'signer', admin: 'Admin', atlas: 'atlas' };

function frame(p, sheet, no, of, name) {
  ring(p, M + 11, 38, 10);
  p.text(M + 30, 43, 'Sign', { size: 18, font: 'bold' });
  p.text(M + 72, 43, name, { size: 10, color: INK.mut });
  p.text(M + W, 36, `${sheet.name}  ·  ${sheet.date}`, { size: 8, align: 'right' });
  let rx = M + W;
  for (const r of [...sheet.roles].reverse()) {
    const w = textWidth(ROLE[r] ?? r, 6.5) + 10;
    rx -= w; p.rect(rx, 41, w, 10, { r: 5, fill: r === 'signer' ? INK.rc : r === 'admin' ? INK.hl : INK.sc });
    p.text(rx + w / 2, 48.5, ROLE[r] ?? r, { size: 6.5, align: 'center' }); rx -= 4;
  }
  p.line(M, 812, M + W, 812, { stroke: INK.line, width: 0.6 });
  p.text(M, 824, 'Sicher aufbewahren · nicht fotografieren · nicht in eine Cloud legen · ein neues Blatt ersetzt dieses', { size: 6.5, color: INK.mut });
  p.text(M + W, 824, `${no} / ${of}`, { size: 6.5, color: INK.mut, align: 'right' });
}

/** A copyable value: label left, value in Courier on a light field (one text run = one copy). */
function value(p, y, label, text, size = 8.5) {
  p.rect(M, y - 9, W, 15, { r: 4, fill: INK.paper });
  p.text(M + 6, y + 1.5, label, { size: 7, color: INK.mut });
  p.text(M + 104, y + 1.5, fit(text, size, W - 110, 'mono'), { size, font: 'mono' });
  return y + 18;
}

/** One sharing point in two lines: glyph, label, kind, rules, strands, files · full path and q_. */
function pointRow(p, y, s) {
  p.circle(M + 9, y + 3, 8, { fill: s.group ? INK.sc : INK.card, stroke: s.group ? INK.scS : INK.rcS, width: 1 });
  p.text(M + 9, y + 5.5, String(s.n), { size: 7, font: 'bold', align: 'center' });
  p.text(M + 24, y + 3, fit(s.label, 9, 150, 'bold'), { size: 9, font: 'bold' });
  p.text(M + 24, y + 12.5, s.kind, { size: 6.5, color: INK.mut });
  let cx = M + 182;
  for (const m of s.marks) {
    const r = RULE[m], w = textWidth(r.de, 6.5) + 10;
    p.rect(cx, y - 3, w, 10, { r: 5, fill: INK.card, stroke: r.ink, width: 0.8, dash: r.dash });
    p.text(cx + w / 2, y + 4.5, r.de, { size: 6.5, align: 'center' }); cx += w + 3;
  }
  Object.keys(KIND).forEach((k, i) => {
    const on = !s.kinds.length || s.kinds.includes(k), kx = M + 384 + i * 11;
    p.rect(kx, y - 3, 9, 9, { r: 2, fill: on ? KIND[k].ink : INK.card, stroke: on ? null : INK.rest, width: 0.6 });
    p.text(kx + 4.5, y + 13, k, { size: 6, color: INK.mut, align: 'center' });
  });
  p.text(M + W, y + 5, s.files ? `${n0(s.files)} Dateien` : '', { size: 7, color: INK.mut, align: 'right' });
  const path = s.path ?? '(erreichbar über das Gerät, kein Pfad)', room = W - 24 - 92; // the whole path: smaller type before cutting
  const size = Math.max(5, Math.min(7, room / (0.6 * path.length)));
  p.text(M + 24, y + 23, fit(path, size, room, 'mono'), { size, font: 'mono', color: s.path ? INK.fg : INK.mut });
  p.text(M + W, y + 23, s.id ?? '', { size: 7, font: 'mono', color: INK.mut, align: 'right' });
  p.line(M, y + 29, M + W, y + 29, { stroke: INK.line, width: 0.4 });
}

function accessPage(sheet, rest) {
  const p = new Page();
  let y = title(p, M, 80, W, 'Papier-Passwort für deine Backups', 'öffnet jedes Backup, auch wenn alle Geräte fehlen');
  p.rect(M, y - 6, W, 44, { r: 10, fill: '#fff6d6', stroke: INK.hlS, width: 0.8 });
  p.text(M + W / 2, y + 23, groups(sheet.paper), { size: 22, font: 'mono', align: 'center' });
  y = title(p, M, y + 62, W, 'Zugangs-IDs', 'öffentlich · zum Kopieren markieren');
  for (const { label, value: v, small } of sheet.ids) y = value(p, y, label, v, small ? 6.8 : 8.5);
  y = title(p, M, y + 14, W, `sharing points (${sheet.points.length})`, 'Pfad und q_ zum Wiederverbinden · Passwörter nie hier');
  for (const s of sheet.points.slice(0, FIRST)) { pointRow(p, y, s); y += 36; }
  if (sheet.points.length > FIRST) p.text(M, y, `weiter auf Seite 2 (${sheet.points.length - FIRST})`, { size: 7, color: INK.mut });
  y = title(p, M, y + 10, W, 'Passwort-Gesten', 'nur von Hand · ein Wort je Geste als Merkhilfe');
  const slots = Math.max(3, Math.min(8, sheet.passwordGestures?.length || sheet.gestureSlots || 5)), sw = (W - (slots - 1) * 6) / slots;
  for (let i = 0; i < slots; i++) {
    const sx = M + i * (sw + 6);
    p.rect(sx, y - 6, sw, 34, { r: 6, fill: INK.card, stroke: INK.rest, width: 0.8, dash: [3, 2] });
    p.circle(sx + 10, y + 4, 6, { fill: INK.rc }); p.text(sx + 10, y + 6.5, String(i + 1), { size: 7, font: 'bold', align: 'center' });
    const word = sheet.passwordGestures?.[i];
    if (word) p.text(sx + sw / 2, y + 22, fit(word, 9, sw - 8), { size: 9, align: 'center' });
  }
  y = title(p, M, y + 50, W, 'Notzugang (nur von Hand eintragen, nie digital)');
  for (const [i, label] of ['Konto', 'Passwort'].entries()) {
    const lx = M + i * (W / 2 + 6);
    p.text(lx, y + 4, label, { size: 7, color: INK.mut });
    p.line(lx + 44, y + 6, lx + W / 2 - 6, y + 6, { stroke: INK.mut, width: 0.6 });
  }
  if (y < 700) back(p, Math.max(y + 34, 712));
  frame(p, sheet, 1, rest + 1, 'Notfallblatt · Zugang');
  return p;
}

/** So kommst du zurück: three steps along the app's own gestures (Namensgebärde, Passwort-Gesten, tile on the device). */
function back(p, y) {
  y = title(p, M, y, W, 'So kommst du zurück');
  const steps = [['Neues Gerät', 'App öffnen, Namensgebärde aufnehmen'], ['Passwort-Gesten', 'nacheinander gebärden: Konto und Gerät'], ['Backup holen', 'Kachel aufs Gerät, Papier-Passwort']];
  const sw = (W - 2 * 14) / 3;
  steps.forEach(([head, text], i) => {
    const sx = M + i * (sw + 14);
    p.circle(sx + 11, y + 6, 10, { fill: [INK.rc, INK.hl, INK.sc][i], stroke: [INK.rcS, INK.hlS, INK.scS][i], width: 0.8 });
    p.text(sx + 11, y + 9.5, String(i + 1), { size: 9, font: 'bold', align: 'center' });
    p.text(sx + 28, y + 4, head, { size: 8.5, font: 'bold' });
    p.text(sx + 28, y + 14, fit(text, 7, sw - 30), { size: 7, color: INK.mut });
    if (i < 2) p.poly([[sx + sw + 3, y + 2], [sx + sw + 9, y + 6], [sx + sw + 3, y + 10]], { stroke: INK.mut, width: 0.8 });
  });
}

function morePoints(sheet, list, from) {
  const p = new Page();
  let y = title(p, M, 80, W, `sharing points ${from + 1}–${from + list.length}`);
  for (const s of list) { pointRow(p, y, s); y += 36; }
  return p;
}

function stockPage(sheet) {
  const p = new Page(), st = sheet.stats, all = Object.values(st.strands).reduce((a, b) => a + b, 0);
  let y = title(p, M, 80, W, 'Bestand', st.first ? `seit ${new Date(st.first).toLocaleDateString('de-DE')}` : '');
  tiles(p, { x: M, y, w: W, h: 58 }, [
    { value: n0(st.takes), label: 'Takes', ink: INK.rcS }, { value: hours(st.hours.all), label: 'Stunden', ink: INK.video },
    { value: n0(st.words), label: 'Wörter im context', ink: INK.scS }, { value: n0(all), label: 'strands', ink: INK.hold },
    { value: n0(sheet.points.length), label: 'sharing points', ink: INK.hlS }, { value: n0(st.versions), label: 'Versionen', ink: INK.rc },
  ]);
  y = title(p, M, y + 82, W, 'strands je Art', `mit Bild ${hours(st.hours.v)} h · mit Ton ${hours(st.hours.a)} h · ~ berechnet ${n0(st.echo)}`);
  stack(p, { x: M, y: y - 4, w: W }, st.strands);
  y = title(p, M, y + 44, W, 'Takes je Woche', 'letzte 26 Wochen · die letzten 4 kräftig');
  weeks(p, { x: M + 16, y, w: W - 16, h: 78 }, st.weeks, sheet.now);
  y += 108;
  title(p, M, y, 240, 'Trends', '28 Tage gegen die 28 davor');
  trend(p, { x: M, y: y + 16, w: 240 }, st.trend);
  title(p, M + 260, y, W - 260, 'Orte', 'schematisch');
  rooms(p, { x: M + 260, y: y + 14, w: W - 260, h: 92 }, st.rooms);
  y = title(p, M, y + 128, W, 'Gruppen und sharing points', 'Größe = Dateien dort · Linie = Regel');
  around(p, { x: M, y, w: W, h: 812 - y - 14 }, sheet.points, sheet.deviceLabel);
  return p;
}

function linksPage(sheet) {
  const p = new Page(), st = sheet.stats;
  let y = title(p, M, 80, W, 'context-Cluster', `${n0(st.words)} Wörter · Kreis = strands mit dem Wort · Linie = gemeinsam in einem strand`);
  cluster(p, { x: M, y, w: W, h: 330 }, st.chips, st.pairs);
  y = title(p, M, y + 352, W, 'Besondere Gesten');
  tiles(p, { x: M, y, w: W, h: 52 }, [
    { value: sheet.nameSign ? 'ja' : '–', label: 'Namensgebärde', ink: INK.rcS }, { value: String(sheet.passwordGestures?.length || sheet.gestureSlots || '–'), label: 'Passwort-Gesten', ink: INK.hlS },
    { value: n0(st.waiting), label: 'offene takes _( )', ink: INK.rc }, { value: n0(st.similar), label: 'similar im Log', ink: INK.scS },
    { value: n0(st.echo), label: 'echo ~( )', ink: INK.hold }, { value: n0(st.people.length), label: 'Personen @', ink: INK.video },
  ]);
  y = title(p, M, y + 76, W, 'So ist der Index aufgebaut', 'Ordner in jedem sharing point, Tabellen im Gerät');
  indexMap(p, { x: M, y: y + 4, w: W }, st.tables, st.strands);
  return p;
}

function atlasPage(sheet) {
  const p = new Page(), list = sheet.accounts.slice(0, 40), sum = (k) => sheet.accounts.reduce((a, b) => a + (b[k] ?? 0), 0);
  const bytes = sum('bytes'), quota = sheet.quota ?? 1e12; // 1 TB at the start (Hetzner, decided 27.10.)
  let y = title(p, M, 80, W, 'Konten', sheet.atlas ? `atlas: ${sheet.atlas} · zählt, ohne Dateien zu lesen` : 'von atlas gezählt, ohne Dateien zu lesen');
  tiles(p, { x: M, y, w: W, h: 52 }, [
    { value: n0(sheet.accounts.length), label: 'Konten', ink: INK.rcS }, { value: n0(sum('v')), label: 'Bild', ink: KIND.v.ink }, { value: n0(sum('a')), label: 'Ton', ink: KIND.a.ink },
    { value: n0(sum('x')), label: 'context', ink: KIND.x.ink }, { value: n0(sum('chains')), label: 'chains', ink: INK.rc }, { value: gb(bytes), label: 'GB belegt', ink: INK.hlS },
  ]);
  y = title(p, M, y + 76, W, 'Speicher', `${gb(bytes)} GB von ${gb(quota)} GB · ${((bytes / quota) * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`);
  p.rect(M, y - 4, W, 12, { r: 6, fill: INK.rest });
  p.rect(M, y - 4, Math.max(12, (bytes / quota) * W), 12, { r: 6, fill: INK.hlS });
  y = title(p, M, y + 30, W, 'je Konto', 'Bild · Ton · context · landmarks');
  const max = Math.max(1, ...list.map((a) => a.v + a.a + a.x + a.l));
  for (const a of list) {
    p.text(M, y + 4, fit(a.label || a.user, 8.5, 120, 'bold'), { size: 8.5, font: 'bold' });
    p.text(M + 124, y + 4, fit(a.user, 7, 110, 'mono'), { size: 7, font: 'mono', color: INK.mut });
    let bx = M + 240;
    p.rect(bx, y - 3, 190, 9, { r: 2, fill: INK.paper });
    for (const k of ['v', 'a', 'x', 'l']) { const bw = (a[k] / max) * 190; if (bw) p.rect(bx, y - 3, bw, 9, { fill: KIND[k].ink }); bx += bw; }
    p.text(M + W, y + 4, `${n0(a.chains)} chains · ${gb(a.bytes)} GB`, { size: 7, color: INK.mut, align: 'right' });
    p.line(M, y + 9, M + W, y + 9, { stroke: INK.line, width: 0.3 });
    y += 17;
  }
  return p;
}

const KIND_DE = { nextcloud: 'Nextcloud', webdav: 'WebDAV', link: 'Lese-Link', folder: 'Ordner', local: 'Gerät', cloud: 'Cloud-ID' };
const ORDER = Object.keys(RULE);

/**
 * What share-mount.js holds → the sheet. entries: the list (readList) · rules: rulesOf · open: Map(n → { spec, store }) ·
 * index: the Index or null · admin: { user, server } or null · accounts: atlas summary rows or [] · project: project.json.
 */
export function sheetData({ person, device, key, paper, signerCode = null, date, entries = [], rules = [], open = new Map(), index = null, admin = null, accounts = [], project = null, nameSign = false, gestureSlots = 5, now = Date.now() }) {
  const stats = index ? tally(index, { now }) : tally({ tables: { chains: new Map(), strands: new Map(), sharingPoints: new Map(), context: new Map(), weave: new Map(), takes: new Set(), similar: new Set() } }, { now });
  const files = new Map(stats.files);
  const points = entries.map((e, i) => ({ e, n: i + 1 })).filter(({ e }) => e.id !== device).map(({ e, n }) => {
    const spec = open.get(n)?.spec, mine = rules.filter((r) => r.to === n && r.from == null);
    const kind = !e.path && e.key ? 'Gerät' : /sciebo/i.test(e.path ?? '') ? 'Sciebo' : KIND_DE[spec?.kind] ?? (e.path ? 'Speicher' : 'Gerät');
    return {
      n, label: e.label, kind, path: e.path ?? null, id: e.id ?? null, group: ['link', 'cloud'].includes(spec?.kind),
      marks: ORDER.filter((m) => mine.some((r) => r.mark === m)),
      kinds: mine.some((r) => !r.kinds?.length) ? [] : [...new Set(mine.flatMap((r) => r.kinds ?? []))],
      files: files.get(e.label) ?? 0,
    };
  });
  const atlas = project?.atlas && admin?.server ? `${project.atlas}@${String(admin.server).replace(/^https?:\/\//, '')}` : project?.atlas ?? null;
  const roles = ['signer', ...(admin ? ['admin'] : []), ...(admin && project?.atlas === admin.user ? ['atlas'] : [])];
  const [q] = String(key).split(' ');
  const ids = [
    { label: 'Person', value: person.id }, { label: 'Gerät', value: q }, { label: 'Prüfschlüssel', value: key, small: true },
    ...(admin ? [{ label: 'Konto (Admin)', value: `${admin.user}@${String(admin.server).replace(/^https?:\/\//, '')}` }] : []),
    ...(atlas ? [{ label: 'atlas', value: atlas }] : []),
    ...(project?.signer ? [{ label: 'signer des Projekts', value: project.signer, small: true }] : []),
    ...(signerCode ? [{ label: 'Ersatz-signer (neues Admin-Gerät: kopieren, + antippen)', value: `sign-signer ${signerCode.replace(/(.{4})/g, '$1 ').trim()}` }] : []),
  ];
  return { name: person.label, date, now, roles, paper, ids, points, deviceLabel: person.label, nameSign, gestureSlots, stats, accounts: admin ? accounts : null, atlas };
}

/** sheet (sheetData) → the pages. */
export function sheetPages(sheet) {
  const extra = [];
  for (let i = FIRST; i < sheet.points.length; i += MORE) extra.push(morePoints(sheet, sheet.points.slice(i, i + MORE), i));
  const tail = [...extra, stockPage(sheet), linksPage(sheet), ...(sheet.accounts?.length ? [atlasPage(sheet)] : [])];
  const pages = [accessPage(sheet, tail.length), ...tail];
  const names = [...extra.map(() => 'Notfallblatt · Zugang'), 'Notfallblatt · Bestand', 'Notfallblatt · Zusammenhänge', 'Notfallblatt · Konten'];
  tail.forEach((p, i) => frame(p, sheet, i + 2, pages.length, names[i]));
  return pages;
}

/** The sheet as a PDF file. */
export const sheetPdf = (sheet) => makePages(sheetPages(sheet), { title: `Sign · Notfallblatt · ${sheet.name}` });
