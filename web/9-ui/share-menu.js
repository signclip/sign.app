// share-menu.js — the share menu as in the initial version: tiles, chips on hold, ← to bring one in.
//
// Purpose:   slides in from the middle-right edge, or picks a target after ↑ on the point (pick:
//            only tiles that can take the take, tap = share there). Three rows, chips only:
//              teilen          the system share (send / copy) of the last take
//              sharing points  one tile per sharing point of the list; marks under the name
//              einfügen        ← or tap: take the clipboard (a link, an address, a cloud id)
//            tile: tap = share the last take there now · hold = its chips · ↓ = out of the list
//            chips of a tile: immer · fragen · zeigen · schreiben · backup, then the kinds it gets
//            (the kinds belong to its "immer" rule, else to its "fragen" rule); on a Nextcloud folder
//            also geben: ganz or some kinds, then WebDAV-Adresse kopieren · an Adresse. Every mark chip = one
//            change of the list (list.js editList → a new chain version), nothing else is stored.
// Depends:   2-storage/list.js (rules), sharing-points.js (offers)
// Test:      tests/ui.test.mjs (model and chips); drawing in share-mount.js needs a browser.
// Limits:    up to 40 tiles; kinds v a x l.

export const MENU_MARKS = ['always', 'ask', 'show', 'write', 'backup'];
export const MENU_KINDS = ['v', 'a', 'x', 'l'];

const ruleOf = (rules, n, mark) => rules.find((r) => r.from == null && r.to === n && r.mark === mark) ?? null;
const sendRule = (rules, n) => ruleOf(rules, n, 'always') ?? ruleOf(rules, n, 'ask');

/**
 * Tiles of the list. entries: readList · rules: rulesOf · open: openAll (or an empty Map).
 * → [{ n, label, marks, kinds, state: 'ok' | 'error' | 'waiting' | 'device' | 'closed', readOnly, canGive }]
 */
export function tiles(entries, rules, open = new Map()) {
  return entries.slice(0, 40).map((entry, i) => {
    const n = i + 1, sp = open.get(n);
    const marks = MENU_MARKS.filter((m) => (m === 'write' ? ruleOf(rules, n, 'show')?.write : ruleOf(rules, n, m)));
    const send = sendRule(rules, n);
    const kinds = send ? (send.kinds.length ? send.kinds : MENU_KINDS) : [];
    const state = !entry.path && entry.key ? 'device' : sp?.error ? 'error' : sp?.waiting ? 'waiting' : sp?.store ? 'ok' : 'closed';
    const readOnly = Boolean(sp?.store?.readOnly);
    return { n, label: entry.label, marks, kinds, state, readOnly, canGive: sp?.spec?.kind === 'nextcloud' && !readOnly };
  });
}

/** Chips of one tile (hold): [{ key: 'mark' | 'kind', value, label, on }]. */
export function tileChips(tile, t) {
  return [
    ...MENU_MARKS.filter((m) => !(m === 'write' && tile.readOnly)).map((m) => ({ key: 'mark', value: m, label: t(`mark.${m}`), on: tile.marks.includes(m) })),
    ...MENU_KINDS.map((k) => ({ key: 'kind', value: k, label: t(`kind.${k}`), on: tile.kinds.includes(k) })),
  ];
}

/** A chip tapped on tile n → the edit for editList, or null. */
export function chipEdit(n, chip, rules) {
  const has = (mark) => Boolean(ruleOf(rules, n, mark));
  if (chip.key === 'mark' && chip.value === 'write') {
    const show = ruleOf(rules, n, 'show');
    return { rule: { to: n, mark: 'show', kinds: show?.kinds ?? [], write: !show?.write }, on: true }; // writing brings it in too
  }
  if (chip.key === 'mark') {
    const kinds = chip.value === 'always' || chip.value === 'ask' ? sendRule(rules, n)?.kinds ?? [] : [];
    return { rule: { to: n, mark: chip.value, kinds }, on: !has(chip.value) };
  }
  if (chip.key === 'kind') {
    const send = sendRule(rules, n);
    const now = send ? (send.kinds.length ? send.kinds : MENU_KINDS) : [];
    const kinds = now.includes(chip.value) ? now.filter((k) => k !== chip.value) : [...now, chip.value];
    const mark = send?.mark ?? 'ask';
    return kinds.length ? { rule: { to: n, mark, kinds: MENU_KINDS.filter((k) => kinds.includes(k)) }, on: true } : { rule: { to: n, mark }, on: false };
  }
  return null;
}

/** What a tile says under its name: marks as short words, "nicht zugänglich" when it cannot open. */
export function tileNote(tile, t) {
  if (tile.state === 'error') return t('notReachable');
  if (tile.state === 'waiting') return t('menu.waiting');
  return [...tile.marks.map((m) => t(`mark.${m}`)), ...(tile.kinds.length && tile.kinds.length < MENU_KINDS.length ? [tile.kinds.map((k) => t(`kind.${k}`)).join(' ')] : [])].join(' · ');
}

/** Pick mode (↑ on the point): only tiles that can take a take now. */
export const pickable = (all) => all.filter((tile) => tile.state === 'ok' && !tile.readOnly);

/**
 * geben (a Nextcloud folder of mine, read-only elsewhere): what — ganz or chosen kinds (only for this
 * moment, nothing stored) — then how: WebDAV-Adresse kopieren · an Adresse (Sciebo, other Nextcloud).
 * picked: [] = ganz · ['x', 'l'] = only these strand folders. → chips [{ key: 'give-what' | 'give', value, label, on }]
 */
export function giveChips(picked, t) {
  return [
    { key: 'give-what', value: 'all', label: t('give.all'), on: !picked.length },
    ...MENU_KINDS.map((k) => ({ key: 'give-what', value: k, label: t(`kind.${k}`), on: picked.includes(k) })),
    ...['link', 'address'].map((v) => ({ key: 'give', value: v, label: t(`give.${v}`), on: false })),
  ];
}

/** A give-what chip tapped → the new choice. */
export const pickGive = (picked, value) => (value === 'all' ? [] : picked.includes(value) ? picked.filter((k) => k !== value) : [...picked, value]);
