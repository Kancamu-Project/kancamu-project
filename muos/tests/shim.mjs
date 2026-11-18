/**
 * Just enough of a browser for the pure parts of the system (the virtual disk,
 * settings, translations) to run under Node. Import this file first.
 */
const data = new Map();

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => void data.set(key, String(value)),
    removeItem: (key) => void data.delete(key),
    key: (index) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    }
  }
});

globalThis.window = globalThis;
globalThis.parent = globalThis; // not inside an app window
globalThis.addEventListener ??= () => {};
globalThis.document = { addEventListener() {}, documentElement: { lang: 'en-US' }, visibilityState: 'visible' };
