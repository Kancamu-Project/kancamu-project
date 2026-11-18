import { os, t, i18n, fs, h, icon, hydrateIcons, pickFile, showDialog, alertDialog, describeError, basename, KNOWN_FOLDERS, readJSON, writeJSON } from 'webos/sdk/app.js';

await os.ready;

const tabsEl = document.getElementById('tabs');
const editorsEl = document.getElementById('editors');
const menubar = document.getElementById('menubar');
const statusEl = document.getElementById('status');

const FONTS = ['Cascadia Mono', 'Consolas', 'Courier New', 'Arial', 'Segoe UI', 'Times New Roman', 'Georgia'];
const BASE_SIZE = 14;
const DEFAULTS = { font: 'Cascadia Mono', size: BASE_SIZE, zoom: 100, wrap: true, statusBar: true, restore: true };

const prefs = { ...DEFAULTS, ...readJSON('notepad.prefs', {}) };
const state = { tabs: [], activeId: null };
let editor = null; // the textarea of the active tab
let sequence = 0;
let dragId = null;

// Only the first Notepad window keeps the session; a second one starts empty and leaves it alone.
const selfApp = location.pathname.split('/').at(-2); // apps/<id>/index.html
const primary = (await os.windows.list()).filter((w) => w.appId === selfApp).length <= 1;

const active = () => state.tabs.find((tab) => tab.id === state.activeId) ?? null;
const textOf = (tab) => tab.el.value;
const dirty = (tab) => textOf(tab) !== tab.saved;
const displayName = (tab) => (tab.path ? basename(tab.path) : t('notepad.untitled'));
const anyDirty = () => state.tabs.some(dirty);

/* ------------------------------ saved data ------------------------------- */

const quiet = (fn) => {
  try {
    fn();
  } catch {
    /* disk full: the editor still works */
  }
};
const savePrefs = () => quiet(() => writeJSON('notepad.prefs', prefs));

let sessionTimer = 0;
function persist(now = false) {
  if (!primary) return;
  clearTimeout(sessionTimer);
  const write = () =>
    quiet(() =>
      writeJSON(
        'notepad.session',
        prefs.restore ? { active: state.tabs.findIndex((tab) => tab.id === state.activeId), tabs: state.tabs.map((tab) => ({ path: tab.path, text: textOf(tab), saved: tab.saved })) } : null
      )
    );
  if (now) write();
  else sessionTimer = setTimeout(write, 400);
}

/* --------------------------------- tabs ---------------------------------- */

function createTab({ path = null, text = '', saved = text } = {}) {
  const el = h('textarea', { class: 'editor', spellcheck: false, autocomplete: 'off', autocapitalize: 'off', hidden: true });
  el.value = text;
  attachEditor(el);
  const tab = { id: ++sequence, path, saved, el };
  state.tabs.push(tab);
  editorsEl.append(el);
  return tab;
}

function newTab() {
  activate(createTab().id);
}

function activate(id) {
  const tab = state.tabs.find((other) => other.id === id);
  if (!tab) return;
  state.activeId = id;
  for (const other of state.tabs) other.el.hidden = other !== tab;
  editor = tab.el;
  applyView();
  afterChange();
  renderTabs();
  updateCount();
  editor.focus();
  persist();
}

/** Ask what to do with unsaved text of a tab. Returns false when the user cancels. */
async function settle(tab) {
  if (!dirty(tab)) return true;
  activate(tab.id);
  const { button } = await showDialog({
    title: t('app.name'),
    message: t('notepad.unsaved.message', { name: displayName(tab) }),
    buttons: [
      { id: 'save', label: t('common.save'), primary: true },
      { id: 'discard', label: t('notepad.unsaved.dontSave') },
      { id: 'cancel', label: t('common.cancel') }
    ],
    cancelId: 'cancel'
  });
  if (button === 'cancel') return false;
  return button === 'discard' ? true : save(tab);
}

async function closeTab(id) {
  const at = state.tabs.findIndex((tab) => tab.id === id);
  if (at < 0) return false;
  const tab = state.tabs[at];
  if (!(await settle(tab))) return false;
  if (state.tabs.length === 1) {
    // the last tab: the window goes with it
    tab.el.value = '';
    tab.saved = '';
    persist(true);
    os.window.close();
    return true;
  }
  tab.el.remove();
  state.tabs.splice(at, 1);
  if (state.activeId === id) activate(state.tabs[Math.min(at, state.tabs.length - 1)].id);
  else (renderTabs(), persist());
  return true;
}

