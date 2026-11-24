import { ROOT, fetchJSON } from './paths.js';
import { i18n } from './i18n.js';
import { FALLBACK_LANGUAGE } from '../config/i18n.js';
import { settings } from './settings.js';
import { DEFAULT_WINDOW } from '../config/apps.js';
import { brandName } from './osinfo.js';

/**
 * Registry of installed apps.
 *
 * Everything about an app is written in /apps.json (there is no manifest.json
 * in the app folders). What the OS and the Store say about an app is written once
 * per language, with the code of the language as the key:
 *   { "apps": [ {
 *     "id": "file-explorer",            short name, used in settings and commands
 *     "name": { "en-US": "File Explorer", "zh-CN": "文件资源管理器", "ar-SA": "مستكشف الملفات" },
 *     "description": { "en-US": "...", ... },
 *     "publisher": { "en-US": "{brand}", ... },   {brand} is the name written in /assets/data/brand.js
 *     "version": "1.0.0",
 *     "entry": "apps/file-explorer/index.html",   page loaded inside the window: an address, or a path relative to the OS root
 *     "icon": "apps/file-explorer/favicon.png",   an address, or a path relative to the OS root (like entry)
 *     "window": { "width": 960, "height": 620, "minWidth": 420, "minHeight": 300 },
 *     "roles": ["file-manager"],        lets the shell find "the settings app", "the terminal" ...
 *     "pinned": ["taskbar", "start"],  where it is pinned at first: the taskbar and/or Start (a missing list means Start only, [] means nowhere)
 *     "behaviors": ["removable", "installed"],   what is in the list is true, what is not is false:
 *                                       "singleInstance": opening it again focuses the open window instead of making a new one
 *                                       "removable": it can be uninstalled (without it the app is part of the system and stays out of the Store)
 *                                       "installed": it is there from the start (without it it appears once installed from the Store)
 *                                       "startup": it runs without a window when the system starts, with an icon in the tray (the user can switch it off in Settings)
 *     "categories": ["image", "utilities"],   tags for what it is for (the Store groups, filters and shows them as listed)
 *     "store": { "color": ["#0f7bd8", "#073761"], "featured": true },  how the Store shows it
 *     "deepLinks": [{ "title": { "en-US": "...", "zh-CN": "..." }, "args": { ... } }]   extra entries for Search
 *   } ] }
 * "en-US" is required for name, description and publisher and is the fallback: a language that
 * leaves a text out gets the English one. A text may also be written as a plain string, which then
 * is the English one. The languages files of an app (apps/<id>/languages) are only for what is
 * shown inside the app.
 *
 * There is no difference between an app of this project and a web site: both are
 * just an "entry" address, so an app folder can live anywhere. A page that loads
 * the app SDK can use the OS (as far as its "permissions" allow); one that does
 * not is shown inside the window as long as it allows being framed.
 */
class AppRegistry {
  /** Every app of apps.json (the catalog), installed or not. */
  all = [];
  #ready = null;

  /** The installed apps: what the user chose in the Store, otherwise the "installed" default of apps.json. */
  get list() {
    const chosen = settings.get('appInstall') || {};
    return this.all.filter((app) => chosen[app.id] ?? app.installed);
  }

  /** Load apps.json. Safe to call more than once. */
  init() {
    return (this.#ready ??= this.#load());
  }

  /** Inside an app page the list comes from the shell (it is already parsed). */
  load(list) {
    this.all = list;
    this.#ready = Promise.resolve(list);
  }

  async #load() {
    let list = [];
    try {
      let index = await fetchJSON(`${ROOT}apps.json`);
      // a text that says {brand} gets the name of the brand
      const brand = await brandName();
      if (brand) index = JSON.parse(JSON.stringify(index).replaceAll('{brand}', JSON.stringify(brand).slice(1, -1)));
      list = Array.isArray(index) ? index : index.apps ?? [];
    } catch (err) {
      console.warn('[apps] apps.json could not be loaded', err);
    }
    this.all = list.map((item) => AppRegistry.#parse(item)).filter(Boolean);
    return this.all;
  }

  /** A text of apps.json as { language: text }: a plain string is the English one. */
  static #perLanguage(value) {
    if (typeof value === 'string') return { [FALLBACK_LANGUAGE]: value };
    return value && typeof value === 'object' ? { ...value } : {};
  }

