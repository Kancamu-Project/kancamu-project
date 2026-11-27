import { i18n, popups, account, settings, storage, urlState, transfer, autocomplete, components } from "../assets/js/shared.js";
import appData from "./data.js";

(() => {
'use strict';

let STORAGE_LIMIT_KB, DEFAULT_FOLDERS, KEEP, MAX_FILE, THUMB_MAX, TYPES, ICON_OF, THUMB_EXT, MIME;

const $ = (id) => document.getElementById(id);
const tr = (key, params) => i18n.t(key, params);
const S = {
  token: '', user: null, owner: '', repo: '', branch: 'main', root: '', system: [], head: null,
  path: [], rootFolders: [], items: [], visible: [], view: 'grid', sort: 'name', dir: 1, query: '',
  selected: new Set(), busy: false, repoSizeKB: 0, repoPrivate: true,
};

const { element, icon, extensionOf } = components;
const enc = (p) => p.split('/').map(encodeURIComponent).join('/');
const fullPath = (...parts) => [S.root, ...S.path, ...parts].filter(Boolean).join('/');
const contentsOf = (path) => `/contents${path ? '/' + enc(path) : ''}`;
const kind = (it) => {
  if (it.type === 'dir') return 'folder';
  const e = extensionOf(it.name);
  for (const k in TYPES) if (TYPES[k].includes(e)) return k;
  return 'file';
};
const typeLabel = (it) => (it.type === 'dir' ? tr('type.folder') : extensionOf(it.name) ? tr('type.fileExt', { ext: extensionOf(it.name).toUpperCase() }) : tr('type.file'));
const tile = (k, big = false) => { const t = element('span', 'file-tile kind-' + k + (big ? ' large' : '')); t.appendChild(icon(ICON_OF[k])); return t; };


async function ask({ title, text = '', input = null, ok }) {
  const answer = await popups.ask({ title, text, value: input, ok });
  return typeof answer === 'string' ? answer.trim() : answer || null;
}

async function api(path, opts = {}) {
  const res = await fetch(path.startsWith('http') ? path : 'https://api.github.com' + path, {
    cache: 'no-store',
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
    try { msg = (await res.json()).message || msg; } catch { }
    const err = new Error(msg); err.status = res.status; throw err;
  }
  if (opts.returnResponse) return res;
  if (res.status === 204) return null;
  if ((opts.headers || {}).Accept && opts.headers.Accept.includes('raw')) return res;
  return res.json();
}
const repoApi = (p, opts) => api(`/repos/${S.owner}/${S.repo}${p}`, opts);

async function commitTree(entries, message) {
  for (let attempt = 1; ; attempt++) {
    const ref = await repoApi(`/git/ref/heads/${S.branch}`);
    const parent = ref.object.sha;
    const commit = await repoApi(`/git/commits/${parent}`);
    const tree = await repoApi('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: commit.tree.sha, tree: entries }) });
    const nc = await repoApi('/git/commits', { method: 'POST', body: JSON.stringify({ message, tree: tree.sha, parents: [parent] }) });
    try {
      await repoApi(`/git/refs/heads/${S.branch}`, { method: 'PATCH', body: JSON.stringify({ sha: nc.sha }) });
    } catch (e) {
      if ((e.status === 422 || e.status === 409) && attempt < 4) { await new Promise((resolve) => setTimeout(resolve, 300 * attempt)); continue; }
      throw e;
    }
    S.head = nc.sha;
    return;
  }
}
async function blobsUnder(prefix) {
  const ref = await repoApi(`/git/ref/heads/${S.branch}`);
  const commit = await repoApi(`/git/commits/${ref.object.sha}`);
  const tree = await repoApi(`/git/trees/${commit.tree.sha}?recursive=1`);
  return tree.tree.filter((t) => t.type === 'blob' && t.path.startsWith(prefix + '/'));
}
async function listViaTree(dir) {
  const sha = S.head || (await repoApi(`/git/ref/heads/${S.branch}`)).object.sha;
  const commit = await repoApi(`/git/commits/${sha}`);
  const tree = await repoApi(`/git/trees/${commit.tree.sha}?recursive=1`);
  const prefix = dir ? dir + '/' : '';
  return tree.tree
    .filter((t) => t.path.startsWith(prefix) && !t.path.slice(prefix.length).includes('/'))
    .map((t) => ({ name: t.path.slice(prefix.length), path: t.path, type: t.type === 'tree' ? 'dir' : 'file', size: t.size || 0, sha: t.sha }));
}
async function authenticate(token) {
  S.token = token;
  const res = await api('/user', { returnResponse: true });
  S.user = await res.json();
  S.owner = S.user.login;
}

async function createDefaultFolders() {
  const blob = await repoApi('/git/blobs', { method: 'POST', body: JSON.stringify({ content: '', encoding: 'utf-8' }) });
  await commitTree(DEFAULT_FOLDERS.map((name) => ({ path: [S.root, name, KEEP].filter(Boolean).join('/'), mode: '100644', type: 'blob', sha: blob.sha })), 'Drivemu: create the default folders');
}

async function openStorage() {
  const store = await storage.drive();
  S.owner = store.owner; S.repo = store.repo; S.branch = store.branch; S.root = store.root; S.system = store.system;
  S.repoPrivate = store.info.private; S.repoSizeKB = store.info.size || 0;
  S.head = null;
  let root = [];
  try { root = await repoApi(`${contentsOf(S.root)}?ref=${S.branch}`); } catch (e) { if (e.status !== 404) throw e; }
  if (root.every((item) => item.name === KEEP || S.system.includes(item.name))) await createDefaultFolders();
  showApp();
}

async function startFromAccount() {
  const acc = account.get();
  if (!acc) { showSignedOut(); return; }
  try {
    await authenticate(acc.token);
    await openStorage();
  } catch (e) {
    if (e.status === 401) { popups.toast(tr('acct.tokenInvalid', { name: acc.login || tr('acct.anAccount') }), { kind: "error" }); account.signOut(); showSignedOut(); }
    else showSignedOut(tr('login.couldNotConnect', { message: e.code === 'noWrite' ? tr('error.noWrite') : e.message }));
  }
}
function resetSession() { S.token = ''; S.user = null; S.items = []; S.rootFolders = []; showSignedOut(); }
account.onChange(async (acc) => {
  if (!acc) { if (S.user) resetSession(); return; }
  if (!S.user || acc.token !== S.token) await startFromAccount();
});

let fromAddress = { path: urlState.get('path'), query: urlState.get('q') };
function showApp() {
  S.path = fromAddress.path.split('/').filter(Boolean); S.query = fromAddress.query; S.restored = S.path.length > 0; fromAddress = { path: '', query: '' };
  $('file-search').value = S.query; S.selected.clear(); load();
}
function showSignedOut(err = '') {
  S.path = []; S.query = ''; $('file-search').value = ''; S.selected.clear(); S.items = []; S.head = null;
  $('loading').classList.add('hidden');
  render();
  if (err) popups.toast(err, { kind: "error" });
}

settings.listen('drivemu', (message) => {
  if (message.type !== 'reset') return;
  S.head = message.head; S.path = []; S.query = ''; $('file-search').value = '';
  load(); refreshUsage();
});

async function load() {
  $('loading').replaceChildren(...Array.from({ length: 4 }, () => element('i')));
  $('loading').classList.remove('hidden'); $('empty').classList.add('hidden'); $('file-list').replaceChildren();
  S.selected.clear();
  try {
    const r = await repoApi(`${contentsOf(fullPath())}?ref=${S.head || S.branch}`);
    let items = Array.isArray(r) ? r : [];
    if (items.length >= 1000) items = await listViaTree(fullPath());
    S.items = items.filter((i) => i.name !== KEEP);
    if (!S.path.length) S.rootFolders = S.items.filter((i) => i.type === 'dir').map((i) => i.name);
  } catch (e) {
    if (e.status === 404 && S.restored && S.path.length) { S.path = []; S.restored = false; return load(); }
    if (e.status === 404) S.items = [];
    else { popups.toast(tr('load.failed', { message: e.message }), { kind: "error" }); S.items = []; }
  }
  S.restored = false;
  $('loading').classList.add('hidden');
  render();
}

function visibleItems() {
  const q = S.query.toLowerCase();
  const cmp = {
    name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
    size: (a, b) => a.size - b.size,
    type: (a, b) => extensionOf(a.name).localeCompare(extensionOf(b.name)) || a.name.localeCompare(b.name),
  }[S.sort];
  const items = S.items.filter((i) => !q || i.name.toLowerCase().includes(q));
  items.sort((a, b) => (a.type === b.type ? cmp(a, b) * S.dir : a.type === 'dir' ? -1 : 1));
  return items;
}

function usageInfo() {
  const used = S.repoSizeKB * 1024, limit = STORAGE_LIMIT_KB * 1024;
  const percent = Math.min(100, (used / limit) * 100);
  const params = { percent: i18n.number(percent, { maximumFractionDigits: percent < 10 ? 1 : 0 }), used: components.formatSize(used), limit: components.formatSize(limit) };
  return { percent, params };
}
function refreshUsage() {
  repoApi('').then((info) => { S.repoSizeKB = info.size; renderSide(); }).catch(() => { });
}

function setSide(open) {
  $('sidebar').classList.toggle('open', open);
  $('menu-button').setAttribute('aria-expanded', String(open));
  if (open) $('sidebar-nav').querySelector('button')?.focus();
}
$('menu-button').onclick = () => setSide(!$('sidebar').classList.contains('open'));
$('sidebar-nav').addEventListener('click', () => setSide(false));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $('sidebar').classList.contains('open') && $('menu-button').offsetParent) { setSide(false); $('menu-button').focus(); }
});

function renderSide() {
  const nav = $('sidebar-nav'), box = $('usage');
  document.body.classList.toggle('plain', !S.user);
  nav.replaceChildren(); box.replaceChildren();
  if (!S.user) return;
  const entry = (label, ico, path, on) => {
    const b = element('button', 'sidebar-item'); b.type = 'button'; b.classList.toggle('on', on);
    b.append(icon(ico), element('span', '', label));
    b.onclick = () => goTo(path);
    return b;
  };
  nav.append(entry(tr('nav.myDrive'), 'hard-drive', [], S.path.length === 0));
  for (const name of S.rootFolders) nav.append(entry(name, 'folder', [name], S.path[0] === name));
  const { percent, params } = usageInfo();
  const meter = element('div', 'progress'), fill = element('div', 'progress-fill');
  fill.style.width = `${percent > 0 ? Math.max(percent, 1) : 0}%`;
  meter.append(fill);
  meter.setAttribute('role', 'progressbar'); meter.setAttribute('aria-valuenow', Math.round(percent)); meter.setAttribute('aria-valuemin', 0); meter.setAttribute('aria-valuemax', 100);
  box.append(element('span', 'usage-percent', tr('usage.percent', params)), meter, element('span', 'usage-detail', tr('usage.detail', params)));
}
function goTo(path) { S.path = path; S.query = ''; $('file-search').value = ''; load(); }

function render() {
  renderSide();
  renderCrumbs();
  const items = S.visible = visibleItems();
  const list = $('file-list');
  list.className = 'list ' + S.view;
  list.replaceChildren();
  if (S.view === 'grid') {
    const dirs = items.filter((i) => i.type === 'dir'), files = items.filter((i) => i.type !== 'dir');
    if (dirs.length) { list.appendChild(element('div', 'list-section-title', tr('list.folders'))); const g = element('div', 'folder-grid'); dirs.forEach((i) => g.appendChild(folderChip(i))); list.appendChild(g); }
    if (files.length) { list.appendChild(element('div', 'list-section-title', tr('list.files'))); const g = element('div', 'file-grid'); files.forEach((i) => g.appendChild(fileCard(i))); list.appendChild(g); }
  } else if (items.length) {
    list.appendChild(listTable(items));
  }
  const empty = items.length === 0;
  $('empty').classList.toggle('hidden', !empty);
  if (empty) {
    const searching = S.query && S.items.length > 0;
    $('empty').heading = tr(!S.user ? 'signedout.title' : searching ? 'empty.noMatches' : 'empty.title');
    $('empty').text = !S.user ? tr('signedout.text') : searching ? tr('empty.noMatchesText', { query: S.query }) : tr('empty.text');
    const cta = $('empty-action-button');
    cta.replaceChildren(icon(S.user ? 'upload' : 'user'), element('span', '', tr(S.user ? 'menu.uploadFiles' : 'login.signIn')));
    cta.onclick = S.user ? () => $('file-input').click() : () => account.open();
    cta.classList.toggle('hidden', searching && !!S.user);
  }
  $('view-grid-button').classList.toggle('on', S.view === 'grid');
  $('view-list-button').classList.toggle('on', S.view === 'list');
  $('sort-order').value = `${S.sort}:${S.dir}`;
  if (S.user) urlState.set({ path: S.path.join('/'), q: S.query, view: S.view === 'grid' ? '' : S.view, sort: S.sort === 'name' && S.dir === 1 ? '' : `${S.sort}:${S.dir}` });
  $('new-button').disabled = !S.user;
  updateSelection();
  const files = S.items.filter((i) => i.type !== 'dir');
  const total = files.reduce((s, f) => s + f.size, 0);
  $('status').textContent = !S.user ? '' : tr('status', { folders: S.items.length - files.length, files: files.length, size: components.formatSize(total), });
}

function renderCrumbs() {
  const c = $('breadcrumbs'); c.replaceChildren();
  const mk = (label, depth) => {
    const b = element('span', 'breadcrumb', label); b.tabIndex = 0; b.setAttribute('role', 'link');
    b.onclick = () => goTo(S.path.slice(0, depth));
    b.onkeydown = (e) => { if (e.key === 'Enter') b.click(); };
    return b;
  };
  c.appendChild(mk(tr('nav.myDrive'), 0));
  S.path.forEach((p, i) => c.append(mk(p, i + 1)));
}

function chkEl(it, always = false) {
  const c = element('input', 'checkbox' + (always ? ' always' : '')); c.type = 'checkbox'; c.setAttribute('aria-label', tr('sel.item', { name: it.name }));
  c.onclick = (e) => e.stopPropagation();
  c.onchange = () => toggleSel(it.name, c.checked);
  return c;
}
function actsEl(it) {
  const a = element('div', 'actions');
  const btn = (ic, title, fn, cls = '') => { const b = element('button', 'icon-button ' + cls); b.append(icon(ic)); b.title = title; b.setAttribute('aria-label', title); b.onclick = (e) => { e.stopPropagation(); fn(); }; return b; };
  if (it.type !== 'dir') a.appendChild(btn('download', tr('download'), () => download(it)));
  a.appendChild(btn('pencil', tr('rename'), () => rename(it)));
  a.appendChild(btn('trash', tr('delete'), () => remove([it]), 'delete'));
  return a;
}
function nameCell(it, k) {
  const n = element('div', 'name-cell'); n.append(tile(k), element('span', 'file-name', it.name)); return n;
}
function base(it, cls) {
  const el = element('div', 'file-item ' + cls); el.dataset.name = it.name; el.title = it.name;
  el.onclick = () => (S.selected.size ? toggleSel(it.name) : open(it));
  if (it.type !== 'dir') transfer.drag(el, { id: it.path, name: it.name, size: it.size, image: kind(it) === 'image', load: () => fetchBlob(it) }, () => el.querySelector('.file-thumbnail, .file-tile'));
  el.tabIndex = 0;
  el.onkeydown = (e) => {
    if (e.target !== el) return;
    const move = (step) => { const all = [...$('file-list').querySelectorAll('.file-item')]; all[all.indexOf(el) + step]?.focus(); };
    const keys = {
      Enter: () => el.click(), ' ': () => toggleSel(it.name), F2: () => rename(it), Delete: () => remove([it]),
      ArrowDown: () => move(1), ArrowRight: () => move(1), ArrowUp: () => move(-1), ArrowLeft: () => move(-1),
    };
    if (keys[e.key]) { e.preventDefault(); keys[e.key](); }
  };
  return el;
}
function folderChip(it) {
  const el = base(it, 'file-chip kind-folder');
  el.append(tile('folder'), element('span', 'file-name', it.name), actsEl(it), chkEl(it));
  return el;
}
function fileCard(it) {
  const k = kind(it);
  const el = base(it, 'file-card kind-' + k);
  const th = element('div', 'file-thumbnail');
  th.appendChild(tile(k, true));
  if (it.download_url && THUMB_EXT.includes(extensionOf(it.name)) && it.size > 0 && it.size < THUMB_MAX) {
    const img = element('img'); img.loading = 'lazy'; img.decoding = 'async'; img.alt = '';
    img.onload = () => img.classList.add('ready');
    img.onerror = () => img.remove();
    img.src = it.download_url;
    th.appendChild(img);
  }
  th.append(chkEl(it), actsEl(it));
  const foot = element('div', 'card-footer');
  const txt = element('div', 'card-text'); txt.append(element('span', 'file-name', it.name), element('span', 'file-meta', `${typeLabel(it)} · ${components.formatSize(it.size)}`));
  foot.append(icon(ICON_OF[k]), txt);
  el.append(th, foot);
  return el;
}
function listTable(items) {
  const t = element('div', 'file-table');
  const head = element('div', 'file-row table-header');
  const all = element('input', 'checkbox always'); all.type = 'checkbox'; all.id = 'select-all-checkbox'; all.setAttribute('aria-label', tr('sel.all'));
  all.onchange = () => { S.visible.forEach((i) => (all.checked ? S.selected.add(i.name) : S.selected.delete(i.name))); updateSelection(); };
  const hc = (key) => element('span', 'header-cell', tr(key));
  head.append(all, hc('list.name'), hc('list.type'), hc('list.size'), element('span'));
  t.appendChild(head);
  for (const it of items) {
    const k = kind(it);
    const el = base(it, 'file-row');
    el.append(chkEl(it), nameCell(it, k), element('div', 'file-cell muted', typeLabel(it)), element('div', 'file-cell muted numeric-cell', it.type === 'dir' ? '—' : components.formatSize(it.size)), actsEl(it));
    t.appendChild(el);
  }
  return t;
}

function toggleSel(name, on) {
  const next = on === undefined ? !S.selected.has(name) : on;
  next ? S.selected.add(name) : S.selected.delete(name);
  updateSelection();
}
function updateSelection() {
  document.querySelectorAll('#file-list .file-item').forEach((el) => {
    const on = S.selected.has(el.dataset.name);
    el.classList.toggle('selected', on);
    const c = el.querySelector('.checkbox'); if (c) c.checked = on;
  });
  const n = S.selected.size;
  $('selection-bar').classList.toggle('hidden', n === 0);
  $('breadcrumbs').classList.toggle('hidden', n > 0);
  $('selection-count').textContent = tr('sel.count', { n });
  document.body.classList.toggle('selecting', n > 0);
  const all = $('select-all-checkbox');
  if (all) all.checked = S.visible.length > 0 && S.visible.every((i) => S.selected.has(i.name));
}

function open(it) {
  if (it.type === 'dir') { S.path.push(it.name); S.query = ''; $('file-search').value = ''; load(); }
  else previewFile(it);
}

async function fetchBlob(it) {
  const res = await repoApi(`/contents/${enc(it.path)}?ref=${S.head || S.branch}`, { headers: { Accept: 'application/vnd.github.raw+json' } });
  const b = await res.blob();
  const m = MIME[extensionOf(it.name)];
  return new Blob([b], { type: m || 'application/octet-stream' });
}
async function download(it) {
  const t = popups.toast(tr('download.start', { name: it.name }), { kind: "info", duration: 0 });
  try { components.download(it.name, await fetchBlob(it)); } catch (e) { popups.toast(tr('download.failed', { message: e.message }), { kind: "error" }); }
  t.close();
}

let pvUrl = null;
async function previewFile(it) {
  const k = kind(it), body = $('preview-content');
  $('preview-name').textContent = it.name;
  body.replaceChildren(element('div', 'spinner'));
  $('preview-download-button').onclick = () => download(it);
  const dlg = $('preview'); if (!dlg.open) dlg.showModal();
  try {
    if (!['image', 'video', 'audio', 'pdf', 'text'].includes(k)) { body.replaceChildren(element('span', 'muted', tr('preview.none'))); return; }
    const blob = await fetchBlob(it);
    if (!dlg.open) return;
    if (pvUrl) URL.revokeObjectURL(pvUrl);
    body.replaceChildren();
    if (k === 'text') { const pre = element('pre', 'selectable'); pre.textContent = await blob.text(); body.appendChild(pre); return; }
    pvUrl = URL.createObjectURL(blob);
    const tag = { image: 'img', video: 'video', audio: 'audio', pdf: 'iframe' }[k];
    const el = document.createElement(tag); el.src = pvUrl;
    if (k === 'video' || k === 'audio') el.controls = true;
    body.appendChild(el);
  } catch (e) { body.replaceChildren(element('span', 'error', tr('preview.failed', { message: e.message }))); }
}

const readB64 = (file) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1] || '');
  r.onerror = () => rej(r.error);
  r.readAsDataURL(file);
});

