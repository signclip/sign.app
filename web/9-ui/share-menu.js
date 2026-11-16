// share-menu.js — the sharing menu after ↑ on the point: what each gesture on a sharing point means. No chips.
//
// Purpose:   one gesture, one meaning, on every tile (16.11., with the user). The target decides what a line means.
//              EINBINDEN     + (upper right): link, cloud id or server from the clipboard → a tile · hold + = log in ·
//                            tap this device = a folder or disk on it · a waiting share (dashed blue): tap = in
//              tap           share the last take there, now (the first time: the first circle asks what and how much)
//              hold          from now on every new take goes there (the strands on in the ring); hold again = off
//              drag → tile   a line = a connection, by the target:
//                              onto a folder of mine          COPY (from now on; held on first = everything so far too)
//                              onto a folder only I read      encrypted BACKUP (the target tile gets a dark inner edge)
//                              onto another account's tile    READ for that account (thin blue line, a share, no copy);
//                                                             its tile tapped = its server's page, to accept there
//                              onto +                         a GROUP: a read link and a drop link
//              double-tap    encrypted ↔ readable, for what goes there from now on
//              ←             show in Similar (with writing when it allows it) · again = out
//              →             look again (reachable? what is new?)
//              ↑             its link to the clipboard · on this device: the overview sheet (PDF) out
//              ↓             the tile out of the list (a group with both its links) · ↓ on a line = that connection ends
//              edge bar tap  this strand goes there → also consented (bar with a dot) → off
//              account ○     upper left: tap = what its role does · ← = what its role opens · ↓ = log out
//            Colours: blue = shows in Similar (view) · coral edge = I write there (view + write) · inner dashed = read
//            only · dark inner edge = encrypted there · coral line solid = everything over there (full copy, backup),
//            dashed = a part, new takes go in from now on · blue dotted line = read for another account.
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
      consent: kindsOf(ruleOf(rules, n, 'consent')), // strands this sharing point may also use (index, modeling), 14.11.
      shown: Boolean(show),
      write: Boolean(show?.write) && !readOnly,
      copyTo: rules.filter((r) => r.from === n && r.mark === 'always').map((r) => r.to),
      copyAll: rules.filter((r) => r.from === n && (r.mark === 'backup' || (r.mark === 'always' && r.all))).map((r) => r.to), // 16.11.: these hold everything (a full copy, a backup)
      alwaysAll: Boolean(ruleOf(rules, n, 'always')?.all),
      encrypted: sp?.spec?.kind === 'folder' || rules.some((r) => r.to === n && r.mark === 'backup'), // what lies there is encrypted: shown on the tile itself
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
  const pairs = list.filter((t) => t.state !== 'device' && list.some((o) => o !== t && o.label === t.label));
  for (const t of pairs) if (!list.some((o) => o.dropOnly && o.label === t.label) && pairs.find((o) => o.label === t.label) !== t) t.dropOnly = true; // not reachable yet: of two links of one name the later one is the drop (the door adds read, then drop)
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
      if (gesture === 'tap-kind' && has) { // a tap walks the strand on: goes there → also consented (solid, dot) → off (14.11.)
        const agreed = kindsOf(ruleOf(rules, n, 'consent'));
        if (!agreed.includes(extra.kind)) return { edit: { rule: { to: n, mark: 'consent', kinds: allOrSome([...agreed, extra.kind]) }, on: true } };
        const left = agreed.filter((k) => k !== extra.kind), rest = now.filter((k) => k !== extra.kind), mark = send?.mark ?? 'always';
        return { edits: [
          left.length ? { rule: { to: n, mark: 'consent', kinds: allOrSome(left) }, on: true } : { rule: { to: n, mark: 'consent' }, on: false }, // taken back: at once, for everything
          rest.length ? { rule: { to: n, mark, kinds: allOrSome(rest) }, on: true } : { rule: { to: n, mark }, on: false },
        ] };
      }
      const kinds = has ? now.filter((k) => k !== extra.kind) : [...now, extra.kind];
      const mark = send?.mark ?? 'always'; // a strand put on a sharing point means "always"
      if (!kinds.length) return { edit: { rule: { to: n, mark }, on: false } }; // the last strand off ends it
      return { edit: { rule: { to: n, mark, kinds: allOrSome(kinds) }, on: true } };
    }

    case 'double': { // 14.11.: encrypted ↔ readable, for what goes from this device there from now on
      const enc = ruleOf(rules, n, 'backup'), plain = ruleOf(rules, n, 'always');
      const swap = (off, on) => ({ edits: [{ rule: { to: n, mark: off }, on: false }, { rule: { to: n, mark: on, kinds: [] }, on: true }] });
      if (enc) return swap('backup', 'always'); // readable again: others with the link can read new files
      if (!extra.private) return { deny: n }; // others read it: encrypted only with a group key (not yet)
      return plain ? swap('always', 'backup') : { edit: { rule: { to: n, mark: 'backup', kinds: [] }, on: true } };
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
      return { edit: { rule: { from, to: n, mark: 'always', kinds: [], all: Boolean(extra.sofar) }, on: true }, ...(extra.sofar ? { once: { from, n } } : {}) }; // from now on; held on first (15.11.) = + everything so far, kept whole (16.11.)
    }

    case 'cut': { // ↓ on a line: that connection ends (copy or encrypted)
      const from = extra.from === 0 ? null : extra.from;
      const there = ruleOf(rules, n, 'always', from) ?? ruleOf(rules, n, 'backup', from);
      return there ? { edit: { rule: { from, to: n, mark: there.mark }, on: false } } : null;
    }

    default: return null;
  }
}
