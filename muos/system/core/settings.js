import { Emitter } from './events.js';
import { readJSON, writeJSON, onExternalChange } from './store.js';
import { DEFAULTS } from '../config/settings.js';
import { STORAGE_KEYS } from '../config/storage.js';
export { DEFAULTS } from '../config/settings.js';

const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);

class Settings extends Emitter {
  #data;
  #remote = null; // in an app page: sends a change to the shell

  constructor() {
    super();
    this.#data = { ...DEFAULTS, ...readJSON(STORAGE_KEYS.settings, {}) };
    onExternalChange(STORAGE_KEYS.settings, () => !this.#remote && this.#reload());
  }

  /**
   * Inside an app page the settings live in the shell: this page keeps a copy
   * (`values`) and sends every change as `send(patch)`. `apply()` takes the
   * changes the shell announces.
   */
  attach(values, send) {
    this.#remote = send;
    this.#data = { ...DEFAULTS, ...values };
  }

  apply(patch) {
    const previous = this.#data;
    this.#data = { ...DEFAULTS, ...this.#data, ...patch };
    this.#announce(previous);
  }

  get(key) {
    return this.#data[key];
  }

  all() {
    return { ...this.#data };
  }

  set(key, value) {
    this.update({ [key]: value });
  }

  /** Change several settings at once. Listeners get one "change" per key. */
  update(patch) {
    if (this.#remote) {
      const before = this.#data;
      this.#data = { ...DEFAULTS, ...this.#data, ...patch };
      this.#remote({ patch });
      this.#announce(before);
      return;
    }
    // Re-read first so a change made by another window is never overwritten.
    const stored = readJSON(STORAGE_KEYS.settings, {});
    const previous = this.#data;
    Object.assign(stored, patch);
    this.#data = { ...DEFAULTS, ...stored };
    try {
      writeJSON(STORAGE_KEYS.settings, stored);
    } catch (err) {
      console.warn('[settings] could not be saved', err);
    }
    this.#announce(previous);
  }

  /** Subscribe to one key. `fn(value)` runs on every change. */
  watch(key, fn, { immediate = false } = {}) {
    if (immediate) fn(this.#data[key]);
    return this.on('change', (changed, value) => {
      if (changed === key) fn(value);
    });
  }

  reset() {
    if (this.#remote) return this.#remote({ reset: true });
    const previous = this.#data;
    this.#data = { ...DEFAULTS };
    try {
      writeJSON(STORAGE_KEYS.settings, {});
    } catch {
      /* ignore */
    }
    this.#announce(previous);
  }

  #reload() {
    const previous = this.#data;
    this.#data = { ...DEFAULTS, ...readJSON(STORAGE_KEYS.settings, {}) };
    this.#announce(previous);
  }

  #announce(previous) {
    const keys = new Set([...Object.keys(previous), ...Object.keys(this.#data)]);
    for (const key of keys) {
      if (!same(previous[key], this.#data[key])) this.emit('change', key, this.#data[key]);
    }
  }
}

export const settings = new Settings();
