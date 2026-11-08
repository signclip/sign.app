// state.js — where a person stands in hello → join → within → quiet, read from file names only.
//
// Purpose:   the first word of a file name is its state; the folder is the same word. The growing
//            icon in the share menu (9-ui) draws from stateOf().
// Depends:   1-model/filename
// Test:      tests/join.test.mjs
// Limits:    hello/ matches by the name label (two persons with one label look alike there);
//            within/ and quiet/ match exactly by n_.

import { buildName, readName } from '../1-model/filename.js';

export const STATES = ['hello', 'join', 'within', 'quiet'];
export const nameOf = (path) => path.slice(path.lastIndexOf('/') + 1);

/** Same name, other state: the first word becomes the state (added if there was none). */
export function withState(name, state) {
  if (!STATES.includes(state)) throw new Error(`unknown state: ${state}`);
  const p = readName(name);
  return buildName({ ...p, words: [state, ...(STATES.includes(p.words[0]) ? p.words.slice(1) : p.words)] });
}

/** Folder of an account inside within/ or quiet/. */
export const accountFolder = (person) => `@(${person.label})!(${person.id})`;

/**
 * Where is this person now? From paths only → 'none' | 'hello' | 'join' | 'within' | 'quiet', for the
 * growing icon. within/ and quiet/ match by n_; hello/ by the name; join/ by the u_ of her hello
 * (helloPath), because names in join/ stay hidden.
 */
export function stateOf(paths, person, { helloPath = null } = {}) {
  const u = helloPath ? readName(nameOf(helloPath))?.u : null;
  const inAccount = (folder) => paths.some((p) => p.startsWith(`${folder}/${accountFolder(person)}/`));
  const named = (folder) => paths.some((p) => {
    const n = p.startsWith(`${folder}/`) && readName(nameOf(p));
    return n && (n.person === person.label || n.words.join(' ').includes(person.label));
  });
  const answered = u && paths.some((p) => p.startsWith('join/') && readName(nameOf(p))?.words.includes(u));
  return inAccount('quiet') ? 'quiet' : inAccount('within') ? 'within' : answered ? 'join' : named('hello') ? 'hello' : 'none';
}
