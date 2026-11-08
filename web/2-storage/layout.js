// layout.js — where files lie inside a sharing point. The same at every sharing point.
//
// Purpose:   as few folders as possible (decision 07.11.):
//              sharing-point.sign        the sharing point describes itself (who, what may go here)
//              take/2026.11/             originals: .v.mp4 .a.wav .x.sign/.json
//              echo/2026.11/             computed: .l.parquet .m.mp4, Whisper text, cuts
//              chain/2026.11/            chain files: Takes, steps, shares (name starts with ^),
//                                        a person's list of sharing points
//              index/                    index parts, computed, rebuildable
//            Secrets never lie in a sharing point: they live in the device keychain.
// Depends:   symbols.js, filename.js
// Test:      tests/storage.test.mjs
// Limits:    one folder per month: 50 persons × 150 Takes × 4 files ≈ 30,000 entries in
//            take/ per month = one listing request (~1–3 s on Nextcloud).

import { KINDS } from '../1-model/symbols.js';
import { buildName, readName } from '../1-model/filename.js';

export const SELF = 'sharing-point.sign';

/** "2026.11.07 15.41.00 0_4200" → "2026.11"; month folders keep listings short. */
export function monthOf(time) {
  return /^\d{4}\.\d{2}/.exec(time ?? '')?.[0] ?? 'undated';
}

/** Folder for a kind; Whisper text and other computed text go to echo/. */
export function folderOf(kind, { echo = false } = {}) {
  const f = echo && KINDS[kind]?.folder === 'take' ? 'echo' : KINDS[kind]?.folder;
  if (f === undefined) throw new Error(`unknown kind: ${kind}`);
  return f;
}

/** Full path of a file inside a sharing point. parts: see filename.buildName. */
export function pathOf(parts, { echo = false } = {}) {
  const ext = parts.ext ?? KINDS[parts.kind].ext;
  const name = buildName({ ...parts, ext });
  const folder = folderOf(parts.kind, { echo: echo || Boolean(parts.echo) });
  return folder ? `${folder}/${monthOf(parts.time)}/${name}` : name;
}

/** The .json next to a .sign: same name, other ending. */
export function jsonPath(signPath) {
  return signPath.replace(/\.sign$/, '.json');
}

/** Kind and parts of a path, read from the name only. */
export function partsOf(path) {
  return readName(path.slice(path.lastIndexOf('/') + 1));
}