async function upload(input) {
  if (!S.user) return account.open();
  let files = [...input].map((x) => (x instanceof File ? { file: x, rel: x.webkitRelativePath || x.name } : x));
  if (!files.length || S.busy) return;
  const tooBig = files.filter((f) => f.file.size > MAX_FILE);
  if (tooBig.length) popups.toast(tr('upload.skipped', { size: components.formatSize(MAX_FILE), names: tooBig.map((f) => f.rel).join(', ') }), { kind: "warning" });
  files = files.filter((f) => f.file.size <= MAX_FILE);
  if (!files.length) return;
  const dup = files.filter((f) => S.items.some((i) => i.name === f.rel));
  if (dup.length && !(await ask({ title: tr('upload.overwriteTitle'), text: tr('upload.overwriteText', { count: dup.length, names: dup.map((f) => f.rel).slice(0, 5).join(', ') }), ok: tr('upload.overwrite') }))) return;

  S.busy = true;
  const pt = popups.toast(tr('upload.start'), { duration: 0, progress: 0 });
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
    popups.toast(tr('upload.done', { count: files.length }));
  } catch (e) { popups.toast(tr('upload.failed', { message: e.message }), { kind: "error" }); }
  pt.close(); S.busy = false; load(); refreshUsage();
}

async function newFolder() {
  const name = await ask({ title: tr('folder.newTitle'), input: tr('folder.untitled'), ok: tr('create') });
  if (!name) return;
  if (/[\\/]/.test(name) || name === '.' || name === '..') return popups.toast(tr('folder.invalid'), { kind: "error" });
  if (S.items.some((i) => i.name === name)) return popups.toast(tr('name.inUse'), { kind: "error" });
  try {
    const put = await repoApi(`/contents/${enc(fullPath(name, KEEP))}`, { method: 'PUT', body: JSON.stringify({ message: `Drivemu: new folder ${name}`, content: '', branch: S.branch }) });
    if (put && put.commit) S.head = put.commit.sha;
    popups.toast(tr('folder.created'));
  } catch (e) { popups.toast(tr('failed', { message: e.message }), { kind: "error" }); }
  load();
}

