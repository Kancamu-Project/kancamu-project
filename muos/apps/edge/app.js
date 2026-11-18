import { os, t, i18n, h, icon, hydrateIcons, readJSON, writeJSON } from 'webos/sdk/app.js';

await os.ready;

// Started with the system, without a window: Edge only keeps an icon in the tray (behind the arrow), like a browser does on a desktop.
// A click on it, or "Open", brings up a window; "Exit" (added by the OS) stops it until the system starts again.
if (os.background) {
  const open = () => os.launch(os.appId);
  os.tray.set({ tooltip: t('app.name'), menu: [{ label: t('edge.trayOpen'), icon: 'open', action: open }] });
  os.tray.onClick(open);
  i18n.on('change', () => os.tray.set({ tooltip: t('app.name'), menu: [{ label: t('edge.trayOpen'), icon: 'open', action: open }] }));
  await new Promise(() => {}); // nothing else to build: there is no window
}

const $ = (id) => document.getElementById(id);
const page = $('page');
const start = $('start');
const urlInput = $('url');
const urlView = $('url-view');
const suggestEl = $('suggest');
const notice = $('notice');
const tabsEl = $('tabs');
const bookmarksEl = $('bookmarks');
const panelEl = $('panel');

/** Pages offered on the new tab page until real visits take their place. Sites decide themselves whether they can be shown in a frame. */
const LINKS = [
  ['Google', 'https://www.google.com/?igu=1'],
  ['Wikipedia', 'https://en.wikipedia.org/'],
  ['OpenStreetMap', 'https://www.openstreetmap.org/'],
  ['Wikimedia Commons', 'https://commons.wikimedia.org/'],
  ['Example Domain', 'https://example.com/']
];

const HISTORY_LIMIT = 300;
const TILE_LIMIT = 8;
const SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox';

const state = {
  tabs: [],
  activeId: null,
  noticeDismissed: false,
  panel: null, // null | 'history' | 'favorites'
  bookmarks: [],
  history: [],
  closed: [],
  showBar: true,
  suggestions: [],
  picked: -1
};
let sequence = 0;
let dragId = null;

const active = () => state.tabs.find((tab) => tab.id === state.activeId) ?? null;
const current = (tab = active()) => tab?.history[tab.index] ?? null;

/* ------------------------------ saved data ------------------------------- */

function loadData() {
  state.bookmarks = readJSON('edge.bookmarks', []);
  state.history = readJSON('edge.history', []);
  state.showBar = readJSON('edge.bar', true) !== false;
}

const save = (key, value) => {
  try {
    writeJSON(key, value);
  } catch {
    /* disk full: the page still works */
  }
};

const isBookmarked = (url) => state.bookmarks.some((b) => b.url === url);

function parse(url) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

const hostOf = (url) => parse(url)?.hostname.replace(/^www\./, '') || url;

/** A stable colour for a site, used for tiles and tab marks. */
function hue(text) {
  let n = 0;
  for (const ch of text) n = (n * 31 + ch.charCodeAt(0)) % 360;
  return n;
}

function mark(url, size = 16) {
  const host = hostOf(url);
  return h('span', { class: 'mark', style: `--hue:${hue(host)};--size:${size}px` }, host.charAt(0).toUpperCase());
}

function toggleBookmark() {
  const url = current();
  if (!url) return;
  state.bookmarks = isBookmarked(url) ? state.bookmarks.filter((b) => b.url !== url) : [...state.bookmarks, { title: hostOf(url), url }];
  save('edge.bookmarks', state.bookmarks);
  sync();
}

function removeBookmark(url) {
  state.bookmarks = state.bookmarks.filter((b) => b.url !== url);
  save('edge.bookmarks', state.bookmarks);
  sync();
}

