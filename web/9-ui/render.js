// render.js — draw glyph shapes as SVG text (no DOM needed, so it runs in tests too).
//
// Purpose:   koralle = own, blue = others, dashed = waiting, pale = quiet (design chat colours).
// Depends:   glyph.js (shapes)
// Test:      tests/ui.test.mjs
// Limits:    the point is at least 44 px (touch target); size is the viewBox edge in px.

const CORAL = '#f5a08a', BLUE = '#8fb6e0', GREY = '#888780';

/** shapes (glyph()) → '<svg …>' for a square of size px. */
export function glyphSvg(shapes, size = 88) {
  const c = size / 2, r = Math.max(22, size * 0.22);
  const parts = [];
  let lines = 0;
  for (const s of shapes) {
    if (s.shape === 'point') {
      const fill = s.state === 'empty' ? 'none' : s.role === 'own' ? CORAL : BLUE;
      const dash = s.state === 'empty' ? ' stroke-dasharray="4 4"' : '';
      parts.push(`<circle cx="${c}" cy="${c}" r="${r}" fill="${s.state === 'recording' ? CORAL : fill}" fill-opacity="${s.state === 'rest' ? 0.35 : 1}" stroke="${CORAL}" stroke-width="2"${dash}/>`);
      if (s.state === 'ready') parts.push(`<circle cx="${c}" cy="${c}" r="${r + 6}" fill="none" stroke="${CORAL}" stroke-width="1.5" stroke-dasharray="3 5"/>`);
    } else if (s.shape === 'line') {
      const a = (-35 + 35 * lines++) * (Math.PI / 180);
      const colour = s.state === 'pale' || s.state === 'bundle' ? GREY : BLUE;
      parts.push(`<line x1="${c + r * Math.cos(a)}" y1="${c + r * Math.sin(a)}" x2="${c + (r + 14) * Math.cos(a)}" y2="${c + (r + 14) * Math.sin(a)}" stroke="${colour}" stroke-width="2" stroke-opacity="${s.state === 'pale' ? 0.4 : 1}"/>`);
    } else if (s.shape === 'bubble') {
      const dash = s.state === 'waiting' ? ' stroke-dasharray="4 3" fill="none"' : ` fill="${BLUE}"`;
      parts.push(`<rect x="${c + r + 4}" y="${c - 9}" width="${size - c - r - 6}" height="18" rx="9" stroke="${BLUE}" stroke-width="1.5"${dash}/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${parts.join('')}</svg>`;
}