async function rename(it) {
  const name = await ask({ title: tr('rename'), input: it.name, ok: tr('save') });
  if (!name || name === it.name) return;
  if (/[\\/]/.test(name) || name === '.' || name === '..') return popups.toast(tr('name.invalid'), { kind: "error" });
  if (S.items.some((i) => i.name === name)) return popups.toast(tr('name.inUse'), { kind: "error" });
  const t = popups.toast(tr('rename.renaming'), { kind: "info", duration: 0 });
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
    popups.toast(tr('rename.done'));
  } catch (e) { popups.toast(tr('failed', { message: e.message }), { kind: "error" }); }
  t.close(); load();
}

async function remove(list) {
  const label = list.length === 1 ? tr('delete.labelOne', { name: list[0].name }) : tr('delete.labelMany', { count: list.length });
  if (!(await ask({ title: tr('delete.title'), text: tr('delete.text', { label }), ok: tr('delete') }))) return;
  const t = popups.toast(tr('delete.deleting'), { kind: "info", duration: 0 });
  try {
    const entries = [];
    for (const it of list) {
      if (it.type === 'dir') for (const b of await blobsUnder(it.path)) entries.push({ path: b.path, mode: b.mode, type: 'blob', sha: null });
      else entries.push({ path: it.path, mode: '100644', type: 'blob', sha: null });
    }
    if (entries.length) await commitTree(entries, `Drivemu: delete ${label}`);
    popups.toast(tr('delete.done'));
  } catch (e) { popups.toast(tr('failed', { message: e.message }), { kind: "error" }); }
  t.close(); load(); refreshUsage();
}