  /** One entry of apps.json -> an app, or null when it is not usable. */
  static #parse(m) {
    if (!m || typeof m !== 'object' || !m.id || !AppRegistry.#perLanguage(m.name)[FALLBACK_LANGUAGE]) {
      console.warn(`[apps] an entry of apps.json needs an "id" and a "name" with a "${FALLBACK_LANGUAGE}" text`, m);
      return null;
    }
    try {
      const entry = new URL(m.entry || `apps/${m.id}/index.html`, ROOT).href;
      const behaviors = Array.isArray(m.behaviors) ? m.behaviors.map(String) : [];
      const texts = Object.fromEntries(['name', 'description', 'publisher'].map((field) => [field, AppRegistry.#perLanguage(m[field])]));
      return {
        id: String(m.id),
        texts,
        // the fallback language, for code that does not follow the language shown
        name: texts.name[FALLBACK_LANGUAGE],
        description: texts.description[FALLBACK_LANGUAGE] || '',
        publisher: texts.publisher[FALLBACK_LANGUAGE] || '',
        version: m.version || '1.0.0',
        icon: new URL(m.icon || 'favicon.png', m.icon ? ROOT : entry).href, // like entry: an address or a path from the OS root; without it, favicon.png next to the page
        entry,
        // a page of another address than the OS, or in a folder beside it (shown as such; every page is treated the same)
        external: new URL(entry).origin !== new URL(ROOT).origin,
        // what the page may ask of the OS (see system/shell/protocol.js); null = the default
        permissions: Array.isArray(m.permissions) ? m.permissions.map(String) : null,
        window: { ...DEFAULT_WINDOW, ...m.window },
        behaviors,
        singleInstance: behaviors.includes('singleInstance'),
        removable: behaviors.includes('removable'),
        installed: behaviors.includes('installed'),
        startup: behaviors.includes('startup'),
        store: m.store && typeof m.store === 'object' ? m.store : {},
        roles: Array.isArray(m.roles) ? m.roles : [],
        // tags that say what the app is for (the Store groups, filters and shows them as they are listed)
        categories: Array.isArray(m.categories) ? m.categories.map(String) : [],
        // where the app is pinned from the start: a list of "taskbar" and/or "start" (the Start menu alone when left out)
        pinned: Array.isArray(m.pinned) ? m.pinned.map(String) : ['start'],
        deepLinks: (Array.isArray(m.deepLinks) ? m.deepLinks : []).map((link) => ({ ...link, title: AppRegistry.#perLanguage(link.title) }))
      };
    } catch (err) {
      console.warn(`[apps] "${m.id}" has an address that cannot be used`, err);
      return null;
    }
  }

  /** An installed app, or null (also for an app that is not installed). */
  get(id) {
    return this.list.find((app) => app.id === id) || null;
  }

  /** Any app of the catalog, installed or not. */
  getAny(id) {
    return this.all.find((app) => app.id === id) || null;
  }

  isInstalled(id) {
    return !!this.get(id);
  }

  /** Apps without "removable" in their behaviors (Settings, File Explorer, the Store ...) stay. */
  isRemovable(id) {
    return this.getAny(id)?.removable !== false;
  }

  /** Apps that can run in the background (they have "startup" in their behaviors) and are installed: what the Startup page of Settings lists. */
  startupCapable() {
    return this.list.filter((app) => app.startup);
  }

  /** True when the app is to be started with the system: it can, and the user has not switched it off. */
  startsAtBoot(appOrId) {
    const app = typeof appOrId === 'string' ? this.getAny(appOrId) : appOrId;
    if (!app?.startup) return false;
    return (settings.get('startupApps') || {})[app.id] ?? true;
  }

  setStartsAtBoot(id, on) {
    if (!this.getAny(id)?.startup) return;
    settings.set('startupApps', { ...(settings.get('startupApps') || {}), [id]: !!on });
  }

  setInstalled(id, installed) {
    if (!this.getAny(id) || (!installed && !this.isRemovable(id))) return;
    settings.set('appInstall', { ...(settings.get('appInstall') || {}), [id]: !!installed });
  }

  /** First app that declares the role ("file-manager", "settings", "terminal"). */
  byRole(role) {
    return this.list.find((app) => app.roles.includes(role)) || null;
  }

  #app(appOrId) {
    return typeof appOrId === 'string' ? this.get(appOrId) : appOrId;
  }

  /** A text of the app in the language shown, or in English when the app has none in it. */
  #text(app, field) {
    return app?.texts?.[field]?.[i18n.lang] || app?.texts?.[field]?.[FALLBACK_LANGUAGE] || '';
  }

  /** Display name in the current language. */
  name(appOrId) {
    return this.#text(this.#app(appOrId), 'name');
  }

  /** What the app does, in the current language. */
  description(appOrId) {
    return this.#text(this.#app(appOrId), 'description');
  }

  /** Who made the app. */
  publisher(appOrId) {
    return this.#text(this.#app(appOrId), 'publisher');
  }

  /** The title of a deep link (an entry of the app that Search can open) in the current language. */
  linkTitle(link) {
    return link.title?.[i18n.lang] || link.title?.[FALLBACK_LANGUAGE] || '';
  }

  /** Apps sorted by display name. */
  sorted() {
    return [...this.list].sort((a, b) => this.name(a).localeCompare(this.name(b), i18n.lang));
  }

  /* ---- pinning (stored in settings, defaults come from apps.json) ---- */

  pinnedTo(place) {
    const key = place === 'taskbar' ? 'taskbarPinned' : 'startPinned';
    const saved = settings.get(key);
    const ids = Array.isArray(saved) ? saved : this.list.filter((app) => app.pinned.includes(place)).map((app) => app.id);
    return ids.filter((id) => this.get(id));
  }

  isPinned(place, id) {
    return this.pinnedTo(place).includes(id);
  }

  setPinned(place, id, pinned) {
    const key = place === 'taskbar' ? 'taskbarPinned' : 'startPinned';
    const ids = this.pinnedTo(place).filter((other) => other !== id);
    if (pinned) ids.push(id);
    settings.set(key, ids);
  }
}

export const apps = new AppRegistry();
