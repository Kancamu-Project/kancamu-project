/**
 * App SDK - everything an app page needs to live inside the OS.
 *
 * An app is a web page like any other: it may be hosted in this project or on
 * any other address. It reaches the OS only through messages (see
 * system/sdk/channel.js and system/shell/protocol.js), so the page needs just
 * one thing from the OS: the address of this file. The OS passes it as the
 * `os` parameter of the page's address (".../index.html?os=https://host/").
 *
 *   <script>
 *     // tells the page where the OS is, so that 'webos/...' can be imported
 *     const os = new URLSearchParams(location.search).get('os') || new URL('../../', location.href).href;
 *     document.head.append(Object.assign(document.createElement('script'), { type: 'importmap', textContent: JSON.stringify({ imports: { 'webos/': os + 'system/' } }) }));
 *   </script>
 *   <script type="module">
 *     import { os, t, fs } from 'webos/sdk/app.js';
 *     await os.ready;                      // theme and language are applied
 *     os.window.setTitle('My app');
 *   </script>
 *
 * The same page also works when it is opened on its own in a browser tab
 * ("standalone"): window actions fall back to sensible browser behaviour.
 */
import { Emitter } from '../core/events.js';
import { ROOT } from '../core/paths.js';
import { settings } from '../core/settings.js';
import { i18n, t } from '../core/i18n.js';
import { fs, dirname, useFs } from '../core/fs.js';
import { apps } from '../core/apps.js';
import { clipboard } from '../core/clipboard.js';
import { watchClipboard } from '../core/clipboard-watch.js';
import { watchTheme } from '../core/system.js';
import { isEditable, rectOf, makeIcons } from '../core/dom.js';
import { showMenu, closeMenus } from '../ui/menu.js';
import { showDialog, alertDialog, confirmDialog, promptDialog } from '../ui/dialog.js';
import { initTooltips } from '../ui/tooltip.js';
import { useRemoteStore, applyRemoteStore } from '../core/store.js';
import { RemoteFs } from './remote-fs.js';
import { connect } from './channel.js';
import { SDK_STYLE_TIMEOUT, SDK_READY_DELAY } from '../config/shell.js';

/**
 * An app's own icons live in its folder (apps/<id>/icons). The helpers below
 * shadow the OS ones that `export *` brings in, so icon('x'), picture('x'),
 * iconUrl('x'), setIcon() and hydrateIcons() read icons/x.svg next to the page.
 */
const appIcons = makeIcons(new URL('icons/', new URL('./', window.location.href)).href);
export const { iconUrl, setIcon, icon, picture, hydrateIcons } = appIcons;

/**
 * Menu items become plain data for the trip to the shell: functions stay here,
 * every item gets an id, and the shell answers with the id that was chosen.
 */
function plainItems(items, table, prefix = '') {
  return Array.from(items, (item, index) => {
    if (!item || item.separator) return item;
    const id = `${prefix}${index}`;
    table.set(id, item);
    const copy = { id };
    for (const [key, value] of Object.entries(item)) if (typeof value !== 'function' && key !== 'items') copy[key] = value;
    if (copy.icon && !copy.iconUrl && !copy.iconSrc) {
      copy.iconSrc = appIcons.iconUrl(copy.icon);
      delete copy.icon;
    }
    if (item.items) copy.items = plainItems(item.items, table, `${id}.`);
    return copy;
  });
}

/** In a plain browser tab the menu is drawn by the page itself: only the icons need pointing at the app's folder. */
function withAppIcons(items) {
  return Array.from(items, (item) => {
    if (!item || item.separator) return item;
    const copy = { ...item };
    if (copy.icon && !copy.iconUrl && !copy.iconSrc) {
      copy.iconSrc = appIcons.iconUrl(copy.icon);
      delete copy.icon;
    }
    if (copy.items) copy.items = withAppIcons(copy.items);
    return copy;
  });
}

// Re-exports, so an app can import all it needs from this one file.
export { settings, i18n, t, apps, clipboard, showDialog, alertDialog, confirmDialog, promptDialog };
export * from '../core/fs.js';
export * from '../core/dom.js';
export * from '../core/format.js';
export * from '../core/filetypes.js';
export * from '../core/system.js';
export { describeError } from '../core/errors.js';
export { transfer, setDragPaths, prepareDragFiles, hasDragPaths, getDragPaths, dropInto } from '../core/clipboard.js';
export { attachMarquee } from '../ui/marquee.js';
export { OS_INFO, brandName } from '../core/osinfo.js';
export { usedSpace, clearAll, persistent, readJSON, writeJSON, removeKey, onExternalChange } from '../core/store.js';
export { ROOT, url } from '../core/paths.js';
export { playSound } from '../core/sound.js';
export { takeDropped, importDropped } from '../core/importer.js';
export { pickFile } from '../ui/filepicker.js';
export { showEntryProperties } from '../ui/properties.js';