function remember(url) {
  const before = state.history.find((entry) => entry.url === url);
  state.history = [{ url, time: Date.now(), visits: (before?.visits ?? 0) + 1 }, ...state.history.filter((entry) => entry.url !== url)].slice(0, HISTORY_LIMIT);
  save('edge.history', state.history);
}

/* --------------------------------- tabs ---------------------------------- */

/** What was typed -> a URL: addresses as they are, domains with https, anything else as a search. */
function resolve(text) {
  const value = text.trim();
  if (!value) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value;
  if (/^(localhost|[\w-]+(\.[\w-]+)+)(:\d+)?([/?#].*)?$/i.test(value) && !/\s/.test(value)) return `https://${value}`;
  return `https://www.google.com/search?igu=1&q=${encodeURIComponent(value)}`;
}

const looksLikeAddress = (text) => resolve(text)?.startsWith('https://') && !resolve(text).includes('google.com/search?igu=1&q=');

function load(tab, url) {
  tab.loading = true;
  clearTimeout(tab.timer);
  tab.timer = setTimeout(() => {
    tab.loading = false;
    sync();
  }, 15000);
  tab.frame.src = url;
}

function newTab(url = null, { background = false, from = null, at = null } = {}) {
  const frame = h('iframe', { class: 'frame', hidden: true, sandbox: SANDBOX, referrerpolicy: 'no-referrer' });
  const tab = { id: ++sequence, history: [], index: -1, frame, loading: false, timer: 0 };
  frame.addEventListener('load', () => {
    tab.loading = false;
    clearTimeout(tab.timer);
    sync();
  });
  if (at === null) state.tabs.push(tab);
  else state.tabs.splice(at, 0, tab);
  if (!background || !state.activeId) state.activeId = tab.id;
  // an empty frame fires "load" the moment it is attached, so the tab must be known by then
  page.append(frame);
  if (from) {
    tab.history = [...from.history];
    tab.index = from.index;
    if (current(tab)) load(tab, current(tab));
  } else if (url) go(tab, url);
  sync();
  return tab;
}

function closeTab(id, { keepOpen = false } = {}) {
  const at = state.tabs.findIndex((tab) => tab.id === id);
  if (at < 0) return;
  const tab = state.tabs[at];
  if (current(tab)) state.closed.push(current(tab));
  if (state.tabs.length === 1 && !keepOpen) return os.window.close();
  tab.frame.remove();
  clearTimeout(tab.timer);
  state.tabs.splice(at, 1);
  if (state.activeId === id) state.activeId = state.tabs[Math.min(at, state.tabs.length - 1)].id;
  sync();
}

function closeMany(ids) {
  for (const id of ids) closeTab(id, { keepOpen: true });
}

function reopenTab() {
  const url = state.closed.pop();
  if (url) newTab(url);
}

function activate(id) {
  state.activeId = id;
  sync();
}

function go(tab, text, { push = true } = {}) {
  const url = resolve(text);
  if (!url) return;
  if (push) {
    tab.history = tab.history.slice(0, tab.index + 1);
    tab.history.push(url);
    tab.index = tab.history.length - 1;
    remember(url);
  }
  load(tab, url);
  sync();
}

function move(delta) {
  const tab = active();
  const next = tab.index + delta;
  if (next < -1 || next >= tab.history.length) return;
  tab.index = next;
  if (current(tab)) load(tab, current(tab));
  else tab.frame.removeAttribute('src');
  tab.loading = false;
  sync();
}

function reload() {
  const tab = active();
  if (!current(tab)) return;
  if (tab.loading) {
    // The page of another site cannot be stopped from here, so the frame is emptied instead.
    tab.frame.src = 'about:blank';
    tab.loading = false;
    clearTimeout(tab.timer);
    return sync();
  }
  load(tab, current(tab));
  sync();
}

function home() {
  const tab = active();
  tab.index = -1;
  tab.loading = false;
  tab.frame.removeAttribute('src');
  sync();
  $('search-input').focus();
}

/* ------------------------------ rendering -------------------------------- */

function tabTitle(tab) {
  const url = current(tab);
  return url ? hostOf(url) : t('edge.newTab');
}

function tabIcon(tab) {
  const url = current(tab);
  if (tab.loading) return h('span', { class: 'spinner' });
  if (!url) return icon('globe', { size: 14 });
  return mark(url, 14);
}

function tabMenu(tab, event) {
  const at = state.tabs.indexOf(tab);
  os.menu(
    [
      { label: t('edge.newTabButton'), icon: 'plus', action: () => newTab(null, { at: at + 1 }) },
      { label: t('files.refresh'), icon: 'refresh', disabled: !current(tab), action: () => (activate(tab.id), reload()) },
      { label: t('edge.duplicateTab'), icon: 'copy', disabled: !current(tab), action: () => newTab(null, { from: tab, at: at + 1 }) },
      { separator: true },
      { label: t('edge.closeTab'), icon: 'dismiss', shortcut: 'Ctrl+W', action: () => closeTab(tab.id) },
      { label: t('edge.closeOthers'), disabled: state.tabs.length < 2, action: () => (activate(tab.id), closeMany(state.tabs.filter((other) => other !== tab).map((other) => other.id))) },
      { label: t('edge.closeRight'), disabled: at >= state.tabs.length - 1, action: () => closeMany(state.tabs.slice(at + 1).map((other) => other.id)) }
    ],
    event
  );
}

function renderTabs() {
  tabsEl.replaceChildren(
    ...state.tabs.map((tab) => {
      const close = h('button', { class: 'tab-close', type: 'button', 'aria-label': t('edge.closeTab'), tabIndex: -1 }, icon('dismiss', { size: 10 }));
      close.addEventListener('click', (e) => {
        e.stopPropagation();
        closeTab(tab.id);
      });
      const el = h('div', { class: `tab${tab.id === state.activeId ? ' is-active' : ''}`, role: 'tab', 'aria-selected': String(tab.id === state.activeId), tabIndex: 0, draggable: 'true', title: current(tab) ?? '' }, h('span', { class: 'tab-icon' }, tabIcon(tab)), h('span', { class: 'tab-title' }, tabTitle(tab)), close);
      el.addEventListener('click', () => activate(tab.id));
      el.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && activate(tab.id));
      el.addEventListener('auxclick', (e) => e.button === 1 && closeTab(tab.id));
      el.addEventListener('contextmenu', (e) => (e.preventDefault(), tabMenu(tab, e)));
      el.addEventListener('dragstart', (e) => {
        dragId = tab.id;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(tab.id));
      });
      el.addEventListener('dragover', (e) => dragId !== null && (e.preventDefault(), (e.dataTransfer.dropEffect = 'move')));
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        const from = state.tabs.findIndex((other) => other.id === dragId);
        const to = state.tabs.indexOf(tab);
        dragId = null;
        if (from < 0 || from === to) return;
        const [moved] = state.tabs.splice(from, 1);
        state.tabs.splice(to, 0, moved);
        sync();
      });
      el.addEventListener('dragend', () => (dragId = null));
      return el;
    }),
    h('button', { class: 'tbtn tab-add', type: 'button', 'aria-label': t('edge.newTabButton'), 'data-tip': t('edge.newTabButton'), onclick: () => newTab() }, icon('plus'))
  );
}