/** The window is closing: with session restore the texts are kept, otherwise every unsaved tab is asked about. */
async function settleAll() {
  if (prefs.restore) return persist(true), true;
  for (const tab of [...state.tabs]) if (!(await settle(tab))) return false;
  return true;
}

function renderTabs() {
  tabsEl.replaceChildren(
    ...state.tabs.map((tab) => {
      const isActive = tab.id === state.activeId;
      const close = h('button', { class: 'tab-close', type: 'button', 'aria-label': t('notepad.closeTab'), tabIndex: -1 }, icon('dismiss', { size: 10 }));
      close.addEventListener('click', (e) => {
        e.stopPropagation();
        closeTab(tab.id);
      });
      const el = h(
        'div',
        { class: `tab${isActive ? ' is-active' : ''}${dirty(tab) ? ' is-dirty' : ''}`, role: 'tab', 'aria-selected': String(isActive), tabIndex: 0, draggable: 'true', title: tab.path ?? displayName(tab) },
        h('span', { class: 'tab-title' }, displayName(tab)),
        h('span', { class: 'tab-dot', 'aria-hidden': 'true' }),
        close
      );
      el.addEventListener('click', () => activate(tab.id));
      el.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), activate(tab.id)));
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
        renderTabs();
        persist();
      });
      el.addEventListener('dragend', () => (dragId = null));
      return el;
    }),
    h('button', { class: 'tbtn tab-add', type: 'button', 'aria-label': t('notepad.file.new'), 'data-tip': t('notepad.file.new'), onclick: newTab }, icon('plus'))
  );
}

function tabMenu(tab, event) {
  const at = state.tabs.indexOf(tab);
  os.menu(
    [
      { label: t('notepad.closeTab'), shortcut: 'Ctrl+W', action: () => closeTab(tab.id) },
      { label: t('notepad.closeOthers'), disabled: state.tabs.length < 2, action: () => closeMany(state.tabs.filter((other) => other !== tab)) },
      { label: t('notepad.closeRight'), disabled: at >= state.tabs.length - 1, action: () => closeMany(state.tabs.slice(at + 1)) }
    ],
    event
  );
}

async function closeMany(list) {
  for (const tab of list) if (!(await closeTab(tab.id))) return;
}

/* ------------------------------ title, status ----------------------------- */

function afterChange() {
  const tab = active();
  if (!tab) return;
  os.window.setDirty(!prefs.restore && anyDirty());
  os.window.setTitle(`${dirty(tab) ? '*' : ''}${displayName(tab)} - ${t('app.name')}`);
  const el = tabsEl.children[state.tabs.indexOf(tab)];
  el?.classList.toggle('is-dirty', dirty(tab));
  updateStatus();
}

function updateStatus() {
  if (!editor) return;
  const before = editor.value.slice(0, editor.selectionStart).split('\n');
  const picked = editor.selectionEnd - editor.selectionStart;
  statusEl.replaceChildren(
    h('span', null, t('notepad.status.position', { line: before.length, col: before[before.length - 1].length + 1 })),
    h('span', null, picked ? t('notepad.status.selected', { count: i18n.number(picked), total: i18n.number(editor.value.length) }) : i18n.plural('notepad.status.chars', editor.value.length)),
    h('span', { class: 'status-fill' }),
    h('span', null, `${prefs.zoom}%`),
    h('span', null, t('notepad.status.eol')),
    h('span', null, t('notepad.status.encoding'))
  );
  statusEl.hidden = !prefs.statusBar;
}

function applyView() {
  const stack = `"${prefs.font}", "Cascadia Mono", Consolas, "Courier New", monospace`;
  editorsEl.style.setProperty('--size', `${(prefs.size * prefs.zoom) / 100}px`);
  editorsEl.style.setProperty('--font', stack);
  for (const tab of state.tabs) tab.el.classList.toggle('is-wrap', prefs.wrap);
  updateStatus();
}

/* --------------------------------- files --------------------------------- */

async function openPath(path) {
  try {
    const entry = fs.stat(path);
    const known = state.tabs.find((tab) => tab.path === entry.path);
    if (known) return activate(known.id);
    // a text area keeps lines apart with LF only, so a file with CRLF line ends is not "changed" by being opened
    const text = (await fs.readFile(path)).replace(/\r\n?/g, '\n');
    // a lone, untouched "Untitled" tab is replaced by the file
    const only = state.tabs.length === 1 && !state.tabs[0].path && !textOf(state.tabs[0]);
    const tab = createTab({ path: entry.path, text, saved: text });
    if (only) {
      const [old] = state.tabs.splice(0, 1);
      old.el.remove();
    }
    activate(tab.id);
    editor.setSelectionRange(0, 0);
  } catch (err) {
    alertDialog(t('notepad.error.open'), describeError(err));
  }
}