/* ------------------------------ host connection ---------------------------- */

const channel = await connect();
// The strings of the page itself: a languages/ folder next to it (apps/<id>/languages/<code>.json). The OS keeps only its own.
i18n.addSource(new URL('languages/', window.location.href).href);

const events = new Emitter();
const root = document.documentElement;
root.classList.add(channel ? 'is-embedded' : 'is-standalone');

/** Calls whose answer the page does not wait for. */
const post = (method, params) => channel?.post(method, params);

if (channel) {
  const welcome = channel.welcome;

  // what the page stored, its settings and the disk: copies that the shell keeps up to date
  useRemoteStore(welcome.storage, (message) => {
    if (message.clearOwn) post('storage.clear');
    else if (message.remove) post('storage.remove', { key: message.key });
    else post('storage.set', { key: message.key, value: message.value });
  });
  settings.attach(welcome.settings, (message) => (message.reset ? post('settings.reset') : post('settings.update', { patch: message.patch })));
  clipboard.attach(welcome.files, (message) => (message.set ? post('clipboard.files.set', message.set) : post('clipboard.files.clear')));
  apps.load(welcome.apps ?? []);
  useFs(new RemoteFs((method, params) => channel.call(method, params), welcome.fs));

  channel.on('settings', ({ patch }) => settings.apply(patch));
  channel.on('fs', (update) => fs.apply(update));
  channel.on('files', ({ data }) => clipboard.apply(data));
  channel.on('storage', (message) => applyRemoteStore(message));
}