function renderBookmarks() {
  bookmarksEl.hidden = !state.showBar || !state.bookmarks.length;
  bookmarksEl.replaceChildren(
    ...state.bookmarks.map((bookmark) => {
      const el = h('button', { class: 'bookmark', type: 'button', title: bookmark.url }, mark(bookmark.url, 14), h('span', null, bookmark.title));
      el.addEventListener('click', () => go(active(), bookmark.url));
      el.addEventListener('auxclick', (e) => e.button === 1 && newTab(bookmark.url, { background: true }));
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        os.menu(
          [
            { label: t('edge.openNewTab'), icon: 'open', action: () => newTab(bookmark.url) },
            { label: t('edge.removeBookmark'), icon: 'delete', action: () => removeBookmark(bookmark.url) }
          ],
          e
        );
      });
      return el;
    })
  );
}

/** The address bar: a padlock for secure pages, and the site name stands out from the rest of the address. */
function renderAddress() {
  const url = state.panel === 'history' && !current() ? null : current();
  const parts = url ? parse(url) : null;
  const secure = parts?.protocol === 'https:';
  $('site').replaceChildren(url ? icon(secure ? 'lock' : 'globe', { size: 14 }) : icon('search', { size: 14 }));
  $('site').dataset.tip = url ? t(secure ? 'edge.secure' : 'edge.notSecure') : '';
  $('site').classList.toggle('is-warn', !!parts && !secure);
  urlView.replaceChildren();
  if (parts) {
    const rest = `${parts.pathname === '/' ? '' : parts.pathname}${parts.search}${parts.hash}`;
    urlView.append(h('b', null, parts.hostname), h('span', null, `${parts.port ? ':' + parts.port : ''}${rest}`));
    if (!secure) urlView.prepend(h('em', null, t('edge.notSecure')));
  }
  if (document.activeElement !== urlInput) urlInput.value = url ?? '';
  $('url').closest('.address').classList.toggle('has-value', !!url);
}

