import {
  os,
  t,
  i18n,
  settings,
  apps,
  clipboard,
  fs,
  join,
  dirname,
  basename,
  isInside,
  HOME,
  ROOT_PATH,
  KNOWN_FOLDERS,
  TRASH,
  h,
  icon,
  clear,
  iconUrl,
  formatBytes,
  formatKB,
  formatDateTime,
  iconFor,
  kindOf,
  typeLabel,
  isTextual,
  describeError,
  setDragPaths,
  prepareDragFiles,
  hasDragPaths,
  getDragPaths,
  dropInto,
  takeDropped,
  importDropped,
  attachMarquee,
  alertDialog,
  confirmDialog,
  showDialog,
  showEntryProperties,
  openersFor
} from 'webos/sdk/app.js';

await os.ready;
await apps.init();

/* Locations are real folders ("C:/Users/Kanca") or one of these virtual places. */
const HOME_LOC = 'shell:home';
const PC_LOC = 'shell:pc';
const isReal = (loc) => !loc.startsWith('shell:');

const $ = (id) => document.getElementById(id);
const els = {
  tabs: $('tabs'),
  commandbar: $('commandbar'),
  back: $('nav-back'),
  forward: $('nav-forward'),
  up: $('nav-up'),
  refresh: $('nav-refresh'),
  address: $('address'),
  search: $('search'),
  sidebar: $('sidebar'),
  content: $('content'),
  head: $('content-head'),
  preview: $('preview'),
  count: $('status-count'),
  selection: $('status-selection'),
  viewDetails: $('view-details'),
  viewIcons: $('view-icons')
};

/** How the files are laid out, from the most compact to the biggest ("icons" was the old name of one size). */
const VIEWS = ['details', 'list', 'small', 'medium', 'large', 'xl', 'tiles'];
const normalizeView = (view) => (view === 'icons' ? 'medium' : VIEWS.includes(view) ? view : 'details');

/**
 * What the window shows right now. The fields up to `focus` belong to the open
 * tab: switching tabs saves them and loads those of the other tab.
 */
const state = {
  location: HOME_LOC,
  history: [],
  index: -1,
  sort: { key: 'name', dir: 1 },
  selection: new Set(),
  anchor: null,
  query: '',
  focus: null,
  // shared by all tabs
  mode: 'home', // 'folder' | 'search' | 'trash' | 'home' | 'pc'
  view: normalizeView(settings.get('explorerView')),
  items: [],
  sections: null, // groups shown by Home and This PC
  previewOpen: settings.get('explorerPane') === 'preview',
  detailsOpen: settings.get('explorerPane') === 'details',
  navPane: settings.get('explorerNavPane') !== false,
  renaming: false,
  editingAddress: false
};

/** The file shown in the preview pane. */
const preview = { path: null, dirty: false, field: null, shownPath: undefined, shownStamp: 0 };

const selfId = apps.byRole('file-manager')?.id ?? 'file-explorer';

/* -------------------------------- locations -------------------------------- */

function locationName(loc) {
  if (loc === HOME_LOC) return t('explorer.home');
  if (loc === PC_LOC) return t('explorer.thisPC');
  if (loc === TRASH) return t('desktop.recycleBin');
  if (loc === ROOT_PATH) return t('explorer.localDisk');
  return basename(loc);
}

function locationIcon(loc, className) {
  if (loc === HOME_LOC) return icon('home', { class: className });
  let name = 'c-folder';
  if (loc === PC_LOC) name = 'this-pc';
  else if (loc === TRASH) name = fs.trashCount() ? 'recycle-bin-full' : 'recycle-bin';
  else if (loc === ROOT_PATH) name = 'c-drive';
  else return h('img', { class: className, src: iconFor({ type: 'dir', path: loc, name: basename(loc) }), alt: '', draggable: false });
  return h('img', { class: className, src: iconUrl(name), alt: '', draggable: false });
}

/** Canonical form of a location, or null when it does not exist. */
function canonical(loc) {
  if (loc === HOME_LOC || loc === PC_LOC || loc === TRASH) return loc;
  const full = fs.resolve(loc);
  const entry = full ? fs.stat(full) : null;
  return entry?.type === 'dir' ? entry.path : null;
}

function crumbs(loc) {
  if (loc === HOME_LOC || loc === TRASH) return [{ label: locationName(loc), loc }];
  const list = [{ label: t('explorer.thisPC'), loc: PC_LOC }];
  if (loc === PC_LOC) return list;
  list.push({ label: t('explorer.localDisk'), loc: ROOT_PATH });
  let path = ROOT_PATH;
  for (const part of loc.slice(3).split('/').filter(Boolean)) {
    path = join(path, part);
    list.push({ label: part, loc: path });
  }
  return list;
}

/* --------------------------- navigation pane (tree) --------------------------- */

const byName = (a, b) => a.localeCompare(b, i18n.lang, { numeric: true, sensitivity: 'base' });
const QUICK_ACCESS = ['desktop', 'downloads', 'documents', 'pictures', 'music', 'videos'];

/** Folders that are open in the tree. A key is "<branch>:<location>", so the same folder can be open in one branch and closed in another. */
const expanded = new Set();
let revealedFor = null;

function subfolders(path) {
  try {
    return fs
      .list(path)
      .filter((entry) => entry.type === 'dir')
      .map((entry) => entry.path)
      .sort((a, b) => byName(basename(a), basename(b)));
  } catch {
    return [];
  }
}

const hasSubfolders = (path) => {
  try {
    return fs.list(path).some((entry) => entry.type === 'dir');
  } catch {
    return false;
  }
};

const knownNode = (key) => ({ loc: KNOWN_FOLDERS[key], label: t(`folders.${key}`), img: `folder-${key}` });
const driveNode = () => ({ loc: ROOT_PATH, label: t('explorer.localDisk'), img: 'c-drive' });

/** Children of a node: This PC holds the known folders and the drive; a folder holds its sub-folders. */
function childrenOf(node) {
  if (node.loc === PC_LOC) return [...Object.keys(KNOWN_FOLDERS).map(knownNode), driveNode()];
  return subfolders(node.loc).map((loc) => ({ loc, label: basename(loc) }));
}

const canExpand = (node) => node.loc === PC_LOC || (isReal(node.loc) && hasSubfolders(node.loc));

/** The tree as a flat list of rows (and separators), only following the folders that are open. */
function treeRows() {
  const rows = [{ branch: 'q', loc: HOME_LOC, label: t('explorer.home'), mono: 'home', depth: 0 }, { sep: true }];
  const add = (branch, node, depth) => {
    const key = `${branch}:${node.loc}`;
    const expandable = canExpand(node);
    const open = expandable && expanded.has(key);
    rows.push({ ...node, branch, key, depth, expandable, open });
    if (open) for (const child of childrenOf(node)) add(branch, child, depth + 1);
  };
  for (const key of QUICK_ACCESS) add('q', knownNode(key), 0);
  rows.push({ sep: true });
  add('pc', { loc: PC_LOC, label: t('explorer.thisPC'), img: 'this-pc' }, 0);
  rows.push({ sep: true }, { branch: 'q', loc: TRASH, label: t('desktop.recycleBin'), img: fs.trashCount() ? 'recycle-bin-full' : 'recycle-bin', depth: 0 });
  return rows;
}

/** Open the folders above the current location, so that it is visible in the tree. */
function revealCurrent() {
  const loc = state.location;
  if (!isReal(loc)) return;
  expanded.add(`pc:${PC_LOC}`);
  const known = Object.values(KNOWN_FOLDERS).find((path) => isInside(loc, path));
  if (!known) expanded.add(`pc:${ROOT_PATH}`);
  for (let path = dirname(loc); path !== loc; path = dirname(path)) {
    if (known ? !isInside(path, known) : false) break;
    expanded.add(`pc:${path}`);
    if (path === ROOT_PATH || path === known) break;
  }
}

function nodeIcon(node) {
  if (node.mono) return icon(node.mono);
  const src = node.img ? iconUrl(node.img) : iconFor({ type: 'dir', path: node.loc, name: basename(node.loc) });
  return h('img', { src, alt: '', draggable: false });
}

function toggleNode(key) {
  if (!expanded.delete(key)) expanded.add(key);
  renderSidebar();
}

/* -------------------------------- navigation ------------------------------- */

function navigate(loc, { push = true, select = null } = {}) {
  const target = canonical(loc);
  if (!target) return false;
  if (push && (state.index < 0 || state.history[state.index] !== target)) {
    state.history = state.history.slice(0, state.index + 1);
    state.history.push(target);
    state.index = state.history.length - 1;
  }
  state.location = target;
  state.query = '';
  els.search.value = '';
  state.selection = new Set(select ? [select] : []);
  state.anchor = select;
  refresh({ resetScroll: true });
  if (select) elFor(select)?.scrollIntoView({ block: 'nearest' });
  return true;
}

