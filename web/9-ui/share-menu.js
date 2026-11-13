// share-menu.js — the sharing points after ↑ on the point: what each gesture on them means. No chips.
//
// Purpose:   ↑ on the point shows every sharing point of the list as a small circle in the upper half
//            (view/points.js). Settings sit on the circle itself and are set with the gestures that mean
//            the same everywhere (UI doc, section 3):
//              tap               share the last take there now (once)
//              double-tap        mode: from now on ALWAYS · the strands that are on in the ring go there
//              tap a mini arc    this strand goes there always, or not (left visual, right audio,
//                                bottom context, top landmarks)
//              drag a ring arc   onto a circle = that strand always goes there (A onto B = B gets A)
//              hold              bring it in: it shows in Similar (show; writing too when it allows it)
//              ↑                 give it out read-only (WebDAV address on the clipboard, or to the
//                                cloud id that is on the clipboard)
//              ↓                 out of the list
//              drag circle → circle   copy what is missing, again and again; double-tap the bridge =
//                                encrypted backup instead of a copy. The first circle (0) is this
//                                device: 0 → n is the same as "always" (every take goes there)
//            Two dashed circles at the end bring new ones in: clipboard (link, address, server) · folder.
//            Every change = one edit of the list (list.js editList → a new chain version).
// Depends:   nothing (rules come from 2-storage/list.js)
// Test:      tests/ui.test.mjs
// Limits:    up to 40 sharing points; kinds v a x l.

export const KINDS = ['v', 'a', 'x', 'l'];

const ruleOf = (rules, n, mark, from = null) => rules.find((r) => (r.from ?? null) === from && r.to === n && r.mark === mark) ?? null;
const sendRule = (rules, n) => ruleOf(rules, n, 'always') ?? ruleOf(rules, n, 'ask');
const kindsOf = (rule) => (rule ? (rule.kinds.length ? rule.kinds : KINDS) : []);
const ordered = (kinds) => KINDS.filter((k) => kinds.includes(k));
const allOrSome = (kinds) => (kinds.length === KINDS.length ? [] : ordered(kinds)); // [] = everything

/**
 * Tiles of the list. entries: readList · rules: rulesOf · open: openAll (or an empty Map).
 * → [{ n, label, always, ask, kinds, shown, write, copyTo: [n], backupTo: [n], backupOwn, state, readOnly, canGive }]
 */
export function tiles(entries, rules, open = new Map()) {
  return entries.slice(0, 40).map((entry, i) => {
    const n = i + 1;
    const sp = open.get(n);
    let state = 'closed';
    if (!entry.path && entry.key) state = 'device'; // reached another way (LocalSend later)
    else if (sp?.error) state = 'error';
    else if (sp?.waiting) state = 'waiting'; // a disk not plugged in
    else if (sp?.store) state = 'ok';
    const readOnly = Boolean(sp?.store?.readOnly);
    const show = ruleOf(rules, n, 'show');
    return {
      n,
      label: entry.label,
      always: Boolean(ruleOf(rules, n, 'always')),
      ask: Boolean(ruleOf(rules, n, 'ask')),
      kinds: kindsOf(sendRule(rules, n)),
      shown: Boolean(show),
      write: Boolean(show?.write) && !readOnly,
      copyTo: rules.filter((r) => r.from === n && r.mark === 'always').map((r) => r.to),
      backupTo: rules.filter((r) => r.from === n && r.mark === 'backup').map((r) => r.to),
      backupOwn: Boolean(ruleOf(rules, n, 'backup')), // this device backs up there
      state,
      readOnly,
      canGive: sp?.spec?.kind === 'nextcloud' && !readOnly,
    };
  });
}

/** Tiles that can take a take now. */
export const pickable = (all) => all.filter((tile) => tile.state === 'ok' && !tile.readOnly);

/**
 * A gesture on sharing point n → { action } (something to do now), { edit } or { edits } (changes of
 * the list), or null. gesture: 'tap' | 'double-tap' | 'hold' | 'up' | 'down' | 'tap-kind' | 'drop-kind' |
 * 'drop-point' | 'double-tap-bridge'. extra: { kind, selection (kinds on in the ring), from (another n) }.
 */
export function gestureOn(n, gesture, rules, extra = {}) {
  const send = sendRule(rules, n);
  switch (gesture) {
    case 'tap': return { action: 'share', n };
    case 'up': return { action: 'give', n };
    case 'down': return { edit: { remove: n } };

    case 'double-tap': { // always on / off; on = the strands that are on in the ring
      if (ruleOf(rules, n, 'always')) return { edit: { rule: { to: n, mark: 'always' }, on: false } };
      const kinds = extra.selection?.length ? extra.selection : kindsOf(send);
      return { edit: { rule: { to: n, mark: 'always', kinds: allOrSome(kinds.length ? kinds : KINDS) }, on: true } };
    }

    case 'tap-kind': case 'drop-kind': {
      const now = kindsOf(send);
      const has = now.includes(extra.kind);
      if (gesture === 'drop-kind' && has) return null; // goes there already
      const kinds = has ? now.filter((k) => k !== extra.kind) : [...now, extra.kind];
      const mark = send?.mark ?? 'always'; // a strand put on a sharing point means "always"
      if (!kinds.length) return { edit: { rule: { to: n, mark }, on: false } }; // the last strand off ends it
      return { edit: { rule: { to: n, mark, kinds: allOrSome(kinds) }, on: true } };
    }

    case 'hold': { // bring in (show) or take out again
      const shown = ruleOf(rules, n, 'show');
      return { edit: { rule: { to: n, mark: 'show', kinds: [], write: true }, on: !shown } };
    }

    case 'drop-point': { // circle `from` dropped on circle n: copy from → n, again and again
      if (extra.from == null || extra.from === n) return null;
      const from = extra.from === 0 ? null : extra.from; // 0 = this device
      const there = ruleOf(rules, n, 'always', from) ?? ruleOf(rules, n, 'backup', from);
      if (there) return { edit: { rule: { from, to: n, mark: there.mark }, on: false } }; // dropped again = undone
      return { edit: { rule: { from, to: n, mark: 'always', kinds: [] }, on: true } };
    }

    case 'double-tap-bridge': { // copy ↔ encrypted backup
      const from = extra.from === 0 ? null : extra.from;
      const copy = ruleOf(rules, n, 'always', from);
      const backup = ruleOf(rules, n, 'backup', from);
      if (!copy && !backup) return null;
      return { edits: [
        { rule: { from, to: n, mark: copy ? 'always' : 'backup' }, on: false },
        { rule: { from, to: n, mark: copy ? 'backup' : 'always', kinds: [] }, on: true },
      ] };
    }

    default: return null;
  }
}
