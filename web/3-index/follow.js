// follow.js — the index follows what this device writes; everything else is read again one build at a time (26.11.).
//
// Purpose:   until 26.11. the whole index was built anew after every take: every sharing point listed again (over
//            the network: one request per folder), every part read, every seal checked – and several builds side by
//            side when takes came quickly, the slowest one winning. A take was only found (to play it, in Similar)
//            once that build was through.
//            Now:  write    what the own store writes is in the index when the write returns (index.js addFiles):
//                           its path, and a .sign with its text and seal. No listing, no reading.
//                  reindex  called after own writes (as before, from every flow): nothing to read, it only waits
//                           until those files are in. reindex({ all: true }): every sharing point is read again –
//                           at the start, every few minutes, when the sharing points changed, and after something
//                           was written somewhere else than on this device.
//                  build    one at a time. A call that comes while one runs asks for exactly one more afterwards
//                           (not one per call). Files written while a build runs are added to its result too, so
//                           a take made meanwhile is never missing.
//                  remove   a file removed or moved on this device: the next reindex() builds everything anew
//                           (the tables only grow; taking out is left to the build).
// Depends:   index.js (addFiles), parts.js (PARTS: the index's own files are not followed)
// Test:      tests/index.test.mjs
// Limits:    a write waits for its own adding: ≈ 0.1–0.5 ms per .sign (its seal), nothing for a video · files written
//            since the last build are remembered until the next one is in (a few KB per take: only .sign texts) ·
//            a build still costs what index.js says; it just no longer runs after every take.

import { addFiles } from './index.js';
import { PARTS } from './parts.js';

const dec = new TextDecoder();
const textOf = (bytes) => (typeof bytes === 'string' ? bytes : dec.decode(bytes));

/**
 * build(): → Promise(index), reads every sharing point (buildIndex) · name: the own store's name in the index ·
 * first: an index to begin with (empty: the start does not wait for the first build; what is written meanwhile is
 * found in it at once) · onIndex(index, { all }): the index is current again – a build came in (all: true), or
 * reindex() after own writes (all: false).
 * → { index, follow(store), reindex({ all }), building }
 */
export function followIndex({ build, name = 'own', first = null, onIndex = () => {} }) {
  let index = first, stale = true, building = null, again = false, started = 0;
  let recent = []; // [{ file: { path, text? }, at: builds started when it was written }]
  let adding = Promise.resolve(); // own files on their way into the index, one after another

  /** One file the own store just wrote: into the index now, and remembered for the build that may not have seen it. */
  function wrote(path, bytes) {
    if (path.startsWith(PARTS)) return adding; // the index's own parts and the copies of wakes: nothing to index
    if (path.endsWith('sharing-point.sign')) { stale = true; return adding; } // its keys reach the other files only through a build
    const file = { path, ...(path.endsWith('.sign') ? { text: textOf(bytes) } : {}) };
    recent.push({ file, at: started });
    adding = adding.then(() => (index ? addFiles(index, name, [file]) : null)).catch(() => {});
    return adding;
  }

  /** Read every sharing point again. One build at a time; calls that come meanwhile get one more build after it. */
  function rebuild() {
    if (building) { again = true; return building; }
    building = (async () => {
      do {
        again = false;
        stale = false;
        started += 1;
        const mine = started;
        let next;
        try { next = await build(); } catch (err) { stale = true; throw err; } // not built: still due
        await addFiles(next, name, recent.map((r) => r.file)); // written before or while it was listed: in either way (adding twice changes nothing)
        recent = recent.filter((r) => r.at >= mine); // written while this build ran: kept for the next one too
        index = next;
        onIndex(index, { all: true });
      } while (again);
      return index;
    })().finally(() => { building = null; });
    return building;
  }

  return {
    get index() { return index; },
    get building() { return Boolean(building); },
    /**
     * The own store, followed from now on: write, remove and move tell the index. The store itself is returned (its
     * three functions are wrapped where they stand, so everyone who holds the store is followed).
     */
    follow(store) {
      const write = store.write.bind(store), remove = store.remove.bind(store), move = store.move?.bind(store);
      store.write = async (path, bytes) => { await write(path, bytes); await wrote(path, bytes); };
      store.remove = async (path) => { await remove(path); if (!path.startsWith(PARTS)) stale = true; };
      if (move) store.move = async (from, to) => { await move(from, to); stale = true; };
      return store;
    },
    /**
     * Make the index current. After own writes: resolves once they are in. all: true, or after something was removed,
     * or before the first build: reads every sharing point. → Promise(index)
     */
    reindex({ all = false } = {}) {
      if (all || stale || !index) return rebuild();
      return adding.then(() => { onIndex(index, { all: false }); return index; });
    },
  };
}
