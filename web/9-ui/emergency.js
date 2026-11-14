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
  const [q, z] = key.split(' ');
  return [
    { text: 'Sign · Notfallblatt', size: 22, gap: 0 },
    { text: `${name} · ${date}`, size: 12, gap: 10 },
    { text: 'Öffnet deine Backups, auch wenn alle Geräte fehlen. Sicher aufbewahren, nicht fotografieren.', size: 10, gap: 18 },
    { text: 'Papier-Passwort für Backups', size: 12, gap: 18 },
    { text: groups(paper), size: 16, gap: 8, mono: true },
    { text: 'Ein neues Blatt ersetzt dieses: dann gilt nur noch das neue Passwort.', size: 9, gap: 6 },
    { text: 'Prüfschlüssel dieses Geräts (öffentlich)', size: 12, gap: 22 },
    { text: q ?? '', size: 11, gap: 8, mono: true },
    { text: z ?? '', size: 9, gap: 4, mono: true },
    { text: 'Notzugang Admin - nur von Hand eintragen, nie digital', size: 12, gap: 26 },
    { text: 'Konto:     ______________________________', size: 12, gap: 18 },
    { text: 'Passwort:  ______________________________', size: 12, gap: 18 },
  ];
}

/** The sheet as a PDF file. */
export const sheetPdf = (input) => makePdf(sheetLines(input));
