// pass-flow.js — passing on someone else's take, in the app (21.11., user: free for all, or a request lands with her).
//
// Purpose:   ↑ on an element shown single that is not hers to pass on (8-join/pass-request.js mayPassOn) = a request
//            into hello/ of the sharing point where it lies, instead of the sharing menu. The author's app looks for
//            requests about her takes after every index (5 min while seen): a ↗ bubble with their number at the top
//            of Similar; spread or tap = the requested takes as a cloud (who asks = the name on the tile); in the
//            single view ↑ on the button = allowed for that person, ↓ = not.
// In / out:  passFlow(A) → { scan, ask(e) → 'asked' | null, decide(yes), entries(dress) }
// Depends:   8-join/pass-request.js, 1-model/ids.js, device-keys.js
// Limits:    one listing of hello/ per sharing point per index; requests older than the take's chain are found by id.

import { mayPassOn, askPassOn, asksFor, allowPassOn, declinePassOn } from '../8-join/pass-request.js';
import { writeId } from '../1-model/ids.js';
import { deviceKeys } from './device-keys.js';

const sealKey = async () => (await deviceKeys().catch(() => null))?.device ?? null;

export function passFlow(A) {
  const storeOf = (name) => (A.sources ?? []).find((x) => x.name === name)?.store ?? null;
  /** The chains that point to this take (answers of its author among them). */
  const around = (c) => [...(A.index?.tables?.weave?.get(c?.key) ?? [])].map((k) => A.index.tables.chains.get(k)).filter(Boolean);

  /** The one passing on: free → null (share as usual) · not → a request to the author → 'asked'. */
  async function ask(e) {
    const c = e?.chain, from = c?.from, store = storeOf(from?.store);
    if (!c || mayPassOn([c, ...around(c)], A.person.id)) return null;
    if (!store || !from?.path) { A.say('nicht erreichbar'); return 'asked'; }
    try {
      await askPassOn({ store, chainBytes: await store.read(from.path), device: A.device, person: A.person, deviceKey: await sealKey() });
      navigator.vibrate?.(20);
      A.say(`gefragt: ${e.person || '…'}`);
    } catch (err) { console.warn('ask', err); A.say('Anfrage ging nicht'); }
    return 'asked';
  }

  /** The author: requests about her takes in every sharing point she reads. */
  async function scan() {
    const before = (A.data.asks ?? []).length, asks = [];
    for (const src of A.sources ?? []) for (const a of await asksFor(src.store, A.person.id).catch(() => [])) asks.push({ ...a, store: src.store });
    A.data.asks = asks;
    if (asks.length > before) A.say(`${asks[asks.length - 1].from || 'jemand'} fragt, ob weitergeben`);
    A.paint();
  }

  /** The requested takes as entries of their own cloud: the take, the name of who asks. */
  function entries(dress) {
    const out = [];
    for (const a of A.data.asks ?? []) {
      const c = A.index?.chain(writeId(a.take));
      if (c) out.push(dress({ key: `ask:${a.path}`, kind: 'ask', chain: c, words: [], t: 0, person: a.from, sharing: [c.from?.store].filter(Boolean), thumb: null, ask: a }));
    }
    return out;
  }

  /** The author decides about the request shown single: ↑ allowed for that person, ↓ not. */
  async function decide(yes) {
    const e = A.data.picked ?? (A.data.entries ?? []).find((x) => x.key === A.st.pick), a = e?.ask;
    if (!a) return null;
    try {
      if (yes) await allowPassOn({ store: a.store, ask: a, device: A.device, person: A.person, deviceKey: await sealKey() });
      else await declinePassOn({ store: a.store, ask: a });
      navigator.vibrate?.(yes ? 20 : [12, 50, 12]);
    } catch (err) { A.say(String(err?.message ?? err).slice(0, 60)); return null; }
    A.data.asks = (A.data.asks ?? []).filter((x) => x.path !== a.path);
    A.dispatch({ type: 'pick', key: null });
    if (!A.data.asks.length) A.similar.closeKind();
    await A.reindex({ all: true }); // the answer lies where the request lay, maybe not on this device (26.11.)
    return true;
  }

  return { scan, ask, decide, entries };
}
