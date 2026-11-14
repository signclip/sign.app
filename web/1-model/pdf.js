// pdf.js — PDF pages drawn from plain shapes and text, for printing (the emergency sheet, 14.11.). No library.
//
// Purpose:   a Page collects shapes in top-left coordinates (points, y downwards, like the screen):
//            text · rect (rounded) · line (dashed) · circle · arc · poly. makePages → a valid PDF 1.4
//            (A4, Helvetica / Helvetica-Bold / Courier, WinAnsi: German letters print right).
//            Text stays text: a PDF viewer selects and copies it (one value = one text run).
// Depends:   nothing.
// Origin:    PDF 1.4 (ISO 32000-1 subset): catalog, pages, three standard fonts, one content stream per page.
//            Helvetica widths: Adobe AFM of the 14 standard fonts (ASCII), others ≈ 556/1000.
// Test:      tests/model.test.mjs
// Limits:    characters outside WinAnsi (Latin-1 + … – — • € quotes) become "?" · no images, no QR, no transparency ·
//            ≈ 1–3 kB per page of shapes; 4 pages with 300 shapes each ≈ 40 kB.

export const A4 = { w: 595, h: 842 };

// WinAnsi = Latin-1 plus a few signs in 128…159 (… – — • € ‘ ’ “ ” ‹ ›); anything else prints "?"
const WIN = { 0x2026: 133, 0x2013: 150, 0x2014: 151, 0x2022: 149, 0x20ac: 128, 0x2018: 145, 0x2019: 146, 0x201c: 147, 0x201d: 148, 0x2039: 139, 0x203a: 155 };
const latin1 = (s) => Array.from(String(s), (c) => { const n = c.codePointAt(0); return n < 128 || (n > 159 && n < 256) ? n : WIN[n] ?? 63; });
const esc = (bytes) => bytes.flatMap((b) => (b === 40 || b === 41 || b === 92 ? [92, b] : [b])); // ( ) \ escaped
const num = (n) => (Math.round(n * 100) / 100).toString();

// Helvetica widths for ASCII 32…126 (1/1000 em), from the AFM
const HELV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778,
  722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const FONTS = { sans: 'F1', mono: 'F2', bold: 'F3' };

/** Width of a text in points. mono: Courier is 600/1000 for every character; bold ≈ 6 % wider. */
export function textWidth(text, size, font = 'sans') {
  if (font === 'mono') return String(text).length * 0.6 * size;
  let w = 0;
  for (const c of String(text)) { const n = c.codePointAt(0); w += n >= 32 && n <= 126 ? HELV[n - 32] : n === 183 ? 278 : n === 0x2026 ? 1000 : n === 0x2013 ? 556 : n === 0x2014 ? 1000 : 556; }
  return (w / 1000) * size * (font === 'bold' ? 1.06 : 1);
}

/** Cut a text with "…" so it fits a width. */
export function fit(text, size, width, font = 'sans') {
  let s = String(text ?? '');
  if (textWidth(s, size, font) <= width) return s;
  while (s && textWidth(s + '…', size, font) > width) s = s.slice(0, -1);
  return s + '…';
}

const rgb = (hex) => { const h = hex.replace('#', ''); return [0, 2, 4].map((i) => num(parseInt(h.slice(i, i + 2), 16) / 255)).join(' '); };