function go(delta) {
  const next = state.index + delta;
  if (next < 0 || next >= state.history.length) return;
  state.index = next;
  if (!navigate(state.history[next], { push: false })) {
    state.history.splice(next, 1); // the folder is gone
    state.index = Math.min(state.index, state.history.length - 1);
    updateNav();
  }
}

function parentOf(loc) {
  if (!isReal(loc)) return null;
  return loc === ROOT_PATH ? PC_LOC : dirname(loc);
}

function goUp() {
  const parent = parentOf(state.location);
  if (parent) navigate(parent, { select: isReal(parent) || parent === PC_LOC ? state.location : null });
}

/** Go to whatever was typed into the address bar. */
function goTo(text) {
  const lower = text.toLowerCase();
  const named = [HOME_LOC, PC_LOC, TRASH].find((loc) => lower === loc || lower === locationName(loc).toLowerCase());
  if (named) return navigate(named);
  const full = fs.resolve(text, isReal(state.location) ? state.location : ROOT_PATH);
  const entry = full ? fs.stat(full) : null;
  if (!entry) return alertDialog(t('explorer.notFoundTitle'), t('explorer.notFound', { path: text }));
  if (entry.type === 'dir') return navigate(entry.path);
  navigate(dirname(entry.path), { select: entry.path });
  os.openPath(entry.path);
}

/* ---------------------------------- items ---------------------------------- */

function makeItem(entry, extra = {}) {
  return {
    key: entry.path,
    kind: 'entry',
    entry,
    name: entry.name,
    isDir: entry.type === 'dir',
    icon: iconFor(entry),
    thumb: iconFor(entry, { thumbnail: true }),
    type: typeLabel(entry),
    size: entry.size,
    date: entry.mtime,
    folder: dirname(entry.path),
    ...extra
  };
}

function makeTrashItem(item) {
  const pseudo = { type: item.type, name: item.name, ext: item.ext, url: item.url };
  return {
    key: `trash:${item.id}`,
    kind: 'trash',
    trash: item,
    name: item.name,
    isDir: item.type === 'dir',
    icon: iconFor(pseudo),
    thumb: iconFor(pseudo, { thumbnail: true }),
    type: typeLabel(pseudo),
    size: item.size,
    date: item.deletedAt,
    folder: item.originalDir
  };
}

function sortItems(items) {
  const { key, dir } = state.sort;
  const collator = new Intl.Collator(i18n.lang, { numeric: true, sensitivity: 'base' });
  const values = { name: (i) => i.name, date: (i) => i.date, type: (i) => i.type, size: (i) => i.size ?? -1, folder: (i) => i.folder };
  const get = values[key] || values.name;
  return items.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1; // folders stay on top
    const x = get(a);
    const y = get(b);
    const result = typeof x === 'string' ? collator.compare(x, y) : x - y;
    return (result || collator.compare(a.name, b.name)) * dir;
  });
}

function load() {
  const loc = state.location;
  const query = state.query.toLowerCase();
  state.sections = null;

  if (loc === TRASH) {
    state.mode = 'trash';
    let list = fs.trashList().map(makeTrashItem);
    if (query) list = list.filter((item) => item.name.toLowerCase().includes(query));
    state.items = sortItems(list);
  } else if (query) {
    state.mode = 'search';
    const base = loc === HOME_LOC ? HOME : loc === PC_LOC ? ROOT_PATH : loc;
    state.items = sortItems(fs.search(base, query).map((entry) => makeItem(entry)));
  } else if (loc === HOME_LOC || loc === PC_LOC) {
    state.mode = loc === HOME_LOC ? 'home' : 'pc';
    const folders = Object.entries(KNOWN_FOLDERS)
      .map(([key, path]) => [key, fs.stat(path)])
      .filter(([, entry]) => entry)
      .map(([key, entry]) => makeItem(entry, { name: t(`folders.${key}`), sub: dirname(entry.path) }));
    if (loc === HOME_LOC) {
      const recent = fs.recent(HOME, 12).map((entry) => makeItem(entry, { sub: dirname(entry.path) }));
      state.sections = [
        { title: t('explorer.quickAccess'), items: folders },
        { title: t('explorer.recent'), items: recent, empty: t('start.noRecommended') }
      ];
    } else {
      const drive = makeItem(fs.stat(ROOT_PATH), { name: t('explorer.localDisk'), drive: true, icon: iconUrl('c-drive'), thumb: iconUrl('c-drive'), type: t('explorer.driveType') });
      state.sections = [
        { title: t('explorer.foldersTitle'), items: folders },
        { title: t('explorer.drives'), items: [drive] }
      ];
    }
    state.items = state.sections.flatMap((section) => section.items);
  } else {
    state.mode = 'folder';
    state.items = sortItems(fs.list(loc).map((entry) => makeItem(entry)));
  }

  const keys = new Set(state.items.map((item) => item.key));
  state.selection = new Set([...state.selection].filter((key) => keys.has(key)));
  if (state.anchor && !keys.has(state.anchor)) state.anchor = null;
}

const itemFor = (key) => state.items.find((item) => item.key === key) || null;
const elFor = (key) => [...els.content.querySelectorAll('.item')].find((el) => el.dataset.key === key) || null;
const selectedItems = () => state.items.filter((item) => state.selection.has(item.key));
const selectedEntries = () => selectedItems().filter((item) => item.kind === 'entry').map((item) => item.entry);
const currentDir = () => (state.mode === 'folder' ? state.location : null);

/* -------------------------------- rendering -------------------------------- */

function columns() {
  const name = { id: 'name', label: t('files.columns.name'), sort: 'name' };
  const size = { id: 'size', label: t('files.columns.size'), sort: 'size' };
  if (state.mode === 'trash') {
    return [name, { id: 'folder', label: t('explorer.columns.originalLocation'), sort: 'folder' }, { id: 'date', label: t('explorer.columns.dateDeleted'), sort: 'date' }, size];
  }
  if (state.mode === 'search') {
    return [name, { id: 'folder', label: t('explorer.columns.folder'), sort: 'folder' }, { id: 'date', label: t('files.columns.modified'), sort: 'date' }, size];
  }
  return [name, { id: 'date', label: t('files.columns.modified'), sort: 'date' }, { id: 'type', label: t('files.columns.type'), sort: 'type' }, size];
}

function cellText(item, id) {
  if (id === 'date') return formatDateTime(item.date);
  if (id === 'type') return item.type;
  if (id === 'size') return item.isDir ? '' : formatKB(item.size);
  return item.folder;
}

function emptyMessage() {
  if (state.mode === 'search' || (state.mode === 'trash' && state.query)) return t('explorer.noSearchResults');
  if (state.mode === 'trash') return t('explorer.trash.empty');
  return t('explorer.emptyFolder');
}

const itemClass = (item, base) => `${base} item${item.kind === 'entry' && clipboard.isCut(item.key) ? ' is-cut' : ''}`;

function renderList() {
  const cols = columns();
  const head = h(
    'div',
    { class: 'list-head' },
    cols.map((col) =>
      h(
        'button',
        { class: 'col-head', type: 'button', onclick: () => sortBy(col.sort) },
        h('span', null, col.label),
        state.sort.key === col.sort ? icon(state.sort.dir > 0 ? 'chevron-up' : 'chevron-down') : null
      )
    )
  );
  const rows = state.items.map((item) =>
    h(
      'div',
      { class: itemClass(item, 'row'), dataset: { key: item.key }, draggable: item.kind === 'entry' },
      cols.map((col) =>
        col.id === 'name'
          ? h('div', { class: 'cell cell-name' }, h('img', { src: item.icon, alt: '', draggable: false }), h('span', { class: 'item-name' }, item.name))
          : h('div', { class: `cell cell-${col.id}` }, cellText(item, col.id))
      )
    )
  );
  els.head.replaceChildren(head); // above the scrolling part, so the rows never pass under it
  els.content.append(h('div', { class: 'list' }, rows));
  if (!state.items.length) els.content.append(h('p', { class: 'empty' }, emptyMessage()));
}

/** Every layout except Details: icons in four sizes, List, and Tiles. */
function renderGrid() {
  if (!state.items.length) {
    els.content.append(h('p', { class: 'empty' }, emptyMessage()));
    return;
  }
  const compact = state.view === 'small' || state.view === 'list'; // 16 px icons, name beside them
  els.content.append(
    h(
      'div',
      { class: 'grid', dataset: { view: state.view } },
      state.items.map((item) =>
        h(
          'div',
          { class: itemClass(item, 'tile'), dataset: { key: item.key }, draggable: item.kind === 'entry' },
          h('img', { src: compact ? item.icon : item.thumb, alt: '', draggable: false }),
          state.view === 'tiles'
            ? h('span', { class: 'tile-text' }, h('span', { class: 'tile-name item-name' }, item.name), h('span', { class: 'tile-sub' }, item.type), item.isDir ? null : h('span', { class: 'tile-sub' }, formatKB(item.size)))
            : h('span', { class: 'tile-name item-name' }, item.name)
        )
      )
    )
  );
}

