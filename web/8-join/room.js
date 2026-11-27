// room.js — an account's room in the object storage, set by the admin (27.11., user: "Objektspeicher auch individuell,
// fließende Grenzen in 10-GB-Schritten").
//
// Purpose:   the same zoom on an account that moves its Nextcloud quota moves its room in the object storage: the
//            account's first folder there (<user>/, where its Sign/ lies) gets the same number of bytes. The gateway
//            keeps it in the bucket (gateway/rooms.mjs); without one, QUOTA_BYTES of gateway.env counts.
//            The admin asks with a grant it seals for itself over the whole bucket (rw ''): only the project's signer
//            can make one that counts, and it gives nothing the signer could not already give.
// Depends:   2-storage/gateway-ask.js, 2-storage/spec.js, grant.js
// Test:      tests/gateway.test.mjs
// Limits:    one ask per change (≈ 1 round trip) and one per look · counts on every gateway ≤ 60 s later ·
//            what an account holds is listed by the gateway at most every 10 min.

import { askGateway } from '../2-storage/gateway-ask.js';
import { gatewayParts } from '../2-storage/spec.js';
import { makeGrant } from './grant.js';

export const GB = 2 ** 30;
/** "60 GB" → bytes; "none" → null (no room of its own). */
export const bytesOf = (quota) => (quota === 'none' || quota == null ? null : Math.round(Number.parseFloat(quota) * GB));
/** An account's root in the object storage: its first folder. */
export const rootOf = (user) => `${String(user).replace(/\/+$/, '')}/`;

/** The admin's own grant over the whole bucket. signer: { device, person, deviceKey } · keys: the device's { device, access }. */
export const wholeGrant = (signer, keys) => makeGrant({ signer, device: { label: signer.person?.label ?? '', id: signer.device, key: keys.device.public }, access: keys.access.public, prefix: '', rights: 'rw' });

/** One ask with the admin's grant. where: { gateway (https://gateway.<domain>), access: async () => key, grant, fetch } */
export const askThere = ({ gateway, access, grant, fetch = globalThis.fetch.bind(globalThis) }, op, a, b = null, c = null) => {
  const p = gatewayParts(`${String(gateway).replace(/\/$/, '')}/s3/`);
  if (!p) throw new Error(`not a gateway: ${gateway}`);
  return askGateway({ api: p.api, access, fetch }, op, a, b, c, { grant });
};
const ask = askThere;

/** Set the room of a root: bytes, or null = back to QUOTA_BYTES. → { root, room } */
export const setRoom = (where, root, bytes) => ask(where, 'room', root, bytes == null ? null : String(bytes));

/** What a root holds and may hold. → { root, used, room (null = no limit), rests } */
export const roomHeld = (where, root) => ask(where, 'held', root);
