// device-keys.js — this device's key pairs, made once: in the phone's Keystore (APK), else kept in the browser.
//
// Purpose:   device key (P-256 since 22.11.): seals what this device writes (y_), its public half z_ names the device.
//            pickup key (ECDH P-256): a signer seals a join for it; only this device can open it.
//            access key (P-256, 21.11.): signs the wishes to an object storage's gateway (2-storage/gateway-store.js);
//            kept apart from the device key, so access can be renewed without a new device (and no wish is a seal).
//            APK (22.11., user): made inside the Android Keystore (native-keys.js), StrongBox or TEE; only alias and
//            public half are kept here. Elsewhere non-extractable CryptoKeys in IndexedDB. A key made before stays
//            what it was: a new one would make a new device (it would have to join again).
// Depends:   browser (IndexedDB, WebCrypto); 1-model/crypto.js, 1-model/ids.js; native-keys.js
// Test:      needs a browser; the keys themselves are tested in tests/join.test.mjs and crypto tests.
// Limits:    one pair of each per device and browser profile; clearing site data = a new device (it
//            joins again with a new hello; a gateway pairs it again with a new link).

import { newDeviceKey, newPickupKey, compressP256 } from '../1-model/crypto.js';
import { toBase32 } from '../1-model/ids.js';
import { nativeKeys } from './native-keys.js';
import { personal } from './persons.js';

const DB = 'sign-keys', STORE = 'keys';

function db() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function run(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, mode);
    let result;
    try { const r = fn(tx.objectStore(STORE)); r.onsuccess = () => { result = r.result; }; } catch (err) { reject(err); return; }
    tx.oncomplete = () => resolve(result); // written for sure only when the transaction is complete
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

async function kept(name, make) {
  const have = await run('readonly', (s) => s.get(name));
  if (have) return have;
  const made = await make();
  await run('readwrite', (s) => s.put(made, name));
  const back = await run('readonly', (s) => s.get(name)); // read back: some web views lose keys silently
  if (!back) throw new Error(`keys not kept (${name})`);
  return back;
}

/** A key in the Keystore: made once (alias and public half kept here), then a handle. kind: 'sign' | 'agree'. */
async function keptNative(name, kind) {
  const have = await run('readonly', (s) => s.get(`native:${name}`));
  if (have && (await nativeKeys.has(have.alias))) return { privateKey: nativeKeys.handle(have.alias, kind), public: have.public, hardware: have.hardware };
  const alias = `sign.${name}.${toBase32(crypto.getRandomValues(new Uint8Array(5)))}`;
  const made = await nativeKeys.create(alias, kind);
  const record = { alias, public: toBase32(kind === 'sign' ? compressP256(made.public) : made.public), hardware: made.hardware }; // pickup: 65 raw bytes as before
  await run('readwrite', (s) => s.put(record, `native:${name}`));
  return { privateKey: nativeKeys.handle(alias, kind), public: record.public, hardware: record.hardware };
}
/** A key of this device: the one made before (browser), else the Keystore, else a new browser key. */
async function keyOf(name, kind, make) {
  const have = await run('readonly', (s) => s.get(name));
  if (have) return have;
  if (nativeKeys.available()) { try { return await keptNative(name, kind); } catch { /* no plugin in this APK, or agree before Android 12: the browser's */ } }
  return kept(name, make);
}

let once = null; // one promise for everyone: two callers at the start must not make two different keys (14.11.)
/** → { device: { privateKey, public, hardware? }, pickup: { privateKey, public }, access: { privateKey, public } } */
export function deviceKeys() {
  once ??= (async () => ({ device: await keyOf('device', 'sign', newDeviceKey), pickup: await keyOf('pickup', 'agree', newPickupKey), access: await keyOf('access', 'sign', newDeviceKey) }))().catch((err) => { once = null; throw err; });
  return once;
}
/** The access key alone (for gateway-store.js). */
export const accessKey = async () => (await deviceKeys()).access;

/** Remember small things about joins (the path of my hello per group). */
export const joins = {
  get: (label) => run('readonly', (s) => s.get(personal(`hello:${label}`))), // each person on the device says its own hello
  set: (label, value) => run('readwrite', (s) => s.put(value, personal(`hello:${label}`))),
  /** Another person's hello on this device (16.11.: she is taken off, her request goes back). */
  getFor: (label, id) => run('readonly', (s) => s.get(globalThis.signPersons?.keyOf?.(`hello:${label}`, id) ?? `hello:${label}`)),
  setFor: (label, id, value) => run('readwrite', (s) => s.put(value, globalThis.signPersons?.keyOf?.(`hello:${label}`, id) ?? `hello:${label}`)),
};