async function openFile() {
  const tab = active();
  const path = await pickFile({ mode: 'open', dir: tab?.path ? fs.resolve('..', tab.path) : KNOWN_FOLDERS.documents, filter: (e) => !e.url });
  if (path) await openPath(path);
}

async function save(tab = active()) {
  return tab.path ? write(tab, tab.path) : saveAs(tab);
}

async function saveAs(tab = active()) {
  const path = await pickFile({ mode: 'save', dir: KNOWN_FOLDERS.documents, defaultName: tab.path ? basename(tab.path) : `${t('notepad.untitled')}.txt`, extension: 'txt' });
  return path ? write(tab, path) : false;
}

async function saveAll() {
  for (const tab of state.tabs) if (dirty(tab) && !(await save(tab))) return;
}

async function write(tab, path) {
  try {
    const text = textOf(tab);
    await fs.writeFile(path, text);
    tab.path = path;
    tab.saved = text;
    renderTabs();
    afterChange();
    persist();
    return true;
  } catch (err) {
    alertDialog(t('notepad.error.save'), describeError(err));
    return false;
  }
}

function newWindow() {
  if (selfApp) os.launch(selfApp);
}

/* ------------------------------ find and replace ------------------------------ */

const findInput = h('input', { class: 'input', type: 'text', spellcheck: false, autocomplete: 'off' });
const replaceInput = h('input', { class: 'input', type: 'text', spellcheck: false, autocomplete: 'off' });
const caseBox = h('input', { type: 'checkbox' });
const countEl = h('span', { class: 'find-count' });
const replaceRow = h('div', { class: 'find-row' }, replaceInput);
const findbar = h('div', { class: 'findbar', hidden: true, role: 'search' });
editorsEl.before(findbar);

function matches() {
  const query = findInput.value;
  if (!query || !editor) return [];
  const hay = caseBox.checked ? editor.value : editor.value.toLowerCase();
  const needle = caseBox.checked ? query : query.toLowerCase();
  const found = [];
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + needle.length)) found.push(i);
  return found;
}

function updateCount(message) {
  const list = matches();
  if (message) countEl.textContent = message;
  else if (!findInput.value) countEl.textContent = '';
  else if (!list.length) countEl.textContent = t('notepad.find.none');
  else {
    const at = list.filter((p) => p < editor.selectionEnd).length;
    countEl.textContent = t('notepad.find.count', { current: Math.max(1, Math.min(at, list.length)), total: list.length });
  }
}

function scrollToIndex(index) {
  const line = editor.value.slice(0, index).split('\n').length - 1;
  const lineHeight = parseFloat(getComputedStyle(editor).lineHeight) || 20;
  editor.scrollTop = Math.max(0, line * lineHeight - editor.clientHeight / 2);
}

function findNext(direction = 1) {
  const list = matches();
  updateCount();
  if (!list.length) return false;
  const length = findInput.value.length;
  const index =
    direction > 0 ? list.find((p) => p >= editor.selectionEnd) ?? list[0] : [...list].reverse().find((p) => p + length <= editor.selectionStart) ?? list[list.length - 1];
  editor.setSelectionRange(index, index + length);
  scrollToIndex(index);
  updateCount();
  return true;
}

/** Replace through the editor's own edit command, so Ctrl+Z still undoes it. */
function insertAt(start, end, text) {
  editor.focus();
  editor.setSelectionRange(start, end);
  document.execCommand('insertText', false, text);
}

function replaceOne() {
  const picked = editor.value.slice(editor.selectionStart, editor.selectionEnd);
  const same = caseBox.checked ? picked === findInput.value : picked.toLowerCase() === findInput.value.toLowerCase();
  if (picked && same) insertAt(editor.selectionStart, editor.selectionEnd, replaceInput.value);
  findNext(1);
}

function replaceAll() {
  const list = matches();
  if (!list.length) return updateCount();
  const pattern = new RegExp(findInput.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseBox.checked ? 'g' : 'gi');
  insertAt(0, editor.value.length, editor.value.replace(pattern, () => replaceInput.value));
  editor.setSelectionRange(0, 0);
  updateCount(i18n.plural('notepad.find.replaced', list.length));
}

