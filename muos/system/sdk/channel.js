/**
 * The page's side of the app protocol (see system/shell/protocol.js): the only
 * way a page talks to the OS around it. Messages are plain objects marked
 * `webos: 1`; the OS answers a "hello" with a "welcome" and a call with a
 * result, and sends events on its own.
 *
 * connect() resolves to a channel, or to null when the page is not inside a
 * window of the OS (opened on its own, or the OS does not answer).
 */
import { CHANNEL_TIMEOUT as TIMEOUT } from '../config/shell.js';

export function connect() {
  if (window.parent === window) return Promise.resolve(null);
  return new Promise((resolve) => {
    const listeners = new Map(); // event name -> Set of fn
    const waiting = new Map(); // call id -> { resolve, reject }
    let seq = 0;
    let welcome = null;

    const send = (message) => window.parent.postMessage({ webos: 1, ...message }, '*');

    const channel = {
      get welcome() {
        return welcome;
      },
      /** Call the OS; resolves with the result, rejects with an Error that has `code`. */
      call(method, params = {}) {
        return new Promise((ok, fail) => {
          const id = ++seq;
          waiting.set(id, { ok, fail });
          send({ kind: 'call', id, method, params });
        });
      },
      /** Call without waiting for the answer (changes the page already applied itself). */
      post(method, params = {}) {
        this.call(method, params).catch(() => {});
      },
      on(name, fn) {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name).add(fn);
        return () => listeners.get(name)?.delete(fn);
      }
    };

    const timer = setTimeout(() => {
      window.removeEventListener('message', onMessage);
      resolve(null); // nobody answered: a plain page that happens to sit in a frame
    }, TIMEOUT);

    function onMessage(e) {
      const data = e.data;
      if (e.source !== window.parent || !data || data.webos !== 1) return;
      if (data.kind === 'welcome' && !welcome) {
        clearTimeout(timer);
        welcome = data;
        resolve(channel);
      } else if (data.kind === 'result') {
        const pending = waiting.get(data.id);
        if (!pending) return;
        waiting.delete(data.id);
        if (data.ok) pending.ok(data.result);
        else pending.fail(Object.assign(new Error(data.error?.message ?? 'call failed'), { code: data.error?.code, path: data.error?.path }));
      } else if (data.kind === 'event') {
        for (const fn of [...(listeners.get(data.name) ?? [])]) {
          try {
            fn(data.data);
          } catch (err) {
            console.error(`[os] "${data.name}" listener failed`, err);
          }
        }
      }
    }
    window.addEventListener('message', onMessage);
    send({ kind: 'hello' });
  });
}
