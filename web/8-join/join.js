// join.js — hello, hello back, join, consent, within, quiet (decisions 08.11., 16.08).
//
// Purpose:   what the person sees in the share menu, and the folders of a signer behind it.
//            Each file lies in exactly one folder; the first word of its name says the state.
//              1 hello        name sign recorded → (hello …) in hello/ (drop only); the name sign and the password
//                             gestures go along as takes of their own (15.11.): every file of each take, named
//                             (hello)@(Lena)…(name sign) and (word)@(Lena)…(password gesture 1 · 2 · own), and the hello
//                             points to their chains by !( ) (never by name)
//              2 hello back   a signer with a z_ of this sharing point seals the access + her sharing
//                             points → (join …) in join/ (read-only link); the device checks the seal
//              3 join         swipe left: the device takes the access locally, drops ((join));
//                             advance() moves the hello and the marker to join/ → hello/ is empty
//              4 consent      {:x :l} {:sharing-point.1} (consent) dropped; advance() moves all, the temporary
//                             answer too (kept in case the device app password fails), to within/@(name)!(n_…)/
//              5 quiet        the whole account folder moves to quiet/, nothing is deleted
//            New device: steps 1–3 only (no consent; it joins an account that exists).
// Depends:   1-model (file, ids, hash, crypto, filename)
// Test:      tests/join.test.mjs
// Limits:    request ≈ 0.5 KB, answer ≈ 0.5 KB + 100 B per sharing point; one advance ≤ 5 moves.

import { readFile, headLine, defLine, fileText } from '../1-model/file.js';
import { newId, writeId, uOf } from '../1-model/ids.js';
import { hashBytes } from '../1-model/hash.js';
import { signed, seal, unseal, checkWitness } from '../1-model/crypto.js';
import { timeLabel, buildName, readName } from '../1-model/filename.js';
import { withState, accountFolder, nameOf } from './state.js';
import { relationLine } from '../2-storage/relations.js';
import { monthOf } from '../2-storage/layout.js';
import { ExistsError } from '../2-storage/memory.js';
import { KINDS } from '../1-model/symbols.js';

export { STATES, withState, accountFolder, stateOf } from './state.js';

const enc = new TextEncoder(), dec = new TextDecoder();

/** A chain file: head, definitions, one line, optionally on top of another file. */
async function chainFile({ by, device, deviceKey, now, defs = [], line, raw = null, below = null, words }) {
  const id = newId({ q: device, n: by.id, now });
  const at = timeLabel(now);
  const top = below ? [defLine('chain.1', { id: writeId(below.id, below.hash) })] : [];
  const text = await signed(deviceKey ?? null, fileText(headLine('chain', { '!': writeId(id), '@': by.label, "'t": at }),
    [...top, ...defs], [raw ? `${raw}'t(${at})` : `(${line.map((c) => (c.startsWith('{') ? c : `(${c})`)).join(' ')})'t(${at})`, ...(below ? ['{:chain.1}'] : [])]));
  return { text, name: buildName({ words, person: by.label, time: at, u: uOf(id), kind: 'chain', ext: 'sign' }) };
}
/** The name sign beside a rename note: same name, picture strand (rename.js). */
export const nameSignOf = (helloName) => buildName({ ...readName(helloName), kind: 'v', ext: 'mp4' });

const STRAND = (d) => d.id?.u && !['chain', 'sharing-point', '?', '_'].includes(d.kind);
const rank = (p) => { const part = readName(nameOf(p))?.part ?? ''; return part === 'name sign' ? 0 : part.endsWith(' own') ? 3 : Number(/(\d+)$/.exec(part)?.[1] ?? 9); }; // name sign · 1 · 2 · own
const kindRank = (p) => (/\.chain\.sign$/.test(p) ? 9 : /\.v\.(mp4|png|webm)$/.test(p) ? 0 : 1);

/**
 * The files of one take on the device, from its visual strand: the chain that defines it and every strand that chain
 * defines (15.11.). Limits: one listing of chain/<month>/ and one per strand folder. → [paths], the chain last
 */
