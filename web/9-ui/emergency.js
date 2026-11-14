// emergency.js — the emergency sheet (Notfallblatt, 14.11.): ↑ on this device's own tile → a PDF in the system
// share sheet (print, save, send). The screen never shows the paper password; only the paper does.
//
// Purpose:   the paper password opens every backup when all devices are gone (backup-key.js, paper.key);
//            the check key q_ z_ of this device (public); two empty lines to write an emergency admin login by
//            hand (never digital). A new sheet = a new paper password; the old sheet stops opening new backups.
// Depends:   1-model/pdf.js
// Test:      tests/model.test.mjs (sheetLines)
// Limits:    one A4 page · the paper password: 26 Base32 characters (≈ 130 bit), printed in groups of 4.

import { makePdf } from '../1-model/pdf.js';

const groups = (s) => s.replace(/(.{4})/g, '$1 ').trim();

/** The lines of the sheet. key: "q_… z_…" · paper: the paper password · date: "2026.11.14". */
export function sheetLines({ name, key, paper, date }) {
  const [q, z] = key.split(' '); // the whole key in one line: select it in the PDF viewer, copy, paste
  return [
    { text: 'Sign', size: 30, gap: 0 },
    { text: 'Notfallblatt', size: 16, gap: 4, grey: true },
    { text: `${name}  ·  ${date}`, size: 11, gap: 6, grey: true },
    { text: 'Papier-Passwort für deine Backups', size: 13, gap: 14, rule: true },
    { text: groups(paper), size: 18, gap: 14, mono: true, box: true },
    { text: 'Öffnet alle Backups, auch wenn jedes Gerät fehlt. Ein neues Blatt ersetzt dieses.', size: 9, gap: 12, grey: true },
    { text: 'Prüfschlüssel dieses Geräts (öffentlich, zum Kopieren)', size: 13, gap: 14, rule: true },
    { text: key, size: 7.5, gap: 12, mono: true, box: true },
    { text: `${q ?? ''} · ${(z ?? '').slice(0, 10)}…  (Gerät)`, size: 10, gap: 10, mono: true, grey: true },
    { text: 'Notzugang Admin (nur von Hand eintragen, nie digital)', size: 13, gap: 14, rule: true },
    { text: 'Konto', size: 9, gap: 16, grey: true },
    { text: ' ', size: 14, gap: 4, box: true },
    { text: 'Passwort', size: 9, gap: 14, grey: true },
    { text: ' ', size: 14, gap: 4, box: true },
    { text: 'Sicher aufbewahren, nicht fotografieren, nicht in eine Cloud legen.', size: 9, gap: 40, grey: true, rule: true },
  ];
}

/** The sheet as a PDF file. */
export const sheetPdf = (input) => makePdf(sheetLines(input));
