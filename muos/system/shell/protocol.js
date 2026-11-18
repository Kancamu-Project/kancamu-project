import { showMenu, closeMenus } from '../ui/menu.js';
import { fs } from '../core/fs.js';
import { updateFor } from '../core/fs-sync.js';
import { settings, DEFAULTS } from '../core/settings.js';
import { clipboard } from '../core/clipboard.js';
import { apps } from '../core/apps.js';
import { readJSON, writeJSON, removeKey, usedSpace, clearAll, persistent, PREFIX } from '../core/store.js';
import { OPEN, PERMISSION_OF, PERMISSIONS, DEFAULT_PERMISSIONS, PUBLIC_SETTINGS, POWER_ACTIONS } from '../config/permissions.js';
import { CLOSE_ANSWER_TIMEOUT, METRICS_TICK, METRICS_MIN_SHELL_NODES, TRAY_MENU_MAX_ITEMS, TRAY_TOOLTIP_MAX_LENGTH } from '../config/shell.js';

/**
 * The OS side of the app protocol. Every window talks to the OS the same way,
 * whether its page is a built-in app or a web site from another address:
 * messages with `postMessage`, nothing else. A page says "hello" and gets a
 * "welcome" with what it is allowed to know; after that it sends calls
 * ({ webos: 1, kind: 'call', id, method, params }) and gets results
 * ({ kind: 'result', id, ok, result | error }); the OS sends events
 * ({ kind: 'event', name, data }) when something it cares about changes.
 *
 * A page can be in a window or, when its app has "startup" in its behaviors, in the background (system/shell/background.js);
 * the protocol treats both alike, a background page just has no window to speak of.
 *
 * What a page may do depends on the "permissions" of its entry in apps.json.
 * The app SDK (system/sdk/app.js) is the client of this protocol; a page can
 * also speak it without the SDK (see README).
 */

class ProtocolError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function createProtocol(shell) {
  const { wm } = shell;
  const channels = new Map(); // window id (or background id) -> { win, permissions, pending: Map }
  /** The window, or the background page, that a message came from. */
  const contextOf = (source) => wm.findByContentWindow(source) ?? shell.background?.findByContentWindow(source) ?? null;
  const everyContext = () => [...wm.list(), ...(shell.background?.list() ?? [])];

  /* ---------------------------------- helpers --------------------------------- */

  const permissionsOf = (app) => new Set(Array.isArray(app.permissions) ? app.permissions : DEFAULT_PERMISSIONS);
  const targetOrigin = (win) => {
    try {
      return new URL(win.app.entry).origin;
    } catch {
      return '*';
    }
  };

  function post(win, message) {
    try {
      win.iframe.contentWindow?.postMessage({ webos: 1, ...message }, targetOrigin(win));
    } catch {
      /* the window is gone */
    }
  }
  const event = (win, name, data) => post(win, { kind: 'event', name, data });

  const publicSettings = () => Object.fromEntries(PUBLIC_SETTINGS.map((key) => [key, settings.get(key)]));
  const settingsFor = (channel) => (channel.permissions.has('settings') ? settings.all() : publicSettings());

