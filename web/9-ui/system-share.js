// system-share.js — out of the app without ever showing a link or password: "copy" puts it on the
// clipboard, "send" opens the system share sheet (messenger, mail, AirDrop, Nearby Share).
// Prepared for the native app: uses Capacitor's Share/Clipboard when present, else the browser.
//
// Depends:   browser or Capacitor (dynamic); 4-save/remove (pathsOfStrand) for files of a take
// Test:      filesOf in tests/connect.test.mjs; the share sheet only on a device.
// Limits:    the browser shares files only where navigator.canShare({ files }) says yes (Android
//            Chrome, iOS Safari 15+); receiving shares into Sign comes with the native app
//            EXTEND(S4, receive): Android "share to Sign" / iOS share extension → a new Take.

import { pathsOfStrand } from '../4-save/remove.js';

const cap = () => globalThis.Capacitor?.Plugins ?? {};
const TYPES = { mp4: 'video/mp4', wav: 'audio/wav', sign: 'text/plain', json: 'application/json', parquet: 'application/octet-stream' };

/** Copy text (a link, a cloud id) to the clipboard. → true if it worked. */
export async function copy(text) {
  try { if (cap().Clipboard) await cap().Clipboard.write({ string: text }); else await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

/** Send through the system share sheet: text and/or files. Falls back to copy for text. */
export async function send({ text = '', title = 'Sign', files = [] }) {
  if (cap().Share && !files.length) return cap().Share.share({ title, text });
  if (navigator.canShare?.({ files, text })) return navigator.share({ title, text, files });
  if (text) return copy(text);
  return false;
}

/** Files of some strands of a take, ready for send(). ids: strand ids (from the chain). */
export async function filesOf(store, ids) {
  const out = [];
  for (const id of ids) {
    for (const p of await pathsOfStrand(store, id)) {
      if (p.endsWith('.json')) continue;
      const name = p.slice(p.lastIndexOf('/') + 1);
      out.push(new File([await store.read(p)], name, { type: TYPES[name.split('.').pop()] ?? 'application/octet-stream' }));
    }
  }
  return out;
}