export class Page {
  constructor({ w = A4.w, h = A4.h } = {}) { this.w = w; this.h = h; this.ops = []; }
  y(v) { return num(this.h - v); }
  style({ fill = null, stroke = null, width = 1, dash = null } = {}) {
    const s = [];
    if (fill) s.push(`${rgb(fill)} rg`);
    if (stroke) s.push(`${rgb(stroke)} RG ${num(width)} w ${dash ? `[${dash.join(' ')}] 0 d` : '[] 0 d'}`);
    return { pre: s.join(' '), paint: fill && stroke ? 'B' : fill ? 'f' : 'S' };
  }
  /** align: left | center | right · returns the width */
  text(x, y, text, { size = 10, font = 'sans', color = '#222222', align = 'left' } = {}) {
    const w = textWidth(text, size, font);
    const at = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    this.ops.push(latin1(`${rgb(color)} rg BT /${FONTS[font]} ${num(size)} Tf ${num(at)} ${this.y(y)} Td (`), esc(latin1(text)), latin1(') Tj ET\n'));
    return w;
  }
  rect(x, y, w, h, { r = 0, ...st } = {}) {
    const { pre, paint } = this.style(st);
    if (!r) return this.raw(`${pre} ${num(x)} ${this.y(y + h)} ${num(w)} ${num(h)} re ${paint}`);
    const k = r * 0.5523, X = x + w, Y = y + h; // four quarter circles as Bézier curves
    const p = (a, b) => `${num(a)} ${this.y(b)}`;
    this.raw(`${pre} ${p(x + r, y)} m ${p(X - r, y)} l ${p(X - r + k, y)} ${p(X, y + r - k)} ${p(X, y + r)} c ${p(X, Y - r)} l ` +
      `${p(X, Y - r + k)} ${p(X - r + k, Y)} ${p(X - r, Y)} c ${p(x + r, Y)} l ${p(x + r - k, Y)} ${p(x, Y - r + k)} ${p(x, Y - r)} c ` +
      `${p(x, y + r)} l ${p(x, y + r - k)} ${p(x + r - k, y)} ${p(x + r, y)} c h ${paint}`);
  }
  line(x1, y1, x2, y2, st = {}) { const { pre } = this.style({ stroke: '#222222', ...st }); this.raw(`${pre} ${num(x1)} ${this.y(y1)} m ${num(x2)} ${this.y(y2)} l S`); }
  poly(points, { close = false, ...st } = {}) {
    if (points.length < 2) return;
    const { pre, paint } = this.style(st);
    this.raw(`${pre} ${points.map(([x, y], i) => `${num(x)} ${this.y(y)} ${i ? 'l' : 'm'}`).join(' ')}${close ? ' h' : ''} ${paint}`);
  }
  /** Arc from angle a0 to a1 (degrees, 0 = right, clockwise on the page, like the ring of the app). */
  arc(cx, cy, r, a0, a1, st = {}) {
    const steps = Math.max(1, Math.ceil(Math.abs(a1 - a0) / 90)), d = (a1 - a0) / steps, rad = Math.PI / 180;
    const pt = (a) => [cx + r * Math.cos(a * rad), cy + r * Math.sin(a * rad)];
    const parts = [`${num(pt(a0)[0])} ${this.y(pt(a0)[1])} m`];
    for (let i = 0; i < steps; i++) {
      const s = a0 + i * d, e = s + d, k = (4 / 3) * Math.tan((d * rad) / 4);
      const [x0, y0] = pt(s), [x3, y3] = pt(e);
      const c1 = [x0 - k * r * Math.sin(s * rad), y0 + k * r * Math.cos(s * rad)], c2 = [x3 + k * r * Math.sin(e * rad), y3 - k * r * Math.cos(e * rad)];
      parts.push(`${num(c1[0])} ${this.y(c1[1])} ${num(c2[0])} ${this.y(c2[1])} ${num(x3)} ${this.y(y3)} c`);
    }
    const { pre, paint } = this.style(st);
    this.raw(`${pre} ${parts.join(' ')} ${paint}`);
  }
  circle(cx, cy, r, st = {}) {
    const { pre, paint } = this.style(st), k = r * 0.5523, p = (a, b) => `${num(a)} ${this.y(b)}`;
    this.raw(`${pre} ${p(cx + r, cy)} m ${p(cx + r, cy + k)} ${p(cx + k, cy + r)} ${p(cx, cy + r)} c ${p(cx - k, cy + r)} ${p(cx - r, cy + k)} ${p(cx - r, cy)} c ` +
      `${p(cx - r, cy - k)} ${p(cx - k, cy - r)} ${p(cx, cy - r)} c ${p(cx + k, cy - r)} ${p(cx + r, cy - k)} ${p(cx + r, cy)} c h ${paint}`);
  }
  /** A curve from (x0, y0) to (x1, y1) bent towards (cx, cy) — the quadratic Bézier the app draws (written as cubic). */
  curve(x0, y0, cx, cy, x1, y1, st = {}) {
    const { pre } = this.style({ stroke: '#222222', ...st }), c1 = [x0 + (2 / 3) * (cx - x0), y0 + (2 / 3) * (cy - y0)], c2 = [x1 + (2 / 3) * (cx - x1), y1 + (2 / 3) * (cy - y1)];
    this.raw(`${pre} ${num(x0)} ${this.y(y0)} m ${num(c1[0])} ${this.y(c1[1])} ${num(c2[0])} ${this.y(c2[1])} ${num(x1)} ${this.y(y1)} c S`);
  }
  /** Many small dots of one colour: [[x, y, diameter]] as round-capped zero-length lines (~35 B per dot, not ~180). */
  dots(list, color) {
    if (!list.length) return;
    this.raw(`${rgb(color)} RG 1 J [] 0 d ${list.map(([x, y, d]) => `${num(d)} w ${num(x)} ${this.y(y)} m ${num(x)} ${this.y(y)} l S`).join('\n')} 0 J`);
  }
  raw(s) { this.ops.push(latin1(s + '\n')); }
  bytes() { return new Uint8Array(this.ops.flat()); }
}

/** pages: [Page] → Uint8Array (the PDF file). title goes into the document info. */
export function makePages(pages, { title = 'Sign' } = {}) {
  const n = pages.length, FONT0 = 3 + 2 * n; // 1 catalog · 2 pages · then page + content per page · fonts · info
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + 2 * i} 0 R`).join(' ')}] /Count ${n} >>`,
  ];
  const fonts = `/F1 ${FONT0} 0 R /F2 ${FONT0 + 1} 0 R /F3 ${FONT0 + 2} 0 R`;
  pages.forEach((p, i) => {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${p.w} ${p.h}] /Resources << /Font << ${fonts} >> >> /Contents ${4 + 2 * i} 0 R >>`);
    objects.push(p.bytes());
  });
  for (const base of ['Helvetica', 'Courier', 'Helvetica-Bold']) objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /${base} /Encoding /WinAnsiEncoding >>`);
  objects.push(`<< /Title (${String.fromCharCode(...esc(latin1(title)))}) /Producer (Sign) >>`);
  const parts = [latin1('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')];
  const offsets = [];
  let at = parts[0].length;
  const push = (bytes) => { parts.push(bytes); at += bytes.length; };
  objects.forEach((o, i) => {
    offsets.push(at);
    if (typeof o === 'string') return push(latin1(`${i + 1} 0 obj\n${o}\nendobj\n`));
    push(latin1(`${i + 1} 0 obj\n<< /Length ${o.length} >>\nstream\n`)); push(Array.from(o)); push(latin1('\nendstream\nendobj\n'));
  });
  const xref = at, size = objects.length + 1;
  push(latin1(`xref\n0 ${size}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}` +
    `trailer\n<< /Size ${size} /Root 1 0 R /Info ${size - 1} 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
  return new Uint8Array(parts.flat());
}
