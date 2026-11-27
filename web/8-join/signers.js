// signers.js — who may answer at the door, without a new app when the admin device changes (14.11.).
//
// Purpose:   project.json names the first signer (q_ z_, the anchor, built into the app). Every other signer comes
//            with a certificate in the door's join/signer/: a small .sign naming q_ z_ of the new signer, sealed by a
//            signer already trusted. Trust = the anchor plus every certificate sealed by someone trusted (a chain).
//              second device: the admin device certifies it (its check key q_ z_ on the clipboard, + tapped)
//              paper: a signer code printed on the emergency sheet; its key is derived from the code, the admin device
//                     certifies it once; a lost admin device → the code on a new device certifies that device
// Depends:   1-model (crypto, ids, file, filename), Web Crypto (Ed25519 from a 32-byte seed via PKCS#8)
// Test:      tests/join.test.mjs
//            48 h (22.11., user: "B"): a new certificate counts 48 h after it appeared in the door (the storage's own time,
//            which no signer can set), at once when another trusted signer approves ((signer ok)), never when a trusted
//            signer objects ((signer no)). Every signer device is told meanwhile (share-door.js). A lost admin device:
//            the paper's new device counts after 48 h; a stolen paper: the real admin objects within them.
//            Junk in join/signer/ (22.11.): only files named (signer …) are read, ≤ 200; one without a trusted seal
//            counts for nothing. Pushing the real ones out takes > 200 files named so, written with the admin's account;
//            the paper as a second anchor in project.json does not depend on any file here.
//            The paper only (27.11., audit H3): the code stands on the sheet and nowhere else. The device keeps the
//            paper's public half (q_ z_) and where its certificate lies (paperKept); a sheet made later names the paper
//            without its code. A code kept on a device from before is dropped at the next start.
//            Whose time (27.11., audit M1): a certificate's 48 h count from `stored`, the time the storage itself put on
//            the file (Nextcloud nc:upload_time, an object storage's own time). `at` (WebDAV getlastmodified) can be set
//            by whoever writes (X-OC-MTime) and counts only where the storage names nothing else.
// Limits:    a file moved inside the same storage keeps its `stored`: laid somewhere else 48 h earlier and moved in, a
//            certificate counts at once (needs the paper and the admin's account 48 h ahead; open, md/TODO.md).
//            ≤ 200 certificates read, ≤ 10 links in a chain · the paper key: PBKDF2-SHA-256, 200 000 rounds (≈ 0.3 s on a
//            phone, guessing stays slow), code 26 Base32 characters (≈ 130 bit) · a certificate ≈ 0.4 KB.

import { signed, checkWitness, newPassword } from '../1-model/crypto.js';
import { newId, writeId, uOf, toBase32 } from '../1-model/ids.js';
import { headLine, defLine, fileText, readFile } from '../1-model/file.js';
import { buildName, timeLabel } from '../1-model/filename.js';

export const FOLDER = 'join/signer/', MOST = 200, WAIT_MS = 48 * 3600 * 1000;
const subtle = () => globalThis.crypto.subtle;
const enc = new TextEncoder();
const PKCS8 = [0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20]; // Ed25519 private key, 32-byte seed follows
const fromUrl64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

/** A new signer code for the paper: 26 Base32 characters. */
export const newSignerCode = newPassword;

/** The signer key of a paper code → { id (q_…), key (z_ Base32), privateKey, label }. Same code, same key, on any device. */
export async function paperSigner(code) {
  const clean = String(code).replace(/[\s-]+/g, '').toUpperCase();
  const base = await subtle().importKey('raw', enc.encode(clean), 'PBKDF2', false, ['deriveBits']);
  const seed = new Uint8Array(await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('sign signer paper'), iterations: 200000 }, base, 256));
  const privateKey = await subtle().importKey('pkcs8', new Uint8Array([...PKCS8, ...seed]), { name: 'Ed25519' }, true, ['sign']);
  const pub = fromUrl64((await subtle().exportKey('jwk', privateKey)).x);
  const id = `q_${toBase32(new Uint8Array(await subtle().digest('SHA-256', pub)).slice(0, 10))}`; // its name: from its key
  return { id, key: toBase32(pub), privateKey, label: 'Papier' };
}

/**
 * What the admin device keeps of the paper: its public half and its certificate, never the code.
 * kept: what the keychain holds ({ id, key, path, at } or, from before 27.11., { code, path }) → { id, key, path, at } | null
 */
export async function paperKept(kept) {
  if (!kept) return null;
  if (!kept.code) return { id: kept.id, key: kept.key, path: kept.path ?? null, at: kept.at ?? null };
  const paper = await paperSigner(kept.code);
  return { id: paper.id, key: paper.key, path: kept.path ?? null, at: kept.at ?? null };
}

/**
 * A certificate: by (a trusted signer: { id, label, privateKey }) names signer ({ id, key, label }) → { path, text }.
 * person: { id, label } of the one who certifies.
 */
export async function certify({ by, signer, person, now = Date.now() }) {
  const id = newId({ q: by.id, n: person.id, now });
  const time = timeLabel(now);
  const text = await signed({ privateKey: by.privateKey }, fileText(headLine('chain', { '!': writeId(id), '@': person.label, "'t": time }),
    [defLine('sharing-point.1', { hint: signer.label, id: `${signer.id} z_${signer.key}` })], [`((signer) {:sharing-point.1})'t(${time})`]));
  return { path: `${FOLDER}${buildName({ words: ['signer', signer.label], person: person.label, time, u: uOf(id), kind: 'chain', ext: 'sign' })}`, text };
}

