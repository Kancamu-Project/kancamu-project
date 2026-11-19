/* Drivemu — serverless file storage on top of GitHub (the user's own repository). */
(() => {
'use strict';

const STORAGE_LIMIT_KB = 5 * 1024 * 1024;   // the size the percentage of use is counted against (5 GB)
const DEFAULT_FOLDERS = ['Documents', 'Images', 'Videos', 'Audio'];   // what a new drive starts with
const KEEP = '.gitkeep';              // keeps an empty folder alive
const MAX_FILE = 100 * 1024 * 1024;   // GitHub's hard limit per file (100 MB), not an artificial one

const $ = (id) => document.getElementById(id);
const tr = (key, params) => i18n.t(key, params);
const S = {
  token: '', user: null, owner: '', repo: '', branch: 'main', head: null,
  path: [], rootFolders: [], items: [], visible: [], view: 'grid', sort: 'name', dir: 1, query: '',
  selected: new Set(), busy: false, repoSizeKB: 0, repoPrivate: true,
};

/* ---------- utilities ---------- */
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const icon = (name) => h('span', 'icon i-' + name);
const enc = (p) => p.split('/').map(encodeURIComponent).join('/');
const fullPath = (...parts) => [...S.path, ...parts].filter(Boolean).join('/');
const contentsOf = (path) => `/contents${path ? '/' + enc(path) : ''}`;
const fmtSize = (n) => {
  if (n < 1024) return n + ' B';
  const u = ['KB', 'MB', 'GB', 'TB']; let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return n.toFixed(n < 10 ? 1 : 0) + ' ' + u[i];
};
const ext = (name) => (name.includes('.') ? name.split('.').pop().toLowerCase() : '');
const TYPES = {
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'ico'],
  video: ['mp4', 'webm', 'mov', 'ogv', 'm4v'],
  audio: ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'],
  pdf: ['pdf'],
  text: ['txt', 'md', 'json', 'csv', 'js', 'ts', 'css', 'html', 'xml', 'yml', 'yaml', 'log', 'py', 'java', 'c', 'cpp', 'sh', 'ini', 'toml', 'sql'],
  archive: ['zip', 'rar', '7z', 'tar', 'gz'],
};
const THUMB_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp'];
const kind = (it) => {
  if (it.type === 'dir') return 'folder';
  const e = ext(it.name);
  for (const k in TYPES) if (TYPES[k].includes(e)) return k;
  return 'file';
};
const ICON_OF = { folder: 'folder', image: 'image', video: 'video', audio: 'audio', pdf: 'pdf', text: 'file-text', archive: 'archive', file: 'file' };
const typeLabel = (it) => (it.type === 'dir' ? tr('type.folder') : ext(it.name) ? tr('type.fileExt', { ext: ext(it.name).toUpperCase() }) : tr('type.file'));
const tile = (k, big = false) => { const t = h('span', 'tile k-' + k + (big ? ' lg' : '')); t.appendChild(icon(ICON_OF[k])); return t; };
const MIME = { svg: 'image/svg+xml', pdf: 'application/pdf', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

function toast(msg, isErr = false, ms = 3500) {
  const el = h('div', 'toast' + (isErr ? ' err' : ''));
  el.append(icon(isErr ? 'alert' : 'check'), h('span', '', msg));
  $('toasts').appendChild(el);
  if (ms) setTimeout(() => el.remove(), ms);
  return el;
}
function progressToast(text) {
  const el = h('div', 'toast');
  const label = h('span', '', text), bar = h('div', 'bar'); bar.appendChild(h('i'));
  el.append(icon('upload'), label, bar);
  $('toasts').appendChild(el);
  return {
    set(t, p) { label.textContent = t; bar.firstChild.style.width = Math.round(p * 100) + '%'; },
    done() { el.remove(); },
  };
}

/* ---------- dialogs ---------- */
function ask({ title, text = '', input = null, ok = tr('ok') }) {
  return new Promise((resolve) => {
    const d = $('dlg'), inp = $('dlgInput');
    $('dlgTitle').textContent = title;
    $('dlgText').textContent = text;
    $('dlgText').classList.toggle('hidden', !text);
    $('dlgOk').textContent = ok;
    inp.classList.toggle('hidden', input === null);
    if (input !== null) inp.value = input;
    let result = null;
    const finish = (v) => { result = v; d.close(); };
    $('dlgForm').onsubmit = (e) => { e.preventDefault(); finish(input === null ? true : inp.value.trim()); };
    $('dlgCancel').onclick = () => finish(null);
    d.onclose = () => resolve(result);
    d.showModal();
    if (input !== null) { inp.focus(); inp.select(); }
  });
}

/* ---------- GitHub API ---------- */
async function api(path, opts = {}) {
  const res = await fetch(path.startsWith('http') ? path : 'https://api.github.com' + path, {
    cache: 'no-store', // the GitHub API replies with max-age=60; without this the browser serves a stale list
    ...opts,
    headers: {
      Authorization: 'Bearer ' + S.token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opts.body && typeof opts.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).message || msg; } catch { /* ignore */ }
    const err = new Error(msg); err.status = res.status; throw err;
  }
  if (opts.returnResponse) return res;
  if (res.status === 204) return null;
  if ((opts.headers || {}).Accept && opts.headers.Accept.includes('raw')) return res;
  return res.json();
}
const repoApi = (p, opts) => api(`/repos/${S.owner}/${S.repo}${p}`, opts);

// One commit for many changes (git data API)
async function commitTree(entries, message) {
  const ref = await repoApi(`/git/ref/heads/${S.branch}`);
  const parent = ref.object.sha;
  const commit = await repoApi(`/git/commits/${parent}`);
  const tree = await repoApi('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: commit.tree.sha, tree: entries }) });
  const nc = await repoApi('/git/commits', { method: 'POST', body: JSON.stringify({ message, tree: tree.sha, parents: [parent] }) });
  await repoApi(`/git/refs/heads/${S.branch}`, { method: 'PATCH', body: JSON.stringify({ sha: nc.sha }) });
  S.head = nc.sha; // read straight from this commit: not affected by caching or branch replication lag
}
// Every blob (file) under a folder
async function blobsUnder(prefix) {
  const ref = await repoApi(`/git/ref/heads/${S.branch}`);
  const commit = await repoApi(`/git/commits/${ref.object.sha}`);
  const tree = await repoApi(`/git/trees/${commit.tree.sha}?recursive=1`);
  return tree.tree.filter((t) => t.type === 'blob' && t.path.startsWith(prefix + '/'));
}
// Folder listing through the git tree (no 1000-item cap like the Contents API)
async function listViaTree(dir) {
  const sha = S.head || (await repoApi(`/git/ref/heads/${S.branch}`)).object.sha;
  const commit = await repoApi(`/git/commits/${sha}`);
  const tree = await repoApi(`/git/trees/${commit.tree.sha}?recursive=1`);
  const prefix = dir ? dir + '/' : '';
  return tree.tree
    .filter((t) => t.path.startsWith(prefix) && !t.path.slice(prefix.length).includes('/'))
    .map((t) => ({ name: t.path.slice(prefix.length), path: t.path, type: t.type === 'tree' ? 'dir' : 'file', size: t.size || 0, sha: t.sha }));
}
/* ---------- the account: one sign-in, shared with the other webs (assets/account.js) ---------- */
async function authenticate(token) {
  S.token = token;
  const res = await api('/user', { returnResponse: true });
  S.user = await res.json();
  S.owner = S.user.login;
}

// The default folders, all empty (a folder is kept by an empty .gitkeep file).
async function createDefaultFolders() {
  const blob = await repoApi('/git/blobs', { method: 'POST', body: JSON.stringify({ content: '', encoding: 'utf-8' }) });
  await commitTree(DEFAULT_FOLDERS.map((name) => ({ path: `${name}/${KEEP}`, mode: '100644', type: 'blob', sha: blob.sha })), 'Drivemu: create the default folders');
}

// Connects to the drivemu branch of the shared storage (assets/storage.js), then makes sure the root folder is there.
async function openStorage() {
  const store = await storage.connect('drivemu');
  S.owner = store.owner; S.repo = store.repo; S.branch = store.branch;
  S.repoPrivate = store.info.private; S.repoSizeKB = store.info.size || 0;
  S.head = null;
  let root = [];
  try { root = await repoApi(`${contentsOf('')}?ref=${S.branch}`); } catch (e) { if (e.status !== 404) throw e; }
  if (root.every((item) => item.name === KEEP)) await createDefaultFolders();   // a new, empty branch
  showApp();
}

// Connects with the shared account; shows the sign-in screen when there is none or it does not work.
async function startFromAccount() {
  const acc = account.get();
  if (!acc) { showSignedOut(); return; }
  try {
    await authenticate(acc.token);
    await openStorage();
  } catch (e) {
    if (e.status === 401) { toast(tr('acct.tokenInvalid', { name: acc.login || tr('acct.anAccount') }), true, 6000); account.signOut(); showSignedOut(); }
    else showSignedOut(tr('login.couldNotConnect', { message: e.code === 'noWrite' ? tr('error.noWrite') : e.message }));
  }
}
// Back to the sign-in screen (the account was removed here or in another web).
function resetSession() { S.token = ''; S.user = null; S.items = []; S.rootFolders = []; showSignedOut(); }
account.onChange(async (acc) => {
  if (!acc) { if (S.user) resetSession(); return; }
  if (!S.user || acc.token !== S.token) await startFromAccount();
});

/* --- screens --- */
function showApp() {
  S.path = []; S.query = ''; $('search').value = ''; S.selected.clear(); load();
}
// Reset: every file and folder is deleted, and the default folders are made again, in one commit.
async function resetDrive() {
  if (!(await ask({ title: tr('reset.title'), text: tr('reset.text'), ok: tr('reset') }))) return;
  $('settings').close();
  const t = toast(tr('reset.doing'), false, 0);
  try {
    const ref = await repoApi(`/git/ref/heads/${S.branch}`);
    const commit = await repoApi(`/git/commits/${ref.object.sha}`);
    const tree = await repoApi(`/git/trees/${commit.tree.sha}?recursive=1`);
    const empty = await repoApi('/git/blobs', { method: 'POST', body: JSON.stringify({ content: '', encoding: 'utf-8' }) });
    const entries = tree.tree.filter((i) => i.type === 'blob' && i.path !== KEEP).map((i) => ({ path: i.path, mode: i.mode, type: 'blob', sha: null }));
    entries.push(...DEFAULT_FOLDERS.map((name) => ({ path: `${name}/${KEEP}`, mode: '100644', type: 'blob', sha: empty.sha })));
    await commitTree(entries, 'Drivemu: reset');
    toast(tr('reset.done'));
  } catch (e) { toast(tr('failed', { message: e.message }), true, 6000); }
  t.remove();
  S.path = []; S.query = ''; $('search').value = '';
  load(); refreshUsage();
}

// Not signed in: the files page is shown as it is, empty, with an invitation to sign in.
function showSignedOut(err = '') {
  S.path = []; S.query = ''; $('search').value = ''; S.selected.clear(); S.items = []; S.head = null;
  $('loading').classList.add('hidden');
  render();
  if (err) toast(err, true, 6000);
}

/* --- settings: appearance, profile, token, repository --- */
const row = (k, v) => {
  const r = h('div', 'srow'), val = h('span', 'sv');
  if (v instanceof Node) val.append(v); else val.textContent = v;
  r.append(h('span', 'sk', k), val);
  return r;
};
const section = (title, ...kids) => { const s = h('section', 'ssec'); s.append(h('h4', '', title), ...kids); return s; };

async function openSettings() {
  const d = $('settings'), body = $('settingsBody');
  body.replaceChildren(h('div', 'spinner'));
  if (!d.open) d.showModal();
  if (S.user) try { // fresh data; if that fails, keep what we have
    const info = await repoApi('');
    S.repoSizeKB = info.size; S.repoPrivate = info.private;
  } catch { /* ignore */ }

  const add = (rows, k, v) => { if (v !== null && v !== undefined && v !== '') rows.append(row(k, v)); };

  // storage
  const rr = h('div', 'srows');
  add(rr, tr('usage.title'), tr('usage.value', usageInfo().params));
  const resetBtn = h('button', 'btn danger'); resetBtn.type = 'button';
  resetBtn.append(icon('refresh'), h('span', '', tr('reset')));
  resetBtn.onclick = resetDrive;

  // appearance: language and theme, shared with every other web
  const lang = h('select', 'language'); lang.setAttribute('aria-label', tr('language'));
  const themes = h('div', 'seg'); themes.setAttribute('role', 'group'); themes.setAttribute('aria-label', tr('theme'));
  for (const [name, ico] of [['dark', 'moon'], ['light', 'sun']]) {
    const b = h('button'); b.type = 'button'; b.dataset.theme = name; b.title = tr('theme.' + name);
    b.setAttribute('aria-label', tr('theme.' + name)); b.append(icon(ico));
    b.onclick = () => { try { localStorage.setItem('theme', name); } catch { /* ignore */ } document.documentElement.dataset.theme = name; markTheme(); };
    themes.append(b);
  }
  const look = h('div', 'srows'); look.append(row(tr('language'), lang), row(tr('theme'), themes));

  body.replaceChildren(...[
    section(tr('set.appearance'), look),
    S.user && section(tr('set.storage'), rr),
    S.user && section(tr('reset.title'), h('p', 'hint', tr('reset.hint')), resetBtn),
  ].filter(Boolean));
  i18n.selects();
  markTheme();
}

// Shows which theme is active in the settings (also when another web changed it).
function markTheme() {
  document.querySelectorAll('#settingsBody .seg button').forEach((b) => b.classList.toggle('on', b.dataset.theme === document.documentElement.dataset.theme));
}
window.addEventListener('storage', (e) => { if (e.key === 'theme' || e.key === null) markTheme(); });

/* ---------- file list ---------- */
async function load() {
  $('loading').replaceChildren(...Array.from({ length: 4 }, () => h('i')));
  $('loading').classList.remove('hidden'); $('empty').classList.add('hidden'); $('list').replaceChildren();
  S.selected.clear();
  try {
    const r = await repoApi(`${contentsOf(fullPath())}?ref=${S.head || S.branch}`);
    let items = Array.isArray(r) ? r : [];
    if (items.length >= 1000) items = await listViaTree(fullPath()); // the Contents API stops at 1000 items
    S.items = items.filter((i) => i.name !== KEEP);
    if (!S.path.length) S.rootFolders = S.items.filter((i) => i.type === 'dir').map((i) => i.name);
  } catch (e) {
    if (e.status === 404) S.items = [];
    else { toast(tr('load.failed', { message: e.message }), true); S.items = []; }
  }
  $('loading').classList.add('hidden');
  render();
}

function visibleItems() {
  const q = S.query.toLowerCase();
  const cmp = {
    name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
    size: (a, b) => a.size - b.size,
    type: (a, b) => ext(a.name).localeCompare(ext(b.name)) || a.name.localeCompare(b.name),
  }[S.sort];
  const items = S.items.filter((i) => !q || i.name.toLowerCase().includes(q));
  items.sort((a, b) => (a.type === b.type ? cmp(a, b) * S.dir : a.type === 'dir' ? -1 : 1));
  return items;
}

// How much of the storage is used: the percentage, and the text with sizes.
function usageInfo() {
  const used = S.repoSizeKB * 1024, limit = STORAGE_LIMIT_KB * 1024;
  const percent = Math.min(100, (used / limit) * 100);
  const params = { percent: i18n.number(percent, { maximumFractionDigits: percent < 10 ? 1 : 0 }), used: fmtSize(used), limit: fmtSize(limit) };
  return { percent, params };
}
function refreshUsage() {
  repoApi('').then((info) => { S.repoSizeKB = info.size; renderSide(); }).catch(() => { /* ignore */ });
}

// The sidebar: the folders at the root of the branch (the last list read at the root), and the root itself.
function renderSide() {
  const nav = $('folders'), box = $('usage');
  $('app').classList.toggle('plain', !S.user);   // signed out: only the name, settings, and profile show
  nav.replaceChildren(); box.replaceChildren();
  if (!S.user) return;
  const entry = (label, ico, path, on) => {
    const b = h('button', 'btn'); b.type = 'button'; b.classList.toggle('on', on);
    b.append(icon(ico), h('span', '', label));
    b.onclick = () => goTo(path);
    return b;
  };
  nav.append(entry(tr('nav.myDrive'), 'hard-drive', [], S.path.length === 0));
  for (const name of S.rootFolders) nav.append(entry(name, 'folder', [name], S.path[0] === name));
  // the indicator of the storage used, at the bottom
  const { percent, params } = usageInfo();
  const meter = h('div', 'meter'), fill = h('i');
  fill.style.width = `${percent > 0 ? Math.max(percent, 1) : 0}%`;
  meter.append(fill);
  meter.setAttribute('role', 'progressbar'); meter.setAttribute('aria-valuenow', Math.round(percent)); meter.setAttribute('aria-valuemin', 0); meter.setAttribute('aria-valuemax', 100);
  box.append(h('span', 'usage-percent', tr('usage.percent', params)), meter, h('span', 'usage-detail', tr('usage.detail', params)));
}
function goTo(path) { S.path = path; S.query = ''; $('search').value = ''; load(); }

function render() {
  renderSide();
  renderCrumbs();
  const items = S.visible = visibleItems();
  const list = $('list');
  list.className = 'list ' + S.view;
  list.replaceChildren();
  if (S.view === 'grid') {
    const dirs = items.filter((i) => i.type === 'dir'), files = items.filter((i) => i.type !== 'dir');
    if (dirs.length) { list.appendChild(h('div', 'sec', tr('list.folders'))); const g = h('div', 'folders'); dirs.forEach((i) => g.appendChild(folderChip(i))); list.appendChild(g); }
    if (files.length) { list.appendChild(h('div', 'sec', tr('list.files'))); const g = h('div', 'cards'); files.forEach((i) => g.appendChild(fileCard(i))); list.appendChild(g); }
  } else if (items.length) {
    list.appendChild(listTable(items));
  }
  // empty state
  const empty = items.length === 0;
  $('empty').classList.toggle('hidden', !empty);
  if (empty) {
    const searching = S.query && S.items.length > 0;
    $('emptyTitle').textContent = tr(!S.user ? 'signedout.title' : searching ? 'empty.noMatches' : 'empty.title');
    $('emptyText').textContent = !S.user ? tr('signedout.text') : searching ? tr('empty.noMatchesText', { query: S.query }) : tr('empty.text');
    const cta = $('emptyCta');
    cta.replaceChildren(icon(S.user ? 'upload' : 'user'), h('span', '', tr(S.user ? 'menu.uploadFiles' : 'login.signIn')));
    cta.onclick = S.user ? () => $('fileInput').click() : () => account.open();
    cta.classList.toggle('hidden', searching && !!S.user);
  }
  $('viewGrid').classList.toggle('on', S.view === 'grid');
  $('viewList').classList.toggle('on', S.view === 'list');
  $('sort').value = `${S.sort}:${S.dir}`;
  $('newBtn').disabled = !S.user;
  updateSelection();
  const files = S.items.filter((i) => i.type !== 'dir');
  const total = files.reduce((s, f) => s + f.size, 0);
  $('status').textContent = !S.user ? '' : tr('status', { folders: S.items.length - files.length, files: files.length, size: fmtSize(total), });
}

function renderCrumbs() {
  const c = $('crumbs'); c.replaceChildren();
  const mk = (label, depth) => {
    const b = h('span', 'crumb', label); b.tabIndex = 0; b.setAttribute('role', 'link');
    b.onclick = () => goTo(S.path.slice(0, depth));
    b.onkeydown = (e) => { if (e.key === 'Enter') b.click(); };
    return b;
  };
  c.appendChild(mk(tr('nav.myDrive'), 0));
  S.path.forEach((p, i) => { const s = icon('chevron-right'); s.classList.add('sep'); c.append(s, mk(p, i + 1)); });
}

/* ----- item building blocks ----- */
function chkEl(it, always = false) {
  const c = h('input', 'chk' + (always ? ' always' : '')); c.type = 'checkbox'; c.setAttribute('aria-label', tr('sel.item', { name: it.name }));
  c.onclick = (e) => e.stopPropagation();
  c.onchange = () => toggleSel(it.name, c.checked);
  return c;
}
function actsEl(it) {
  const a = h('div', 'acts');
  const btn = (ic, title, fn, cls = '') => { const b = h('button', 'ibtn ' + cls); b.append(icon(ic)); b.title = title; b.setAttribute('aria-label', title); b.onclick = (e) => { e.stopPropagation(); fn(); }; return b; };
  if (it.type !== 'dir') a.appendChild(btn('download', tr('download'), () => download(it)));
  a.appendChild(btn('pencil', tr('rename'), () => rename(it)));
  a.appendChild(btn('trash', tr('delete'), () => remove([it]), 'del'));
  return a;
}
function nameCell(it, k) {
  const n = h('div', 'namecell'); n.append(tile(k), h('span', 'name', it.name)); return n;
}
function base(it, cls) {
  const el = h('div', 'item ' + cls); el.dataset.name = it.name; el.title = it.name;
  el.onclick = () => (S.selected.size ? toggleSel(it.name) : open(it));
  // Keyboard: Tab reaches every item; arrows move between them, Enter opens, Space selects, F2 renames, Delete deletes.
  el.tabIndex = 0;
  el.onkeydown = (e) => {
    if (e.target !== el) return;
    const move = (step) => { const all = [...$('list').querySelectorAll('.item')]; all[all.indexOf(el) + step]?.focus(); };
    const keys = {
      Enter: () => el.click(), ' ': () => toggleSel(it.name), F2: () => rename(it), Delete: () => remove([it]),
      ArrowDown: () => move(1), ArrowRight: () => move(1), ArrowUp: () => move(-1), ArrowLeft: () => move(-1),
    };
    if (keys[e.key]) { e.preventDefault(); keys[e.key](); }
  };
  return el;
}
function folderChip(it) {
  const el = base(it, 'fchip k-folder');
  el.append(tile('folder'), h('span', 'name', it.name), actsEl(it), chkEl(it));
  return el;
}
function fileCard(it) {
  const k = kind(it);
  const el = base(it, 'card k-' + k);
  const th = h('div', 'thumb');
  th.appendChild(tile(k, true));
  if (it.download_url && THUMB_EXT.includes(ext(it.name)) && it.size > 0 && it.size < 8 * 1024 * 1024) {
    const img = h('img'); img.loading = 'lazy'; img.decoding = 'async'; img.alt = '';
    img.onload = () => img.classList.add('ready');
    img.onerror = () => img.remove();
    img.src = it.download_url;
    th.appendChild(img);
  }
  th.append(chkEl(it), actsEl(it));
  const foot = h('div', 'foot');
  const txt = h('div', 'txt'); txt.append(h('span', 'name', it.name), h('span', 'meta', `${typeLabel(it)} · ${fmtSize(it.size)}`));
  foot.append(icon(ICON_OF[k]), txt);
  el.append(th, foot);
  return el;
}
function listTable(items) {
  const t = h('div', 'table');
  const head = h('div', 'row head');
  const all = h('input', 'chk always'); all.type = 'checkbox'; all.id = 'selAll'; all.setAttribute('aria-label', tr('sel.all'));
  all.onchange = () => { S.visible.forEach((i) => (all.checked ? S.selected.add(i.name) : S.selected.delete(i.name))); updateSelection(); };
  const hc = (key) => h('span', 'hcell', tr(key));
  head.append(all, hc('list.name'), hc('list.type'), hc('list.size'), h('span'));
  t.appendChild(head);
  for (const it of items) {
    const k = kind(it);
    const el = base(it, 'row');
    el.append(chkEl(it), nameCell(it, k), h('div', 'cell muted', typeLabel(it)), h('div', 'cell muted num-r', it.type === 'dir' ? '—' : fmtSize(it.size)), actsEl(it));
    t.appendChild(el);
  }
  return t;
}

/* ----- selection ----- */
function toggleSel(name, on) {
  const next = on === undefined ? !S.selected.has(name) : on;
  next ? S.selected.add(name) : S.selected.delete(name);
  updateSelection();
}
function updateSelection() {
  document.querySelectorAll('#list .item').forEach((el) => {
    const on = S.selected.has(el.dataset.name);
    el.classList.toggle('selected', on);
    const c = el.querySelector('.chk'); if (c) c.checked = on;
  });
  const n = S.selected.size;
  $('selbar').classList.toggle('hidden', n === 0);
  $('crumbs').classList.toggle('hidden', n > 0);
  $('selCount').textContent = tr('sel.count', { n });
  document.body.classList.toggle('selecting', n > 0);
  const all = $('selAll');
  if (all) all.checked = S.visible.length > 0 && S.visible.every((i) => S.selected.has(i.name));
}

/* ---------- actions ---------- */
function open(it) {
  if (it.type === 'dir') { S.path.push(it.name); S.query = ''; $('search').value = ''; load(); }
  else previewFile(it);
}

async function fetchBlob(it) {
  const res = await repoApi(`/contents/${enc(it.path)}?ref=${S.head || S.branch}`, { headers: { Accept: 'application/vnd.github.raw+json' } });
  const b = await res.blob();
  const m = MIME[ext(it.name)];
  return m ? new Blob([b], { type: m }) : b;
}
function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
async function download(it) {
  const t = toast(tr('download.start', { name: it.name }), false, 0);
  try { saveBlob(await fetchBlob(it), it.name); } catch (e) { toast(tr('download.failed', { message: e.message }), true); }
  t.remove();
}

let pvUrl = null;
async function previewFile(it) {
  const k = kind(it), body = $('pvBody');
  $('pvName').textContent = it.name;
  body.replaceChildren(h('div', 'spinner'));
  $('pvDownload').onclick = () => download(it);
  const dlg = $('preview'); if (!dlg.open) dlg.showModal();
  try {
    if (!['image', 'video', 'audio', 'pdf', 'text'].includes(k)) { body.replaceChildren(h('p', 'muted', tr('preview.none'))); return; }
    const blob = await fetchBlob(it);
    if (!dlg.open) return;
    if (pvUrl) URL.revokeObjectURL(pvUrl);
    body.replaceChildren();
    if (k === 'text') { const pre = h('pre', 'selectable'); pre.textContent = await blob.text(); body.appendChild(pre); return; }
    pvUrl = URL.createObjectURL(blob);
    const tag = { image: 'img', video: 'video', audio: 'audio', pdf: 'iframe' }[k];
    const el = document.createElement(tag); el.src = pvUrl;
    if (k === 'video' || k === 'audio') el.controls = true;
    body.appendChild(el);
  } catch (e) { body.replaceChildren(h('p', 'error', tr('preview.failed', { message: e.message }))); }
}

const readB64 = (file) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1] || '');
  r.onerror = () => rej(r.error);
  r.readAsDataURL(file);
});

