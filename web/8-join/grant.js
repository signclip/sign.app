// grant.js — a grant: a signer allows an access key into a part of the object storage (21.11., user; groups 22.11.).
//
// Purpose:   a grant is a small chain, sealed with the device key of whoever gives it (y_):
//              :chain!(q_<giver> u_<grant id> y_…)@(<giver>)'t(…)
//              :sharing-point.1^(<holder>)!(q_<device> z_<device key>)      whose access key (missing for a door)
//              ((grant) (access <access key> | *) (r|a|ra|rw) (<prefix>))'t(…)
//            Rights: r = read and list · a = add new files (never over, never away) · w = also remove, move, and give
//            grants beneath its prefix. `*` = any access key: a group's door (only r or a, never w).
//            Chains, root first: the root grant is sealed by a signer the gateway trusts (SIGNERS in gateway.env); every
//            next one by the device key named in the one before, which holds w, inside its prefix, with no more rights.
//              admin → Lena (rw n_lena/Sign/)                          her own sharing point (hello back of the admin)
//              admin → Lena → * (ra n_lena/Sign/Kurs 3/)               her group's door, in the invitation
//              admin → Lena → Anna (ra n_lena/Sign/Kurs 3/)            Anna's own grant, in Lena's hello back
//            A grant is no secret: without the private half of the access key it names it opens nothing (a door grant
//            opens what a group link opened: anyone with the invitation).
// Depends:   1-model (file, ids, crypto, filename)
// Test:      tests/gateway.test.mjs
// Limits:    ≈ 350 B each, chains ≤ 3 · one prefix per grant · no end date: taken back by a revocation in the bucket
//            (gateway: op revoke, setup.mjs revoke) by the grant's id, its access key, device or holder.

import { readFile, headLine, defLine, fileText } from '../1-model/file.js';
import { newId, writeId } from '../1-model/ids.js';
import { signed, checkWitness } from '../1-model/crypto.js';
import { timeLabel } from '../1-model/filename.js';

const LINE = /^\(\(grant\) \(access ([0-9A-Z]+|\*)\) \((r|a|ra|rw)\) \(([^()]*)\)\)/;
export const MOST = 3;

/** Signer (or holder of w): a grant. giver: { person, device, deviceKey } · holder: { label, id, key } of the hello (null for a door). */
export async function makeGrant({ signer, device = null, access, prefix, rights = 'rw', now = Date.now() }) {
  if (!/^([0-9A-Z]+|\*)$/.test(access ?? '')) throw new Error('no access key in the hello');
  if (access === '*' && rights.includes('w')) throw new Error('a door never gives w');
  if (!/^(r|a|ra|rw)$/.test(rights)) throw new Error(`rights not known: ${rights}`);
  if ((prefix && !String(prefix).endsWith('/')) || String(prefix).includes('..') || /[()]/.test(prefix)) throw new Error(`prefix not allowed: ${prefix}`);
  const at = timeLabel(now);
  const head = headLine('chain', { '!': writeId(newId({ q: signer.device, n: signer.person.id, now })), '@': signer.person.label, "'t": at });
  const defs = device ? [defLine('sharing-point.1', { hint: device.label, id: `${device.id} z_${device.key}` })] : [];
  return signed(signer.deviceKey, fileText(head, defs, [`((grant) (access ${access}) (${rights}) (${prefix}))'t(${at})`]));
}

/** What a grant says (not checked). → { id, access, rights, prefix, giver, device: { label, id, key } | null } or null */
export function readGrant(text) {
  try {
    const f = readFile(String(text));
    const m = LINE.exec(f.rows[0]?.text ?? ''), d = f.defs.get('sharing-point.1');
    if (!m) return null;
    return { id: f.head.id.u, access: m[1], rights: m[2], prefix: m[3], giver: f.head['@'] ?? '', device: d ? { label: d.hint ?? '', id: d.id?.q ?? null, key: d.id?.z?.slice(2) ?? null } : null };
  } catch { return null; }
}

/** Grants as kept and sent: one text, an array of texts (root first), or that array as JSON. → [text] */
export function chainOf(grants) {
  if (Array.isArray(grants)) return grants.map(String);
  const s = String(grants ?? '');
  if (s.startsWith('[')) { try { return JSON.parse(s).map(String); } catch { return []; } }
  return s ? [s] : [];
}

const within = (inner, outer) => [...inner].every((r) => (r === 'a' ? /[aw]/.test(outer) : outer.includes(r)));

/**
 * A chain of grants checked: the root sealed by one of the signers (public keys, Base32), every next one sealed by the
 * holder of the one before (w, inside its prefix, no more rights). → { grant: the last, all: [every grant] } or null
 */
export async function checkChain(grants, signers = []) {
  const texts = chainOf(grants);
  if (!texts.length || texts.length > MOST) return null;
  const all = [];
  for (const [i, text] of texts.entries()) {
    const g = readGrant(text), up = all[i - 1];
    if (!g) return null;
    const keys = up ? [up.device?.key].filter(Boolean) : signers;
    if (up && !(up.rights.includes('w') && up.access !== '*' && g.prefix.startsWith(up.prefix) && within(g.rights, up.rights))) return null;
    let sealed = false;
    for (const key of keys) sealed ||= await checkWitness(key, text).catch(() => false);
    if (!sealed) return null;
    all.push(g);
  }
  return { grant: all.at(-1), all };
}

/** One grant sealed by one of these signers? (a chain of one) → what it says, or null */
export const checkGrant = async (text, signers = []) => (await checkChain([text], signers))?.grant ?? null;

/** May this grant do this (r | a | w) with this object name? */
export const grantAllows = (g, name, right) => Boolean(g) && String(name).startsWith(g.prefix) && (right === 'a' ? /[aw]/.test(g.rights) : g.rights.includes(right));
