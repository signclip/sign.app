// where.js — the o_ of a take (15.11.): the H3 cell, resolution 5 (~250 km², SCHEMA B2), of where the phone is.
//
// Purpose:   refresh() asks the phone where it is (coarse, no GPS needed: enableHighAccuracy false, a position up to
//            30 min old is fine) and keeps the cell; now() gives it to the next take (or null: no permission, no fix,
//            older than 6 h). Called when a take starts, so the take never waits for it.
//            centre(o_) → { lat, lon } for the earth on the emergency sheet.
//            Only the cell leaves the phone, never the position: 250 km² ≈ a circle of 9 km radius.
// Depends:   h3-js 4.5.0 (IMPORTS.md), loaded on first use from jsDelivr and kept by the browser cache, not in the repo
// Test:      tests/model.test.mjs (with a fake position and a fake h3)
// Limits:    h3-js ≈ 550 kB once · a fix takes 0.1–8 s (timeout 8 s) · the browser asks once for permission; denied →
//            o_ stays empty, nothing else changes.

export const H3_LIBRARY = 'https://cdn.jsdelivr.net/npm/h3-js@4.5.0/dist/browser/h3-js.es.js';
const RES = 5, FRESH = 6 * 3_600_000;

let lib = null;
const h3 = async (load) => (lib ??= await (load ?? ((url) => import(/* @vite-ignore */ url)))(H3_LIBRARY));

/** geo: navigator.geolocation (or a fake) · load: how to load h3 (tests) · clock: ms. */
export function createWhere({ geo = globalThis.navigator?.geolocation, load = null, clock = () => Date.now() } = {}) {
  let cell = null, at = 0, busy = null;
  const position = () => new Promise((done) => {
    if (!geo) return done(null);
    geo.getCurrentPosition(done, () => done(null), { enableHighAccuracy: false, maximumAge: 30 * 60_000, timeout: 8000 });
  });
  async function refresh() {
    busy ??= (async () => {
      const p = await position();
      if (p) {
        const h = await h3(load).catch(() => null);
        if (h) { cell = h.latLngToCell(p.coords.latitude, p.coords.longitude, RES); at = clock(); }
      }
      busy = null;
      return cell;
    })();
    return busy;
  }
  return { refresh, now: () => (cell && clock() - at < FRESH ? cell : null) };
}

/** The outline of a cell, for the map of Similar's spots (22.11.): 'o_…' → [[lat, lon], …]. */
export async function outlineOf(o, { load = null } = {}) {
  return (await h3(load)).cellToBoundary(String(o).replace(/^o_/, ''));
}
/** The middle of a cell: 'o_851fa19bfffffff' → { lat, lon }. */
export async function centre(o, { load = null } = {}) {
  const [lat, lon] = (await h3(load)).cellToLatLng(String(o).replace(/^o_/, ''));
  return { lat, lon };
}