function driveUsage() {
  const usage = fs.usage();
  const ratio = usage.used / usage.capacity;
  return [
    h('div', { class: `usage${ratio > 0.9 ? ' is-full' : ''}` }, h('span', { style: { width: `${Math.max(1, ratio * 100)}%` } })),
    h('span', { class: 'place-sub' }, t('explorer.driveFree', { free: formatBytes(usage.free), total: formatBytes(usage.capacity) }))
  ];
}

function renderGroups() {
  const wrap = h('div', { class: 'groups' });
  for (const section of state.sections) {
    wrap.append(h('h2', { class: 'group-title' }, section.title));
    if (!section.items.length) {
      wrap.append(h('p', { class: 'empty' }, section.empty || ''));
      continue;
    }
    wrap.append(
      h(
        'div',
        { class: 'places' },
        section.items.map((item) =>
          h(
            'div',
            { class: itemClass(item, 'place'), dataset: { key: item.key }, draggable: !item.drive && !item.entry.system },
            h('img', { src: item.thumb, alt: '', draggable: false }),
            h('div', { class: 'place-text' }, h('span', { class: 'place-name item-name' }, item.name), item.drive ? driveUsage() : h('span', { class: 'place-sub' }, item.sub))
          )
        )
      )
    );
  }
  els.content.append(wrap);
}

/** Keep the column headers as wide as the list below and as far scrolled sideways. */
function syncHead() {
  const list = els.content.querySelector('.list');
  els.head.hidden = !els.head.firstChild || !list;
  if (els.head.hidden) return;
  els.head.style.setProperty('--list-width', `${list.offsetWidth}px`);
  els.head.style.setProperty('--gutter', `${els.content.offsetWidth - els.content.clientWidth}px`);
  els.head.scrollLeft = els.content.scrollLeft;
}
els.content.addEventListener('scroll', () => (els.head.scrollLeft = els.content.scrollLeft));
new ResizeObserver(syncHead).observe(els.content);

function renderContent() {
  const scroll = els.content.scrollTop;
  clear(els.content);
  els.head.replaceChildren();
  if (state.sections) renderGroups();
  else if (state.view === 'details') renderList();
  else renderGrid();
  els.content.scrollTop = scroll;
  syncHead();
  applySelection();
}

function applySelection() {
  for (const el of els.content.querySelectorAll('.item')) {
    const selected = state.selection.has(el.dataset.key);
    el.classList.toggle('is-selected', selected);
    el.setAttribute('role', 'option');
    el.setAttribute('aria-selected', String(selected));
  }
}

function renderAddress() {
  if (state.editingAddress) return;
  clear(els.address);
  els.address.classList.remove('is-editing');
  const wrap = h('div', { class: 'crumbs' });
  crumbs(state.location).forEach((crumb, index) => {
    if (index) wrap.append(icon('chevron-right', { class: 'crumb-sep' }));
    wrap.append(h('button', { class: 'crumb', type: 'button', dataset: { loc: crumb.loc }, onclick: () => navigate(crumb.loc) }, crumb.label));
  });
  els.address.append(locationIcon(state.location, 'address-icon'), wrap);
  wrap.scrollLeft = document.documentElement.dir === 'rtl' ? -wrap.scrollWidth : wrap.scrollWidth; // the end of the path, on the side where the text goes on
}

function editAddress() {
  if (state.editingAddress) return;
  state.editingAddress = true;
  const input = h('input', { class: 'address-input', type: 'text', spellcheck: false, autocomplete: 'off' });
  input.value = isReal(state.location) ? state.location : locationName(state.location);
  clear(els.address);
  els.address.classList.add('is-editing');
  els.address.append(locationIcon(state.location, 'address-icon'), input);
  input.focus();
  input.select();
  const finish = (commit) => {
    if (!state.editingAddress) return;
    state.editingAddress = false;
    const text = input.value.trim();
    renderAddress();
    if (commit && text) goTo(text);
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') finish(true);
    else if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(false));
}

function renderSidebar() {
  els.sidebar.hidden = !state.navPane;
  if (revealedFor !== state.location) {
    revealedFor = state.location;
    revealCurrent();
  }
  const focused = els.sidebar.contains(document.activeElement) ? document.activeElement.dataset.key : null;
  clear(els.sidebar);
  els.sidebar.setAttribute('role', 'tree');
  els.sidebar.setAttribute('aria-label', t('explorer.navPane'));
  let activeFound = false;
  for (const row of treeRows()) {
    if (row.sep) {
      els.sidebar.append(h('div', { class: 'side-sep' }));
      continue;
    }
    const key = row.key ?? `${row.branch}:${row.loc}`;
    const active = !activeFound && row.loc === state.location;
    if (active) activeFound = true;
    const chevron = h('span', { class: `tree-chev${row.expandable ? '' : ' is-empty'}${row.open ? ' is-open' : ''}`, 'aria-hidden': 'true' }, row.expandable ? icon('chevron-right', { size: 10 }) : null);
    const link = h(
      'button',
      {
        class: `side-link${active ? ' is-active' : ''}`,
        type: 'button',
        role: 'treeitem',
        tabIndex: active ? 0 : -1,
        'aria-level': String(row.depth + 1),
        'aria-selected': String(active),
        'aria-expanded': row.expandable ? String(!!row.open) : null,
        style: { '--depth': row.depth },
        dataset: { loc: row.loc, key },
        onclick: () => navigate(row.loc)
      },
      chevron,
      nodeIcon(row),
      h('span', null, row.label)
    );
    chevron.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleNode(key);
    });
    if (row.expandable) link.addEventListener('dblclick', () => toggleNode(key));
    link.addEventListener('pointerdown', (e) => e.button === 1 && e.preventDefault()); // no auto-scroll on a middle click
    link.addEventListener('auxclick', (e) => e.button === 1 && newTab(row.loc, { background: true }));
    link.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      os.menu(
        [
          { label: t('files.open'), icon: 'open', action: () => navigate(row.loc) },
          { label: t('explorer.tabs.openInNewTab'), icon: 'plus', action: () => newTab(row.loc) },
          { label: t('explorer.openNewWindow'), icon: 'window', action: () => os.launch(selfId, { path: row.loc }) },
          row.loc === TRASH && { separator: true },
          row.loc === TRASH && { label: t('files.emptyTrash'), icon: 'delete', disabled: fs.trashCount() === 0, action: emptyTrash }
        ],
        e
      );
    });
    els.sidebar.append(link);
  }
  if (!activeFound) els.sidebar.querySelector('.side-link')?.setAttribute('tabindex', '0');
  if (focused) [...els.sidebar.querySelectorAll('.side-link')].find((el) => el.dataset.key === focused)?.focus({ preventScroll: true });
}

function updateNav() {
  els.back.disabled = state.index <= 0;
  els.forward.disabled = state.index >= state.history.length - 1;
  els.up.disabled = !parentOf(state.location);
}

/* ---------------------------------- tabs ----------------------------------- */

const tabs = [];
let activeTab = null;
let tabSequence = 0;

const freshTabData = (loc) => ({ location: loc, history: [loc], index: 0, sort: { key: 'name', dir: 1 }, selection: new Set(), anchor: null, query: '', focus: null, scroll: 0, search: '' });

/** Remember what the open tab shows, so that it can be restored when the user comes back. */
function saveActiveTab() {
  if (!activeTab) return;
  activeTab.data = {
    location: state.location,
    history: [...state.history],
    index: state.index,
    sort: { ...state.sort },
    selection: new Set(state.selection),
    anchor: state.anchor,
    query: state.query,
    focus: state.focus,
    scroll: els.content.scrollTop,
    search: els.search.value
  };
}

function activateTab(tab) {
  if (tab === activeTab) return;
  saveActiveTab();
  activeTab = tab;
  const d = tab.data;
  Object.assign(state, { location: d.location, history: [...d.history], index: d.index, sort: { ...d.sort }, selection: new Set(d.selection), anchor: d.anchor, query: d.query, focus: d.focus });
  els.search.value = d.search;
  refresh();
  els.content.scrollTop = d.scroll;
}

/** Open a location in a new tab, next to the open one. */
function newTab(loc = HOME_LOC, { background = false } = {}) {
  const target = canonical(loc) ?? HOME_LOC;
  const tab = { id: ++tabSequence, data: freshTabData(target) };
  tabs.splice(tabs.indexOf(activeTab) + 1, 0, tab);
  if (background) renderTabs();
  else activateTab(tab);
}

async function closeTab(tab) {
  if (tabs.length === 1) {
    await settlePreview();
    return os.window.close();
  }
  const at = tabs.indexOf(tab);
  tabs.splice(at, 1);
  if (tab === activeTab) {
    activeTab = null; // nothing to save: the tab is gone
    activateTab(tabs[Math.min(at, tabs.length - 1)]);
  } else renderTabs();
  return undefined;
}

function stepTab(delta) {
  activateTab(tabs[(tabs.indexOf(activeTab) + delta + tabs.length) % tabs.length]);
}