/** Read a certificate → { u (its id), by (q_ of the sealer), signer: { id, key, label } } or null. */
export function readCertificate(text) {
  try {
    const f = readFile(text);
    const d = f.defs.get('sharing-point.1');
    if (!/\(\(signer\)/.test(f.rows[0]?.text ?? '') || !d?.id?.z) return null;
    return { u: f.head.id.u, by: f.head.id.q, signer: { id: d.id.q, key: d.id.z.slice(2), label: d.hint } };
  } catch { return null; }
}

/** Read an approval or objection → { by (q_), ok: true | false, u (the certificate's id) } or null. */
export function readVerdict(text) {
  try {
    const f = readFile(text);
    const m = /^\(\(signer (ok|no)\) \((u_[0-9A-Z]+)\)\)/.exec(f.rows[0]?.text ?? '');
    return m ? { by: f.head.id.q, ok: m[1] === 'ok', u: m[2] } : null;
  } catch { return null; }
}

/** A trusted signer (by: { id, label, privateKey }) approves (ok) or objects to (no) certificate u → { path, text } for join/signer/. */
export async function verdict({ by, u, ok, person, now = Date.now() }) {
  const id = newId({ q: by.id, n: person.id, now });
  const time = timeLabel(now);
  const text = await signed({ privateKey: by.privateKey }, fileText(headLine('chain', { '!': writeId(id), '@': person.label, "'t": time }), [], [`((signer ${ok ? 'ok' : 'no'}) (${u}))'t(${time})`]));
  return { path: `${FOLDER}${buildName({ words: ['signer', ok ? 'ok' : 'no'], person: person.label, time, u: uOf(id), kind: 'chain', ext: 'sign' })}`, text };
}

/**
 * The trusted signers: anchor ({ q_: z_ } from project.json) plus every certificate sealed by someone trusted, link by
 * link (≤ 10), that is 48 h old in the door or approved by another trusted signer, and that no trusted signer objected
 * to. items: [{ text, at (ms, the storage's own time, see certificatesIn; Infinity = the door names none: only an approval
 * counts) }] or texts alone (no door, as between devices of a swarm: counts as old) (≤ 200). → { q_: z_ }
 */
export async function trustedSigners(anchor, items = [], { now = Date.now(), wait = WAIT_MS } = {}) {
  return (await signerState(anchor, items, { now, wait })).trusted;
}

/** Certificates sealed by a trusted signer, still waiting (not 48 h old, not approved, not objected) → [{ u, signer, by,
 *  until (ms; Infinity: until another signer approves) }] */
export async function pendingSigners(anchor, items = [], { now = Date.now(), wait = WAIT_MS } = {}) {
  return (await signerState(anchor, items, { now, wait })).pending;
}

async function signerState(anchor, items, { now, wait }) {
  const all = items.slice(0, MOST).map((x) => (typeof x === 'string' ? { text: x, at: null } : x));
  const certs = all.map((x) => ({ ...x, c: readCertificate(x.text) })).filter((x) => x.c);
  const verdicts = all.map((x) => ({ ...x, v: readVerdict(x.text) })).filter((x) => x.v);
  const sealedBy = async (trusted, q, text) => Boolean(trusted[q]) && checkWitness(trusted[q], text).catch(() => false);
  let out = [], objected = new Set();
  for (let pass = 0; pass < 5; pass++) { // objections can only come from someone trusted: trust, look at objections, again without
    const trusted = { ...(anchor ?? {}) }, pending = [];
    for (let round = 0; round < 10; round++) {
      let added = false;
      for (const { text, at, c } of certs) {
        if (trusted[c.signer.id] || objected.has(c.u) || !(await sealedBy(trusted, c.by, text))) continue;
        let ok = false;
        for (const { text: vt, v } of verdicts) if (v.ok && v.u === c.u && v.by !== c.by && v.by !== c.signer.id && await sealedBy(trusted, v.by, vt)) ok = true;
        if (ok || at == null || now - at >= wait) { trusted[c.signer.id] = c.signer.key; added = true; }
        else if (!pending.some((p) => p.u === c.u)) pending.push({ u: c.u, signer: c.signer, by: c.by, until: at + wait });
      }
      if (!added) break;
    }
    const no = new Set(objected);
    for (const { text, v } of verdicts) if (!v.ok && await sealedBy(trusted, v.by, text)) for (const { c } of certs) if (c.u === v.u && v.by !== c.signer.id) no.add(c.u);
    out = { trusted, pending: pending.filter((p) => !no.has(p.u) && !trusted[p.signer.id]) };
    if (no.size === objected.size) break;
    objected = no;
  }
  return out;
}

/** The time a certificate counts from: the storage's own (stored) before the one a writer can set (at) → ms | null */
export const timeOf = (f) => (Number.isFinite(f?.stored) ? f.stored : Number.isFinite(f?.at) ? f.at : null);

/** All certificates, approvals and objections of a door, read through store → [{ path, text, at (ms) }]. A door that
 *  names no time for a file (27.11., audit M1): at = Infinity, the certificate never counts by time, only by another
 *  signer's approval – a missing time must not read as "long ago". */
export async function certificatesIn(store) {
  const dec = new TextDecoder();
  const named = (p) => p.endsWith('.chain.sign') && p.slice(p.lastIndexOf('/') + 1).startsWith('(signer '); // as certify() and verdict() name them; anything else is not even read
  const files = (await store.list(FOLDER).catch(() => [])).filter((f) => named(f.path)).slice(0, MOST);
  return Promise.all(files.map(async (f) => ({ path: f.path, text: dec.decode(await store.read(f.path)), at: timeOf(f) ?? Infinity })));
}