export async function takeFiles(store, visualPath) {
  const n = readName(nameOf(visualPath)), month = monthOf(n.time);
  for (const c of (await store.list(`chain/${month}/`)).map((f) => f.path).filter((p) => p.endsWith('.chain.sign') && readName(nameOf(p))?.time === n.time)) {
    const strands = [...readFile(dec.decode(await store.read(c))).defs.values()].filter(STRAND);
    if (!strands.some((d) => d.id.u === n.u)) continue;
    const files = [];
    for (const d of strands) {
      const folder = `${d.echo ? 'echo' : KINDS[d.kind]?.folder ?? 'take'}/${d.kind}/${month}/`;
      files.push(...(await store.list(folder)).map((f) => f.path).filter((p) => readName(nameOf(p))?.u === d.id.u));
    }
    return [...files, c];
  }
  return [visualPath];
}

/**
 * Everything that came with one hello, in the folder it lies in now (hello/, within/…, quiet/…): the takes its hello
 * points to (name sign, password gestures), every file of each (15.11.). → paths, name sign first, each take's chain last
 */
export async function withHello(store, helloPath) {
  const folder = helloPath.slice(0, helloPath.lastIndexOf('/') + 1);
  const chains = new Set([...readFile(dec.decode(await store.read(helloPath))).defs.values()].filter((d) => d.kind === 'chain' && d.id?.u).map((d) => d.id.u));
  if (!chains.size) return [];
  const here = (await store.list(folder)).map((f) => f.path).filter((p) => p.slice(folder.length).indexOf('/') < 0);
  const us = new Set(chains);
  for (const p of here.filter((x) => x.endsWith('.chain.sign') && chains.has(readName(nameOf(x))?.u))) {
    for (const d of readFile(dec.decode(await store.read(p))).defs.values()) if (STRAND(d)) us.add(d.id.u);
  }
  return here.filter((p) => p !== helloPath && us.has(readName(nameOf(p))?.u)).sort((a, b) => rank(a) - rank(b) || kindRank(a) - kindRank(b) || a.localeCompare(b));
}
/** Signer: ↓ on a hello = not now. It and all that came with it move to quiet/<account>/, nothing is deleted. */
export async function quietHello({ store, helloPath }) {
  const { person } = readHello(dec.decode(await store.read(helloPath)));
  const all = [helloPath, ...(await withHello(store, helloPath))];
  for (const p of all) await store.move(p, `quiet/${accountFolder(person)}/${withState(nameOf(p), 'quiet')}`);
  return all.length;
}
const belowOf = async (bytes) => ({ id: readFile(dec.decode(bytes)).head.id, hash: await hashBytes(bytes) });

/**
 * Takes that go along with a note into hello/ (hello, rename): each whole, bytes unchanged, renamed to
 * (words)@(person)…(part). → { defs: [':chain.2!(…)' …], refs: [':chain.2' …] } for the note that points to them.
 */
export async function takesAlong({ store, takes = [], person, folder = 'hello/', onFile = () => {} }) {
  const defs = [], refs = [];
  let sent = 0;
  for (const t of takes) {
    for (const p of await takeFiles(t.from, t.visual)) {
      const n = readName(nameOf(p)), bytes = await t.from.read(p);
      await store.write(`${folder}${buildName({ ...n, to: [], words: t.words ?? n.words, person: person.label, part: t.part })}`, bytes)
        .catch((err) => { if (!(err instanceof ExistsError)) throw err; }); // sent once already (same take, same bytes)
      onFile(++sent); // the surface: one dot more on the line
      if (!p.endsWith('.chain.sign')) continue;
      const name = `chain.${refs.length + 2}`;
      defs.push(defLine(name, { id: writeId(readFile(dec.decode(bytes)).head.id, await hashBytes(bytes)) }));
      refs.push(`:${name}`);
    }
  }
  return { defs, refs };
}

/**
 * 1 · Device: say hello. device: { id, label, key } · pickup: ECDH public key · target: label ·
 * takes: [{ from (store of the device), visual (path of the take's visual strand), part ('name sign' · 'password gesture 1' · '… 2' · '… own'),
 * words (front of the name: ['hello'] for the name sign; none = the take's own context words) }] (15.11.).
 * Each take goes whole (every strand and its chain, bytes unchanged, only renamed); the hello comes last and points to them.
 */
export async function sayHello({ store, device, deviceKey = null, person, target, pickup, access = null, takes = [], now = Date.now(), onFile = () => {} }) { // access: public half of the access key (grant.js)
  const { defs, refs } = await takesAlong({ store, takes, person, onFile });
  defs.unshift(defLine('sharing-point.1', { hint: device.label, id: `${device.id} z_${device.key}` }));
  const f = await chainFile({ by: person, device: device.id, deviceKey, now, words: ['hello', target], defs,
    line: ['hello', target, `pickup ${pickup}`, ...(access ? [`access ${access}`] : []), '{:sharing-point.1}', ...(refs.length ? [`{${refs.join(' ')}}`] : [])] });
  const path = `hello/${f.name}`;
  await store.write(path, enc.encode(f.text)); // the hello last: whoever finds it finds its takes
  return path;
}