function renderTabs() {
  clear(els.tabs);
  for (const tab of tabs) {
    const loc = tab === activeTab ? state.location : tab.data.location;
    const selected = tab === activeTab;
    const close = h('button', { class: 'tab-close', type: 'button', tabIndex: -1, 'aria-label': t('explorer.tabs.close') }, icon('dismiss', { size: 10 }));
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(tab);
    });
    const el = h('div', { class: `tab${selected ? ' is-active' : ''}`, role: 'tab', 'aria-selected': String(selected), tabIndex: selected ? 0 : -1 }, locationIcon(loc, 'tab-icon'), h('span', { class: 'tab-title' }, locationName(loc)), close);
    el.addEventListener('click', () => activateTab(tab));
    el.addEventListener('auxclick', (e) => e.button === 1 && closeTab(tab));
    el.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && activateTab(tab));
    els.tabs.append(el);
  }
  const add = h('button', { class: 'tab-add', type: 'button', 'aria-label': t('explorer.tabs.new'), onclick: () => newTab() }, icon('plus'));
  add.dataset.tip = t('explorer.tabs.new');
  els.tabs.append(add);
}

function renderChrome() {
  const name = locationName(state.location);
  renderTabs();
  renderAddress();
  renderSidebar();
  updateNav();
  els.search.placeholder = t('explorer.searchIn', { name });
  els.viewDetails.classList.toggle('is-on', state.view === 'details');
  els.viewIcons.classList.toggle('is-on', state.view !== 'details');
  os.window.setTitle(`${state.mode === 'search' ? t('explorer.searchResults', { name }) : name} - ${apps.name(selfId) || 'File Explorer'}`);
}

function renderStatus() {
  els.count.textContent = i18n.plural('explorer.status.items', state.items.length);
  const selected = selectedItems();
  if (!selected.length) {
    els.selection.textContent = '';
    return;
  }
  const files = selected.filter((item) => !item.isDir);
  const size = files.length === selected.length ? `  ${formatBytes(files.reduce((sum, item) => sum + (item.size || 0), 0))}` : '';
  els.selection.textContent = i18n.plural('explorer.status.selected', selected.length) + size;
}

/** Reload the current location and redraw everything. */
function refresh({ resetScroll = false } = {}) {
  if (isReal(state.location) && !fs.isDir(state.location)) {
    // the folder was deleted or renamed elsewhere: fall back to the nearest one that exists
    let path = state.location;
    while (path !== ROOT_PATH && !fs.isDir(path)) path = dirname(path);
    state.location = path;
    if (state.index >= 0) state.history[state.index] = path;
  }
  load();
  renderChrome();
  renderContent();
  if (resetScroll) els.content.scrollTop = 0;
  updateCommands();
  renderStatus();
  syncPreview();
}

/* -------------------------------- selection -------------------------------- */

function setSelection(keys, anchor) {
  state.selection = new Set(keys);
  if (anchor !== undefined) state.anchor = anchor;
  applySelection();
  prepareDragFiles(selectedEntries());
  updateCommands();
  renderStatus();
  // the preview pane follows the selected file - unless it holds unsaved text,
  // which stays put until it is saved, reverted or another file is opened
  const selected = selectedItems();
  if (state.previewOpen && !preview.dirty && selected.length === 1 && selected[0].kind === 'entry' && !selected[0].isDir) showPreview(selected[0].key);
  else if (state.detailsOpen) renderDetails();
}

function selectRange(fromKey, toKey, additive) {
  const from = state.items.findIndex((item) => item.key === fromKey);
  const to = state.items.findIndex((item) => item.key === toKey);
  if (from < 0 || to < 0) return setSelection([toKey], toKey);
  const range = state.items.slice(Math.min(from, to), Math.max(from, to) + 1).map((item) => item.key);
  setSelection(additive ? [...state.selection, ...range] : range);
}

/* --------------------------------- actions --------------------------------- */

async function report(title, errors) {
  if (errors.length) await alertDialog(title, errors.map(describeError).join('\n'));
}

function openItem(item) {
  if (item.kind === 'trash') return showProperties(item);
  if (item.isDir) return navigate(item.key);
  os.openPath(item.key);
}

function openFile(path) {
  state.previewOpen = true;
  state.detailsOpen = false;
  if (itemFor(path)) setSelection([path], path);
  showPreview(path);
}

async function create(kind) {
  const dir = currentDir();
  if (!dir) return;
  try {
    const wanted = kind === 'folder' ? t('files.newFolder') : `${t('files.newTextDocument')}.txt`;
    const path = join(dir, fs.uniqueName(dir, wanted));
    const created = kind === 'folder' ? await fs.mkdir(path) : await fs.writeFile(path, '');
    setSelection([created], created);
    elFor(created)?.scrollIntoView({ block: 'nearest' });
    startRename(created);
  } catch (err) {
    report(t('files.createFailed'), [err]);
  }
}

function cut() {
  const paths = selectedEntries().map((entry) => entry.path);
  if (paths.length) clipboard.set('cut', paths);
}

function copy() {
  const paths = selectedEntries().map((entry) => entry.path);
  if (paths.length) clipboard.set('copy', paths);
}

function copyAsPath() {
  const text = selectedEntries().map((entry) => `"${entry.path}"`).join('\n');
  if (text) navigator.clipboard?.writeText(text).catch(() => {}); // the browser may refuse; nothing to report then
}

/** "Send to": copies the selection into one of the user's folders. */
async function sendTo(dest) {
  const errors = [];
  for (const entry of selectedEntries()) {
    try {
      await fs.copy(entry.path, dest);
    } catch (err) {
      errors.push(err);
    }
  }
  report(t('files.pasteFailed'), errors);
}

const sendToItems = () =>
  Object.entries(KNOWN_FOLDERS).map(([key, path]) => ({ label: t(`folders.${key}`), iconUrl: iconUrl(`folder-${key}`), action: () => sendTo(path) }));

async function paste() {
  const dir = currentDir();
  if (!dir) return;
  const { created, errors } = await clipboard.pasteInto(dir);
  if (created.length) setSelection(created, created[0]);
  report(t('files.pasteFailed'), errors);
}

async function remove(permanent = false) {
  const items = selectedItems();
  if (!items.length) return;
  const deleted = items.filter((item) => item.kind === 'trash');
  const entries = items.filter((item) => item.kind === 'entry' && !item.drive).map((item) => item.entry);
  if (deleted.length || permanent) {
    const message = items.length === 1 ? t('files.confirmDeleteOne', { name: items[0].name }) : i18n.plural('files.confirmDeleteMany', items.length);
    if (!(await confirmDialog(t('files.confirmDeleteTitle'), message, { okLabel: t('files.delete'), danger: true }))) return;
  }
  const errors = [];
  for (const item of deleted) await fs.purge(item.trash.id);
  for (const entry of entries) {
    try {
      if (permanent) await fs.remove(entry.path, { recursive: true });
      else await fs.trash(entry.path);
    } catch (err) {
      errors.push(err);
    }
  }
  report(t('files.deleteFailed'), errors);
}

async function restoreSelected() {
  const selected = selectedItems().filter((item) => item.kind === 'trash');
  const targets = selected.length ? selected : state.items.filter((item) => item.kind === 'trash');
  const errors = [];
  for (const item of targets) {
    try {
      await fs.restore(item.trash.id);
    } catch (err) {
      errors.push(err);
    }
  }
  report(t('explorer.trash.restoreFailed'), errors);
}

async function emptyTrash() {
  const count = fs.trashCount();
  if (!count) return;
  const ok = await confirmDialog(t('files.emptyTrashTitle'), i18n.plural('files.emptyTrashMessage', count), { okLabel: t('files.emptyTrash'), danger: true });
  if (ok) await fs.emptyTrash();
}

function sortBy(key, dir) {
  state.sort = { key, dir: dir ?? (state.sort.key === key ? -state.sort.dir : 1) };
  if (!state.sections) sortItems(state.items);
  renderContent();
}

function setView(view) {
  state.view = view;
  settings.set('explorerView', view);
  renderChrome();
  renderContent();
}

/** Ctrl + mouse wheel: step through the layouts, from Details up to the biggest icons. */
const ZOOM_ORDER = ['details', 'list', 'small', 'medium', 'large', 'xl'];
function zoomView(direction) {
  const from = ZOOM_ORDER.indexOf(state.view);
  const at = from < 0 ? ZOOM_ORDER.indexOf('medium') : from;
  const next = ZOOM_ORDER[Math.min(ZOOM_ORDER.length - 1, Math.max(0, at + direction))];
  if (next !== state.view && !state.sections) setView(next);
}

function toggleNavPane() {
  state.navPane = !state.navPane;
  settings.set('explorerNavPane', state.navPane);
  renderSidebar();
}

function openTerminal() {
  const terminal = apps.byRole('terminal');
  if (terminal && currentDir()) os.launch(terminal.id, { cwd: currentDir() });
}