  /** The storage of one page: the keys it wrote, under its own prefix. */
  const storageKey = (appId, key) => `app.${appId}/${key}`;
  function storageOf(appId) {
    const prefix = `${PREFIX}app.${appId}/`;
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const name = localStorage.key(i);
      if (!name?.startsWith(prefix)) continue;
      try {
        out[name.slice(prefix.length)] = JSON.parse(localStorage.getItem(name));
      } catch {
        /* a value that is not JSON is not ours */
      }
    }
    return out;
  }

  /* --------------------------------- long tasks --------------------------------- */

  // what Task Manager shows: measured here, because only the shell can see the whole page
  let busy = {}; // 'app:<id>' | 'shell' -> milliseconds since the last reading
  let drift = 0;
  let lastTick = performance.now();
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const id = /\/apps\/([^/]+)\//.exec(entry.attribution?.[0]?.containerSrc ?? '')?.[1];
        const name = id ? `app:${id}` : 'shell';
        busy[name] = (busy[name] ?? 0) + entry.duration;
      }
    }).observe({ entryTypes: ['longtask'] });
  } catch {
    /* long tasks are not reported by this browser */
  }
  setInterval(() => {
    const now = performance.now();
    drift += Math.max(0, now - lastTick - METRICS_TICK);
    lastTick = now;
  }, METRICS_TICK);

  function networkBytes() {
    let sum = 0;
    try {
      for (const entry of performance.getEntriesByType('resource')) sum += entry.transferSize || entry.encodedBodySize || 0;
    } catch {
      /* no resource timing */
    }
    return sum;
  }

  function weightOf(win) {
    try {
      const doc = win.iframe.contentDocument;
      if (!doc) return { nodes: 200, media: 0 };
      let media = 0;
      for (const el of doc.querySelectorAll('canvas')) media += el.width * el.height * 4;
      for (const el of doc.querySelectorAll('img')) media += (el.naturalWidth || 0) * (el.naturalHeight || 0) * 4;
      return { nodes: doc.getElementsByTagName('*').length, media };
    } catch {
      return { nodes: 200, media: 0 }; // a page from another address cannot be looked into
    }
  }

  function metrics() {
    const taken = { busy, drift };
    busy = {};
    drift = 0;
    const all = document.getElementsByTagName('*').length;
    const inWindows = [...document.querySelectorAll('.window')].reduce((sum, el) => sum + el.getElementsByTagName('*').length, 0);
    const connection = navigator.connection;
    return {
      busy: taken.busy,
      drift: taken.drift,
      memory: { used: performance.memory?.usedJSHeapSize ?? 0, limit: performance.memory?.jsHeapSizeLimit ?? 0 },
      weights: Object.fromEntries(everyContext().map((win) => [win.id, weightOf(win)])),
      shellNodes: Math.max(METRICS_MIN_SHELL_NODES, all - inWindows),
      network: networkBytes(),
      pageStart: performance.timeOrigin,
      cores: navigator.hardwareConcurrency || 1,
      deviceMemory: navigator.deviceMemory ?? null,
      online: navigator.onLine,
      connection: connection ? { effectiveType: connection.effectiveType, downlink: connection.downlink, rtt: connection.rtt } : null
    };
  }

  /* ----------------------------------- handlers ----------------------------------- */

  /** Every call: (params, channel) -> result. A call fails by throwing. */
  const handlers = {
    'window.ready': (_, { win }) => win.el?.classList.add('is-ready'),
    'window.setTitle': ({ title }, { win }) => wm.setTitle(win.id, String(title ?? '')),
    'window.close': (_, { win }) => (win.background ? shell.background.end(win.appId) : wm.close(win.id)),
    'window.minimize': (_, { win }) => wm.minimize(win.id),
    'window.toggleMaximize': (_, { win }) => wm.toggleMaximize(win.id),
    'window.focus': (_, { win }) => wm.activate(win.id),
    'window.setDirty': ({ flag }, { win }) => {
      win.dirty = !!flag;
    },
    /** The page keeps the right to veto closing its window (unsaved work). */
    'window.setCloseGuard': ({ on }, channel) => {
      const { win } = channel;
      win.closeGuard = on
        ? () =>
            new Promise((resolve) => {
              const rid = ++requestSeq;
              channel.pending.set(rid, resolve);
              event(win, 'closeRequest', { rid });
              setTimeout(() => resolve(true), CLOSE_ANSWER_TIMEOUT); // a page that does not answer does not keep its window
            })
        : null;
    },
    'window.closeAnswer': ({ rid, allow }, channel) => {
      channel.pending.get(rid)?.(allow !== false);
      channel.pending.delete(rid);
    },
    'menu.show': ({ items, position }, { win }) => showMenu(items, toScreen(win, position)).then((item) => item?.id ?? null),
    'menu.close': () => closeMenus(),
    'shortcut.key': ({ event: key }) => shell.shortcuts.handle(key),

    'notify.show': ({ title, body, clickable, id }, { win }) => {
      shell.notifications.notify({ title, body, appId: win.appId, onClick: clickable ? () => event(win, 'notificationClick', { id }) : null });
      return null;
    },
    'launch.app': ({ appId, args }) => !!shell.launch(appId, args ?? {}),
    'launch.openPath': ({ path }) => void shell.openPath(path),
    'windows.list': () => [
      ...wm.list().map((w) => ({ id: w.id, appId: w.appId, title: w.title, active: wm.activeId === w.id, minimized: w.minimized, opened: w.opened, desktop: w.desktop })),
      // the pages that run without a window: Task Manager lists them as background processes
      ...(shell.background?.list() ?? []).map((b) => ({ id: b.id, appId: b.appId, title: apps.name(b.app), background: true, active: false, minimized: false, opened: b.opened, desktop: null }))
    ],
    'windows.close': ({ id }) => {
      const background = shell.background?.findById(id);
      if (background) shell.background.end(background.appId);
      else wm.close(id);
    },
    'windows.activate': ({ id }) => wm.activate(id),
    'power.run': ({ action }) => {
      if (POWER_ACTIONS.has(action)) shell.power[action]();
      return null;
    },
    'snip.start': ({ options }, { win }) => shell.snip.start(options, win.id),
    'clipboard.add': ({ item }) => shell.clipboardHistory.add(item),
    'clipboard.clearHistory': () => shell.clipboardHistory.clear(),
    'clipboard.files.set': ({ op, paths }) => clipboard.set(op, paths),
    'clipboard.files.clear': () => clipboard.clear(),

    'settings.update': ({ patch }) => {
      const clean = {};
      for (const [key, value] of Object.entries(patch ?? {})) if (key in DEFAULTS) clean[key] = value;
      settings.update(clean);
    },
    'settings.reset': () => settings.reset(),

    'storage.set': ({ key, value }, { win }) => writeJSON(storageKey(win.appId, key), value),
    'storage.remove': ({ key }, { win }) => removeKey(storageKey(win.appId, key)),
    'storage.clear': (_, { win }) => handlers['storage.clearOf']({ appId: win.appId }, { win }),
    'storage.usage': () => ({ used: usedSpace(), persistent }),
    'storage.clearAll': () => clearAll(),
    /** Forget what one page (or one of its keys) stored; Settings uses it to clear activity data. */
    'storage.clearOf': ({ appId = null, key = null }) => {
      // no app: a key of the desktop itself (a call without a key would wipe everything of the OS)
      if (!appId && key == null) throw new ProtocolError('EINVAL', 'a key is needed');
      const prefix = appId ? `${PREFIX}app.${appId}/` : PREFIX;
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const name = localStorage.key(i);
        if (name?.startsWith(prefix) && (key == null || name === prefix + key)) localStorage.removeItem(name);
      }
      if (appId) for (const channel of channels.values()) if (channel.win.appId === appId) event(channel.win, 'storage', { clear: key });
      return null;
    },

    'fs.readFile': ({ path }) => fs.readFile(path),
    'fs.readData': ({ path }) => fs.readData(path),
    'fs.writeFile': ({ path, content, options }) => fs.writeFile(path, content, options),
    'fs.writeLink': ({ path, href, size }) => fs.writeLink(path, href, size),
    'fs.mkdir': ({ path, options }) => fs.mkdir(path, options),
    'fs.remove': ({ path, options }) => fs.remove(path, options),
    'fs.rename': ({ path, newName }) => fs.rename(path, newName),
    'fs.move': ({ path, destDir, options }) => fs.move(path, destDir, options),
    'fs.copy': ({ path, destDir, options }) => fs.copy(path, destDir, options),
    'fs.trash': ({ path }) => fs.trash(path),
    'fs.restore': ({ id }) => fs.restore(id),
    'fs.purge': ({ id }) => fs.purge(id),
    'fs.emptyTrash': () => fs.emptyTrash(),
    'fs.flush': () => fs.flush(),
    'fs.wipe': () => fs.wipe(),

    'system.metrics': () => metrics(),

    /** The icon of the app in the tray: a tooltip and a menu of plain items; the page hears about clicks and choices. */
    'tray.set': ({ tooltip, items }, { win }) => {
      const clean = (Array.isArray(items) ? items : []).slice(0, TRAY_MENU_MAX_ITEMS).map((item) =>
        item?.separator ? { separator: true } : { id: String(item?.id ?? ''), label: String(item?.label ?? ''), iconSrc: item?.iconSrc ? String(item.iconSrc) : undefined, disabled: !!item?.disabled, checked: !!item?.checked, danger: !!item?.danger }
      );
      shell.tray.set(win.appId, { owner: win.id, tooltip: String(tooltip ?? '').slice(0, TRAY_TOOLTIP_MAX_LENGTH), items: clean });
      return null;
    },
    'tray.remove': (_, { win }) => {
      if (shell.tray.ownerOf(win.appId) === win.id) shell.tray.remove(win.appId);
      return null;
    }
  };
  let requestSeq = 0;

  /** A point or a rectangle in the page's own coordinates -> on the screen. */
  function toScreen(win, pos = {}) {
    const frame = win.iframe.getBoundingClientRect();
    if (pos.anchor) {
      const a = pos.anchor;
      return { ...pos, anchor: { left: a.left + frame.left, right: a.right + frame.left, top: a.top + frame.top, bottom: a.bottom + frame.top, width: a.width, height: a.height } };
    }
    return { ...pos, x: (pos.x ?? 0) + frame.left, y: (pos.y ?? 0) + frame.top };
  }

  /* ----------------------------------- messages ----------------------------------- */

  function hello(win) {
    // a page that is loaded again starts without listeners, guard or pending questions
    channels.get(win.id)?.pending.forEach((resolve) => resolve(true));
    const channel = { win, permissions: permissionsOf(win.app), pending: new Map() };
    channels.set(win.id, channel);
    win.closeGuard = null;
    win.dirty = false;
    win.handlers = {};
    for (const name of ['activate', 'deactivate', 'args', 'paste']) (win.handlers[name] ??= new Set()).add((data) => event(win, name, data ?? null));
    const welcome = {
      kind: 'welcome',
      windowId: win.id,
      appId: win.appId,
      args: win.args,
      background: !!win.background,
      active: win.background ? false : wm.activeId === win.id,
      permissions: [...channel.permissions],
      settings: settingsFor(channel),
      storage: storageOf(win.appId),
      apps: channel.permissions.has('apps') ? apps.all : [],
      files: channel.permissions.has('clipboard') ? clipboard.get() : null
    };
    welcome.fs = channel.permissions.has('fs') ? fs.snapshot() : { dirs: { 'c:/': [] }, root: null, trash: [], usage: fs.usage(), persistent: fs.persistent };
    post(win, welcome);
  }

  async function call(channel, message) {
    const { win } = channel;
    const { id, method, params } = message;
    const reply = (body) => post(win, { kind: 'result', id, ...body });
    try {
      const handler = handlers[method];
      if (!handler) throw new ProtocolError('ENOSYS', `unknown call: ${method}`);
      const needs = PERMISSION_OF[method];
      // secure by default: a call that is neither open nor listed needs nothing it can be given, so it is refused
      if (!OPEN.has(method) && (!needs || !channel.permissions.has(needs))) throw new ProtocolError('EACCES', `"${win.appId}" has no "${needs ?? method}" permission`);
      const result = await handler(params ?? {}, channel);
      reply({ ok: true, result: result === undefined ? null : result });
    } catch (err) {
      reply({ ok: false, error: { code: err?.code ?? 'EFAIL', message: String(err?.message ?? err), path: err?.path ?? '' } });
    }
  }

  window.addEventListener('message', (e) => {
    const data = e.data;
    if (!data || data.webos !== 1 || typeof data.kind !== 'string') return;
    const win = contextOf(e.source);
    if (!win) return;
    if (data.kind === 'hello') return hello(win);
    const channel = channels.get(win.id);
    if (channel && data.kind === 'call' && typeof data.method === 'string') call(channel, data);
  });

  /* ------------------------------------ events ------------------------------------ */

  const each = (fn) => {
    for (const channel of channels.values()) if (channel.win.iframe.isConnected) fn(channel);
  };

  settings.on('change', (key, value) => {
    each((channel) => {
      if (channel.permissions.has('settings') || PUBLIC_SETTINGS.includes(key)) event(channel.win, 'settings', { patch: { [key]: value } });
    });
  });
  fs.on('change', (change) => {
    const forFs = [...channels.values()].filter((channel) => channel.permissions.has('fs'));
    if (!forFs.length) return;
    const update = updateFor(fs, change);
    for (const channel of forFs) if (channel.win.iframe.isConnected) event(channel.win, 'fs', update);
  });
  clipboard.on('change', () => {
    const data = clipboard.get();
    each((channel) => channel.permissions.has('clipboard') && event(channel.win, 'files', { data }));
  });
  // a window or a background page that goes takes its tray icon and its open questions with it
  const gone = (win) => {
    const channel = channels.get(win.id);
    channel?.pending.forEach((resolve) => resolve(true));
    channels.delete(win.id);
    shell.tray?.removeOwner(win.id);
  };
  wm.on('close', gone);
  shell.background?.on('stop', gone);

  // what happens to the icon goes to the page that put it there
  const owner = (appId) => channels.get(shell.tray?.ownerOf(appId));
  shell.tray?.on('click', (appId) => owner(appId) && event(owner(appId).win, 'trayClick', null));
  shell.tray?.on('item', (appId, id) => owner(appId) && event(owner(appId).win, 'trayItem', { id }));
  shell.tray?.on('exit', (appId) => shell.background?.end(appId));

  return { PERMISSION_OF, PERMISSIONS, handlers };
}
