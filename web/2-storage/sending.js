// sending.js — what a take still owes its sharing points: sent in the background, kept until it is there (26.11.).
//
// Purpose:   until 26.11. a take was sent right after it was kept, all at once: every file of it read into memory,
//            written to every (always) sharing point one after another, each take beside the ones before it. Closed
//            in between, or one write failed, the rest waited for the daily copy (up to 24 h). Now every file a
//            sharing point shall get is a job in a list on this device:
//              kept       the list survives closing the app (the caller keeps it: load / save); a job leaves it when
//                         the file is there (or was there already), when its sharing point left the list, or when
//                         the file is no longer on this device
//              order      take by take, the oldest first; inside a take the small files first (context, wake, other
//                         echoes), then sound, then picture, the chain last – so nothing ever points into nothing
//                         at the sharing point (SCHEMA B5: originals first, chain last)
//              lanes      one file at a time per sharing point, at most LANES sharing points at once; a file is read
//                         from the device when its turn comes, not before
//              not there  a sharing point that does not answer rests (30 s, doubling to 15 min) and nothing more of
//                         it is tried meanwhile; a file the sharing point will not take (too large, refused) rests
//                         with the rest of its take for PARK_MS, the takes after it go on
//              saving     while the phone saves data only small files go (context, wake, chain of takes without
//                         picture and sound); pictures and sound wait
// Depends:   nothing (a store's write and the device's read are passed in); memory.js (ExistsError, MissingError)
// Test:      tests/sending.test.mjs
// Limits:    LANES = 2: at most two files on their way and in memory at once (≈ 2 MB per second of video each; in
//            the native app with its Base64 ≈ 3.5 × that, dav-fetch.js) · the list: ≈ 200 B per job, at most MAX_JOBS =
//            5,000 (≈ 1,000 takes to one sharing point; beyond that the oldest leave the list and the daily copy
//            of that sharing point catches them up, upkeep.js) · what it costs the line: a take is ≈ 17 Mbit/s
//            (picture 15, sound raw 1.5), so sending as fast as taking needs that much upload per sharing point; at
//            8 Mbit/s a take of 4 s is there after ≈ 9 s, with two sharing points at once after ≈ 18 s.
// EXTEND(W2, take): what is computed in the background (landmarks :~l, mask :~m) becomes jobs of the same list – a
//            job then says what to make instead of where to send (SCHEMA §2 take: also an order, ask-take.js).

import { ExistsError, MissingError } from './memory.js';

export const LANES = 2, MAX_JOBS = 5000, REST_MS = 30_000, REST_MAX_MS = 15 * 60_000, PARK_MS = 60 * 60_000;

/** Where a file stands inside its take: the higher, the later it goes. The chain always last. */
export function weightOf(path) {
  if (/\.chain\.sign$/.test(path)) return 9;
  if (/\.v\.[a-z0-9]+$/.test(path)) return 4;
  if (/\.a\.wav$/.test(path)) return 3;
  if (/\.sign$/.test(path)) return 0;
  return /\.w\.jpg$/.test(path) ? 1 : 2;
}
/** Large = a picture or a sound: waits while the phone saves data. */
export const isLarge = (path) => weightOf(path) === 3 || weightOf(path) === 4;

/** The order jobs of one sharing point go in: take by take as they came, inside a take by weight (stable). */
export function orderOf(jobs) {
  const takes = [...new Set(jobs.map((j) => j.take))];
  return [...jobs].sort((a, b) => takes.indexOf(a.take) - takes.indexOf(b.take) || weightOf(a.path) - weightOf(b.path));
}

/** Is this failure about the file (the sharing point answered and will not take it), not about reaching the sharing point? */
export function aboutFile(err) {
  const text = String(err?.message ?? err), code = Number(/: (\d{3})$/.exec(text)?.[1] ?? 0);
  return /too large/.test(text) || (code >= 400 && code < 500 && ![401, 403, 407, 408, 423, 429].includes(code));
}

/**
 * read(path) → bytes of a file of this device · target(to) → { store, accepts(path) } of a sharing point that is open
 * now, null when it is not open now, undefined when it is no longer in the list · load() → the kept list ·
 * save(list) · allowed() → false while the phone saves data · now() ms · onSent({ to, path, bytes, ms }) ·
 * onFailed({ to, path, error, file }).
 * → { add(jobs), run(), forget(to), waiting }
 */