function startRename(key) {
  const item = itemFor(key);
  const el = elFor(key);
  if (!item || !el || item.kind !== 'entry' || item.entry.system || state.renaming) return;
  const multiline = el.classList.contains('tile') && ['xl', 'large', 'medium'].includes(state.view);
  const input = multiline ? h('textarea', { class: 'rename', rows: 2, spellcheck: false }) : h('input', { class: 'rename', type: 'text', spellcheck: false });
  input.value = item.entry.name;
  state.renaming = true;
  el.draggable = false;
  el.querySelector('.item-name').replaceWith(input);
  input.focus();
  const dot = item.isDir ? -1 : item.entry.name.lastIndexOf('.');
  input.setSelectionRange(0, dot > 0 ? dot : item.entry.name.length);

  let done = false;
  const finish = async (commit) => {
    if (done) return;
    done = true;
    const name = input.value.replace(/\s+/g, ' ').trim();
    let error = null;
    if (commit && name && name !== item.entry.name) {
      try {
        // `renaming` is still set here, so the change event does not redraw
        // the list before the selection has been moved to the new name
        const renamed = await fs.rename(item.key, name);
        if (state.selection.delete(key)) state.selection.add(renamed);
        if (state.anchor === key) state.anchor = renamed;
        if (preview.path === key) preview.path = renamed;
      } catch (err) {
        error = err;
      }
    }
    state.renaming = false;
    refresh();
    els.content.focus({ preventScroll: true });
    if (error) await report(t('files.renameFailed'), [error]);
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      finish(true);
    } else if (e.key === 'Escape') {
      finish(false);
    }
  });
  input.addEventListener('blur', () => finish(true));
  for (const type of ['pointerdown', 'click', 'dblclick', 'contextmenu']) input.addEventListener(type, (e) => e.stopPropagation());
}

function showProperties(item) {
  if (item.kind !== 'trash' && !item.drive && item.entry) return showEntryProperties(item.entry);
  const rows = [];
  const add = (label, value) => rows.push(h('dt', null, label), h('dd', null, value));
  const sizeText = (bytes) => (bytes < 1024 ? formatBytes(bytes) : `${formatBytes(bytes)} (${i18n.plural('common.bytes', bytes)})`);

  add(t('files.columns.type'), item.type);
  if (item.kind === 'trash') {
    add(t('explorer.columns.originalLocation'), item.folder);
    add(t('files.columns.size'), sizeText(item.size));
    add(t('explorer.columns.dateDeleted'), formatDateTime(item.date));
  } else if (item.drive) {
    const usage = fs.usage();
    add(t('explorer.props.used'), sizeText(usage.used));
    add(t('explorer.props.free'), sizeText(usage.free));
    add(t('explorer.props.capacity'), sizeText(usage.capacity));
  } else {
    const { entry } = item;
    add(t('properties.location'), dirname(entry.path));
    if (item.isDir) {
      const { files, folders } = fs.count(entry.path);
      add(t('files.columns.size'), sizeText(fs.sizeOf(entry.path)));
      add(t('properties.contains'), t('properties.containsValue', { files: i18n.number(files), folders: i18n.number(folders) }));
    } else {
      add(t('files.columns.size'), sizeText(entry.size));
    }
    add(t('properties.created'), formatDateTime(entry.ctime));
    add(t('files.columns.modified'), formatDateTime(entry.mtime));
  }
  showDialog({
    title: t('properties.title', { name: item.name }),
    content: h('div', null, h('div', { class: 'props-head' }, h('img', { src: item.thumb, alt: '' }), h('span', null, item.name)), h('dl', { class: 'props' }, rows))
  });
}

/* ------------------------------- command bar ------------------------------- */

const commands = {};

const newMenu = () => [
  { label: t('files.folder'), iconUrl: iconUrl('c-folder'), action: () => create('folder') },
  { label: t('files.textDocument'), iconUrl: iconUrl('file-text'), action: () => create('text') }
];

const sortMenu = () => [
  ...columns().map((col) => ({ label: col.label, checked: state.sort.key === col.sort, radio: true, action: () => sortBy(col.sort, state.sort.dir) })),
  { separator: true },
  { label: t('files.sortAscending'), checked: state.sort.dir > 0, radio: true, action: () => sortBy(state.sort.key, 1) },
  { label: t('files.sortDescending'), checked: state.sort.dir < 0, radio: true, action: () => sortBy(state.sort.key, -1) }
];

const viewItems = () => [
  ...['xl', 'large', 'medium', 'small', 'list', 'details', 'tiles'].map((view) => ({
    label: t(`explorer.view.${view}`),
    checked: state.view === view,
    radio: true,
    disabled: !!state.sections,
    action: () => setView(view)
  }))
];

const showItems = () => [
  { label: t('explorer.view.navPane'), checked: state.navPane, action: toggleNavPane },
  { label: t('explorer.view.detailsPane'), shortcut: 'Alt+Shift+P', checked: state.detailsOpen, action: () => setPane(state.detailsOpen ? 'none' : 'details') },
  { label: t('explorer.view.previewPane'), shortcut: 'Alt+P', checked: state.previewOpen, action: () => setPane(state.previewOpen ? 'none' : 'preview') }
];

const viewMenu = () => [...viewItems(), { separator: true }, { label: t('explorer.view.show'), items: showItems() }];

const moreMenu = () => {
  const selected = selectedItems();
  const target = selected.length === 1 ? selected[0] : currentDir() ? makeItem(fs.stat(currentDir())) : null;
  return [
    { label: t('explorer.selectAll'), icon: 'select-all', shortcut: 'Ctrl+A', action: () => setSelection(state.items.map((item) => item.key)) },
    { label: t('explorer.selectNone'), action: () => setSelection([], null) },
    { label: t('explorer.invertSelection'), action: () => setSelection(state.items.filter((item) => !state.selection.has(item.key)).map((item) => item.key)) },
    { separator: true },
    { label: t('files.properties'), icon: 'info', disabled: !target, action: () => showProperties(target) },
    apps.byRole('terminal') && { label: t('desktop.menu.openTerminal'), icon: 'terminal', disabled: !currentDir(), action: openTerminal }
  ];
};

function buildCommandBar() {
  clear(els.commandbar);
  const button = (id, glyph, label, { text = false, action, menu } = {}) => {
    const labelEl = text ? h('span', { class: 'cmd-label' }, label) : null;
    const btn = h('button', { class: 'cmd', type: 'button', 'aria-label': label }, icon(glyph), labelEl, menu ? icon('chevron-down', { class: 'cmd-caret' }) : null);
    if (!text) btn.dataset.tip = label;
    if (menu) os.dropdown(btn, menu);
    else btn.addEventListener('click', action);
    commands[id] = btn;
    btn.labelEl = labelEl;
    return btn;
  };
  const sep = () => h('span', { class: 'cmd-sep' });
  els.commandbar.append(
    button('new', 'plus', t('files.new'), { text: true, menu: newMenu }),
    sep(),
    button('cut', 'cut', t('files.cut'), { action: cut }),
    button('copy', 'copy', t('files.copy'), { action: copy }),
    button('paste', 'paste', t('files.paste'), { action: paste }),
    button('rename', 'rename', t('files.rename'), { action: () => state.selection.size === 1 && startRename([...state.selection][0]) }),
    button('delete', 'delete', t('files.delete'), { action: () => remove(false) }),
    button('restore', 'undo', t('explorer.trash.restoreAll'), { text: true, action: restoreSelected }),
    button('empty', 'delete', t('files.emptyTrash'), { text: true, action: emptyTrash }),
    sep(),
    button('sort', 'sort', t('explorer.sort'), { text: true, menu: sortMenu }),
    button('view', 'view-grid', t('desktop.menu.view'), { text: true, menu: viewMenu }),
    sep(),
    button('more', 'more', t('explorer.more'), { menu: moreMenu })
  );
}

function updateCommands() {
  const items = selectedItems();
  const entries = selectedEntries();
  const folder = state.mode === 'folder';
  const trash = state.mode === 'trash';
  for (const id of ['new', 'cut', 'copy', 'paste', 'rename']) commands[id].hidden = trash;
  commands.restore.hidden = !trash;
  commands.empty.hidden = !trash;

  commands.new.disabled = !folder;
  commands.cut.disabled = !entries.length;
  commands.copy.disabled = !entries.length;
  commands.paste.disabled = !folder || !clipboard.canPaste();
  commands.rename.disabled = items.length !== 1 || entries.length !== 1 || entries[0].system;
  commands.delete.disabled = !items.length || (!trash && !entries.length);
  commands.restore.disabled = !state.items.length;
  commands.restore.labelEl.textContent = t(items.length ? 'explorer.trash.restoreSelected' : 'explorer.trash.restoreAll');
  commands.empty.disabled = fs.trashCount() === 0;
  commands.sort.disabled = !!state.sections;
}

/* ------------------------------ context menus ------------------------------ */

