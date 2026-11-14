// pdf.js — a one-page PDF of plain lines, for printing (the emergency sheet, 14.11.). No library.
//
// Purpose:   lines → a valid PDF 1.4 (A4, Helvetica, WinAnsi: German letters print right). Each line may be
//            { text, size, gap, mono, grey, box, rule } — mono = Courier, for passwords read character by character.
// Depends:   nothing.
// Origin:    PDF 1.4 (ISO 32000-1 subset): catalog, pages, one page, two standard fonts, one content stream.
// Test:      tests/model.test.mjs
// Limits:    one page (≈ 50 lines at 11 pt) · characters outside Latin-1 become "?" · no images, no QR.

const W = 595, H = 842, LEFT = 56, TOP = 790; // A4 in points

const latin1 = (s) => Array.from(String(s), (c) => { const n = c.codePointAt(0); return n < 256 ? n : 63; });
const esc = (bytes) => bytes.flatMap((b) => (b === 40 || b === 41 || b === 92 ? [92, b] : [b])); // ( ) \ escaped

/**
 * lines: [string | { text, size = 11, gap = 6, mono = false, grey = false, box = false, rule = false }] → Uint8Array.
 * box: a light field behind the line (for what is copied or typed) · rule: a thin line above it (a new section) ·
 * grey: the text in grey (hints). Text stays text: a PDF viewer can select and copy it.
 */
export function makePdf(lines) {
  let y = TOP;
  const ops = [];
  const raw = (s) => ops.push(...latin1(s));
  for (const l of lines.map((x) => (typeof x === 'string' ? { text: x } : x))) {
    const size = l.size ?? 11;
    if (l.rule) { y -= 10; raw(`0.82 G 0.6 w ${LEFT} ${y} m ${W - LEFT} ${y} l S\n`); }
    y -= size + (l.gap ?? 6);
    if (l.box) raw(`0.95 g ${LEFT - 8} ${y - size * 0.45} ${W - 2 * LEFT + 16} ${size * 1.7} re f\n`);
    raw(`${l.grey ? '0.45' : '0.1'} g BT /${l.mono ? 'F2' : 'F1'} ${size} Tf ${LEFT} ${y} Td (`);
    ops.push(...esc(latin1(l.text ?? '')));
    raw(') Tj ET\n');
  }
  const stream = new Uint8Array(ops);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>',
  ];
  const parts = [latin1('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')];
  const offsets = [];
  let at = parts[0].length;
  const push = (bytes) => { parts.push(bytes); at += bytes.length; };
  objects.forEach((o, i) => { offsets.push(at); push(latin1(`${i + 1} 0 obj\n${o}\nendobj\n`)); });
  offsets.push(at);
  push(latin1(`6 0 obj\n<< /Length ${stream.length} >>\nstream\n`)); push(Array.from(stream)); push(latin1('\nendstream\nendobj\n'));
  const xref = at;
  push(latin1(`xref\n0 7\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
  return new Uint8Array(parts.flat());
}
