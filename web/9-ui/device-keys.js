// device-keys.js — this device's two key pairs, made once and kept in the browser (or the app's WebView).
//
// Purpose:   device key (Ed25519): seals what this device writes (y_), its public half z_ names the device.
//            pickup key (ECDH P-256): a signer seals a join for it; only this device can open it.
//            Both private halves are non-extractable CryptoKeys: they never leave the device, not even
//            to this code; IndexedDB keeps them as they are (structured clone), no password needed.
// Depends:   browser (IndexedDB, WebCrypto); 1-model/crypto.js
// Test:      needs a browser; the keys themselves are tested in tests/join.test.mjs and crypto tests.
// Limits:    one pair of each per device and browser profile; clearing site data = a new device (it
//            joins again with a new hello).

import { newDeviceKey, newPickupKey } from '../1-model/crypto.js';

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
    const r = fn(d.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function kept(name, make) {
  const have = await run('readonly', (s) => s.get(name));
  if (have) return have;
  const made = await make();
  await run('readwrite', (s) => s.put(made, name));
  return made;
}

/** → { device: { privateKey, publicKey, public }, pickup: { privateKey, public } } */
export async function deviceKeys() {
  return { device: await kept('device', newDeviceKey), pickup: await kept('pickup', newPickupKey) };
}

/** Remember small things about joins (the path of my hello per group). */
export const joins = {
  get: (label) => run('readonly', (s) => s.get(`hello:${label}`)),
  set: (label, value) => run('readwrite', (s) => s.put(value, `hello:${label}`)),
};