function itemMenu(e) {
  const items = selectedItems();
  const single = items.length === 1 ? items[0] : null;
  if (!items.length) return;

  if (items.every((item) => item.kind === 'trash')) {
    return os.menu(
      [
        { label: t('explorer.trash.restore'), icon: 'undo', action: restoreSelected },
        { label: t('explorer.trash.deleteForever'), icon: 'delete', action: () => remove(true) },
        { separator: true },
        single && { label: t('files.properties'), icon: 'info', action: () => showProperties(single) }
      ],
      e
    );
  }

  const entries = selectedEntries();
  const openers = single && !single.isDir ? openersFor(single.entry, apps) : [];
  const isPicture = single && !single.isDir && single.entry.url && kindOf(single.entry) === 'image';
  os.menu(
    [
      { label: t('files.open'), icon: 'open', disabled: !single, action: () => openItem(single) },
      single?.isDir && { label: t('explorer.tabs.openInNewTab'), icon: 'plus', action: () => newTab(single.key) },
      single?.isDir && { label: t('explorer.openNewWindow'), icon: 'window', action: () => os.launch(selfId, { path: single.key }) },
      single && !single.isDir && openers.length > 0 && { label: t('files.openWith'), icon: 'open', items: openers.map((app) => ({ label: apps.name(app), action: () => os.launch(app.id, { path: single.key }) })) },
      isPicture && { label: t('files.setBackground'), icon: 'picture', action: () => settings.set('wallpaper', `file:${single.key}`) },
      { separator: true },
      { label: t('files.cut'), icon: 'cut', shortcut: 'Ctrl+X', disabled: !entries.length, action: cut },
      { label: t('files.copy'), icon: 'copy', shortcut: 'Ctrl+C', disabled: !entries.length, action: copy },
      { label: t('files.copyAsPath'), icon: 'copy', shortcut: 'Ctrl+Shift+C', disabled: !entries.length, action: copyAsPath },
      { label: t('files.sendTo'), icon: 'open', disabled: !entries.length, items: sendToItems() },
      { separator: true },
      { label: t('files.rename'), icon: 'rename', shortcut: 'F2', disabled: !single || single.entry.system, action: () => startRename(single.key) },
      { label: t('files.delete'), icon: 'delete', shortcut: 'Del', disabled: !entries.length || entries.every((entry) => entry.system), action: () => remove(false) },
      { separator: true },
      single && { label: t('files.properties'), icon: 'info', action: () => showProperties(single) }
    ],
    e
  );
}

function backgroundMenu(e) {
  const folder = state.mode === 'folder';
  const trash = state.mode === 'trash';
  os.menu(
    [
      { label: t('desktop.menu.view'), icon: 'view-grid', disabled: !!state.sections, items: viewItems() },
      { label: t('desktop.menu.sortBy'), icon: 'sort', disabled: !!state.sections, items: sortMenu() },
      { label: t('files.refresh'), icon: 'refresh', action: () => refresh() },
      { separator: true },
      folder && { label: t('files.new'), icon: 'plus', items: newMenu() },
      folder && { label: t('files.paste'), icon: 'paste', shortcut: 'Ctrl+V', disabled: !clipboard.canPaste(), action: paste },
      trash && { label: t('files.emptyTrash'), icon: 'delete', disabled: fs.trashCount() === 0, action: emptyTrash },
      { separator: true },
      folder && apps.byRole('terminal') && { label: t('desktop.menu.openTerminal'), icon: 'terminal', action: openTerminal },
      folder && { separator: true },
      folder && { label: t('files.properties'), icon: 'info', action: () => showProperties(makeItem(fs.stat(state.location))) }
    ],
    e
  );
}

/* ------------------------------- preview pane ------------------------------ */

async function savePreview() {
  if (!preview.path || !preview.field) return;
  try {
    await fs.writeFile(preview.path, preview.field.value);
    preview.dirty = false;
    os.window.setDirty(false);
  } catch (err) {
    report(t('explorer.preview.saveFailed'), [err]);
  }
  syncPreview();
}

/** Ask what to do with unsaved text before the preview shows something else. */
async function settlePreview() {
  if (!preview.dirty || !preview.path) return;
  const { button } = await showDialog({
    title: t('explorer.preview.saveTitle'),
    message: t('explorer.preview.saveMessage', { name: basename(preview.path) }),
    buttons: [
      { id: 'save', label: t('common.save'), primary: true },
      { id: 'discard', label: t('explorer.preview.dontSave') }
    ],
    cancelId: 'discard'
  });
  if (button === 'save') savePreview();
  preview.dirty = false;
  os.window.setDirty(false);
}

async function showPreview(path) {
  state.previewOpen = true;
  state.detailsOpen = false;
  if (preview.path !== path) {
    await settlePreview();
    preview.path = path;
  }
  syncPreview();
}

/** The pane on the right: 'none', 'preview' (the file itself) or 'details' (its properties). One at a time. */
async function setPane(mode) {
  if (mode !== 'preview' && state.previewOpen) await settlePreview();
  state.previewOpen = mode === 'preview';
  state.detailsOpen = mode === 'details';
  settings.set('explorerPane', mode);
  if (state.previewOpen) {
    const selected = selectedItems();
    if (selected.length === 1 && selected[0].kind === 'entry' && !selected[0].isDir) preview.path = selected[0].key;
  }
  preview.shownPath = undefined; // whatever was drawn there belongs to the other pane
  syncPreview();
}

const togglePreview = () => setPane(state.previewOpen ? 'none' : 'preview');

/** The facts shown in the details pane for one item. */
function detailRows(item) {
  const rows = [];
  const add = (label, value) => rows.push([label, value]);
  if (item.kind === 'trash') {
    add(t('explorer.columns.originalLocation'), item.folder);
    add(t('files.columns.size'), formatBytes(item.size));
    add(t('explorer.columns.dateDeleted'), formatDateTime(item.date));
  } else if (item.drive) {
    const usage = fs.usage();
    add(t('explorer.props.used'), formatBytes(usage.used));
    add(t('explorer.props.free'), formatBytes(usage.free));
    add(t('explorer.props.capacity'), formatBytes(usage.capacity));
  } else {
    const { entry } = item;
    if (item.isDir) {
      const { files, folders } = fs.count(entry.path);
      add(t('properties.contains'), t('properties.containsValue', { files: i18n.number(files), folders: i18n.number(folders) }));
      add(t('files.columns.size'), formatBytes(fs.sizeOf(entry.path)));
    } else {
      add(t('files.columns.size'), formatBytes(entry.size));
    }
    add(t('files.columns.modified'), formatDateTime(entry.mtime));
    add(t('properties.created'), formatDateTime(entry.ctime));
    add(t('properties.location'), dirname(entry.path));
  }
  return rows;
}

function locationIconSrc(loc) {
  if (loc === PC_LOC) return iconUrl('this-pc');
  if (loc === TRASH) return iconUrl(fs.trashCount() ? 'recycle-bin-full' : 'recycle-bin');
  if (loc === ROOT_PATH) return iconUrl('c-drive');
  return isReal(loc) ? iconFor({ type: 'dir', path: loc, name: basename(loc) }) : iconUrl('c-folder');
}

/** Details pane: a picture, the name and the properties of what is selected (or of the open folder). */
function renderDetails() {
  preview.shownPath = undefined;
  preview.field = null;
  clear(els.preview);
  const close = h('button', { class: 'nav-btn', type: 'button', 'aria-label': t('common.close'), onclick: () => setPane('none') }, icon('dismiss', { size: 14 }));
  close.dataset.tip = t('common.close');

  const selected = selectedItems();
  let thumb;
  let name;
  let kind = '';
  let rows = [];
  if (selected.length === 1) {
    const [item] = selected;
    thumb = item.thumb;
    name = item.name;
    kind = item.type;
    rows = detailRows(item);
  } else if (selected.length > 1) {
    const files = selected.filter((item) => !item.isDir);
    thumb = iconUrl('c-file');
    name = i18n.plural('explorer.status.selected', selected.length);
    if (files.length === selected.length) rows = [[t('files.columns.size'), formatBytes(files.reduce((sum, item) => sum + (item.size || 0), 0))]];
  } else if (state.mode === 'folder') {
    const folder = makeItem(fs.stat(state.location));
    thumb = folder.thumb;
    name = locationName(state.location);
    kind = folder.type;
    rows = [[t('explorer.details.contains'), i18n.plural('explorer.status.items', state.items.length)], [t('files.columns.modified'), formatDateTime(folder.date)], [t('properties.location'), dirname(state.location)]];
  } else {
    thumb = locationIconSrc(state.location);
    name = locationName(state.location);
    rows = state.sections ? [] : [[t('explorer.details.contains'), i18n.plural('explorer.status.items', state.items.length)]];
  }

  els.preview.append(
    h('div', { class: 'preview-head' }, h('span', { class: 'preview-name' }, t('explorer.view.detailsPane')), close),
    h(
      'div',
      { class: 'details-body' },
      h('img', { class: 'details-thumb', src: thumb, alt: '', draggable: false }),
      h('div', { class: 'details-name' }, name),
      kind ? h('div', { class: 'details-type' }, kind) : null,
      rows.length ? h('dl', { class: 'details-meta' }, rows.flatMap(([label, value]) => [h('dt', null, label), h('dd', null, value)])) : null
    )
  );
}