function hashArgs() {
  try {
    const raw = decodeURIComponent(window.location.hash.slice(1));
    const value = raw ? JSON.parse(raw) : {};
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

let active = channel ? channel.welcome.active : true;
root.classList.toggle('window-inactive', !active);

function toPosition(target, options) {
  const extra = { minWidth: options.minWidth };
  if (target instanceof Element) return { ...extra, anchor: rectOf(target), placement: options.placement || 'bottom-start', gap: options.gap };
  if (target && typeof target.clientX === 'number') return { ...extra, x: target.clientX, y: target.clientY };
  return { ...extra, x: target?.x ?? 0, y: target?.y ?? 0 };
}

const notificationClicks = new Map();
let trayItems = new Map(); // id -> the menu item of the tray icon (the functions stay here)
let notificationSeq = 0;
let closeGuard = null;

/* ----------------------------------- API ----------------------------------- */

export const os = {
  /** True when the page runs in a window of the OS, false in a plain browser tab. */
  embedded: !!channel,

  /** What this page may do (the "permissions" of its entry in apps.json). Everything when standalone. */
  permissions: channel ? channel.welcome.permissions : ['*'],

  /** Arguments the app was started with, e.g. { path: 'C:/Users' }. */
  args: channel ? channel.welcome.args ?? {} : hashArgs(),

  settings,
  i18n,
  t,
  fs,
  apps,
  clipboard,

  window: {
    get active() {
      return active;
    },
    /** Text of the title bar (and of the taskbar tooltip). Empty = app name. */
    setTitle(title) {
      if (channel) post('window.setTitle', { title });
      else if (title) document.title = title;
    },
    close() {
      if (channel) post('window.close');
      else if (window.history.length > 1) window.history.back();
      else window.close();
    },
    minimize() {
      post('window.minimize');
    },
    toggleMaximize() {
      post('window.toggleMaximize');
    },
    /**
     * Ask the app before its window is closed with the X button, sign out, restart
     * or shut down. `fn()` returns (a promise of) false to keep the window open.
     */
    onBeforeClose(fn) {
      closeGuard = typeof fn === 'function' ? fn : null;
      post('window.setCloseGuard', { on: !!closeGuard });
    },
    /** Report unsaved work, so the browser warns before the whole page is left. */
    setDirty(flag) {
      post('window.setDirty', { flag: !!flag });
    },
    /** Events: 'activate', 'deactivate', 'args' (the app was asked to open something else). */
    on(type, fn) {
      return events.on(type, fn);
    }
  },

  /** Start another app (or a new window of this one). Resolves true when it started. */
  async launch(appId, args = {}) {
    if (channel) return channel.call('launch.app', { appId, args });
    window.location.href = `${ROOT}apps/${appId}/index.html#${encodeURIComponent(JSON.stringify(args))}`;
    return true;
  },

  /** Open a file or folder of the virtual disk with the file manager. */
  async openPath(path) {
    if (channel) return channel.call('launch.openPath', { path });
    await apps.init();
    const manager = apps.byRole('file-manager');
    const entry = fs.stat(path);
    if (!manager || !entry) return;
    await os.launch(manager.id, entry.type === 'dir' ? { path: entry.path } : { path: dirname(entry.path), select: entry.name, preview: true });
  },

  /**
   * Show a context menu or drop-down menu.
   * `target` is a mouse event (menu at the pointer) or an element (menu below it).
   * Resolves with the chosen item or null. See /system/ui/menu.js for the item format.
   */
  async menu(items, target, options = {}) {
    const position = toPosition(target, options);
    if (!channel) return showMenu(withAppIcons(items), position);
    const table = new Map();
    const id = await channel.call('menu.show', { items: plainItems(items, table), position });
    const chosen = id == null ? null : table.get(id);
    if (!chosen) return null;
    try {
      chosen.action?.(chosen);
    } catch (err) {
      console.error('[menu] action failed', err);
    }
    return chosen;
  },

  closeMenus() {
    if (channel) post('menu.close');
    else closeMenus();
  },

  /**
   * Turn a button into a drop-down: a click opens the menu returned by
   * `getItems()`, a second click closes it again.
   */
  dropdown(button, getItems, options = {}) {
    let closedAt = 0;
    button.addEventListener('click', async () => {
      if (performance.now() - closedAt < 350) return; // this click just dismissed the open menu
      button.classList.add('is-open');
      button.setAttribute('aria-expanded', 'true');
      await os.menu(getItems(), button, options);
      closedAt = performance.now();
      button.classList.remove('is-open');
      button.setAttribute('aria-expanded', 'false');
    });
  },

  /** Show a notification: { title, body, onClick }. Does nothing when standalone. */
  notify(options = {}) {
    if (!channel) return null;
    const id = ++notificationSeq;
    if (options.onClick) notificationClicks.set(id, options.onClick);
    post('notify.show', { title: options.title, body: options.body, clickable: !!options.onClick, id });
    return id;
  },

  /** Take a screen snip (the window steps aside). Resolves { image: dataURL } or null. */
  snip(options = {}) {
    return channel ? channel.call('snip.start', { options }) : Promise.reject(Object.assign(new Error('unsupported'), { code: 'unsupported' }));
  },

  /** The clipboard history of the desktop (Alt+V). */
  clipboardHistory: {
    clear: () => post('clipboard.clearHistory')
  },

  /** The open windows of the whole desktop (used by tasklist / taskkill). */
  windows: {
    list: async () => (channel ? channel.call('windows.list') : []),
    close: (id) => post('windows.close', { id }),
    activate: (id) => post('windows.activate', { id }),
    get currentId() {
      return channel ? channel.welcome.windowId : null;
    }
  },

  /** What only the system itself may ask (Settings, Task Manager). Each call needs the "system" permission. */
  system: {
    /** CPU, memory and network readings of the whole page (null when standalone). */
    metrics: async () => (channel ? channel.call('system.metrics') : null),
    /** { used, persistent }: what the OS keeps in the browser's storage. */
    storageUsage: async () => (channel ? channel.call('storage.usage') : null),
    /** Forget everything the OS and all apps stored (factory reset). */
    resetStorage: async () => channel?.call('storage.clearAll'),
    /** Forget what one app (or one key of it) stored. */
    clearAppData: async (appId, key = null) => channel?.call('storage.clearOf', { appId, key })
  },

  /** The id of this app in apps.json (null when the page is not in the OS). */
  appId: channel ? channel.welcome.appId : null,

  /** True when the page was started with the system and has no window: it should only do what it runs for (a tray icon, ...). */
  background: !!channel?.welcome.background,

  /**
   * The icon of this app in the tray (permission "tray"): os.tray.set({ tooltip, menu }) with a menu in the
   * format of os.menu, os.tray.onClick(fn) for a click on the icon, os.tray.remove(). The OS adds "Exit" to the menu
   * of an app that runs in the background.
   */
  tray: {
    set(options = {}) {
      trayItems = new Map();
      post('tray.set', { tooltip: options.tooltip ?? '', items: plainItems(options.menu ?? [], trayItems) });
    },
    remove() {
      post('tray.remove');
    },
    onClick: (fn) => events.on('trayClick', fn)
  },

  /** 'lock' | 'signOut' | 'sleep' | 'restart' | 'shutDown' */
  power(action) {
    post('power.run', { action });
  },

  /** Resolves when theme, language and icons are ready. Render after awaiting it. */
  ready: null
};

if (channel) {
  const setActive = (value) => {
    active = value;
    root.classList.toggle('window-inactive', !value);
    events.emit(value ? 'activate' : 'deactivate');
  };
  channel.on('activate', () => setActive(true));
  channel.on('deactivate', () => setActive(false));
  // text chosen in the clipboard history goes into the field that has the focus
  channel.on('paste', ({ text } = {}) => {
    const el = document.activeElement;
    if (typeof text !== 'string' || !el || !(isEditable(el) || el.isContentEditable)) return;
    if (!document.execCommand('insertText', false, text) && 'setRangeText' in el) {
      el.setRangeText(text, el.selectionStart, el.selectionEnd, 'end');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  watchClipboard((item) => post('clipboard.add', { item }));
  channel.on('args', (args) => {
    os.args = args ?? {};
    events.emit('args', os.args);
  });
  channel.on('closeRequest', async ({ rid }) => {
    let allow = true;
    try {
      allow = (await closeGuard?.()) !== false;
    } catch (err) {
      console.error('[window] close guard failed', err);
    }
    post('window.closeAnswer', { rid, allow });
  });
  channel.on('trayClick', () => events.emit('trayClick'));
  channel.on('trayItem', ({ id }) => {
    const item = trayItems.get(id);
    try {
      item?.action?.(item);
    } catch (err) {
      console.error('[tray] action failed', err);
    }
  });
  channel.on('notificationClick', ({ id }) => {
    const fn = notificationClicks.get(id);
    notificationClicks.delete(id);
    fn?.();
  });
}

/* --------------------------------- start-up -------------------------------- */

// An app is not a web page: no browser context menu (except in text fields),
// and dropping a real file on it must not navigate away.
document.addEventListener('contextmenu', (e) => {
  if (!isEditable(e.target)) e.preventDefault();
});
for (const type of ['dragover', 'drop']) {
  window.addEventListener(type, (e) => {
    if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault();
  });
}

// Global shortcuts (Alt+Q, Alt+W ...) must work while an app has the focus:
// pass key events that involve Alt or the Meta key on to the shell. The shell
// answers too late to cancel the browser's own action, so the page decides that
// itself: a key that is meant for the shell is never also used by the page.
if (channel) {
  for (const type of ['keydown', 'keyup']) {
    window.addEventListener(
      type,
      (e) => {
        const taskManager = e.ctrlKey && e.shiftKey && e.key === 'Escape';
        if (!e.altKey && e.key !== 'Alt' && e.key !== 'Meta' && e.key !== 'PrintScreen' && !taskManager) return;
        const data = { type: e.type, key: e.key, code: e.code, altKey: e.altKey, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, metaKey: e.metaKey };
        post('shortcut.key', { event: data });
        if (e.key !== 'Alt' && e.key !== 'Control' && e.key !== 'Shift') e.preventDefault();
      },
      true
    );
  }
}

/** The stylesheet every app shares comes from the OS, so a page only links its own CSS. */
function loadAppStyles() {
  if (document.querySelector('link[href$="style/app.css"]')) return Promise.resolve(); // the page's own start-up code linked it
  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = new URL('../../style/app.css', import.meta.url).href;
    link.onload = link.onerror = () => resolve();
    document.head.prepend(link);
    setTimeout(resolve, SDK_STYLE_TIMEOUT);
  });
}

os.ready = (async () => {
  watchTheme();
  initTooltips();
  await Promise.all([loadAppStyles(), i18n.init(), fs.init()]);
  hydrateIcons(document);
  i18n.apply(document);
  root.classList.add('os-ready');
})();

// Tell the window to fade the page in once the app has had a chance to render.
// (The timer covers a browser tab in the background, where no frames are drawn.)
os.ready.then(() => {
  const signal = () => post('window.ready');
  requestAnimationFrame(() => requestAnimationFrame(signal));
  setTimeout(signal, SDK_READY_DELAY);
});
