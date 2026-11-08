// t.js — every text the person sees, in her language. Code and files stay language-neutral.
//
// Purpose:   multilingual from the start (decision 06.11.): the UI asks t('key'), never a
//            German or English sentence in code · one file per language in locales/ ·
//            a missing text falls back to English, then to the key itself (never empty).
// Depends:   nothing (JSON files are passed in or imported by the app).
// Test:      tests/i18n.test.mjs (every language has every key and the same {placeholders})
// Limits:    ~100–300 keys for wave 1, ~5–15 KB per language · sign languages are not
//            "translations" of these texts: DGS explanations are Takes, found by Similar.
// EXTEND(S3, languages): more locales (fr, nl, tr, ar, uk …) are new files, no code change.

const FALLBACK = 'en';

/** Make a translator. locales: { de: {...}, en: {...} } · lang: e.g. navigator.language. */
export function translator(locales, lang = FALLBACK) {
  const pick = (l) => locales[l] ?? locales[String(l).split('-')[0]] ?? null;
  const main = pick(lang) ?? locales[FALLBACK];
  return function t(key, vars = {}) {
    const text = main?.[key] ?? locales[FALLBACK]?.[key] ?? key;
    return text.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
  };
}

/** Placeholders in a text, e.g. "{n} Takes" → ["n"]. */
export function placeholders(text) {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

/** Problems between languages: missing keys, different placeholders. Empty = fine. */
export function compare(locales) {
  const errors = [];
  const keys = new Set(Object.values(locales).flatMap(Object.keys));
  for (const [lang, texts] of Object.entries(locales)) {
    for (const key of keys) {
      if (!(key in texts)) { errors.push(`${lang}: missing ${key}`); continue; }
      const ref = Object.values(locales).find((l) => key in l)[key];
      if (placeholders(texts[key]).join() !== placeholders(ref).join()) errors.push(`${lang}: placeholders differ in ${key}`);
    }
  }
  return errors;
}