function dayLabel(time) {
  const day = (value) => new Date(value).setHours(0, 0, 0, 0);
  const diff = Math.round((day(Date.now()) - day(time)) / 86400000);
  if (diff <= 0) return t('edge.today');
  if (diff === 1) return t('edge.yesterday');
  return i18n.date(time, { dateStyle: 'long' });
}

function renderPanel() {
  panelEl.hidden = !state.panel;
  if (!state.panel) return;
  const isHistory = state.panel === 'history';
  $('panel-title').textContent = t(isHistory ? 'edge.history' : 'edge.favorites');
  $('panel-clear').hidden = !isHistory;
  $('panel-clear').textContent = t('edge.clearHistory');
  $('panel-clear').disabled = !state.history.length;
  $('panel-search').placeholder = t(isHistory ? 'edge.searchHistory' : 'edge.searchFavorites');
  const query = $('panel-search').value.trim().toLowerCase();
  const list = $('panel-list');
  list.replaceChildren();
  const match = (item) => !query || item.url.toLowerCase().includes(query) || (item.title ?? '').toLowerCase().includes(query);
  const items = (isHistory ? state.history : state.bookmarks).filter(match);
  if (!items.length) list.append(h('p', { class: 'empty' }, t(query ? 'edge.nothingFound' : isHistory ? 'edge.historyEmpty' : 'edge.favoritesEmpty')));
  let label = '';
  for (const item of items) {
    if (isHistory) {
      const day = dayLabel(item.time);
      if (day !== label) list.append(h('h3', { class: 'panel-day' }, (label = day)));
    }
    const remove = h('button', { class: 'tbtn panel-remove', type: 'button', 'aria-label': t(isHistory ? 'edge.removeFromHistory' : 'edge.removeBookmark'), 'data-tip': t(isHistory ? 'edge.removeFromHistory' : 'edge.removeBookmark') }, icon('dismiss', { size: 10 }));
    remove.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isHistory) {
        state.history = state.history.filter((entry) => entry.url !== item.url);
        save('edge.history', state.history);
        sync();
      } else removeBookmark(item.url);
    });
    const row = h('div', { class: 'panel-item', role: 'button', tabIndex: 0, title: item.url }, mark(item.url, 18), h('span', { class: 'panel-text' }, h('span', { class: 'panel-name' }, hostOf(item.url)), h('span', { class: 'panel-url' }, isHistory ? `${i18n.date(item.time, { timeStyle: 'short' })} · ${item.url}` : item.url)), remove);
    const open = (e) => (e.ctrlKey || e.metaKey ? newTab(item.url, { background: true }) : go(active(), item.url));
    row.addEventListener('click', open);
    row.addEventListener('keydown', (e) => e.key === 'Enter' && open(e));
    row.addEventListener('auxclick', (e) => e.button === 1 && newTab(item.url, { background: true }));
    list.append(row);
  }
}