function openFind(withReplace) {
  findbar.hidden = false;
  replaceRow.hidden = !withReplace;
  const picked = editor.value.slice(editor.selectionStart, editor.selectionEnd);
  if (picked && !picked.includes('\n')) findInput.value = picked;
  findInput.focus();
  findInput.select();
  updateCount();
}

function closeFind() {
  findbar.hidden = true;
  editor.focus();
}

function buildFindbar() {
  const button = (label, action) => h('button', { class: 'btn', type: 'button', onclick: action }, label);
  findInput.placeholder = t('notepad.find.find');
  replaceInput.placeholder = t('notepad.find.replace');
  findbar.replaceChildren(
    h(
      'div',
      { class: 'find-row' },
      findInput,
      button(t('notepad.find.previous'), () => findNext(-1)),
      button(t('notepad.find.next'), () => findNext(1)),
      h('label', { class: 'find-case' }, caseBox, h('span', null, t('notepad.find.matchCase'))),
      countEl,
      h('button', { class: 'btn btn-subtle btn-icon', type: 'button', 'aria-label': t('common.close'), onclick: closeFind }, '×')
    ),
    replaceRow
  );
  replaceRow.replaceChildren(replaceInput, button(t('notepad.find.replaceOne'), replaceOne), button(t('notepad.find.replaceAll'), replaceAll));
}

findInput.addEventListener('input', () => updateCount());
caseBox.addEventListener('change', () => updateCount());
findbar.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    closeFind();
  } else if (e.key === 'Enter' && e.target === findInput) {
    e.preventDefault();
    findNext(e.shiftKey ? -1 : 1);
  } else if (e.key === 'Enter' && e.target === replaceInput) {
    e.preventDefault();
    replaceOne();
  } else if ((e.ctrlKey || e.metaKey) && ['f', 'h'].includes(e.key.toLowerCase())) {
    e.preventDefault();
    openFind(e.key.toLowerCase() === 'h');
  }
});

/* --------------------------------- editing -------------------------------- */

const edit = (command) => () => {
  editor.focus();
  document.execCommand(command);
};

async function paste() {
  editor.focus();
  try {
    editor.setRangeText(await navigator.clipboard.readText(), editor.selectionStart, editor.selectionEnd, 'end');
    editor.dispatchEvent(new Event('input'));
  } catch {
    /* clipboard access refused: Ctrl+V still works */
  }
}

function insertTimeDate() {
  editor.focus();
  const now = new Date();
  document.execCommand('insertText', false, `${i18n.date(now, { timeStyle: 'short' })} ${i18n.date(now, { dateStyle: 'short' })}`);
}

async function goToLine() {
  const lines = editor.value.split('\n').length;
  const current = editor.value.slice(0, editor.selectionStart).split('\n').length;
  const { button, value } = await showDialog({
    title: t('notepad.goTo.title'),
    message: t('notepad.goTo.message', { max: lines }),
    input: { value: String(current), select: [0, String(current).length] },
    buttons: [
      { id: 'go', label: t('notepad.goTo.go'), primary: true },
      { id: 'cancel', label: t('common.cancel') }
    ],
    cancelId: 'cancel'
  });
  const line = Number.parseInt(value, 10);
  if (button !== 'go' || !Number.isFinite(line)) return editor.focus();
  const target = Math.min(lines, Math.max(1, line));
  const index = editor.value.split('\n').slice(0, target - 1).reduce((sum, row) => sum + row.length + 1, 0);
  editor.focus();
  editor.setSelectionRange(index, index);
  scrollToIndex(index);
  updateStatus();
}

function zoom(delta) {
  prefs.zoom = delta === 0 ? 100 : Math.min(500, Math.max(25, prefs.zoom + delta));
  savePrefs();
  applyView();
}

/* -------------------------------- settings -------------------------------- */

