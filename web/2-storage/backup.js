// backup.js — encrypted backup of a sharing point onto any store: external drive, another device,
// WebDAV (decision 08.11.: weekly, plus the provider's snapshots).
//
// Purpose:   files never change, so a backup is "copy what is missing". Each file is sealed on the
//            device before it leaves: AES-256-GCM over its path and bytes. Names and context words
//            stay hidden too: the backup name is an HMAC of the path, so the next run can see what is
//            already there without opening anything:
//              backup/<52 chars>.sealed      = 12 bytes iv · sealed(2 bytes path length · path · bytes)
//            Every copy is read back and opened once before it counts.
// Depends:   Web Crypto, 1-model/ids (Base32), memory.js (ExistsError)
// Test:      tests/backup.test.mjs
// Limits:    one file in memory at a time (a 4 s Take ≈ 10 MB) · ~28 bytes more per file ·
//            the key is 32 bytes (52 Base32 chars): without it the backup cannot be opened, so it
//            needs a second copy away from the device (e.g. on paper, never in the backup itself).
// Other way: rclone with its own crypt over WebDAV works too; it uses its own format.

import { toBase32, fromBase32 } from '../1-model/ids.js';
import { ExistsError } from './memory.js';

export const FOLDER = 'backup/';
const subtle = () => globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

/** A new backup key, as Base32 text (52 chars). Never shown on screen: copy or send only. */
export function newBackupKey() {
  return toBase32(globalThis.crypto.getRandomValues(new Uint8Array(32)));
}

async function keys(keyB32) {
  if (!/^[0-9A-Z]{52}$/.test(keyB32 ?? '')) throw new Error('backup key must be 52 Base32 chars (32 bytes)');
  let v = fromBase32(keyB32);
  const raw = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) { raw[i] = Number(v & 255n); v >>= 8n; }
  const [seal, name] = await Promise.all([
    subtle().importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']),
    subtle().importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
  ]);
  return { seal, name };
}

/** Name in the backup for a path: HMAC, so equal paths meet again and nothing is readable. */
async function backupName(k, path) {
  const mac = new Uint8Array(await subtle().sign('HMAC', k.name, enc.encode(path)));
  return `${FOLDER}${toBase32(mac).slice(0, 52)}.sealed`;
}

async function sealFile(k, path, bytes) {
  const p = enc.encode(path);
  const plain = new Uint8Array(2 + p.length + bytes.length);
  plain[0] = p.length >> 8; plain[1] = p.length & 255;
  plain.set(p, 2); plain.set(bytes, 2 + p.length);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, k.seal, plain));
  const out = new Uint8Array(12 + data.length);
  out.set(iv); out.set(data, 12);
  return out;
}

async function openFile(k, sealed) {
  const plain = new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: sealed.slice(0, 12) }, k.seal, sealed.slice(12)));
  const n = (plain[0] << 8) | plain[1];
  return { path: dec.decode(plain.slice(2, 2 + n)), bytes: plain.slice(2 + n) };
}

const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * Copy what is missing from a sharing point into the backup store. filter(path) chooses files.
 * Returns { copied, kept, failed }: kept = already in the backup.
 */
export async function backup(from, to, keyB32, { filter = () => true } = {}) {
  const k = await keys(keyB32);
  const have = new Set((await to.list(FOLDER)).map((f) => f.path));
  const result = { copied: [], kept: [], failed: [] };
  for (const { path } of await from.list()) {
    if (path.startsWith(FOLDER) || !filter(path)) continue;
    const name = await backupName(k, path);
    if (have.has(name)) { result.kept.push(path); continue; }
    try {
      const bytes = await from.read(path);
      await to.write(name, await sealFile(k, path, bytes));
      const back = await openFile(k, await to.read(name)); // read back once before it counts
      if (back.path !== path || !same(back.bytes, bytes)) throw new Error('copy differs');
      result.copied.push(path);
    } catch (err) {
      if (err instanceof ExistsError) result.kept.push(path);
      else result.failed.push([path, String(err.message ?? err)]);
    }
  }
  return result;
}

/**
 * Bring a backup back into any sharing point. Existing files stay (same path = same file).
 * skip(path): leave out what was removed after the backup (remove.quietIds), so it never comes back.
 */
export async function restore(from, to, keyB32, { skip = () => false } = {}) {
  const k = await keys(keyB32);
  const have = new Set((await to.list()).map((f) => f.path));
  const restored = [];
  for (const { path: name } of await from.list(FOLDER)) {
    if (!name.endsWith('.sealed')) continue; // backup/keys/ holds the sealed backup key (backup-key.js)
    const { path, bytes } = await openFile(k, await from.read(name));
    if (have.has(path) || skip(path)) continue;
    await to.write(path, bytes);
    restored.push(path);
  }
  return restored;
}
