// share-menu.js — the sharing menu after ↑ on the point: what each gesture on a sharing point means. No chips.
//
// Purpose:   ↑ on the point shows every sharing point of the list as a small tile in the upper half
//            (view/points.js). Settings sit on the tile itself and are set with the gestures that mean
//            the same everywhere (UI doc, section 3):
//            (decided 13.11.: a connection = what is new goes there; a copy also takes everything so far)
//              tap               share the last take there, now
//              hold              NEW goes there from now on (the strands that are on in the ring); held again = off
//              drag tile → tile  COPY there: everything so far once, then what is new (a line with a chevron);
//                                this device (0) onto a tile = all my takes; a tile onto 0 = bring it here once
//                                (a backup is restored); dropped again = the connection ends
//            encryption is no gesture (13.11.): always where it can be. On the way it always is (HTTPS); at rest
//            a sharing point only I read (a picked folder or disk: private) gets everything encrypted (backup format) by
//            itself; sharing points others read (group, link, the project's Nextcloud for training) stay readable until a
//            group key exists (EXTEND(S9, group key): sealed for each member in the join)
//              ↓ on a line       cut that connection (↓ = remove, everywhere)
//              ←                 bring it into Similar (show; writing too when it allows it), again = out
//              tap an edge bar   this strand goes there, or not (left visual, right audio, bottom context)
//              drag a ring arc   onto a tile = that strand goes there (A onto B = B gets A)
//              ↑                 give it out read-only (decided 13.11.): a cloud id or another account's link on the
//                                clipboard = shared to it, that account comes in as a tile with a line (a tap on it
//                                opens its page to accept); else the own WebDAV address goes on the clipboard
//              drag my Nextcloud onto another account's tile = shared to it, read-only (a share, no copy)
//              drag my Nextcloud onto + = a group: a read link and a drop link (dragged again = new links)
//              ↓                 out of the list
//            Two dashed tiles at the end bring new ones in: clipboard (link, address, server) · folder.
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
 * runs: n → how its last copy or backup went (upkeep.summary).
 * → [{ n, label, always, ask, kinds, shown, write, copyTo: [n], backupTo: [n], giveTo: [n], backupOwn, state, run, seal, readOnly, canGive }]
 */
export function tiles(entries, rules, open = new Map(), runs = new Map()) {
  const list = entries.slice(0, 40).map((entry, i) => {
    const n = i + 1;
    const sp = open.get(n);
    let state = 'closed';
    if (!entry.path && entry.key) state = 'device'; // reached another way (LocalSend later)
    else if (entry.path?.startsWith('cloud:')) state = 'cloud'; // an account whose shares to me are taken in
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
      giveTo: rules.filter((r) => r.from === n && r.mark === 'show').map((r) => r.to), // shared to it, read-only
      backupOwn: Boolean(ruleOf(rules, n, 'backup')), // this device backs up there
      state,
      run: runs.get(n)?.state ?? null, // 'ok' | 'waiting' | 'error' after a copy or backup to it
      private: sp?.spec?.kind === 'folder', // only I read it: whatever goes there goes encrypted
      seal: sp?.description ? ({ true: 'ok', false: 'wrong' }[sp.description.trusted] ?? 'none') : null, // its sharing-point.sign
      readOnly,
      dropOnly: Boolean(sp?.store?.dropOnly),
      canGive: sp?.spec?.kind === 'nextcloud' && !readOnly,
    };
  });
  return groups(list, rules);
}

/**
 * A group = a folder with two links of the same name: one to read, one to drop into ("File drop").
 * They show as ONE tile: the read tile carries `drop` (n of the drop link) and the strands that go into
 * the drop; the drop tile carries `under` and is not drawn. (decided 13.11.: groups live outside our
 * Nextcloud, two links each, no accounts)
 */
function groups(list, rules) {
  for (const drop of list.filter((t) => t.dropOnly)) {
    const read = list.find((t) => t !== drop && !t.dropOnly && t.label === drop.label);
    if (!read) continue;
    drop.under = read.n;
    Object.assign(read, { drop: drop.n, kinds: drop.kinds, always: drop.always, ask: drop.ask, group: true });
  }
  return list;
}

/** Which of the two links a gesture on a group tile means: sending goes into the drop, seeing and giving to the read link. */
export function targetFor(tile, gesture) {
  if (!tile?.drop) return tile?.n;
  return ['tap', 'hold', 'double-tap', 'tap-kind', 'drop-kind'].includes(gesture) ? tile.drop : tile.n;
}

/** Tiles that can take a take now. */
export const pickable = (all) => all.filter((tile) => tile.state === 'ok' && (!tile.readOnly || tile.drop) && !tile.under);

/**
 * A gesture on sharing point n → { action } (something to do now), { edit } or { edits } (changes of
 * the list, plus once: { from, n } = copy everything so far once), or null. gesture: 'tap' | 'hold' |
 * 'left' | 'up' | 'down' | 'cut' | 'tap-kind' | 'drop-kind' | 'drop-point'.
 * extra: { kind, selection (kinds on in the ring), from (another n), private (the target: only I read it) }.
 */
export function gestureOn(n, gesture, rules, extra = {}) {
  const send = sendRule(rules, n);
  switch (gesture) {
    case 'tap': return { action: 'share', n };
    case 'up': return { action: 'give', n };
    case 'down': return { edit: { remove: n } };

    case 'hold': { // new goes there from now on (the rule's time: nothing from before); on = the strands on in the ring
      if (extra.private) { // only I read it: encrypted, everything (backup format)
        const there = ruleOf(rules, n, 'backup');
        return { edit: there ? { rule: { to: n, mark: 'backup' }, on: false } : { rule: { to: n, mark: 'backup', kinds: [] }, on: true } };
      }
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

    case 'left': { // bring in (show) or take out again
      const shown = ruleOf(rules, n, 'show');
      return { edit: { rule: { to: n, mark: 'show', kinds: [], write: true }, on: !shown } };
    }

    case 'drop-point': { // circle `from` dropped on circle n: copy from → n, again and again
      if (extra.from == null || extra.from === n) return null;
      const from = extra.from === 0 ? null : extra.from; // 0 = this device
      if (extra.give) { // my Nextcloud onto another account: shared to it, read-only (no copy); again = ended
        const shared = from != null && ruleOf(rules, n, 'show', from);
        return shared ? { edit: { rule: { from, to: n, mark: 'show' }, on: false } } : { edit: { rule: { from, to: n, mark: 'show', kinds: [] }, on: true }, give: { from, n } };
      }
      const there = ruleOf(rules, n, 'always', from) ?? ruleOf(rules, n, 'backup', from);
      if (there) return { edit: { rule: { from, to: n, mark: there.mark }, on: false } }; // dropped again = undone
      if (extra.private) return { edit: { rule: { from, to: n, mark: 'backup', kinds: [] }, on: true } }; // only I read it: encrypted, all
      return { edit: { rule: { from, to: n, mark: 'always', kinds: [] }, on: true }, once: { from, n } }; // + everything so far
    }

    case 'cut': { // ↓ on a line: that connection ends (copy or encrypted)
      const from = extra.from === 0 ? null : extra.from;
      const there = ruleOf(rules, n, 'always', from) ?? ruleOf(rules, n, 'backup', from);
      return there ? { edit: { rule: { from, to: n, mark: there.mark }, on: false } } : null;
    }

    default: return null;
  }
}