function openSettings() {
  const row = (label, control) => h('label', { class: 'pref' }, h('span', null, label), control);
  const font = h('select', { class: 'input' }, FONTS.map((name) => h('option', { value: name, selected: name === prefs.font }, name)));
  const size = h('input', { class: 'input', type: 'number', min: 8, max: 48, value: String(prefs.size) });
  const wrap = h('input', { type: 'checkbox', checked: prefs.wrap });
  const restore = h('select', { class: 'input' }, [
    h('option', { value: 'restore', selected: prefs.restore }, t('notepad.settings.startRestore')),
    h('option', { value: 'new', selected: !prefs.restore }, t('notepad.settings.startNew'))
  ]);
  const apply = () => {
    prefs.font = font.value;
    prefs.size = Math.min(48, Math.max(8, Number.parseInt(size.value, 10) || BASE_SIZE));
    prefs.wrap = wrap.checked;
    prefs.restore = restore.value === 'restore';
    savePrefs();
    applyView();
    afterChange();
    persist(true);
  };
  for (const control of [font, size, wrap, restore]) control.addEventListener('change', apply);
  const sample = h('p', { class: 'pref-sample' }, t('notepad.settings.sample'));
  const refreshSample = () => {
    sample.style.fontFamily = `"${font.value}", monospace`;
    sample.style.fontSize = `${Math.min(48, Math.max(8, Number.parseInt(size.value, 10) || BASE_SIZE))}px`;
  };
  font.addEventListener('change', refreshSample);
  size.addEventListener('input', refreshSample);
  refreshSample();
  return showDialog({
    title: t('notepad.settings.title'),
    content: h('div', { class: 'prefs' }, row(t('notepad.settings.font'), font), row(t('notepad.settings.size'), size), row(t('notepad.format.wrap'), wrap), row(t('notepad.settings.startup'), restore), sample),
    buttons: [{ id: 'ok', label: t('common.close'), primary: true }]
  }).then(() => editor.focus());
}

/* ---------------------------------- menus ---------------------------------- */

const MENUS = () => [
  {
    label: t('notepad.menu.file'),
    items: () => [
      { label: t('notepad.file.new'), shortcut: 'Ctrl+N', action: newTab },
      { label: t('notepad.file.newWindow'), shortcut: 'Ctrl+Shift+N', action: newWindow },
      { label: t('notepad.file.open'), shortcut: 'Ctrl+O', action: openFile },
      { separator: true },
      { label: t('notepad.file.save'), shortcut: 'Ctrl+S', action: () => save() },
      { label: t('notepad.file.saveAs'), shortcut: 'Ctrl+Shift+S', action: () => saveAs() },
      { label: t('notepad.file.saveAll'), shortcut: 'Ctrl+Alt+S', action: saveAll },
      { separator: true },
      { label: t('notepad.closeTab'), shortcut: 'Ctrl+W', action: () => closeTab(state.activeId) },
      { label: t('notepad.file.closeWindow'), shortcut: 'Ctrl+Shift+W', action: () => os.window.close() },
      { label: t('notepad.file.exit'), action: () => os.window.close() }
    ]
  },
  {
    label: t('notepad.menu.edit'),
    items: () => [
      { label: t('notepad.edit.undo'), shortcut: 'Ctrl+Z', action: edit('undo') },
      { label: t('notepad.edit.redo'), shortcut: 'Ctrl+Y', action: edit('redo') },
      { separator: true },
      { label: t('files.cut'), shortcut: 'Ctrl+X', action: edit('cut') },
      { label: t('files.copy'), shortcut: 'Ctrl+C', action: edit('copy') },
      { label: t('files.paste'), shortcut: 'Ctrl+V', action: paste },
      { label: t('files.delete'), shortcut: 'Del', action: edit('delete') },
      { separator: true },
      { label: t('notepad.edit.find'), shortcut: 'Ctrl+F', action: () => openFind(false) },
      { label: t('notepad.edit.findNext'), shortcut: 'F3', action: () => findNext(1) },
      { label: t('notepad.edit.findPrevious'), shortcut: 'Shift+F3', action: () => findNext(-1) },
      { label: t('notepad.edit.replace'), shortcut: 'Ctrl+H', action: () => openFind(true) },
      { label: t('notepad.edit.goTo'), shortcut: 'Ctrl+G', action: goToLine },
      { separator: true },
      { label: t('notepad.selectAll'), shortcut: 'Ctrl+A', action: () => (editor.focus(), editor.select()) },
      { label: t('notepad.edit.timeDate'), shortcut: 'F5', action: insertTimeDate }
    ]
  },
  {
    label: t('notepad.menu.format'),
    items: () => [
      { label: t('notepad.format.wrap'), checked: prefs.wrap, action: () => ((prefs.wrap = !prefs.wrap), savePrefs(), applyView()) },
      { label: t('notepad.format.font'), action: openSettings }
    ]
  },
  {
    label: t('notepad.menu.view'),
    items: () => [
      {
        label: t('notepad.view.zoom'),
        items: [
          { label: t('notepad.view.zoomIn'), shortcut: 'Ctrl++', action: () => zoom(10) },
          { label: t('notepad.view.zoomOut'), shortcut: 'Ctrl+-', action: () => zoom(-10) },
          { label: t('notepad.view.zoomReset'), shortcut: 'Ctrl+0', action: () => zoom(0) }
        ]
      },
      { label: t('notepad.view.statusBar'), checked: prefs.statusBar, action: () => ((prefs.statusBar = !prefs.statusBar), savePrefs(), applyView()) }
    ]
  }
];

