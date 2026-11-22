// grant.js — a grant: a signer allows one device's access key into a sharing point in the object storage (21.11., user).
//
// Purpose:   the signer's app writes it with the hello back (welcome.js), sealed with the signer's device key (y_):
//              :chain!(q_<signer device> u_… y_…)@(<signer>)'t(…)
//              :sharing-point.1^(<person>)!(q_<device> z_<device key>)        which device holds the access key
//              ((grant) (access <access key, public half>) (rw) (<prefix>))'t(…)
//            It travels inside the sealed answer (only the asking device opens it) and is kept like an app password
//            (keychain, by the id of the sharing point). The device shows it with its wishes; the gateway checks the
//            seal against the project's signers and that the wish is signed by the access key the grant names.
//            A grant is no secret: without the private half of the access key (never leaves the device) it opens nothing.
// Depends:   1-model (file, ids, crypto, filename)
// Test:      tests/gateway.test.mjs
// Limits:    ≈ 350 B · rights r or rw · one prefix per grant · no end date: the gateway's list of revoked keys and
//            devices takes it back (setup.mjs revoke) · the signers are the project's (project.json, SIGNERS).

import { readFile, headLine, defLine, fileText } from '../1-model/file.js';
import { newId, writeId } from '../1-model/ids.js';
import { signed, checkWitness } from '../1-model/crypto.js';
import { timeLabel } from '../1-model/filename.js';

const LINE = /^\(\(grant\) \(access ([0-9A-Z]+)\) \((rw|r)\) \(([^()]+)\)\)/;

/** Signer: a grant for one device. signer: { person: { id, label }, device: q_, deviceKey } · device: { label, id, key } of the hello. */
export async function makeGrant({ signer, device, access, prefix, rights = 'rw', now = Date.now() }) {
  if (!/^[0-9A-Z]+$/.test(access ?? '')) throw new Error('no access key in the hello');
  if (!String(prefix).endsWith('/') || String(prefix).includes('..') || /[()]/.test(prefix)) throw new Error(`prefix not allowed: ${prefix}`);
  const at = timeLabel(now);
  const head = headLine('chain', { '!': writeId(newId({ q: signer.device, n: signer.person.id, now })), '@': signer.person.label, "'t": at });
  const defs = [defLine('sharing-point.1', { hint: device.label, id: `${device.id} z_${device.key}` })];
  return signed(signer.deviceKey, fileText(head, defs, [`((grant) (access ${access}) (${rights}) (${prefix}))'t(${at})`]));
}

/** What a grant says (not checked). → { access, rights, prefix, device: { label, id, key } } or null */
export function readGrant(text) {
  try {
    const f = readFile(String(text));
    const m = LINE.exec(f.rows[0]?.text ?? ''), d = f.defs.get('sharing-point.1');
    return m ? { access: m[1], rights: m[2], prefix: m[3], device: { label: d?.hint ?? '', id: d?.id?.q ?? null, key: d?.id?.z?.slice(2) ?? null } } : null;
  } catch { return null; }
}

/** A grant sealed by one of these signers (public keys, Base32)? → what it says, or null. */
export async function checkGrant(text, signers = []) {
  const g = readGrant(text);
  if (!g) return null;
  for (const key of signers) if (await checkWitness(key, String(text)).catch(() => false)) return g;
  return null;
}

/** May this grant do this (r | w) with this object name? */
export const grantAllows = (g, name, right) => Boolean(g) && String(name).startsWith(g.prefix) && (right === 'r' || g.rights === 'rw');