/** Signer: what a hello asks. → { person, device: { label, id, key }, target, pickup, access (null = none) } */
export function readHello(text) {
  const f = readFile(text);
  const d = f.defs.get('sharing-point.1');
  const m = /\(\(hello\) \(([^()]*)\) \(pickup ([0-9A-Z]+)\)/.exec(f.rows[0]?.text ?? '');
  if (!d?.id?.z || !m) throw new Error('not a hello');
  const access = /\(access ([0-9A-Z]+)\)/.exec(f.rows[0]?.text ?? '')?.[1] ?? null;
  return { person: { id: f.head.id.n, label: f.head['@'] }, device: { label: d.hint, id: d.id.q, key: d.id.z.slice(2) }, target: m[1], pickup: m[2], access };
}

/**
 * 2 · Signer: hello back. secret (e.g. Nextcloud user + app password) and the sharing points the person
 * will see are sealed together for the asking device. join/ is readable by link, so its file name holds
 * only the u_ of the hello (the device finds its answer by it), no name, no target.
 */
export async function helloBack({ store, helloPath, secret, sharingPoints = [], signer, now = Date.now() }) {
  const bytes = await store.read(helloPath);
  const ask = readHello(dec.decode(bytes));
  const payload = [secret, ...sharingPoints.map((sp, i) => defLine(`sharing-point.${i + 1}`, { hint: sp.label, path: sp.path, id: sp.id }))].join('\n');
  const f = await chainFile({ by: signer.person, device: signer.device, deviceKey: signer.deviceKey, now,
    below: await belowOf(bytes), words: ['join', readName(nameOf(helloPath)).u], line: ['hello', `sealed ${await seal(ask.pickup, payload)}`] });
  const path = `join/${f.name}`;
  await store.write(path, enc.encode(f.text));
  return path;
}

/** Device: its answer in join/, found by the u_ of its own hello. */
export const answerFor = (paths, helloPath) => paths.find((p) => p.startsWith('join/') && readName(nameOf(p))?.words.includes(readName(nameOf(helloPath)).u)) ?? null;

/**
 * 3 · Device: join. Checks that hello back is sealed by a signer of the sharing point (signers:
 * { q_…: z_ }), opens it with the private pickup key (it never leaves the device), drops ((join))
 * into hello/. → { secret, sharingPoints, marker (bytes, kept on the device for consent) }
 */
export async function join({ store, joinPath, pickupKey, signers, device, deviceKey = null, person, now = Date.now() }) {
  const text = dec.decode(await store.read(joinPath));
  let ok = false;
  for (const key of Object.values(signers ?? {})) ok ||= await checkWitness(key, text);
  if (!ok) throw new Error('hello back is not sealed by a signer of this sharing point');
  const m = /\(\(hello\) \(sealed ([0-9A-Z]+ [0-9A-Z]+ [0-9A-Z]+)\)\)/.exec(readFile(text).rows[0]?.text ?? '');
  if (!m) throw new Error('no sealed access in this file');
  const [secret, ...defs] = (await unseal(pickupKey, m[1])).split('\n');
  const sharingPoints = [...readFile([':chain', ...defs].join('\n')).defs.values()].map((d) => ({ label: d.hint, path: d.path, id: d.id?.q ?? null }));
  const f = await chainFile({ by: person, device: device.id, deviceKey, now, below: await belowOf(enc.encode(text)),
    words: ['join', ...readName(nameOf(joinPath)).words.slice(1)], line: ['join'] });
  await store.write(`hello/${f.name}`, enc.encode(f.text));
  return { secret, sharingPoints, marker: enc.encode(f.text) };
}

/**
 * 4 · Device: consent, in the settings of its new sharing point; on top of its join marker.
 * kinds: what may be processed · at: { path, id } the sharing point it is about (the own one).
 */
export async function consent({ store, marker, kinds, at, device, deviceKey = null, person, now = Date.now() }) {
  const f = await chainFile({ by: person, device: device.id, deviceKey, now, below: await belowOf(marker), words: ['join', 'consent'],
    defs: [defLine('sharing-point.1', { hint: at.label, path: at.path, id: at.id })], raw: relationLine({ what: kinds, to: 1, marks: ['consent'] }) });
  await store.write(`hello/${f.name}`, enc.encode(f.text));
  return `hello/${f.name}`;
}

/**
 * Signer: advance what the person dropped into hello/ (never readable by others). A ((join)) → her
 * hello, the marker and the answer leave hello/ and join/ for within/, the signer's overview of what
 * is done. A consent → also into within/. Returns the new paths.
 */
export async function advance({ store, person, folder = accountFolder(person) }) { // folder: a known account (a new device of hers, 15.11.)
  const inHello = (await store.list('hello/')).map((f) => f.path).filter((p) => readName(nameOf(p))?.person === person.label);
  const texts = await Promise.all(inHello.map(async (p) => [p, dec.decode(await store.read(p))]));
  const asks = texts.filter(([, t]) => /\n\(\(hello\) /.test(t)).map(([p]) => p);
  const taken = texts.some(([, t]) => /\n\(\(join\)\)'t/.test(t) || / \(consent\)'t/.test(t));
  if (!taken) return [];
  const us = texts.filter(([, t]) => /\n\(\(join\)\)'t/.test(t)).flatMap(([p]) => readName(nameOf(p))?.words.filter((w) => w.startsWith('u_')) ?? []);
  const all = [...inHello, ...(await answersIn(store, asks)), ...(await answersOfU(store, us))]; // the hello may be in within/ already (join ↑)
  const moved = [];
  for (const p of [...new Set(all)]) {
    const to = `within/${folder}/${withState(nameOf(p), 'within')}`;
    await store.move(p, to);
    moved.push(to);
  }
  return moved;
}
const answersOfU = async (store, us) => (us.length ? (await store.list('join/')).map((f) => f.path).filter((p) => us.some((u) => readName(nameOf(p))?.words.includes(u))) : []);
const answersIn = async (store, asks) => { const ps = (await store.list('join/')).map((f) => f.path); return asks.map((a) => answerFor(ps, a)).filter(Boolean); };

/**
 * Signer, an account looked at (14.11.): its devices, from the hellos in within/ → [{ device: { label, id, key }, helloPath }].
 * user: the account (n_…, any case). Limits: one listing of within/ + one read per hello.
 */
export async function devicesOf(store, user) {
  const mark = `!(${user.toLowerCase()})/`;
  const paths = (await store.list('within/')).map((f) => f.path).filter((p) => p.toLowerCase().includes(mark) && p.endsWith('.chain.sign'));
  const out = [];
  for (const helloPath of paths) {
    try { out.push({ device: readHello(dec.decode(await store.read(helloPath))).device, helloPath }); } catch { /* the join marker, a consent: no device */ }
  }
  return out;
}

/** Signer: one device goes quiet (↓, "Gerät sperren"): its hello, name sign and answer move to quiet/; its seals count until now. */
export async function quietDevice(store, helloPath) {
  const folder = helloPath.split('/')[1], u = readName(nameOf(helloPath))?.u;
  const takes = new Set(await withHello(store, helloPath)); // its name sign and password gestures (15.11.)
  const mine = (await store.list(`within/${folder}/`)).map((f) => f.path).filter((p) => { const n = readName(nameOf(p)); return takes.has(p) || n?.u === u || n?.words?.includes(u); });
  const moved = [];
  for (const p of mine) { const to = `quiet/${folder}/${withState(nameOf(p), 'quiet')}`; await store.move(p, to); moved.push(to); }
  const at = timeLabel(Date.now()); // a note in join/ (read by the device through the door, 15.11.): it logs itself out, its app password deletes itself
  if (u) await store.write(`join/${buildName({ words: ['join', u, 'quiet'], time: at, u, kind: 'chain', ext: 'sign' })}`, enc.encode(`:chain't(${at})\n((quiet))\n`));
  return moved;
}

/** 5 · Signer: quiet. Every file of the account moves to quiet/ with the state word changed. */
export async function goQuiet({ store, person }) {
  const folder = accountFolder(person);
  const files = await store.list(`within/${folder}/`);
  if (!files.length) throw new Error(`no account: ${folder}`);
  const moved = [];
  for (const { path } of files) {
    const to = `quiet/${folder}/${withState(nameOf(path), 'quiet')}`;
    await store.move(path, to);
    moved.push(to);
  }
  return moved;
}