$('new-button').onclick = (e) => components.menu({
  anchor: e.currentTarget,
  items: [
    { label: tr('menu.uploadFiles'), icon: 'upload', onSelect: () => $('file-input').click() },
    { label: tr('menu.uploadFolder'), icon: 'folder-up', onSelect: () => $('folder-input').click() },
    { separator: true },
    { label: tr('menu.newFolder'), icon: 'folder-plus', onSelect: newFolder },
  ],
});

account.bind($('account-button'));
$('file-input').onchange = (e) => { upload(e.target.files); e.target.value = ''; };
$('folder-input').onchange = (e) => { upload(e.target.files); e.target.value = ''; };
$('refresh-button').onclick = () => { S.head = null; load(); refreshUsage(); };
$('sort-order').onchange = (e) => { const [key, dir] = e.target.value.split(':'); S.sort = key; S.dir = +dir; render(); };
const setView = (v) => { S.view = v; try { localStorage.setItem('drivemu.view', v); } catch { } render(); };
$('view-grid-button').onclick = () => setView('grid');
$('view-list-button').onclick = () => setView('list');
$('file-search').oninput = (e) => { S.query = e.target.value; render(); };
autocomplete.attach($('file-search'), { suggestions: () => S.items.map((item) => item.name) });
$('selection-clear-button').onclick = () => { S.selected.clear(); updateSelection(); };
$('delete-selected-button').onclick = () => remove(S.items.filter((i) => S.selected.has(i.name)));
$('preview-close-button').onclick = () => $('preview').close();
$('preview').onclose = () => { if (pvUrl) { URL.revokeObjectURL(pvUrl); pvUrl = null; } $('preview-content').replaceChildren(); };

