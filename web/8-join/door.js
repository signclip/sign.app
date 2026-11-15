// door.js — the admin's door as four piles (15.11.): hello · join · within · quiet, and the step a swipe makes.
//            hello ↑ = welcome (share-group) · ↓ = quiet · join ↑ = within at once (no waiting for the device's ((join)))
//            · join ↓ = back: answer and hello to quiet/, an again-note (join u_ again) asks the device to say hello anew
//            · within ↓ = quiet · quiet ↑ = within again. Nothing is deleted, every move changes the state word.
//
// Depends:   1-model/filename, state.js, join.js, known.js
// Test:      tests/join.test.mjs
// Limits:    one list of the door per look; piles by name label (two persons with one label: one folder).

import { buildName, readName, timeLabel } from '../1-model/filename.js';
import { withState, nameOf, accountFolder } from './state.js';
import { answerFor, readHello, withHello } from './join.js';
import { knownFolder } from './known.js';

const dec = new TextDecoder(), enc = new TextEncoder();
const folderName = (folder) => /^@\(([^)]*)\)/.exec(folder)?.[1] ?? folder;

/** → { hello: [{ helloPath, name }], join: [{ helloPath, name, answer }], within: [{ folder, name }], quiet: [...] } */
export async function doorView(store) {
  const paths = (await store.list()).map((f) => f.path);
  const hellos = paths.filter((p) => p.startsWith('hello/') && p.endsWith('.chain.sign') && /^\(hello /.test(nameOf(p)));
  const item = (p) => ({ helloPath: p, name: readName(nameOf(p))?.person ?? '?' });
  const folders = (base) => [...new Set(paths.filter((p) => p.startsWith(`${base}/`) && p.split('/').length > 2).map((p) => p.split('/')[1]))]
    .map((folder) => ({ folder, name: folderName(folder) }));
  return {
    hello: hellos.filter((p) => !answerFor(paths, p)).map(item),
    join: hellos.filter((p) => answerFor(paths, p)).map((p) => ({ ...item(p), answer: answerFor(paths, p) })),
    within: folders('within'), quiet: folders('quiet'),
  };
}

const moveAll = async (store, paths, base, folder, state) => { for (const p of paths) await store.move(p, `${base}/${folder}/${withState(nameOf(p), state)}`); return paths.length; };
const groupOf = async (store, helloPath) => {
  const { person } = readHello(dec.decode(await store.read(helloPath)));
  const answer = answerFor((await store.list('join/')).map((f) => f.path), helloPath);
  return { person, files: [helloPath, ...(await withHello(store, helloPath)), answer].filter(Boolean) };
};

/** join ↑: hello, its takes and the answer into the account folder (a known one for a new device). */
export async function toWithin(store, helloPath) {
  const { person, files } = await groupOf(store, helloPath);
  return moveAll(store, files, 'within', (await knownFolder(store, person.label)) ?? accountFolder(person), 'within');
}

/** join ↓: answer and hello to quiet/; the again-note in join/ tells the device to say hello anew (new takes). */
export async function backToHello(store, helloPath, { now = Date.now() } = {}) {
  const { person, files } = await groupOf(store, helloPath);
  const u = readName(nameOf(helloPath)).u;
  await moveAll(store, files, 'quiet', accountFolder(person), 'quiet');
  const note = buildName({ words: ['join', u, 'again'], time: timeLabel(now), u, kind: 'chain', ext: 'sign' });
  await store.write(`join/${note}`, enc.encode(`:chain'(${timeLabel(now)})\n((again))\n`));
  return `join/${note}`;
}
/** Is this answer an again-note? (device: say hello anew) */
export const isAgain = (answerPath) => Boolean(readName(nameOf(answerPath ?? ''))?.words.includes('again'));

/** within ↓ quiet · quiet ↑ within: the whole account folder. */
export async function moveAccount(store, folder, from, to) {
  const files = (await store.list(`${from}/`)).map((f) => f.path).filter((p) => p.startsWith(`${from}/${folder}/`));
  return moveAll(store, files, to, folder, to);
}