function renderPreview(entry) {
  clear(els.preview);
  preview.field = null;
  preview.shownPath = entry ? entry.path : null;
  preview.shownStamp = entry ? entry.mtime : 0;

  const closeBtn = h('button', { class: 'nav-btn', type: 'button', 'aria-label': t('common.close'), onclick: togglePreview }, icon('dismiss', { size: 14 }));
  closeBtn.dataset.tip = t('common.close');

  if (!entry) {
    els.preview.append(
      h('div', { class: 'preview-head' }, h('span', { class: 'preview-name' }, t('explorer.view.previewPane')), closeBtn),
      h('div', { class: 'preview-body' }, h('div', { class: 'preview-empty' }, t('explorer.preview.empty')))
    );
    return;
  }

  const body = h('div', { class: 'preview-body' });
  let footer = null;
  if (isTextual(entry)) {
    const field = h('textarea', { class: 'preview-text', spellcheck: false, 'aria-label': entry.name });
    let original = '';
    field.disabled = true; // until the text has arrived
    fs.readFile(entry.path).then(
      (text) => {
        original = text;
        field.value = text;
        field.disabled = false;
      },
      () => {}
    );
    const saveBtn = h('button', { class: 'btn btn-accent', type: 'button', disabled: true, onclick: savePreview }, t('common.save'));
    const revertBtn = h(
      'button',
      {
        class: 'btn',
        type: 'button',
        disabled: true,
        onclick: () => {
          preview.dirty = false;
          os.window.setDirty(false);
          renderPreview(fs.stat(entry.path));
        }
      },
      t('explorer.preview.revert')
    );
    field.addEventListener('input', () => {
      preview.dirty = field.value !== original;
      os.window.setDirty(preview.dirty);
      saveBtn.disabled = revertBtn.disabled = !preview.dirty;
    });
    field.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (preview.dirty) savePreview();
      }
    });
    preview.field = field;
    body.append(field);
    footer = h('div', { class: 'preview-foot' }, revertBtn, saveBtn);
  } else if (entry.url && kindOf(entry) === 'image') {
    body.append(h('img', { class: 'preview-image', src: entry.url, alt: entry.name, draggable: false }));
  } else {
    body.append(h('div', { class: 'preview-empty' }, h('img', { src: iconFor(entry), alt: '' }), t('explorer.preview.unavailable')));
  }

  els.preview.append(
    h('div', { class: 'preview-head' }, h('img', { src: iconFor(entry), alt: '' }), h('span', { class: 'preview-name' }, entry.name), closeBtn),
    body,
    footer,
    h(
      'dl',
      { class: 'preview-meta' },
      h('dt', null, t('files.columns.type')),
      h('dd', null, typeLabel(entry)),
      h('dt', null, t('files.columns.size')),
      h('dd', null, formatBytes(entry.size)),
      h('dt', null, t('files.columns.modified')),
      h('dd', null, formatDateTime(entry.mtime))
    )
  );
}

/** Bring the preview pane in line with the state (called after every change). */
function syncPreview() {
  els.preview.hidden = !state.previewOpen && !state.detailsOpen;
  els.preview.classList.toggle('is-details', state.detailsOpen);
  if (state.detailsOpen) return renderDetails();
  if (!state.previewOpen) return undefined;
  let entry = preview.path ? fs.stat(preview.path) : null;
  if (!entry || entry.type !== 'file') {
    entry = null;
    preview.path = null;
    preview.dirty = false;
  }
  if (preview.dirty) return; // never replace text that is being edited
  const path = entry ? entry.path : null;
  if (preview.shownPath !== path || preview.shownStamp !== (entry ? entry.mtime : 0)) renderPreview(entry);
}

/* ---------------------------------- events --------------------------------- */

els.back.addEventListener('click', () => go(-1));
els.forward.addEventListener('click', () => go(1));
els.up.addEventListener('click', goUp);
els.refresh.addEventListener('click', () => refresh());
els.viewDetails.addEventListener('click', () => setView('details'));
els.viewIcons.addEventListener('click', () => setView('icons'));
els.address.addEventListener('click', (e) => {
  if (!e.target.closest('.crumb, .address-input')) editAddress();
});

let searchTimer = 0;
els.search.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.query = els.search.value.trim();
    state.selection = new Set();
    refresh({ resetScroll: true });
  }, 160);
});
els.search.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !els.search.value) return;
  els.search.value = '';
  state.query = '';
  refresh();
  els.content.focus({ preventScroll: true });
});

els.content.addEventListener('pointerdown', (e) => {
  if (e.target.closest('.rename')) return;
  const el = e.target.closest('.item');
  if (!el) return;
  const key = el.dataset.key;
  if (e.button === 0 && e.shiftKey && state.anchor) selectRange(state.anchor, key, e.ctrlKey || e.metaKey);
  else if (e.button === 0 && (e.ctrlKey || e.metaKey)) {
    const next = new Set(state.selection);
    if (!next.delete(key)) next.add(key);
    setSelection(next, key);
  } else if (!state.selection.has(key)) setSelection([key], key);
});

els.content.addEventListener('click', (e) => {
  if (e.target.closest('.rename, .col-head')) return;
  const el = e.target.closest('.item');
  const plain = !e.ctrlKey && !e.metaKey && !e.shiftKey;
  if (!el) {
    if (plain) setSelection([], null);
  } else if (plain && state.selection.size > 1) {
    setSelection([el.dataset.key], el.dataset.key); // a plain click narrows a multi-selection
  }
});

// a middle click on a folder opens it in a new tab, behind the open one
els.content.addEventListener('pointerdown', (e) => e.button === 1 && e.preventDefault());
els.content.addEventListener('auxclick', (e) => {
  if (e.button !== 1) return;
  const item = itemFor(e.target.closest('.item')?.dataset.key);
  if (item?.kind === 'entry' && item.isDir) {
    e.preventDefault();
    newTab(item.key, { background: true });
  }
});

// Ctrl + mouse wheel: bigger or smaller icons
els.content.addEventListener(
  'wheel',
  (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    zoomView(e.deltaY < 0 ? 1 : -1);
  },
  { passive: false }
);

els.content.addEventListener('dblclick', (e) => {
  if (e.target.closest('.rename')) return;
  const item = itemFor(e.target.closest('.item')?.dataset.key);
  if (item) openItem(item);
});

els.content.addEventListener('contextmenu', (e) => {
  if (e.target.closest('.rename')) return;
  e.preventDefault();
  const el = e.target.closest('.item');
  if (!el) {
    setSelection([], null);
    backgroundMenu(e);
    return;
  }
  if (!state.selection.has(el.dataset.key)) setSelection([el.dataset.key], el.dataset.key);
  itemMenu(e);
});

/** Number of items per row in the current layout (1 in the details view). */
function perRow() {
  const nodes = [...els.content.querySelectorAll('.item')];
  if (nodes.length < 2 || nodes[0].classList.contains('row')) return 1;
  const top = nodes[0].offsetTop;
  const count = nodes.findIndex((node) => node.offsetTop !== top);
  return count < 0 ? nodes.length : count;
}

/** Items in one column of the List layout. */
function perColumn() {
  const nodes = [...els.content.querySelectorAll('.item')];
  if (!nodes.length) return 1;
  const left = nodes[0].offsetLeft;
  const count = nodes.findIndex((node) => node.offsetLeft !== left);
  return count < 0 ? nodes.length : count;
}

function moveFocus(step, extend) {
  if (!state.items.length) return;
  const current = state.items.findIndex((item) => item.key === (state.focus ?? state.anchor));
  const next = current < 0 ? 0 : Math.min(state.items.length - 1, Math.max(0, current + step));
  const key = state.items[next].key;
  if (extend && state.anchor) selectRange(state.anchor, key, false);
  else setSelection([key], key);
  state.focus = key;
  elFor(key)?.scrollIntoView({ block: 'nearest' });
}

