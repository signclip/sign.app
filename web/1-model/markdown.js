// markdown.js — a note written in Markdown (Logseq, Obsidian, any editor) read for Sign: its words and what it links to.
//
// Purpose:   .sign has its own notation; Markdown is not part of it. A note comes in as a Take that holds words only:
//            its title, the pages it links to ([[Page]]) and its tags (#tag) become its context. Two notes that name
//            the same page then hold the same words — that is the link, found by Similar like everything else, with
//            no table of its own.
//              readMarkdown(text, name) → { title, links, tags, lines }
//              noteContext(note)        → '(Title words Linked page words tag)'   one row, all on one level
//            The text of the note itself is not stored by this step: which strand holds a long text is not decided.
// Depends:   —
// Test:      tests/e2e-on.test.mjs
// Limits:    a note of 100 KB ≈ 1 ms · at most 60 words go into the context (a name of a file holds ≤ 255 bytes; the
//            row in the .x.sign keeps all 60) · code blocks are skipped · [text](url) links are not followed.

const WORD = /[\p{L}\p{N}][\p{L}\p{N}\-_.]*/gu;
const wordsIn = (s) => String(s).normalize('NFC').match(WORD) ?? [];
export const MOST_WORDS = 60;

/** text: the file · name: its file name ('Projekt Sign.md', journals '2026_05_14.md'). */
export function readMarkdown(text, name = '') {
  const body = String(text).replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  const heading = /^#\s+(.+)$/m.exec(body)?.[1] ?? /^title::\s*(.+)$/m.exec(body)?.[1];
  const title = (heading ?? name.replace(/\.md$/i, '').replace(/_/g, ' ')).trim();
  const links = [...new Set([...body.matchAll(/\[\[([^\[\]]+)\]\]/g)].map((m) => m[1].split('|')[0].trim()))];
  const tags = [...new Set([...body.matchAll(/(?:^|\s)#([\p{L}\p{N}][\p{L}\p{N}\-_/]*)/gu)].map((m) => m[1]))];
  return { title, links, tags, lines: body.split('\n').filter((l) => l.trim()).length };
}

/** The context of a note: every word once, title first. */
export function noteContext(note) {
  const words = [...new Set([note.title, ...note.links, ...note.tags].flatMap(wordsIn))].slice(0, MOST_WORDS);
  return `(${words.join(' ')})`;
}

/** Which notes link to which: [{ from, to }] by title, only to notes that are there (for a picture of the net). */
export function linksAmong(notes) {
  const titles = new Map(notes.map((n) => [n.title.toLowerCase(), n.title]));
  return notes.flatMap((n) => n.links.filter((l) => titles.has(l.toLowerCase())).map((l) => ({ from: n.title, to: titles.get(l.toLowerCase()) })));
}