let dragDepth = 0;
const dz = $('drop-zone');
const hasFiles = (e) => e.dataTransfer && ['Files', 'text/uri-list'].some((t) => e.dataTransfer.types.includes(t)) && !transfer.dragging;
dz.addEventListener('dragenter', (e) => { if (hasFiles(e)) { e.preventDefault(); dragDepth++; $('drop-overlay').classList.remove('hidden'); } });
dz.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
dz.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('drop-overlay').classList.add('hidden'); } });
dz.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault(); dragDepth = 0; $('drop-overlay').classList.add('hidden');
  if (![...e.dataTransfer.types].includes('Files')) return transfer.take(e).then(upload);
  collectDropped(e.dataTransfer).then(upload);
});

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

function refreshLanguage() {
  render();
}

(async function init() {
  await i18n.load(appData);
  const { drive, fileTypes, thumbnailExtensions, mimeTypes } = i18n.data;
  STORAGE_LIMIT_KB = drive.storageLimitGB * 1024 * 1024;
  DEFAULT_FOLDERS = drive.defaultFolders;
  KEEP = drive.keepFile;
  MAX_FILE = drive.maxFileMB * 1024 * 1024;
  THUMB_MAX = drive.thumbnailMaxMB * 1024 * 1024;
  TYPES = Object.fromEntries(Object.entries(fileTypes).filter(([, type]) => type.extensions.length).map(([kind, type]) => [kind, type.extensions]));
  ICON_OF = Object.fromEntries(Object.entries(fileTypes).map(([kind, type]) => [kind, type.icon]));
  THUMB_EXT = thumbnailExtensions;
  MIME = mimeTypes;
  i18n.selects();
  i18n.onChange(refreshLanguage);
  try { S.view = localStorage.getItem('drivemu.view') || 'grid'; } catch { }
  if (['grid', 'list'].includes(urlState.get('view'))) S.view = urlState.get('view');
  const [sortKey, sortDir] = urlState.get('sort').split(':');
  if (['name', 'size', 'type'].includes(sortKey) && [-1, 1].includes(Number(sortDir))) { S.sort = sortKey; S.dir = Number(sortDir); }
  await startFromAccount();
})();
})();
