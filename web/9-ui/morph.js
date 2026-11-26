// morph.js — bring what is on the page to a new HTML text by changing only what differs (26.11.).
//
// Purpose:   Similar was written anew as a whole whenever anything in it changed (a picture arrived, the window's form
//            moved under two fingers): every tile was a new element, so its "appear" motion began again each time –
//            the cloud trembled (user, 26.11.: "zittert"). Here an element that is still there stays the same element:
//            only its attributes and texts are set. So a motion plays once, when a thing really is new, and a tile
//            follows the window's form frame by frame without blinking.
//            What is "the same element": the same data-key, else the same data-role, else the same tag at the same
//            position among the unnamed ones. Elements keep the order of the new text (what comes later lies on top).
// In / out:  morph(element, html) – the element's children afterwards are as html says
// Depends:   browser (template element)
// Test:      needs a page; checked in Chrome as a phone (tiles stay the same nodes while the form changes)
// Limits:    walks every node once (40 tiles ≈ 400 nodes, < 1 ms); a keyed element that moved is taken out and put in
//            again by the browser (its motion then begins anew) – only when the order really changed.

const keyOf = (n) => (n.nodeType === 1 ? n.dataset?.key ?? n.dataset?.role ?? null : null);
const alike = (a, b) => a.nodeType === b.nodeType && (a.nodeType !== 1 || (a.tagName === b.tagName && a.namespaceURI === b.namespaceURI));

/** The attributes of `to` onto `el` (only those that differ are written). */
function attributes(el, to) {
  for (const a of [...el.attributes]) if (!to.hasAttribute(a.name)) el.removeAttribute(a.name);
  for (const a of [...to.attributes]) if (el.getAttribute(a.name) !== a.value) el.setAttribute(a.name, a.value);
}

/** The children of `old` become those of `fresh` (a fragment or an element), reusing what is alike. */
function children(old, fresh) {
  const named = new Map();
  for (const n of old.childNodes) { const k = keyOf(n); if (k != null && !named.has(k)) named.set(k, n); }
  let at = old.firstChild; // everything before `at` is done and in order
  for (const f of [...fresh.childNodes]) {
    const k = keyOf(f);
    let m = null;
    if (k != null) { m = named.get(k) ?? null; if (m && !alike(m, f)) m = null; if (m) named.delete(k); }
    else if (at && keyOf(at) == null && alike(at, f)) m = at; // unnamed: the one standing there, if it is of the same kind
    if (!m) { old.insertBefore(f, at); continue; } // new: it appears
    if (m === at) at = at.nextSibling; else old.insertBefore(m, at);
    if (m.nodeType === 1) { attributes(m, f); children(m, f); } else if (m.nodeValue !== f.nodeValue) m.nodeValue = f.nodeValue;
  }
  while (at) { const next = at.nextSibling; old.removeChild(at); at = next; } // what the new text no longer has
}

/** Make element's content equal to html, keeping the elements that stay. */
export function morph(element, html) {
  const t = document.createElement('template');
  t.innerHTML = html;
  children(element, t.content);
}