/** Bring everything in line with the state. */
function sync() {
  const tab = active();
  const url = current(tab);
  for (const other of state.tabs) other.frame.hidden = other !== tab || !current(other);
  start.hidden = !!url;
  $('back').disabled = tab.index < 0;
  $('forward').disabled = tab.index >= tab.history.length - 1;
  $('reload').disabled = !url;
  $('reload').replaceChildren(icon(tab.loading ? 'dismiss' : 'refresh'));
  $('reload').dataset.tip = t(tab.loading ? 'edge.stop' : 'files.refresh');
  $('reload').setAttribute('aria-label', $('reload').dataset.tip);
  $('star').hidden = !url;
  $('star').classList.toggle('is-on', !!url && isBookmarked(url));
  $('star').dataset.tip = t(url && isBookmarked(url) ? 'edge.removeBookmark' : 'edge.bookmark');
  $('favorites').classList.toggle('is-on', state.panel === 'favorites');
  notice.hidden = !url || state.noticeDismissed;
  renderAddress();
  renderTabs();
  renderBookmarks();
  renderPanel();
  if (!start.hidden) buildTiles();
  os.window.setTitle(`${tabTitle(tab)} - ${t('app.name')}`);
}

/** The sites visited most, then the suggested ones. */
function topSites() {
  const counts = new Map();
  for (const entry of state.history) {
    const parts = parse(entry.url);
    if (!parts || !/^https?:$/.test(parts.protocol)) continue;
    const site = counts.get(parts.origin) ?? { url: `${parts.origin}/`, visits: 0, time: 0 };
    site.visits += entry.visits ?? 1;
    site.time = Math.max(site.time, entry.time);
    counts.set(parts.origin, site);
  }
  const sites = [...counts.values()].sort((a, b) => b.visits - a.visits || b.time - a.time).map((site) => [hostOf(site.url), site.url]);
  for (const link of LINKS) if (!sites.some(([, url]) => parse(url)?.origin === parse(link[1])?.origin)) sites.push(link);
  return sites.slice(0, TILE_LIMIT);
}

function buildTiles() {
  $('tiles').replaceChildren(
    ...topSites().map(([name, url]) => {
      const tile = h('button', { class: 'tile', type: 'button', title: url }, mark(url, 40), h('span', { class: 'tile-name' }, name));
      tile.addEventListener('click', () => go(active(), url));
      tile.addEventListener('auxclick', (e) => e.button === 1 && newTab(url, { background: true }));
      return tile;
    })
  );
}

function greeting() {
  const hour = new Date().getHours();
  return t(hour < 12 ? 'edge.greetingMorning' : hour < 18 ? 'edge.greetingAfternoon' : 'edge.greetingEvening');
}

function labels() {
  const set = (id, key) => {
    $(id).dataset.tip = t(key);
    $(id).setAttribute('aria-label', t(key));
  };
  set('back', 'edge.navBack');
  set('forward', 'edge.navForward');
  set('home', 'edge.home');
  set('menu', 'edge.menu');
  set('favorites', 'edge.favorites');
  set('panel-close', 'edge.closePanel');
  $('star').setAttribute('aria-label', t('edge.bookmark'));
  urlInput.placeholder = t('edge.addressPlaceholder');
  $('notice-text').textContent = t('edge.notice');
  $('notice-open').textContent = t('edge.external');
  $('start-title').textContent = greeting();
  $('search-input').placeholder = t('edge.searchPlaceholder');
  sync();
}

