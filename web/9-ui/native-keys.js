// native-keys.js — the private keys in the phone's secure hardware (22.11., user: "Schlüssel nativ im Keystore").
//
// Purpose:   in the APK the plugin SignKeys (sign.app native/android/SignKeysPlugin.java) makes and keeps the keys in the
//            Android Keystore – StrongBox when the phone has one, else the TEE. The private halves never leave it:
//              sign    P-256 ECDSA (device key, access key)    → handle { sign(bytes) → raw r‖s }   (1-model/crypto.js)
//              agree   P-256 ECDH (pickup key, Android ≥ 12)   → handle { agree(peer65) → 32 bytes }
//              aes     AES-256-GCM (the keychain's key)        → encrypt / decrypt                  (keychain.js)
//            Elsewhere (web app, an APK without the plugin, agree before Android 12) the WebCrypto keys stay:
//            non-extractable, kept by the browser (device-keys.js).
// Depends:   Capacitor (globalThis.Capacitor.Plugins.SignKeys)
// Test:      needs the APK; the handles are tested in tests/model.test.mjs (crypto: native handles)
// Limits:    a signature ≈ 5–50 ms (StrongBox slower), a keychain value ≈ 5–30 ms · iOS not yet (Secure Enclave: the same
//            curve, a plugin to come) · uninstalling the app or clearing its data deletes the keys (= a new device).

const plugin = () => (globalThis.Capacitor?.isNativePlatform?.() ? globalThis.Capacitor?.Plugins?.SignKeys ?? null : null);
const b64 = (bytes) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export const nativeKeys = {
  /** Is there a Keystore to ask? (an APK without the plugin answers no at the first create) */
  available: () => Boolean(plugin()),
  /** Make a key inside. kind: 'sign' | 'agree' | 'aes' → { public (65 raw bytes; null for aes), hardware: 'strongbox' | 'tee' | 'software' } */
  async create(alias, kind) {
    const r = await plugin().create({ alias, kind });
    return { public: r.publicKey ? unb64(r.publicKey) : null, hardware: r.hardware ?? 'unknown' };
  },
  async has(alias) { return Boolean((await plugin().has({ alias })).exists); },
  /** The handle crypto.js uses: the private half stays in the Keystore, only results come out. */
  handle(alias, kind) {
    return kind === 'agree'
      ? { native: alias, agree: async (peer) => unb64((await plugin().agree({ alias, peer: b64(peer) })).secret) }
      : { native: alias, sign: async (bytes) => unb64((await plugin().sign({ alias, data: b64(bytes) })).signature) };
  },
  async encrypt(alias, bytes) { const r = await plugin().encrypt({ alias, data: b64(bytes) }); return { iv: unb64(r.iv), data: unb64(r.data) }; },
  async decrypt(alias, iv, data) { return unb64((await plugin().decrypt({ alias, iv: b64(iv), data: b64(data) })).data); },
};
