// filename.js — file names as a view: readable, findable by any file manager.
//
// Purpose:   ^(to)(context words)~(echo)@(person)°(where)'t(date time 0_length)!(u_ 12 chars).kind.ext
//            The name is never read to decide meaning; the content is the truth (SCHEMA.md B4).
//            Renaming is allowed: nothing points to paths, only to !( ).
// Depends:   symbols.js, notation.js
// Test:      tests/model.test.mjs
// Limits:    255 bytes (UTF-8, umlauts 2 bytes); meta and id take ~60–90 bytes, context words
//            are cut at whole words to fit · forbidden: : { } / \ * ? " < > | # %.

import { NAME_FORBIDDEN, NAME_MAX_BYTES } from './symbols.js';
import { parse } from './notation.js';

const bytes = (s) => new TextEncoder().encode(s).length;
const clean = (s) => String(s).replace(NAME_FORBIDDEN, ' ').replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();

/** Context text → its words, flat, each once, in order. Meta and times are left out. */
export function flatWords(contextText) {
  const words = [];
  const walk = (list) => {
    for (const n of list) {
      if (n.t === 'value') words.push(...n.text.split(' '));
      else if (n.t === 'text') words.push(n.text);
      else if (n.t === 'spell') words.push(n.letters.join(''));
      else if (n.t === 'prefix') walk([n.head, n.body]);
      else if (n.items) walk(n.items);
    }
  };
  walk(parse(contextText));
  return [...new Set(words.map(clean).filter(Boolean))];
}

/** Time as written in 't( ): local date and time to the second, then the length from 0 in ms. */
export function timeLabel(ms, lengthMs = null) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  const at = `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`;
  return lengthMs == null ? at : `${at} 0_${Math.round(lengthMs)}`;
}

/** Build a file name. Words are cut (whole words) until the name fits 255 bytes. */
export function buildName({ to = [], words = [], echo, person, where, time, u, kind, ext }) {
  const meta = (echo ? `~(${clean(echo)})` : '') + (person ? `@(${clean(person)})` : '') +
    (where ? `°(${clean(where)})` : '') + (time ? `'t(${clean(time)})` : '');
  const end = `!(${u}).${kind}.${ext}`;
  const front = to.map((t) => `^(${clean(t)})`).join('');
  const list = words.map(clean).filter(Boolean);
  for (let n = list.length; n >= 0; n--) {
    const name = front + (n ? `(${list.slice(0, n).join(' ')})` : '') + meta + end;
    if (bytes(name) <= NAME_MAX_BYTES) return name;
  }
  throw new Error('file name too long even without words');
}

const PART = /(\^|~|@|°|'t|!)\(([^()]*)\)/g;

/** Read a name back into its parts (for listing without opening files). */
export function readName(name) {
  const m = /^(.*)\.([a-z-]+)\.([a-z0-9]+)$/.exec(name);
  if (!m) return null;
  const out = { to: [], words: [], kind: m[2], ext: m[3] };
  const body = m[1];
  const firstWords = /^(?:\^\([^()]*\))*\(([^()]*)\)/.exec(body);
  if (firstWords) out.words = firstWords[1].split(' ').filter(Boolean);
  for (const [, sym, value] of body.matchAll(PART)) {
    if (sym === '^') out.to.push(value);
    else if (sym === '~') out.echo = value;
    else if (sym === '@') out.person = value;
    else if (sym === '°') out.where = value;
    else if (sym === "'t") out.time = value;
    else if (sym === '!') out.u = value;
  }
  return out;
}