/* ------------------------------ suggestions ------------------------------ */

function computeSuggestions() {
  const text = urlInput.value.trim();
  const lower = text.toLowerCase();
  const items = [];
  const seen = new Set();
  const add = (item) => !seen.has(item.url) && (seen.add(item.url), items.push(item));
  if (text && urlInput.value !== current()) {
    const url = resolve(text);
    add({ url, label: looksLikeAddress(text) || /^[a-z]+:\/\//i.test(text) ? text : t('edge.searchFor', { query: text }), kind: looksLikeAddress(text) || /^[a-z]+:\/\//i.test(text) ? 'go' : 'search' });
  }
  const pool = [...state.bookmarks.map((b) => ({ ...b, kind: 'favorite' })), ...state.history.map((entry) => ({ url: entry.url, title: hostOf(entry.url), kind: 'history' }))];
  for (const item of pool) {
    if (items.length >= 7) break;
    if (!lower || item.url.toLowerCase().includes(lower) || (item.title ?? '').toLowerCase().includes(lower)) add({ url: item.url, label: item.url, kind: item.kind });
  }
  return items;
}

function renderSuggestions() {
  state.suggestions = document.activeElement === urlInput ? computeSuggestions() : [];
  state.picked = -1;
  suggestEl.hidden = !state.suggestions.length;
  urlInput.setAttribute('aria-expanded', String(!suggestEl.hidden));
  suggestEl.replaceChildren(
    ...state.suggestions.map((item, at) => {
      const el = h('div', { class: 'suggest-item', role: 'option', id: `suggest-${at}` }, icon(item.kind === 'search' ? 'search' : item.kind === 'favorite' ? 'star' : item.kind === 'history' ? 'clock' : 'globe', { size: 14 }), h('span', { class: 'suggest-label' }, item.label), item.kind === 'search' ? null : h('span', { class: 'suggest-kind' }, t(item.kind === 'favorite' ? 'edge.kindFavorite' : item.kind === 'history' ? 'edge.kindHistory' : 'edge.kindOpen')));
      el.addEventListener('mousedown', (e) => e.preventDefault());
      el.addEventListener('click', () => choose(item));
      return el;
    })
  );
}

function pick(delta) {
  if (!state.suggestions.length) return;
  state.picked = (state.picked + delta + state.suggestions.length + 1) % (state.suggestions.length + 1);
  if (state.picked === state.suggestions.length) state.picked = -1;
  [...suggestEl.children].forEach((el, at) => el.classList.toggle('is-picked', at === state.picked));
  if (state.picked >= 0) urlInput.value = state.suggestions[state.picked].url;
}

function choose(item) {
  urlInput.blur();
  go(active(), item.url);
}

/* -------------------------------- wiring --------------------------------- */

const openExternal = () => current() && window.open(current(), '_blank', 'noopener');

function openMenu() {
  os.menu(
    [
      { label: t('edge.newTabButton'), icon: 'plus', shortcut: 'Ctrl+T', action: () => newTab() },
      { label: t('edge.reopenTab'), shortcut: 'Ctrl+Shift+T', disabled: !state.closed.length, action: reopenTab },
      { separator: true },
      { label: t('edge.favorites'), icon: 'star', shortcut: 'Ctrl+Shift+O', action: () => showPanel('favorites') },
      { label: t('edge.history'), icon: 'clock', shortcut: 'Ctrl+H', action: () => showPanel('history') },
      { label: t('edge.showBar'), checked: state.showBar, action: () => ((state.showBar = !state.showBar), save('edge.bar', state.showBar), sync()) },
      { separator: true },
      { label: t('edge.external'), icon: 'open', disabled: !current(), action: openExternal },
      { label: t('edge.clearHistory'), icon: 'delete', disabled: !state.history.length, action: clearHistory }
    ],
    $('menu'),
    { placement: 'bottom-end' }
  );
}

function showPanel(name) {
  loadData();
  state.panel = state.panel === name ? null : name;
  $('panel-search').value = '';
  sync();
  if (state.panel) $('panel-search').focus();
}

function clearHistory() {
  state.history = [];
  save('edge.history', state.history);
  sync();
}

$('form').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = urlInput.value.trim();
  if (text === 'edge://history') return (urlInput.blur(), showPanel('history'));
  urlInput.blur();
  go(active(), text);
});
$('search').addEventListener('submit', (e) => {
  e.preventDefault();
  go(active(), $('search-input').value);
});
$('star').addEventListener('click', toggleBookmark);
$('back').addEventListener('click', () => move(-1));
$('forward').addEventListener('click', () => move(1));
$('reload').addEventListener('click', reload);
$('home').addEventListener('click', home);
$('favorites').addEventListener('click', () => showPanel('favorites'));
$('menu').addEventListener('click', openMenu);
$('site').addEventListener('click', () => urlInput.focus());
$('notice-open').addEventListener('click', openExternal);
$('notice-close').addEventListener('click', () => {
  state.noticeDismissed = true;
  sync();
});
$('panel-clear').addEventListener('click', clearHistory);
$('panel-close').addEventListener('click', () => ((state.panel = null), sync()));
$('panel-search').addEventListener('input', renderPanel);
urlInput.addEventListener('focus', () => {
  urlInput.select();
  renderSuggestions();
});
urlInput.addEventListener('input', renderSuggestions);
urlInput.addEventListener('blur', () => {
  state.suggestions = [];
  suggestEl.hidden = true;
  urlInput.setAttribute('aria-expanded', 'false');
  renderAddress();
});
urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') (e.preventDefault(), pick(1));
  else if (e.key === 'ArrowUp') (e.preventDefault(), pick(-1));
  else if (e.key === 'Escape') {
    if (!suggestEl.hidden) (e.stopPropagation(), (suggestEl.hidden = true));
    else (urlInput.value = current() ?? '', urlInput.blur());
  }
});

