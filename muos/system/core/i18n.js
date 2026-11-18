import { Emitter } from './events.js';
import { settings } from './settings.js';
import { ROOT, fetchJSON } from './paths.js';
import { FALLBACK_LANGUAGE as FALLBACK } from '../config/i18n.js';

function lookup(dict, key) {
  let node = dict;
  for (const part of key.split('.')) {
    if (node == null || typeof node !== 'object') return undefined;
    node = node[part];
  }
  return node;
}

/** Put the strings of `extra` over those of `base` (both are trees of strings). */
function merge(base, extra) {
  const out = { ...base };
  for (const [key, value] of Object.entries(extra ?? {})) {
    out[key] = value && typeof value === 'object' && base[key] && typeof base[key] === 'object' ? merge(base[key], value) : value;
  }
  return out;
}

/**
 * The OS keeps its own translations in /languages/<code>.json; the list of
 * available languages is /languages/index.json. An app keeps the strings of
 * its own in a languages/ folder next to its page (apps/<id>/languages/<code>.json,
 * the same codes) and adds it with addSource(). English is always loaded as a
 * fallback, so a key missing from another language still shows readable text.
 * A source that has no file for the language falls back to its English file.
 */
class I18n extends Emitter {
  lang = FALLBACK;
  /** 'ltr' or 'rtl': the direction of the language shown (languages/index.json). */
  dir = 'ltr';
  /** The language for Intl: numbers stay in Western digits in every language, so that figures never change shape. */
  locale = `${FALLBACK}-u-nu-latn`;
  available = [{ code: FALLBACK, name: 'English (United States)' }];
  #sources = [`${ROOT}languages/`];
  #dict = {};
  #fallback = {};
  #ready = null;
  #plural = new Intl.PluralRules(FALLBACK);

  /** Add the strings of an app: `base` is the address of its languages/ folder. Call before init(). */
  addSource(base) {
    const folder = base.endsWith('/') ? base : `${base}/`;
    if (!this.#sources.includes(folder)) this.#sources.push(folder);
  }

  /** The strings of one language from every source; a source without that language gives its English. */
  async #load(code) {
    let dict = {};
    for (const [i, base] of this.#sources.entries()) {
      let part;
      try {
        part = await fetchJSON(`${base}${code}.json`);
      } catch (err) {
        // the OS must have every language it lists; an app may not
        if (i === 0) throw err;
        part = code === FALLBACK ? {} : await fetchJSON(`${base}${FALLBACK}.json`).catch(() => ({}));
      }
      dict = merge(dict, part);
    }
    return dict;
  }

  /** Load the language files. Safe to call more than once. */
  init() {
    return (this.#ready ??= this.#init());
  }

  async #init() {
    try {
      const index = await fetchJSON(`${ROOT}languages/index.json`);
      if (Array.isArray(index.languages) && index.languages.length) this.available = index.languages;
    } catch (err) {
      console.warn('[i18n] languages/index.json could not be loaded', err);
    }
    try {
      this.#fallback = await this.#load(FALLBACK);
    } catch (err) {
      console.warn('[i18n] fallback language could not be loaded', err);
    }
    await this.#use(settings.get('language'));
    settings.watch('language', async (code) => {
      if (code === this.lang) return;
      await this.#use(code);
      this.emit('change', this.lang);
    });
  }

  async #use(code) {
    if (!this.available.some((l) => l.code === code)) code = FALLBACK;
    if (code === FALLBACK) {
      this.#dict = this.#fallback;
    } else {
      try {
        this.#dict = await this.#load(code);
      } catch (err) {
        console.warn(`[i18n] ${code} could not be loaded`, err);
        this.#dict = this.#fallback;
        code = FALLBACK;
      }
    }
    this.lang = code;
    this.locale = `${code}-u-nu-latn`;
    this.dir = this.available.find((l) => l.code === code)?.dir === 'rtl' ? 'rtl' : 'ltr';
    this.#plural = new Intl.PluralRules(code);
    document.documentElement.lang = code;
    document.documentElement.dir = this.dir;
    this.apply(document);
  }

  has(key) {
    return typeof (lookup(this.#dict, key) ?? lookup(this.#fallback, key)) === 'string';
  }

  /** Translate a key. `{name}` placeholders are filled from `params`. */
  t(key, params) {
    let text = lookup(this.#dict, key);
    if (typeof text !== 'string') text = lookup(this.#fallback, key);
    if (typeof text !== 'string') return key;
    if (!params) return text;
    return text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
  }

  /** Pick `<key>.one` / `<key>.other` by count; `{count}` is filled in. */
  plural(key, count, params = {}) {
    const form = this.#plural.select(count);
    const full = this.has(`${key}.${form}`) ? `${key}.${form}` : `${key}.other`;
    return this.t(full, { count: this.number(count), ...params });
  }

  /**
   * Translate static markup:
   *   data-i18n="key"              -> text content
   *   data-i18n-title="key"        -> title attribute
   *   data-i18n-placeholder="key"  -> placeholder attribute
   *   data-i18n-label="key"        -> aria-label attribute
   *   data-i18n-tip="key"          -> data-tip (custom tooltip)
   */
  apply(root = document) {
    const each = (attr, fn) => root.querySelectorAll(`[${attr}]`).forEach((el) => fn(el, this.t(el.getAttribute(attr))));
    each('data-i18n', (el, text) => (el.textContent = text));
    each('data-i18n-title', (el, text) => el.setAttribute('title', text));
    each('data-i18n-placeholder', (el, text) => el.setAttribute('placeholder', text));
    each('data-i18n-label', (el, text) => el.setAttribute('aria-label', text));
    each('data-i18n-tip', (el, text) => (el.dataset.tip = text));
  }

  number(value, options) {
    return new Intl.NumberFormat(this.locale, options).format(value);
  }

  date(value, options) {
    return new Intl.DateTimeFormat(this.locale, options).format(value);
  }
}

export const i18n = new I18n();
export const t = (key, params) => i18n.t(key, params);
