// passkey.js — 32 bytes from a passkey, or from a card or stick: one more holder of a key (27.11., user: every way
//            back to a sealed file).
//
// Purpose:   a passkey can do more than sign in: asked with the same input it always gives the same 32 bytes
//            (WebAuthn extension prf; on a stick: hmac-secret), and nobody gets them without the person's finger, face
//            or code on that device. These bytes seal a line of a key note (2-storage/sealed-keys.js, holder
//            `passkey <26>` or `thing <26>`), whole or as one of the parts. A passkey kept by the phone's account
//            (iCloud Keychain, Google Password Manager) comes along to the next phone: a way back without paper.
//              passkeyReady   can this app ask here? true | false | null (the platform does not say)
//              newPasskey     make one for this app and take its bytes → { passkey | thing: <26>, secret }
//              askPasskey     take the bytes of one that exists (the system shows which ones there are)
//            <26> = Base32 of the SHA-256 of the credential's id: the note names the holder, nothing about the person.
//            Nothing is sent anywhere: no server checks the answer, the bytes never leave the device.
// Depends:   WebAuthn (navigator.credentials), Web Crypto, 1-model/ids (Base32). No library.
// Test:      tests/passkey.test.mjs – against a stand-in for the system's part; a real phone and a real stick are to
//            be checked by hand (TODO).
// Limits:    32 bytes per passkey and app · one prompt (finger, face, code) per ask, twice when a new passkey gives its
//            bytes only on the second ask · not in the APK: the Android WebView has no WebAuthn with prf – there it
//            needs a plugin over the system's Credential Manager (passkeyReady says false) · iPhone from iOS 18.4,
//            Android with Google Password Manager, Windows Hello from 25H2 (md/RESEARCH.md 9) · a passkey lives under
//            the web address it was made at: another address = another passkey · who has the account at Apple or
//            Google and the device's code has this holder · a lost stick = this holder is gone.

import { toBase32 } from '../1-model/ids.js';

const enc = new TextEncoder();
const subtle = () => globalThis.crypto.subtle;
/** The same input every time, so the same passkey gives the same bytes. */
const input = async () => new Uint8Array(await subtle().digest('SHA-256', enc.encode('sign passkey 1')));
/** 26 Base32 chars of SHA-256(id): how a note names this passkey. */
const nameOf = async (rawId) => toBase32(new Uint8Array(await subtle().digest('SHA-256', rawId))).slice(0, 26);
const bytesOf = (v) => (ArrayBuffer.isView(v) ? new Uint8Array(v.buffer, v.byteOffset, v.byteLength) : new Uint8Array(v));
function secretIn(credential) {
  const first = credential?.getClientExtensionResults?.()?.prf?.results?.first;
  if (!first) return null;
  const secret = bytesOf(first).slice();
  if (secret.length !== 32) throw new Error('a passkey gives 32 bytes');
  return secret;
}
const kindOf = (thing) => (thing ? 'thing' : 'passkey');

/**
 * Can this app ask a passkey for bytes here? true = the platform says so · false = no WebAuthn, or inside the APK
 * (WebView) · null = WebAuthn is there, whether prf works shows only on the first ask.
 */
export async function passkeyReady(env = globalThis) {
  if (env.Capacitor?.isNativePlatform?.()) return false;
  if (!env.navigator?.credentials?.create || !env.PublicKeyCredential) return false;
  try {
    const can = await env.PublicKeyCredential.getClientCapabilities?.();
    if (can && 'extension:prf' in can) return Boolean(can['extension:prf']);
  } catch { /* an older platform: it has no list of what it can */ }
  return null;
}

/**
 * Make a passkey for this app and take its 32 bytes. rp: { id (the app's web address, e.g. location.hostname), name } ·
 * user: { label (shown by the system where she picks a passkey), id (bytes, ≤ 64; none = random: nothing personal) } ·
 * thing: true = on a card or stick instead of in the phone's account.
 * → { passkey | thing: <26>, secret (Uint8Array 32), credential (its id, bytes) }; throws when the platform gives no bytes.
 */
export async function newPasskey({ credentials = globalThis.navigator?.credentials, rp, user = {}, thing = false } = {}) {
  if (!credentials?.create) throw new Error('no passkeys here');
  const first = await input();
  const made = await credentials.create({ publicKey: {
    challenge: globalThis.crypto.getRandomValues(new Uint8Array(32)), // nobody checks the answer: only the bytes count
    rp: { id: rp.id, name: rp.name ?? 'Sign' },
    user: { id: user.id ?? globalThis.crypto.getRandomValues(new Uint8Array(16)), name: user.label ?? 'Sign', displayName: user.label ?? 'Sign' },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { residentKey: 'required', userVerification: 'required', ...(thing ? { authenticatorAttachment: 'cross-platform' } : {}) },
    ...(thing ? { hints: ['security-key'] } : {}),
    extensions: { prf: { eval: { first } } },
  } });
  if (!made) throw new Error('no passkey was made');
  const credential = bytesOf(made.rawId).slice();
  let secret = secretIn(made);
  if (!secret) { // many give the bytes only when asked, not when made
    if (made.getClientExtensionResults?.()?.prf?.enabled === false) throw new Error('this passkey gives no bytes (no prf)');
    secret = (await askPasskey({ credentials, rpId: rp.id, thing, credential })).secret;
  }
  return { [kindOf(thing)]: await nameOf(credential), secret, credential };
}

/**
 * Take the 32 bytes of a passkey that exists. credential: its id (bytes) when this device knows it; without it the
 * system shows the passkeys of this app and she picks (the next phone knows no id, the note only a name).
 * → { passkey | thing: <26>, secret, credential }; throws when she cancels or the platform gives no bytes.
 */
export async function askPasskey({ credentials = globalThis.navigator?.credentials, rpId, thing = false, credential = null } = {}) {
  if (!credentials?.get) throw new Error('no passkeys here');
  const got = await credentials.get({ publicKey: {
    challenge: globalThis.crypto.getRandomValues(new Uint8Array(32)),
    rpId,
    allowCredentials: credential ? [{ type: 'public-key', id: credential }] : [],
    userVerification: 'required',
    ...(thing ? { hints: ['security-key'] } : {}),
    extensions: { prf: { eval: { first: await input() } } },
  } });
  const secret = secretIn(got);
  if (!secret) throw new Error('this passkey gives no bytes (no prf)');
  const id = bytesOf(got.rawId).slice();
  return { [kindOf(thing)]: await nameOf(id), secret, credential: id };
}