document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (mod && (key === 'l' || (key === 'k' && !e.shiftKey))) (e.preventDefault(), urlInput.focus());
  else if (mod && e.shiftKey && key === 't') (e.preventDefault(), reopenTab());
  else if (mod && key === 't') (e.preventDefault(), newTab());
  else if (mod && key === 'w') (e.preventDefault(), closeTab(state.activeId));
  else if (mod && key === 'd') (e.preventDefault(), toggleBookmark());
  else if (mod && e.shiftKey && key === 'o') (e.preventDefault(), showPanel('favorites'));
  else if (mod && key === 'h') (e.preventDefault(), showPanel('history'));
  else if (mod && /^[1-9]$/.test(e.key)) {
    e.preventDefault();
    const tab = e.key === '9' ? state.tabs.at(-1) : state.tabs[Number(e.key) - 1];
    if (tab) activate(tab.id);
  } else if (e.ctrlKey && e.key === 'Tab') {
    e.preventDefault();
    const at = state.tabs.findIndex((tab) => tab.id === state.activeId);
    activate(state.tabs[(at + (e.shiftKey ? state.tabs.length - 1 : 1)) % state.tabs.length].id);
  } else if (e.altKey && e.key === 'ArrowLeft') move(-1);
  else if (e.altKey && e.key === 'ArrowRight') move(1);
  else if (e.key === 'F5' || (mod && key === 'r')) (e.preventDefault(), !active().loading && reload());
  else if (e.key === 'Escape' && state.panel) ((state.panel = null), sync());
});
os.window.on('args', (args) => typeof args.url === 'string' && newTab(args.url));
os.window.on('activate', () => {
  loadData();
  sync();
});
i18n.on('change', labels);

hydrateIcons(document);
loadData();
newTab(typeof os.args.url === 'string' ? os.args.url : null);
labels();
if (!current()) $('search-input').focus();
