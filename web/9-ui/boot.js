// boot.js — the first lines the page runs: the two languages, the service worker, start.
//
// Purpose:   index.html names this file instead of carrying the lines itself (27.11., audit M9): the page's
//            Content-Security-Policy allows scripts from the app's own files only, none written into a page.
// Depends:   9-ui/app.js (start), 0-i18n/locales
// Test:      tests/ui.test.mjs (the pages carry no script of their own); the start itself in Chrome
// Limits:    two languages are read before anything shows (≈ 10 KB each).

import { start } from './app.js';

const load = (l) => fetch(new URL(`../0-i18n/locales/${l}.json`, import.meta.url)).then((r) => r.json());
const [de, en] = await Promise.all([load('de'), load('en')]);
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');
start({ locales: { de, en } });
