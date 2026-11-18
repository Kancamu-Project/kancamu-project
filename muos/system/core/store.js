/**
 * Persistent key/value storage shared by the shell and every app.
 *
 * Everything is kept in localStorage under the "webos:" prefix. Because the
 * shell and the app iframes are separate documents of the same origin, a write
 * made in one of them reaches all the others through the "storage" event.
 */
import { PREFIX } from '../config/storage.js';
export { PREFIX } from '../config/storage.js';

const memory = new Map();
let storage = null;
try {
  const probe = `${PREFIX}probe`;
  window.localStorage.setItem(probe, '1');
  window.localStorage.removeItem(probe);
  storage = window.localStorage;
} catch {
  storage = null; // private mode / blocked storage: fall back to memory
}

/** False when the browser refuses localStorage (nothing will be saved). */
export const persistent = storage !== null;

/**
 * Inside an app page the storage lives in the shell: the page keeps a copy of
 * what it stored (`data`: key -> value) and sends every change as `send(message)`.
 * The page's own localStorage is never used, so a page from another address
 * behaves the same as one of ours.
 */
let remote = null;

export function useRemoteStore(data, send) {
  remote = { data: { ...data }, send };
}

/** The shell says a key (or everything) of this page was forgotten. */
export function applyRemoteStore({ clear }) {
  if (!remote) return;
  if (clear == null) remote.data = {};
  else delete remote.data[clear];
}

export function readRaw(key) {
  if (remote) return key in remote.data ? JSON.stringify(remote.data[key]) : null;
  const k = PREFIX + key;
  if (!storage) return memory.has(k) ? memory.get(k) : null;
  try {
    return storage.getItem(k);
  } catch {
    return null;
  }
}

/** Throws (QuotaExceededError) when the browser storage is full. */
export function writeRaw(key, value) {
  if (remote) {
    const parsed = JSON.parse(value);
    remote.data[key] = parsed;
    remote.send({ key, value: parsed });
    return;
  }
  const k = PREFIX + key;
  if (!storage) {
    memory.set(k, value);
    return;
  }
  storage.setItem(k, value);
}

export function removeKey(key) {
  if (remote) {
    delete remote.data[key];
    remote.send({ key, remove: true });
    return;
  }
  const k = PREFIX + key;
  if (!storage) {
    memory.delete(k);
    return;
  }
  try {
    storage.removeItem(k);
  } catch {
    /* ignore */
  }
}

export function readJSON(key, fallback = null) {
  const raw = readRaw(key);
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeJSON(key, value) {
  writeRaw(key, JSON.stringify(value));
}

/** Number of characters used by all OS keys (roughly the bytes on disk). */
export function usedSpace() {
  let total = 0;
  if (remote) {
    for (const [k, v] of Object.entries(remote.data)) total += k.length + JSON.stringify(v).length;
    return total;
  }
  if (!storage) {
    for (const [k, v] of memory) total += k.length + String(v).length;
    return total;
  }
  try {
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k.startsWith(PREFIX)) total += k.length + (storage.getItem(k) || '').length;
    }
  } catch {
    /* ignore */
  }
  return total;
}

/** Remove every key that belongs to the OS (factory reset). */
export function clearAll() {
  if (remote) {
    remote.data = {};
    remote.send({ clearOwn: true });
    return;
  }
  if (!storage) {
    memory.clear();
    return;
  }
  const keys = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && k.startsWith(PREFIX)) keys.push(k);
  }
  keys.forEach((k) => storage.removeItem(k));
}

/**
 * Run `fn` whenever another document (shell, app window or browser tab)
 * changed the given key. Returns an unsubscribe function.
 */
export function onExternalChange(key, fn) {
  if (remote || !storage) return () => {};
  const k = PREFIX + key;
  const handler = (e) => {
    if (e.storageArea !== storage) return;
    if (e.key === null || e.key === k) fn(e);
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}
