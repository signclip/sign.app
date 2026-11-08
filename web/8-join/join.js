// join.js — hello, hello back, join, consent, within, quiet (decisions 08.11., 16.08).
//
// Purpose:   what the person sees in the share menu, and the folders of a signer behind it.
//            Each file lies in exactly one folder; the first word of its name says the state.
//              1 hello        name sign recorded → (hello …) in hello/ (drop only)
//              2 hello back   a signer with a z_ of this sharing point seals the access + her sharing
//                             points → (join …) in join/ (read-only link); the device checks the seal
//              3 join         swipe left: the device takes the access locally, drops ((join));
//                             advance() moves the hello and the marker to join/ → hello/ is empty
//              4 consent      {:x :l} {:sharing-point.1} (consent) dropped; advance() moves all, the temporary
//                             answer too (kept in case the device password fails), to within/@(name)!(n_…)/
//              5 quiet        the whole account folder moves to quiet/, nothing is deleted
//            New device: steps 1–3 only (no consent; it joins an account that exists).
// Depends:   1-model (file, ids, hash, crypto, filename)
// Test:      tests/join.test.mjs
// Limits:    request ≈ 0.5 KB, answer ≈ 0.5 KB + 100 B per sharing point; one advance ≤ 5 moves.

import { readFile, headLine, defLine, fileText } from '../1-model/file.js';
import { newId, writeId, shortU } from '../1-model/ids.js';
import { hashBytes } from '../1-model/hash.js';
import { signed, seal, unseal, checkWitness } from '../1-model/crypto.js';
import { timeLabel, buildName, readName } from '../1-model/filename.js';
import { withState, accountFolder, nameOf } from './state.js';
import { relationLine } from '../2-storage/relations.js';

export { STATES, withState, accountFolder, stateOf } from './state.js';

const enc = new TextEncoder(), dec = new TextDecoder();

/** A chain file: head, definitions, one line, optionally on top of another file. */
async function chainFile({ by, device, deviceKey, now, defs = [], line, raw = null, below = null, words }) {
  const id = newId({ q: device, n: by.id, now });
  const at = timeLabel(now);
  const top = below ? [defLine('chain.1', { id: writeId(below.id, below.hash) })] : [];
  const text = await signed(deviceKey ?? null, fileText(headLine('chain', { '!': writeId(id), '@': by.label, "'t": at }),
    [...top, ...defs], [raw ? `${raw}'t(${at})` : `(${line.map((c) => (c.startsWith('{') ? c : `(${c})`)).join(' ')})'t(${at})`, ...(below ? ['{:chain.1}'] : [])]));
  return { text, name: buildName({ words, person: by.label, time: at, u: shortU(id), kind: 'chain', ext: 'sign' }) };
}
const belowOf = async (bytes) => ({ id: readFile(dec.decode(bytes)).head.id, hash: await hashBytes(bytes) });

/** 1 · Device: say hello. device: { id, label, key } · pickup: ECDH public key · target: label. */
export async function sayHello({ store, device, deviceKey = null, person, target, pickup, now = Date.now() }) {
  const f = await chainFile({ by: person, device: device.id, deviceKey, now, words: ['hello', target],
    defs: [defLine('sharing-point.1', { hint: device.label, id: `${device.id} z_${device.key}` })],
    line: ['hello', target, `pickup ${pickup}`, '{:sharing-point.1}'] });
  const path = `hello/${f.name}`;
  await store.write(path, enc.encode(f.text));
  return path;
}

/** Signer: what a hello asks. → { person, device: { label, id, key }, target, pickup } */
export function readHello(text) {
  const f = readFile(text);
  const d = f.defs.get('sharing-point.1');
  const m = /\(\(hello\) \(([^()]*)\) \(pickup ([0-9A-Z]+)\)/.exec(f.rows[0]?.text ?? '');
  if (!d?.id?.z || !m) throw new Error('not a hello');
  return { person: { id: f.head.id.n, label: f.head['@'] }, device: { label: d.hint, id: d.id.q, key: d.id.z.slice(2) }, target: m[1], pickup: m[2] };
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
export async function advance({ store, person }) {
  const inHello = (await store.list('hello/')).map((f) => f.path).filter((p) => readName(nameOf(p))?.person === person.label);
  const texts = await Promise.all(inHello.map(async (p) => [p, dec.decode(await store.read(p))]));
  const asks = texts.filter(([, t]) => /\n\(\(hello\) /.test(t)).map(([p]) => p);
  const taken = texts.some(([, t]) => /\n\(\(join\)\)'t/.test(t) || / \(consent\)'t/.test(t));
  if (!taken) return [];
  const all = [...inHello, ...(await answersIn(store, asks))];
  const moved = [];
  for (const p of [...new Set(all)]) {
    const to = `within/${accountFolder(person)}/${withState(nameOf(p), 'within')}`;
    await store.move(p, to);
    moved.push(to);
  }
  return moved;
}
const answersIn = async (store, asks) => { const ps = (await store.list('join/')).map((f) => f.path); return asks.map((a) => answerFor(ps, a)).filter(Boolean); };

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