els.content.addEventListener('keydown', (e) => {
  if (state.renaming || e.target.closest('.rename')) return;
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  const single = state.selection.size === 1 ? itemFor([...state.selection][0]) : null;

  const columnar = state.view === 'list'; // List fills a column top to bottom before starting the next
  if (e.key === 'ArrowDown') moveFocus(columnar ? 1 : perRow(), e.shiftKey);
  else if (e.key === 'ArrowUp') moveFocus(columnar ? -1 : -perRow(), e.shiftKey);
  else if (e.key === 'ArrowRight' && columnar) moveFocus(perColumn(), e.shiftKey);
  else if (e.key === 'ArrowLeft' && columnar) moveFocus(-perColumn(), e.shiftKey);
  else if (e.key === 'ArrowRight' && perRow() > 1) moveFocus(1, e.shiftKey);
  else if (e.key === 'ArrowLeft' && perRow() > 1) moveFocus(-1, e.shiftKey);
  else if (e.key === 'Home') moveFocus(-state.items.length, e.shiftKey);
  else if (e.key === 'End') moveFocus(state.items.length, e.shiftKey);
  else if (e.key === 'Enter' && e.altKey && single) showProperties(single);
  else if (e.key === 'Enter' && single) openItem(single);
  else if (e.key === 'Backspace') goUp();
  else if (e.key === 'F2' && single) startRename(single.key);
  else if (e.key === 'Delete') remove(e.shiftKey);
  else if (e.key === 'Escape') setSelection([], null);
  else if (mod && key === 'a') setSelection(state.items.map((item) => item.key));
  else if (mod && e.shiftKey && key === 'c') copyAsPath();
  else if (mod && key === 'c') copy();
  else if (mod && key === 'x') cut();
  else if (mod && key === 'v') paste();
  else if (!mod && !e.altKey && e.key.length === 1 && e.key !== ' ') {
    // type a letter to jump to the next item that starts with it
    const start = state.items.findIndex((item) => state.selection.has(item.key));
    const ordered = [...state.items.slice(start + 1), ...state.items.slice(0, start + 1)];
    const match = ordered.find((item) => item.name.toLowerCase().startsWith(key));
    if (!match) return;
    setSelection([match.key], match.key);
    elFor(match.key)?.scrollIntoView({ block: 'nearest' });
  } else return;
  e.preventDefault();
});

attachMarquee(els.content, {
  items: () => [...els.content.querySelectorAll('.item')],
  isBackground: (target) => !target.closest('.item, .list-head, .rename'),
  onSelect: (nodes, { additive }) => {
    const keys = nodes.map((node) => node.dataset.key);
    setSelection(additive ? [...state.selection, ...keys] : keys);
  }
});

// the navigation tree: arrow keys move, open and close folders
els.sidebar.addEventListener('keydown', (e) => {
  const row = e.target.closest?.('.side-link');
  if (!row) return;
  const rows = [...els.sidebar.querySelectorAll('.side-link')];
  const at = rows.indexOf(row);
  const expandable = row.hasAttribute('aria-expanded');
  const open = row.getAttribute('aria-expanded') === 'true';
  if (e.key === 'ArrowDown') rows[Math.min(rows.length - 1, at + 1)].focus();
  else if (e.key === 'ArrowUp') rows[Math.max(0, at - 1)].focus();
  else if (e.key === 'Home') rows[0].focus();
  else if (e.key === 'End') rows[rows.length - 1].focus();
  else if (e.key === 'ArrowRight' && expandable && !open) toggleNode(row.dataset.key);
  else if (e.key === 'ArrowRight' && open) rows[at + 1]?.focus();
  else if (e.key === 'ArrowLeft' && open) toggleNode(row.dataset.key);
  else if (e.key === 'ArrowLeft') {
    const level = Number(row.getAttribute('aria-level'));
    for (let i = at - 1; i >= 0; i--) {
      if (Number(rows[i].getAttribute('aria-level')) < level) {
        rows[i].focus();
        break;
      }
    }
  } else return;
  e.preventDefault();
});

// tabs and panes (the browser keeps Ctrl+T / Ctrl+W / Ctrl+Tab for itself in many setups: the buttons always work)
document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
  if (mod && !e.altKey && e.key.toLowerCase() === 't') (e.preventDefault(), newTab());
  else if (mod && !e.altKey && e.key.toLowerCase() === 'w') (e.preventDefault(), closeTab(activeTab));
  else if (e.ctrlKey && e.key === 'Tab') (e.preventDefault(), stepTab(e.shiftKey ? -1 : 1));
  else if (e.altKey && !mod && e.code === 'KeyP' && !typing) {
    e.preventDefault();
    if (e.shiftKey) setPane(state.detailsOpen ? 'none' : 'details');
    else setPane(state.previewOpen ? 'none' : 'preview');
  }
});

/* drag and drop: onto folders, onto the sidebar, or into the open folder */

els.content.addEventListener('dragstart', (e) => {
  const el = e.target instanceof Element ? e.target.closest('.item') : null;
  const item = el ? itemFor(el.dataset.key) : null;
  if (!item || item.kind !== 'entry' || state.renaming) {
    e.preventDefault();
    return;
  }
  if (!state.selection.has(item.key)) setSelection([item.key], item.key);
  setDragPaths(e, selectedEntries().map((entry) => entry.path));
});

function dropTarget(e) {
  if (!(e.target instanceof Element)) return null;
  const link = e.target.closest('.side-link');
  if (link) {
    const loc = link.dataset.loc;
    if (loc === TRASH) return { el: link, trash: true };
    return isReal(loc) ? { el: link, dir: loc } : null;
  }
  const crumb = e.target.closest('.crumb');
  if (crumb) return isReal(crumb.dataset.loc) ? { el: crumb, dir: crumb.dataset.loc } : null;
  const el = e.target.closest('.item');
  const item = el ? itemFor(el.dataset.key) : null;
  if (item && item.kind === 'entry' && item.isDir && !state.selection.has(item.key)) return { el, dir: item.key };
  if (e.target.closest('#content') && state.mode === 'folder') return { el: els.content, dir: state.location };
  return null;
}

const hasFiles = (e) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

/** Where files from the user's computer would land: a folder, never the Recycle Bin. */
function fileTarget(e) {
  const target = dropTarget(e);
  return target && !target.trash ? target : null;
}

/** Copy dropped files and folders from the computer into `dir` of the virtual disk. */
async function importInto(items, dir) {
  els.selection.textContent = t('explorer.import.importing');
  const { created, skipped } = await importDropped(items, dir);
  renderStatus();
  if (created.length && dir === state.location) {
    setSelection(created, created[0]);
    elFor(created[0])?.scrollIntoView({ block: 'nearest' });
  }
  if (skipped.length) {
    const lines = skipped.map((s) => (s.reason === 'noSpace' ? t('import.noSpace', { name: s.name, size: formatBytes(s.size), free: formatBytes(s.free) }) : `${s.name}: ${describeError(s.error)}`));
    await alertDialog(t('import.skipped'), lines.join('\n'));
  }
}

let dropEl = null;
function markDrop(el) {
  if (dropEl === el) return;
  dropEl?.classList.remove('is-drop');
  dropEl = el;
  dropEl?.classList.add('is-drop');
}

document.addEventListener('dragover', (e) => {
  if (hasFiles(e)) {
    // files from the user's computer
    const target = fileTarget(e);
    markDrop(target?.el ?? null);
    if (target) e.preventDefault();
    e.dataTransfer.dropEffect = target ? 'copy' : 'none';
    return;
  }
  if (!hasDragPaths(e)) return;
  const target = dropTarget(e);
  markDrop(target?.el ?? null);
  if (!target) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = e.ctrlKey && !target.trash ? 'copy' : 'move';
});
document.addEventListener('dragleave', (e) => {
  if (!e.relatedTarget) markDrop(null);
});
document.addEventListener('dragend', () => markDrop(null));
document.addEventListener('drop', async (e) => {
  if (hasFiles(e)) {
    e.preventDefault();
    const target = fileTarget(e);
    markDrop(null);
    // the dropped items must be taken now: the browser invalidates them after this event
    if (target) importInto(takeDropped(e.dataTransfer), target.dir);
    return;
  }
  if (!hasDragPaths(e)) return;
  const target = dropTarget(e);
  markDrop(null);
  if (!target) return;
  e.preventDefault();
  if (target.trash) {
    const errors = [];
    const paths = getDragPaths(e); // taken now: the drop event is over after the first await
    for (const path of paths) {
      try {
        await fs.trash(path);
      } catch (err) {
        errors.push(err);
      }
    }
    report(t('files.deleteFailed'), errors);
    return;
  }
  const { errors } = await dropInto(e, target.dir);
  report(t('files.moveFailed'), errors);
});

/* ---------------------------------- wiring --------------------------------- */

fs.on('change', () => {
  if (!state.renaming) refresh();
});
clipboard.on('change', () => {
  if (state.renaming) return;
  renderContent();
  updateCommands();
});
i18n.on('change', () => {
  i18n.apply(document);
  buildCommandBar();
  preview.shownPath = undefined; // force the preview to be redrawn in the new language
  refresh();
});

os.window.onBeforeClose(async () => {
  await settlePreview();
  os.window.setDirty(false);
  return true;
});

buildCommandBar();

// the first tab; its contents are the window's `state`
activeTab = { id: ++tabSequence, data: freshTabData(HOME_LOC) };
tabs.push(activeTab);

const startLocation = typeof os.args.path === 'string' ? canonical(os.args.path) : null;
const startSelection = startLocation && isReal(startLocation) && typeof os.args.select === 'string' ? fs.stat(join(startLocation, os.args.select))?.path : null;
navigate(startLocation ?? HOME_LOC, { select: startSelection });
if (startSelection && os.args.preview && fs.isFile(startSelection)) openFile(startSelection);
els.content.focus({ preventScroll: true });