function buildMenubar() {
  menubar.replaceChildren();
  for (const menu of MENUS()) {
    const button = h('button', { class: 'menu-btn', type: 'button', role: 'menuitem' }, menu.label);
    os.dropdown(button, menu.items);
    menubar.append(button);
  }
  const gear = document.getElementById('settings-btn');
  gear.dataset.tip = t('notepad.settings.title');
  gear.setAttribute('aria-label', t('notepad.settings.title'));
}

/* --------------------------------- wiring --------------------------------- */

function attachEditor(el) {
  el.addEventListener('input', () => {
    afterChange();
    persist();
  });
  for (const type of ['keyup', 'click', 'select']) el.addEventListener(type, updateStatus);
  el.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    zoom(e.deltaY < 0 ? 10 : -10);
  }, { passive: false });
  el.addEventListener('keydown', onKey);
}

function onKey(e) {
  if (e.key === 'Tab' && !e.ctrlKey) {
    e.preventDefault();
    document.execCommand('insertText', false, '\t');
    return;
  }
  if (e.key === 'F3') {
    e.preventDefault();
    if (findInput.value) findNext(e.shiftKey ? -1 : 1);
    else openFind(false);
    return;
  }
  if (e.key === 'F5') {
    e.preventDefault();
    insertTimeDate();
    return;
  }
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return;
  const key = e.key.toLowerCase();
  if (e.key === 'Tab') {
    e.preventDefault();
    const at = state.tabs.findIndex((tab) => tab.id === state.activeId);
    activate(state.tabs[(at + (e.shiftKey ? state.tabs.length - 1 : 1)) % state.tabs.length].id);
    return;
  }
  const run = {
    s: e.altKey ? saveAll : e.shiftKey ? () => saveAs() : () => save(),
    o: openFile,
    n: e.shiftKey ? newWindow : newTab,
    w: e.shiftKey ? () => os.window.close() : () => closeTab(state.activeId),
    f: () => openFind(false),
    h: () => openFind(true),
    g: goToLine
  }[key];
  if (run) {
    e.preventDefault();
    run();
  } else if (key === '+' || key === '=') (e.preventDefault(), zoom(10));
  else if (key === '-') (e.preventDefault(), zoom(-10));
  else if (key === '0') (e.preventDefault(), zoom(0));
}

document.getElementById('settings-btn').addEventListener('click', openSettings);
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('.menurow, .tabs, .editor, .findbar')) setTimeout(() => editor?.focus(), 0);
});
os.window.on('activate', () => editor?.focus());
os.window.on('deactivate', () => persist(true));
os.window.onBeforeClose(settleAll);
os.window.on('args', (args) => typeof args.path === 'string' && openPath(args.path));
window.addEventListener('pagehide', () => persist(true));
i18n.on('change', () => {
  buildMenubar();
  buildFindbar();
  renderTabs();
  afterChange();
});

async function restoreSession() {
  const session = prefs.restore && primary ? readJSON('notepad.session', null) : null;
  for (const item of session?.tabs ?? []) {
    let saved = item.saved ?? '';
    // a file that exists is compared with what is on the disk now
    if (item.path && fs.isFile(item.path)) {
      try {
        saved = (await fs.readFile(item.path)).replace(/\r\n?/g, '\n');
      } catch {
        /* keep what was stored */
      }
    }
    createTab({ path: item.path && fs.isFile(item.path) ? fs.stat(item.path).path : null, text: item.text ?? '', saved: item.path && fs.isFile(item.path) ? saved : '' });
  }
  if (!state.tabs.length) createTab();
  activate(state.tabs[Math.max(0, Math.min(session?.active ?? 0, state.tabs.length - 1))].id);
}

hydrateIcons(document);
buildMenubar();
buildFindbar();
await restoreSession();
if (typeof os.args.path === 'string') {
  await openPath(os.args.path);
  // more files in the tabs after it (args.paths), with the first one kept in front
  const extras = (Array.isArray(os.args.paths) ? os.args.paths : []).filter((extra) => typeof extra === 'string');
  for (const extra of extras) await openPath(extra);
  if (extras.length) await openPath(os.args.path);
}
editor.focus();
