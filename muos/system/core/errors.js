import { i18n } from './i18n.js';

/** Human-readable, translated text for an error (file system errors carry a code). */
export function describeError(err) {
  if (err && err.code) {
    const key = `fs.errors.${err.code}`;
    if (i18n.has(key)) return i18n.t(key, { path: err.path || '' });
  }
  return err?.message || String(err);
}
