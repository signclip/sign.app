// routes.js — what goes where, like a backup but for chosen strands (decision 08.11., 19.57):
//   copy      chosen kinds from one sharing point to another, again and again, only what is missing
//             (e.g. text + landmarks of the own Nextcloud → a Sciebo folder of the course)
//   read      bring another sharing point in, read only (WebDAV, link, federated share): whole folder
//   give      show a folder of the own Nextcloud read-only elsewhere: a share to a cloud id (Sciebo)
//             or a link; the other side takes it in (Sciebo: acceptExpected with our cloud id).
//             giveStrands: only chosen kinds, one share per strand folder (take/x, echo/l, …), no copy
//   local     the device is no server: its strands reach others by copy (copyRoute) only
// A route is copied files, never moved: the source stays as it is (sharing into a group moves).
// Depends:   1-model/filename (kind from the name), memory.js (ExistsError)
// Test:      tests/connect.test.mjs
// Limits:    a copy run lists both sides once (Nextcloud: ~1 s per 10⁴ files) and copies what is new;
//            Nextcloud shares whole folders; strand folders per kind make "only some kinds" a share.

import { readName } from '../1-model/filename.js';
import { ExistsError } from './memory.js';
import { KINDS, FOLDERS } from '../1-model/symbols.js';

const kindOf = (path) => readName(path.slice(path.lastIndexOf('/') + 1))?.kind ?? null;
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * copy: kinds e.g. ['x', 'l'] ('chain' comes along so the strands keep their order); skip(path) for
 * removed ones (remove.quietIds). → { copied, kept, failed }
 */
export async function copyRoute(from, to, { kinds, chains = true, skip = () => false } = {}) {
  const want = new Set([...kinds, ...(chains ? ['chain'] : [])]);
  const have = new Set((await to.list()).map((f) => f.path));
  const result = { copied: [], kept: [], failed: [] };
  for (const { path } of await from.list()) {
    const kind = kindOf(path);
    if (!want.has(kind) || skip(path)) continue;
    if (have.has(path)) { result.kept.push(path); continue; }
    try {
      const bytes = await from.read(path);
      await to.write(path, bytes);
      if (!same(await to.read(path), bytes)) throw new Error('copy differs');
      result.copied.push(path);
    } catch (err) {
      if (err instanceof ExistsError) result.kept.push(path); else result.failed.push([path, String(err.message ?? err)]);
    }
  }
  return result;
}

/** give: show a folder read-only elsewhere. nc: own Nextcloud · to: a cloud id or 'link' (+ password). */
export function give(nc, { path, to, password = null, expires = null }) {
  return to === 'link' ? nc.readOnlyLink({ path, password, expires }) : nc.shareToCloud({ path, cloudId: to, access: 'read' });
}

/** Folders of chosen strand kinds inside a sharing point root, e.g. x → take/x and echo/x. */
export function strandFolders(root, kinds) {
  const base = root.replace(/\/$/, '');
  return kinds.flatMap((k) => (k === 'x' ? ['take', 'echo'] : [KINDS[k]?.folder]).filter(Boolean).map((f) => `${base}/${f}/${k}`));
}

/** give, only chosen strands: one read-only share per strand folder (no copies). → [results] */
export async function giveStrands(nc, { root, kinds, to, password = null, expires = null }) {
  const out = [];
  for (const path of strandFolders(root, kinds)) out.push(await give(nc, { path, to, password, expires }));
  return out;
}

/** give the whole sharing point: its folder, or (an account root cannot be shared) each Sign folder in it. */
export async function giveAll(nc, { root, to, password = null, expires = null }) {
  const base = root.replace(/\/$/, '');
  const paths = base ? [base] : FOLDERS;
  const out = [];
  for (const path of paths) out.push(await give(nc, { path, to, password, expires }));
  return out;
}
