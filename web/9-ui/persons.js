// persons.js — several persons on one device (14.11.): each has its own name, name sign, sharing points, settings
// and start; the device (its key q_ z_, its storage) is shared by all of them.
//
// Purpose:   a registry in the browser storage: [{ id (n_), label, start }] and who is current. What belongs to a person
//            (PERSONAL keys: name, settings, onboarding, list memory …) is kept per person: the first person keeps the
//            old keys (nothing moves), every further one gets `key@n_…`. Takes carry @(person) anyway; the list of
//            sharing points is found by the person's name (list.js findList), passwords by their sharing point (q_).
//            start: 'direct' (straight to the take, as it was left: always ready, Similar … restored) · 'choose' (the
//            persons as tiles at start, tap = in). Checking a name sign or password gestures needs recognition (S5/S6).
// Depends:   browser localStorage; 1-model/ids (newPerson)
// Test:      tests/ui.test.mjs (with a fake storage)
// Limits:    ≤ 12 persons per device · switching reloads the app (≈ 1 s) · a removed person's files stay where they
//            are (device, sharing points); only its keys on this device go.

import { newPerson } from '../1-model/ids.js';

export const PERSONAL = new Set(['sign.person', 'sign.name', 'sign.settings', 'sign.onboard', 'sign.sticky', 'sign.nameSign', 'sign.removeLater',
  'sign.upkeep', 'sign.confirmed', 'sign.atlasAt', 'sign.apps', 'sign.photo', 'sign.passwords']);
const REG = 'sign.persons', CUR = 'sign.current', MAX = 12;

/** The storage seen by the app for the current person. raw: a Storage (localStorage) → a Storage-like object. */
export function personStorage(raw) {
  const reg = () => { try { return JSON.parse(raw.getItem(REG) || '[]'); } catch { return []; } };
  const cur = () => raw.getItem(CUR);
  const first = () => reg()[0]?.id ?? null;
  const key = (k) => (PERSONAL.has(k) && cur() && cur() !== first() ? `${k}@${cur()}` : k);
  return {
    getItem: (k) => raw.getItem(key(k)), setItem: (k, v) => raw.setItem(key(k), v), removeItem: (k) => raw.removeItem(key(k)),
    persons: reg, current: cur,
    /** The first start with this version: the person already here becomes the first of the registry. */
    init() {
      if (reg().length) return;
      const id = raw.getItem('sign.person') || newPerson();
      raw.setItem('sign.person', id);
      raw.setItem(REG, JSON.stringify([{ id, label: raw.getItem('sign.name') || '', start: 'direct' }]));
      raw.setItem(CUR, id);
    },
    /** A new person (hold the own tile): current from now on, its first steps follow. → id */
    add() {
      const list = reg();
      if (list.length >= MAX) return null;
      const id = newPerson();
      raw.setItem(REG, JSON.stringify([...list, { id, label: '', start: 'direct' }]));
      raw.setItem(CUR, id);
      raw.setItem(`sign.person@${id}`, id);
      raw.setItem(`sign.onboard@${id}`, '0');
      return id;
    },
    switchTo(id) { if (reg().some((p) => p.id === id)) raw.setItem(CUR, id); },
    /** A person comes back on this device (15.11.): her ID from the paper (sign-person n_…), her first steps follow. → id */
    adopt(id) {
      if (!/^n_[0-9A-Z]{16}$/.test(id)) return null;
      if (reg().some((p) => p.id === id)) { raw.setItem(CUR, id); return id; }
      if (reg().length >= MAX) return null;
      raw.setItem(REG, JSON.stringify([...reg(), { id, label: '', start: 'direct' }]));
      raw.setItem(CUR, id);
      raw.setItem(`sign.person@${id}`, id);
      raw.setItem(`sign.onboard@${id}`, '0');
      return id;
    },
    /** ↓ on a person: off this device (its keys here); its files stay. The current one cannot remove itself. */
    remove(id) {
      if (id === cur() || id === first()) return false;
      raw.setItem(REG, JSON.stringify(reg().filter((p) => p.id !== id)));
      for (const k of PERSONAL) raw.removeItem(`${k}@${id}`);
      return true;
    },
    /** The current person's name went into the take field: the registry shows it. */
    named(label) { raw.setItem(REG, JSON.stringify(reg().map((p) => (p.id === cur() ? { ...p, label } : p)))); },
    /** Start: 'direct' ↔ 'choose'. */
    setStart(id, start) { raw.setItem(REG, JSON.stringify(reg().map((p) => (p.id === id ? { ...p, start } : p)))); },
  };
}

/** A key of something kept elsewhere (IndexedDB) per person: the first person keeps the old one. */
export function personal(key, g = globalThis) {
  const p = g.signPersons;
  return p && p.current() && p.current() !== p.persons()[0]?.id ? `${key}@${p.current()}` : key;
}

/** In the browser: every localStorage use goes through the current person (installed once, before the app reads it). */
export function installPersons(g = globalThis) {
  const ls = g.localStorage;
  if (!ls || g.signPersons) return g.signPersons ?? null;
  const proto = Object.getPrototypeOf(ls), og = { getItem: proto.getItem, setItem: proto.setItem, removeItem: proto.removeItem };
  const raw = { getItem: (k) => og.getItem.call(ls, k), setItem: (k, v) => og.setItem.call(ls, k, v), removeItem: (k) => og.removeItem.call(ls, k) };
  const p = personStorage(raw);
  p.init();
  proto.getItem = function getItem(k) { return this === ls ? p.getItem(k) : og.getItem.call(this, k); }; // sessionStorage stays as it is
  proto.setItem = function setItem(k, v) { return this === ls ? p.setItem(k, v) : og.setItem.call(this, k, v); };
  proto.removeItem = function removeItem(k) { return this === ls ? p.removeItem(k) : og.removeItem.call(this, k); };
  g.signPersons = p;
  return p;
}
