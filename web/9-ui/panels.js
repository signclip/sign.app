// panels.js — what slides in: chips only (no fields, no buttons). Similar from the upper right, the chips of one strand from ↑ on that strand.
//
// Depends:   7-similar (combinedSimilar)
// Test:      chip lists in tests/ui.test.mjs; drawing needs a browser.
// Limits:    a panel shows at most 40 chips; Similar shows the 20 best.

/** Chips of one strand (↑ on it): the camera's light; audio and text come with Whisper. */
export function strandChips(kind, state) {
  if (kind === 'v') return [{ key: 'torch', value: !state.torch, label: '☀', on: state.torch }];
  return [];
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
