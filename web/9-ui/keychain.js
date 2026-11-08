// keychain.js — where app passwords and device secrets live on this device, found by sharing point id
// (q_). Never in a file, never in a sharing point, never on screen.
//
// Purpose:   browser: values are sealed with an AES-256-GCM key that cannot be exported (it stays
//            inside the browser's crypto); key and sealed values live in IndexedDB.
//            native app: EXTEND(S4, keychain): Android Keystore / iOS Keychain through a plugin, same
//            three functions.
// Depends:   browser (IndexedDB, Web Crypto)
// Test:      needs a browser; the contract { get, set, remove } is what welcome.arrive() uses.
// Limits:    one record per id, a few hundred bytes · clearing site data in the browser deletes it
//            (then: join again with the password gestures, or the native app).

const DB = 'sign-keychain', STORE = 'secrets';
const enc = new TextEncoder(), dec = new TextDecoder();

function open() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
const tx = async (mode, fn) => { const db = await open(); return new Promise((resolve, reject) => { const t = db.transaction(STORE, mode); const req = fn(t.objectStore(STORE)); t.oncomplete = () => resolve(req?.result); t.onerror = () => reject(t.error); }); };

async function key() {
  const have = await tx('readonly', (s) => s.get('key'));
  if (have) return have;
  const k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await tx('readwrite', (s) => s.put(k, 'key'));
  return k;
}

export const keychain = {
  async set(id, value) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), enc.encode(value));
    await tx('readwrite', (s) => s.put({ iv, data }, id));
  },
  async get(id) {
    const r = await tx('readonly', (s) => s.get(id));
    return r ? dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: r.iv }, await key(), r.data)) : null;
  },
  async remove(id) { await tx('readwrite', (s) => s.delete(id)); },
};