export function sendingOf({ read, target, load = () => [], save = () => {}, allowed = () => true, now = () => Date.now(), onSent = () => {}, onFailed = () => {}, lanes = LANES }) {
  let jobs = [];
  try { const had = load(); if (Array.isArray(had)) jobs = had.filter((j) => j && j.to && j.path); } catch { /* nothing kept */ }
  const rest = new Map(); // to → { until, tries }: a sharing point that did not answer
  let running = null, again = false;
  const keepList = () => { try { save(jobs.map(({ to, path, take, parked }) => ({ to, path, take, ...(parked ? { parked } : {}) }))); } catch { /* not kept: the list lives as long as the app */ } };
  const drop = (job) => { jobs = jobs.filter((j) => j !== job); };

  /** New jobs: [{ to, path, take }] (take: what belongs together, the chain's path). The same file to the same sharing point is one job. */
  function add(list) {
    const have = new Set(jobs.map((j) => `${j.to}\n${j.path}`));
    for (const j of list) if (j?.to && j.path && !have.has(`${j.to}\n${j.path}`)) { jobs.push({ to: j.to, path: j.path, take: j.take ?? j.path }); have.add(`${j.to}\n${j.path}`); }
    if (jobs.length > MAX_JOBS) jobs = jobs.slice(jobs.length - MAX_JOBS); // the oldest leave: the sharing point's daily copy catches them up
    keepList();
  }

  /** Everything of one sharing point that can go now, one file after another. */
  async function lane(to) {
    for (;;) {
      const t = target(to);
      if (t === undefined) { jobs = jobs.filter((j) => j.to !== to); keepList(); return; } // no longer in the list
      if (!t?.store) return; // not open now: tried with the next run
      if ((rest.get(to)?.until ?? 0) > now()) return;
      const mine = orderOf(jobs.filter((j) => j.to === to));
      const waits = new Set(); // takes of which a file stays behind in this pass: nothing later of them goes (the chain least of all)
      let job = null;
      for (const j of mine) {
        if (waits.has(j.take)) continue;
        if ((j.parked ?? 0) > now() || (isLarge(j.path) && !allowed())) { waits.add(j.take); continue; }
        job = j; break;
      }
      if (!job) return;
      if (t.accepts && !t.accepts(job.path)) { drop(job); keepList(); continue; } // this sharing point does not take this kind (its description says so)
      const t0 = now();
      try {
        let bytes;
        try { bytes = await read(job.path); } catch (err) { if (err instanceof MissingError) { drop(job); keepList(); continue; } throw err; }
        try { await t.store.write(job.path, bytes); } catch (err) { if (!(err instanceof ExistsError)) throw err; } // there already = there
        drop(job); keepList();
        rest.delete(to);
        onSent({ to, path: job.path, bytes: bytes.length ?? bytes.byteLength ?? 0, ms: now() - t0 });
      } catch (err) {
        const file = aboutFile(err);
        onFailed({ to, path: job.path, error: String(err?.message ?? err), file });
        if (file) { for (const j of jobs) if (j.to === to && j.take === job.take) j.parked = now() + PARK_MS; keepList(); continue; } // this take rests, the next ones go on
        const tries = (rest.get(to)?.tries ?? 0) + 1;
        rest.set(to, { tries, until: now() + Math.min(REST_MAX_MS, REST_MS * 2 ** (tries - 1)) });
        return;
      }
    }
  }

  /** Send what can go now. One run at a time; a call that comes meanwhile gets one more after it. → Promise */
  function run() {
    if (running) { again = true; return running; }
    running = (async () => {
      do {
        again = false;
        const targets = [...new Set(jobs.map((j) => j.to))];
        let next = 0;
        const worker = async () => { while (next < targets.length) await lane(targets[next++]); };
        await Promise.all(Array.from({ length: Math.max(1, Math.min(lanes, targets.length)) }, worker));
      } while (again);
    })().finally(() => { running = null; });
    return running;
  }

  return {
    add, run,
    /** A sharing point left the list: nothing more goes there. */
    forget(to) { jobs = jobs.filter((j) => j.to !== to); rest.delete(to); keepList(); },
    /** A sharing point is reachable again (online, opened anew): its rest ends. */
    wake(to = null) { if (to == null) rest.clear(); else rest.delete(to); },
    get waiting() { return jobs.map((j) => ({ ...j })); },
    get running() { return Boolean(running); },
  };
}