// Accept a File or { file, rel } (rel = relative path, e.g. "Photos/a.jpg" when uploading a folder)
async function upload(input) {
  if (!S.user) return account.open();
  let files = [...input].map((x) => (x instanceof File ? { file: x, rel: x.webkitRelativePath || x.name } : x));
  if (!files.length || S.busy) return;
  const tooBig = files.filter((f) => f.file.size > MAX_FILE);
  if (tooBig.length) toast(tr('upload.skipped', { size: fmtSize(MAX_FILE), names: tooBig.map((f) => f.rel).join(', ') }), true, 6000);
  files = files.filter((f) => f.file.size <= MAX_FILE);
  if (!files.length) return;
  const dup = files.filter((f) => S.items.some((i) => i.name === f.rel));
  if (dup.length && !(await ask({ title: tr('upload.overwriteTitle'), text: tr('upload.overwriteText', { count: dup.length, names: dup.map((f) => f.rel).slice(0, 5).join(', ') }), ok: tr('upload.overwrite') }))) return;

  S.busy = true;
  const pt = progressToast(tr('upload.start'));
  try {
    const entries = []; let done = 0, next = 0;
    const worker = async () => {
      while (next < files.length) {
        const f = files[next++];
        pt.set(tr('upload.progressFile', { done: done + 1, total: files.length, name: f.rel }), done / files.length);
        const blob = await repoApi('/git/blobs', { method: 'POST', body: JSON.stringify({ content: await readB64(f.file), encoding: 'base64' }) });
        entries.push({ path: fullPath(f.rel), mode: '100644', type: 'blob', sha: blob.sha });
        done++; pt.set(tr('upload.progress', { done, total: files.length }), done / files.length);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    pt.set(tr('upload.saving'), 1);
    await commitTree(entries, `Drivemu: upload ${files.length} file(s)`);
    toast(tr('upload.done', { count: files.length }));
  } catch (e) { toast(tr('upload.failed', { message: e.message }), true, 7000); }
  pt.done(); S.busy = false; load(); refreshUsage();
}

async function newFolder() {
  const name = await ask({ title: tr('folder.newTitle'), input: tr('folder.untitled'), ok: tr('create') });
  if (!name) return;
  if (/[\\/]/.test(name) || name === '.' || name === '..') return toast(tr('folder.invalid'), true);
  if (S.items.some((i) => i.name === name)) return toast(tr('name.inUse'), true);
  try {
    const put = await repoApi(`/contents/${enc(fullPath(name, KEEP))}`, { method: 'PUT', body: JSON.stringify({ message: `Drivemu: new folder ${name}`, content: '', branch: S.branch }) });
    if (put && put.commit) S.head = put.commit.sha;
    toast(tr('folder.created'));
  } catch (e) { toast(tr('failed', { message: e.message }), true); }
  load();
}

async function rename(it) {
  const name = await ask({ title: tr('rename'), input: it.name, ok: tr('save') });
  if (!name || name === it.name) return;
  if (/[\\/]/.test(name) || name === '.' || name === '..') return toast(tr('name.invalid'), true);
  if (S.items.some((i) => i.name === name)) return toast(tr('name.inUse'), true);
  const t = toast(tr('rename.renaming'), false, 0);
  try {
    const entries = [];
    if (it.type === 'dir') {
      for (const b of await blobsUnder(it.path)) {
        entries.push({ path: fullPath(name, b.path.slice(it.path.length + 1)), mode: b.mode, type: 'blob', sha: b.sha });
        entries.push({ path: b.path, mode: b.mode, type: 'blob', sha: null });
      }
    } else {
      entries.push({ path: fullPath(name), mode: '100644', type: 'blob', sha: it.sha });
      entries.push({ path: it.path, mode: '100644', type: 'blob', sha: null });
    }
    await commitTree(entries, `Drivemu: rename ${it.name} to ${name}`);
    toast(tr('rename.done'));
  } catch (e) { toast(tr('failed', { message: e.message }), true); }
  t.remove(); load();
}

async function remove(list) {
  const label = list.length === 1 ? tr('delete.labelOne', { name: list[0].name }) : tr('delete.labelMany', { count: list.length });
  if (!(await ask({ title: tr('delete.title'), text: tr('delete.text', { label }), ok: tr('delete') }))) return;
  const t = toast(tr('delete.deleting'), false, 0);
  try {
    const entries = [];
    for (const it of list) {
      if (it.type === 'dir') for (const b of await blobsUnder(it.path)) entries.push({ path: b.path, mode: b.mode, type: 'blob', sha: null });
      else entries.push({ path: it.path, mode: '100644', type: 'blob', sha: null });
    }
    if (entries.length) await commitTree(entries, `Drivemu: delete ${label}`);
    toast(tr('delete.done'));
  } catch (e) { toast(tr('failed', { message: e.message }), true); }
  t.remove(); load(); refreshUsage();
}

/* ---------- menu "New" ---------- */
function openMenu(anchor) {
  const m = $('newMenu');
  m.classList.remove('hidden');
  const r = anchor.getBoundingClientRect();
  m.style.top = r.bottom + 6 + 'px';
  m.style.left = Math.max(8, Math.min(r.left, window.innerWidth - m.offsetWidth - 8)) + 'px';
  m.querySelector('button').focus();
}
const closeMenu = () => $('newMenu').classList.add('hidden');
// Keyboard in the menu: arrows move, Escape closes and gives the focus back, Tab leaves.
$('newMenu').onkeydown = (e) => {
  const buttons = [...$('newMenu').querySelectorAll('button')], i = buttons.indexOf(document.activeElement);
  if (e.key === 'ArrowDown') { e.preventDefault(); buttons[(i + 1) % buttons.length].focus(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); buttons[(i - 1 + buttons.length) % buttons.length].focus(); }
  else if (e.key === 'Escape') { e.stopPropagation(); closeMenu(); $('newBtn').focus(); }
  else if (e.key === 'Tab') closeMenu();
};
$('newBtn').onclick = (e) => { e.stopPropagation(); openMenu(e.currentTarget); };
document.addEventListener('click', closeMenu);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
$('newMenu').onclick = (e) => {
  const b = e.target.closest('button'); if (!b) return;
  closeMenu();
  ({ files: () => $('fileInput').click(), 'folder-upload': () => $('folderInput').click(), folder: newFolder })[b.dataset.act]();
};

/* ---------- events ---------- */
document.querySelectorAll('[data-act=account]').forEach((b) => account.bind(b));
document.querySelectorAll('[data-act=settings]').forEach((b) => { b.onclick = openSettings; });
$('settingsClose').onclick = () => $('settings').close();
$('fileInput').onchange = (e) => { upload(e.target.files); e.target.value = ''; };
$('folderInput').onchange = (e) => { upload(e.target.files); e.target.value = ''; };
$('refreshBtn').onclick = () => { S.head = null; load(); refreshUsage(); }; // read the files again (changes made elsewhere)
$('sort').onchange = (e) => { const [key, dir] = e.target.value.split(':'); S.sort = key; S.dir = +dir; render(); };
const setView = (v) => { S.view = v; try { localStorage.setItem('drivemu.view', v); } catch { /* ignore */ } render(); };
$('viewGrid').onclick = () => setView('grid');
$('viewList').onclick = () => setView('list');
$('search').oninput = (e) => { S.query = e.target.value; render(); };
$('selClear').onclick = () => { S.selected.clear(); updateSelection(); };
$('bulkDelete').onclick = () => remove(S.items.filter((i) => S.selected.has(i.name)));
$('pvClose').onclick = () => $('preview').close();
$('preview').onclose = () => { if (pvUrl) { URL.revokeObjectURL(pvUrl); pvUrl = null; } $('pvBody').replaceChildren(); };

// drag and drop
let dragDepth = 0;
const dz = $('dropzone');
const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
dz.addEventListener('dragenter', (e) => { if (hasFiles(e)) { e.preventDefault(); dragDepth++; $('dropOverlay').classList.remove('hidden'); } });
dz.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
dz.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('dropOverlay').classList.add('hidden'); } });
dz.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault(); dragDepth = 0; $('dropOverlay').classList.add('hidden');
  collectDropped(e.dataTransfer).then(upload);
});

// Read dropped files, including folder contents (recursive)
async function collectDropped(dt) {
  const roots = [...(dt.items || [])].map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null)).filter(Boolean);
  if (!roots.length) return [...dt.files];
  const out = [];
  const walk = async (en, prefix) => {
    if (en.isFile) {
      out.push({ file: await new Promise((res, rej) => en.file(res, rej)), rel: prefix + en.name });
      return;
    }
    const rd = en.createReader();
    let batch;
    do {
      batch = await new Promise((res, rej) => rd.readEntries(res, rej));
      for (const c of batch) await walk(c, prefix + en.name + '/');
    } while (batch.length);
  };
  for (const en of roots) await walk(en, '');
  return out;
}

/* ---------- language ---------- */
function refreshLanguage() {
  render();
  if ($('settings').open) openSettings();
}

/* ---------- start ---------- */
(async function init() {
  await i18n.load();
  i18n.selects();
  i18n.onChange(refreshLanguage);
  try { S.view = localStorage.getItem('drivemu.view') || 'grid'; } catch { /* ignore */ }
  await startFromAccount();
})();
})();
