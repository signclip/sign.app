// panels.js — what slides in: chips only (no fields, no buttons). Own settings from the upper left,
// Similar from the upper right, the chips of one strand from ↑ on that strand.
//
// Depends:   settings.js (CHOICES), 7-similar (combinedSimilar)
// Test:      chip lists in tests/ui.test.mjs; drawing needs a browser.
// Limits:    a panel shows at most 40 chips; Similar shows the 20 best.

import { CHOICES } from './settings.js';
import { combinedSimilar } from '../7-similar/combine.js';

/** Chips of the own settings: [{ key, value, label, on }]. */
export function ownChips(settings, t) {
  return [
    ...CHOICES.waitStartMs.map((v) => ({ key: 'waitStartMs', value: v, label: `▶ ${v / 1000} s`, on: settings.waitStartMs === v })),
    ...CHOICES.waitStopMs.map((v) => ({ key: 'waitStopMs', value: v, label: `■ ${v / 1000} s`, on: settings.waitStopMs === v })),
    ...['v', 'a', 'x', 'l'].map((k) => ({ key: 'auto', value: k, label: t(`kind.${k}`), on: settings.auto.includes(k) })),
  ];
}

/** Chips of one strand (↑ on it): the camera's light; audio and text come with Whisper. */
export function strandChips(kind, state) {
  if (kind === 'v') return [{ key: 'torch', value: !state.torch, label: '☀', on: state.torch }];
  return [];
}

/** Similar from the words of the newest takes: [{ label }]. */
export function similarChips(index, words) {
  return combinedSimilar(index, [{ kind: 'x', words }]).map((h) => ({ label: h.strand?.head?.['@'] ?? '·', key: h.key }));
}

/** Draw chips into a panel element; onChip(chip) on tap. */
export function draw(panel, chips, onChip = () => {}) {
  panel.replaceChildren(...chips.slice(0, 40).map((c) => {
    const el = document.createElement('span');
    el.className = `chip${c.on ? ' on' : ''}`;
    el.textContent = c.label;
    el.onclick = () => onChip(c);
    return el;
  }));
}
