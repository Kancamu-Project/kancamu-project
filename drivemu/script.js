/* Drivemu — penyimpanan file serverless di atas GitHub (repo milik user sendiri). */
(() => {
'use strict';

const ROOT = 'drive';                 // semua file disimpan di folder ini dalam repo
const KEEP = '.gitkeep';              // penanda folder kosong
const MAX_FILE = 100 * 1024 * 1024;   // batas keras GitHub per file (100 MB), bukan batas buatan
const SOFT_LIMIT_KB = 5 * 1024 * 1024; // GitHub menyarankan repo di bawah ~5 GB
const LS_KEY = 'drivemu.session.v1';

const $ = (id) => document.getElementById(id);
const S = {
  token: '', user: null, owner: '', repo: '', branch: 'main', head: null,
  path: [], items: [], visible: [], view: 'grid', sort: 'name', dir: 1, query: '',
  selected: new Set(), busy: false, repoSizeKB: 0, repoPrivate: true, defaultBranch: 'main', branches: [],
  accounts: [], activeId: null, screen: 'login', returnTo: null,
};

/* ---------- util ---------- */
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const icon = (name) => h('span', 'icon i-' + name);
const enc = (p) => p.split('/').map(encodeURIComponent).join('/');
const fullPath = (...parts) => [ROOT, ...S.path, ...parts].filter(Boolean).join('/');
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
const typeLabel = (it) => (it.type === 'dir' ? 'Folder' : ext(it.name) ? ext(it.name).toUpperCase() + ' file' : 'File');
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

/* ---------- dialog ---------- */
function ask({ title, text = '', input = null, ok = 'OK' }) {
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
    cache: 'no-store', // GitHub API membalas dengan max-age=60; tanpa ini browser menyajikan daftar lama
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
    try { msg = (await res.json()).message || msg; } catch { /* abaikan */ }
    const err = new Error(msg); err.status = res.status; throw err;
  }
  if (opts.returnResponse) return res;
  if (res.status === 204) return null;
  if ((opts.headers || {}).Accept && opts.headers.Accept.includes('raw')) return res;
  return res.json();
}
const repoApi = (p, opts) => api(`/repos/${S.owner}/${S.repo}${p}`, opts);

// Satu commit untuk banyak perubahan (git data API)
async function commitTree(entries, message) {
  const ref = await repoApi(`/git/ref/heads/${S.branch}`);
  const parent = ref.object.sha;
  const commit = await repoApi(`/git/commits/${parent}`);
  const tree = await repoApi('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: commit.tree.sha, tree: entries }) });
  const nc = await repoApi('/git/commits', { method: 'POST', body: JSON.stringify({ message, tree: tree.sha, parents: [parent] }) });
  await repoApi(`/git/refs/heads/${S.branch}`, { method: 'PATCH', body: JSON.stringify({ sha: nc.sha }) });
  S.head = nc.sha; // baca langsung dari commit ini: tidak terkena cache/jeda replikasi branch
}
// Semua blob (file) di bawah sebuah folder
async function blobsUnder(prefix) {
  const ref = await repoApi(`/git/ref/heads/${S.branch}`);
  const commit = await repoApi(`/git/commits/${ref.object.sha}`);
  const tree = await repoApi(`/git/trees/${commit.tree.sha}?recursive=1`);
  return tree.tree.filter((t) => t.type === 'blob' && t.path.startsWith(prefix + '/'));
}
// Daftar isi folder lewat git tree (tanpa batas 1000 item milik Contents API)
async function listViaTree(dir) {
  const sha = S.head || (await repoApi(`/git/ref/heads/${S.branch}`)).object.sha;
  const commit = await repoApi(`/git/commits/${sha}`);
  const tree = await repoApi(`/git/trees/${commit.tree.sha}?recursive=1`);
  const prefix = dir + '/';
  return tree.tree
    .filter((t) => t.path.startsWith(prefix) && !t.path.slice(prefix.length).includes('/'))
    .map((t) => ({ name: t.path.slice(prefix.length), path: t.path, type: t.type === 'tree' ? 'dir' : 'file', size: t.size || 0, sha: t.sha }));
}
function refreshUsage() {
  repoApi('').then((i) => { S.repoSizeKB = i.size; updateUsage(); }).catch(() => { /* abaikan */ });
}
function updateUsage() {
  const pct = Math.min(100, (S.repoSizeKB / SOFT_LIMIT_KB) * 100);
  $('usageFill').style.width = Math.max(pct, S.repoSizeKB > 0 ? 2 : 0) + '%';
  $('usageText').textContent = `${fmtSize(S.repoSizeKB * 1024)} of the ~5 GB GitHub recommends`;
}

/* ---------- akun (beberapa token) & drive (satu repo, satu drive = satu branch) ---------- */
const DEFAULT_REPO = 'drivemu-storage';
const ACC_KEY = 'drivemu.accounts.v2';
const screens = ['login', 'drives', 'app'];
const show = (name) => { S.screen = name; screens.forEach((s) => $(s).classList.toggle('hidden', s !== name)); };
const slug = (s) => s.toLowerCase().trim().replace(/[^a-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '');
const validRepo = (s) => /^[A-Za-z0-9._-]+$/.test(s) && s !== '.' && s !== '..';
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

/* --- penyimpanan akun: tiap token = satu koneksi {id, token, login, avatar, repo, branch} --- */
function persist() {
  try { localStorage.setItem(ACC_KEY, JSON.stringify({ active: S.activeId, list: S.accounts })); } catch { /* abaikan */ }
}
function loadAccounts() {
  try {
    const a = JSON.parse(localStorage.getItem(ACC_KEY) || 'null');
    if (a && Array.isArray(a.list)) { S.accounts = a.list; S.activeId = a.active; return; }
  } catch { /* abaikan */ }
  try { // migrasi dari format lama (satu token)
    const o = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (o && o.token) {
      S.accounts = [{ id: uid(), token: o.token, login: '', avatar: '', repo: o.repo || DEFAULT_REPO, branch: o.branch || null }];
      S.activeId = S.accounts[0].id; persist(); localStorage.removeItem(LS_KEY);
    }
  } catch { /* abaikan */ }
}
const activeAcct = () => S.accounts.find((a) => a.id === S.activeId);
// token yang sama tidak didaftarkan dua kali; token beda (akun sama atau beda) jadi koneksi baru
function registerAccount(token) {
  let a = S.accounts.find((x) => x.token === token);
  if (!a) { a = { id: uid(), token, branch: null }; S.accounts.push(a); }
  Object.assign(a, { login: S.owner, avatar: S.user.avatar_url, repo: S.repo });
  S.activeId = a.id; persist();
}
function saveSession(branch = null) {
  const a = activeAcct();
  if (a) { a.repo = S.repo; a.branch = branch; persist(); }
}
const SNAP_KEYS = ['token', 'tokenInfo', 'user', 'owner', 'repo', 'defaultBranch', 'repoPrivate', 'repoSizeKB', 'branch', 'head', 'activeId'];
const snapshot = () => Object.fromEntries(SNAP_KEYS.map((k) => [k, S[k]]));
const restore = (snap) => Object.assign(S, snap);

async function authenticate(token) {
  S.token = token;
  const res = await api('/user', { returnResponse: true });
  S.user = await res.json();
  S.owner = S.user.login;
  const hd = (k) => res.headers.get(k);
  S.tokenInfo = {
    type: token.startsWith('github_pat_') ? 'Fine-grained personal access token' : token.startsWith('ghp_') ? 'Classic personal access token' : 'Access token',
    scopes: (hd('x-oauth-scopes') || '').split(',').map((s) => s.trim()).filter(Boolean),
    limit: hd('x-ratelimit-limit'), remaining: hd('x-ratelimit-remaining'), expires: hd('github-authentication-token-expiration'),
  };
}

// Hubungkan ke repo penyimpanan; dibuat (private) kalau belum ada
async function connectRepo(name) {
  let info;
  try {
    info = await api(`/repos/${S.owner}/${name}`);
  } catch (e) {
    if (e.status !== 404) throw e;
    info = await api('/user/repos', { method: 'POST', body: JSON.stringify({
      name, private: true, auto_init: true, description: 'Drivemu file storage',
    }) });
    await new Promise((r) => setTimeout(r, 1500)); // beri waktu GitHub menyiapkan repo
  }
  if (!info.permissions || !info.permissions.push) throw new Error('The token has no write access to this repository.');
  S.repo = name;
  S.defaultBranch = info.default_branch || 'main';
  S.repoPrivate = info.private;
  S.repoSizeKB = info.size || 0;
}
async function fetchBranches() {
  const names = [];
  try {
    for (let page = 1; page <= 10; page++) {
      const r = await repoApi(`/branches?per_page=100&page=${page}`);
      names.push(...r.map((b) => b.name));
      if (r.length < 100) break;
    }
  } catch (e) { if (e.status !== 404 && e.status !== 409) throw e; } // repo kosong
  return names.sort((a, b) => (a === S.defaultBranch ? -1 : b === S.defaultBranch ? 1 : a.localeCompare(b)));
}

async function openDrive(branch) {
  S.branch = branch;
  S.head = null;
  // pastikan folder root ada di branch ini
  try { await repoApi(`/contents/${ROOT}?ref=${branch}`); }
  catch (e) {
    if (e.status !== 404) throw e;
    await repoApi(`/contents/${ROOT}/${KEEP}`, { method: 'PUT', body: JSON.stringify({ message: 'Drivemu: initialize', content: '', branch }) });
  }
  saveSession(branch);
  showApp();
}
// Drive baru = branch yatim (orphan): riwayat dan isinya terpisah dari drive lain
async function createDrive(label) {
  const name = slug(label);
  if (!name) throw new Error('Please use letters or numbers in the name.');
  if (S.branches.length === 0) { // repo masih kosong: file pertama sekaligus membuat branch bawaan
    await repoApi(`/contents/${ROOT}/${KEEP}`, { method: 'PUT', body: JSON.stringify({ message: 'Drivemu: initialize', content: '' }) });
    return S.defaultBranch;
  }
  const blob = await repoApi('/git/blobs', { method: 'POST', body: JSON.stringify({ content: '', encoding: 'utf-8' }) });
  const tree = await repoApi('/git/trees', { method: 'POST', body: JSON.stringify({ tree: [{ path: `${ROOT}/${KEEP}`, mode: '100644', type: 'blob', sha: blob.sha }] }) });
  const commit = await repoApi('/git/commits', { method: 'POST', body: JSON.stringify({ message: `Drivemu: create drive ${name}`, tree: tree.sha, parents: [] }) });
  await repoApi('/git/refs', { method: 'POST', body: JSON.stringify({ ref: 'refs/heads/' + name, sha: commit.sha }) });
  return name;
}

/* --- layar --- */
function renderAcctBtn(btn) {
  btn.replaceChildren();
  const img = h('img'); img.src = S.user.avatar_url; img.alt = '';
  btn.append(img, h('span', '', S.owner), icon('chevron-down'));
  btn.title = `${S.owner}/${S.repo}`;
}
function showApp() {
  show('app');
  renderAcctBtn($('acctBtn'));
  $('navDrive').replaceChildren(icon('hard-drive'), S.branch);
  $('navDrive').title = `${S.owner}/${S.repo}@${S.branch}`;
  updateUsage();
  S.path = []; S.query = ''; $('search').value = ''; S.selected.clear(); load();
}
function showLogin(err = '') {
  const adding = !!S.returnTo;
  show('login');
  $('loginError').textContent = err;
  $('loginBack').classList.toggle('hidden', !adding);
  $('loginTitle').textContent = adding ? 'Add an account' : 'Connect your GitHub';
  $('loginSub').textContent = adding
    ? 'Use another token. It can belong to the same GitHub account or a different one.'
    : 'It takes about a minute. Your token never leaves your browser.';
}
function addAccount() {
  S.returnTo = S.screen;
  $('tokenInput').value = ''; $('repoInput').value = DEFAULT_REPO;
  showLogin();
}

/* --- ganti / hapus akun --- */
async function switchAccount(id) {
  const a = S.accounts.find((x) => x.id === id);
  if (!a) return;
  const snap = snapshot();
  const t = toast(`Switching to ${a.login || 'account'}…`, false, 0);
  try {
    await authenticate(a.token);
    await connectRepo(a.repo || DEFAULT_REPO);
    S.activeId = id;
    Object.assign(a, { login: S.owner, avatar: S.user.avatar_url }); persist();
    t.remove();
    if (a.branch) {
      try { await openDrive(a.branch); return; }
      catch (e) { toast(`Could not open "${a.branch}": ${e.message}`, true); }
    }
    await showDrives();
  } catch (e) {
    t.remove(); restore(snap);
    if (e.status === 401) { toast(`The token for ${a.login || 'that account'} is no longer valid.`, true, 6000); await signOut(id); }
    else toast('Could not switch: ' + e.message, true, 6000);
  }
}
async function signOut(id) {
  S.accounts = S.accounts.filter((a) => a.id !== id);
  if (S.activeId === id) {
    S.activeId = S.accounts.length ? S.accounts[0].id : null; persist();
    if (S.activeId) { await switchAccount(S.activeId); return; }
    S.token = ''; S.items = []; S.returnTo = null; $('tokenInput').value = '';
    showLogin();
    return;
  }
  persist();
}
async function removeAccount(a) {
  const ok = await ask({ title: 'Remove account?', text: `${a.login || 'This account'} (${a.repo}, token …${a.token.slice(-4)}) will be removed from this browser. Your files on GitHub are not touched.`, ok: 'Remove' });
  if (ok) signOut(a.id);
}

function renderAcctMenu() {
  const m = $('acctMenu'); m.replaceChildren();
  S.accounts.forEach((a) => {
    const row = h('div', 'acct-row' + (a.id === S.activeId ? ' on' : ''));
    row.setAttribute('role', 'menuitem'); row.tabIndex = 0;
    const img = h('img'); img.src = a.avatar || ''; img.alt = '';
    const txt = h('div', 'acct-txt'); txt.append(h('b', '', a.login || 'GitHub account'), h('span', '', `${a.repo} · …${a.token.slice(-4)}`));
    row.append(img, txt);
    if (a.id === S.activeId) row.append(icon('check'));
    const x = h('button', 'ibtn del'); x.append(icon('close')); x.title = 'Remove this account'; x.setAttribute('aria-label', 'Remove this account');
    x.onclick = (e) => { e.stopPropagation(); closeMenu(); removeAccount(a); };
    row.append(x);
    row.onclick = () => { closeMenu(); if (a.id !== S.activeId) switchAccount(a.id); };
    row.onkeydown = (e) => { if (e.key === 'Enter') row.click(); };
    m.append(row);
  });
  m.append(h('hr'));
  const st = h('button'); st.append(icon('sliders'), 'Settings');
  st.onclick = () => { closeMenu(); openSettings(); };
  m.append(st);
  const add = h('button'); add.append(icon('plus'), 'Add account');
  add.onclick = () => { closeMenu(); addAccount(); };
  m.append(add);
}
function openAcctMenu(anchor) {
  closeMenu();
  renderAcctMenu();
  const m = $('acctMenu');
  m.classList.remove('hidden');
  const r = anchor.getBoundingClientRect();
  m.style.top = r.bottom + 6 + 'px';
  m.style.left = Math.max(8, Math.min(r.right - m.offsetWidth, window.innerWidth - m.offsetWidth - 8)) + 'px';
}

/* --- pengaturan: profil, token, repositori, branch bawaan --- */
const row = (k, v) => {
  const r = h('div', 'srow'), val = h('span', 'sv');
  if (v instanceof Node) val.append(v); else val.textContent = v;
  r.append(h('span', 'sk', k), val);
  return r;
};
const linkEl = (text, href) => { const a = h('a', '', text); a.href = href; a.target = '_blank'; a.rel = 'noopener'; return a; };
const section = (title, ...kids) => { const s = h('section', 'ssec'); s.append(h('h4', '', title), ...kids); return s; };
const fmtDate = (d) => new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

async function openSettings() {
  const d = $('settings'), body = $('settingsBody');
  body.replaceChildren(h('div', 'spinner'));
  if (!d.open) d.showModal();
  try { // data terbaru; kalau gagal pakai yang sudah ada
    const info = await repoApi('');
    S.repoSizeKB = info.size; S.repoPrivate = info.private; S.defaultBranch = info.default_branch;
  } catch { /* abaikan */ }
  try { S.branches = await fetchBranches(); } catch { /* abaikan */ }
  const u = S.user, ti = S.tokenInfo || {};

  // profil
  const prof = h('div', 'profile');
  const img = h('img'); img.src = u.avatar_url || ''; img.alt = '';
  const who = h('div', 'who'); who.append(h('b', '', u.name || u.login), h('span', 'muted', '@' + u.login));
  if (u.bio) who.append(h('span', 'bio', u.bio));
  prof.append(img, who);
  const pr = h('div', 'srows');
  const add = (rows, k, v) => { if (v !== null && v !== undefined && v !== '') rows.append(row(k, v)); };
  if (u.html_url) add(pr, 'GitHub profile', linkEl(u.html_url.replace('https://', ''), u.html_url));
  add(pr, 'Email', u.email); add(pr, 'Company', u.company); add(pr, 'Location', u.location); add(pr, 'Website', u.blog);
  add(pr, 'Public repositories', u.public_repos); add(pr, 'Private repositories', u.owned_private_repos);
  add(pr, 'Followers', u.followers); add(pr, 'Plan', u.plan && u.plan.name);
  add(pr, 'Member since', u.created_at && fmtDate(u.created_at));

  // token
  const tr = h('div', 'srows');
  add(tr, 'Type', ti.type);
  const a = activeAcct();
  if (a) add(tr, 'Token', '…' + a.token.slice(-4));
  if (ti.scopes && ti.scopes.length) { const chips = h('span', 'chips'); ti.scopes.forEach((s) => chips.append(h('span', 'badge', s))); add(tr, 'Scopes', chips); }
  else if (ti.type && ti.type.startsWith('Fine')) add(tr, 'Permissions', 'Set per repository on GitHub');
  if (ti.remaining) add(tr, 'API requests left', `${ti.remaining} / ${ti.limit} this hour`);
  if (ti.expires) add(tr, 'Expires', fmtDate(ti.expires));

  // repositori
  const rr = h('div', 'srows');
  add(rr, 'Repository', linkEl(`${S.owner}/${S.repo}`, `https://github.com/${S.owner}/${S.repo}`));
  add(rr, 'Visibility', h('span', 'badge', S.repoPrivate ? 'Private' : 'Public'));
  add(rr, 'Size', fmtSize(S.repoSizeKB * 1024));
  add(rr, 'Drives', String(S.branches.length));
  const repoIn = h('input'); repoIn.type = 'text'; repoIn.value = S.repo; repoIn.setAttribute('aria-label', 'Repository name'); repoIn.pattern = '[A-Za-z0-9._\\-]+';
  const repoBtn = h('button', 'btn', 'Switch'); repoBtn.type = 'button';
  repoBtn.onclick = async () => {
    const name = repoIn.value.trim();
    if (!name || name === S.repo) return;
    if (!validRepo(name)) return toast('Invalid repository name', true);
    const prev = S.repo; repoBtn.disabled = true;
    const t = toast('Connecting…', false, 0);
    try { await connectRepo(name); saveSession(); d.close(); await showDrives(); }
    catch (e) { S.repo = prev; toast('Failed: ' + e.message, true, 6000); }
    t.remove(); repoBtn.disabled = false;
  };
  const repoForm = h('div', 'inline'); repoForm.append(repoIn, repoBtn);

  // branch bawaan
  const sel = h('select'); sel.setAttribute('aria-label', 'Default drive');
  S.branches.forEach((b) => { const o = h('option', '', b); o.value = b; sel.append(o); });
  sel.value = S.defaultBranch;
  const defBtn = h('button', 'btn', 'Set as default'); defBtn.type = 'button'; defBtn.disabled = true;
  sel.onchange = () => { defBtn.disabled = sel.value === S.defaultBranch; };
  defBtn.onclick = async () => { if (await setDefault(sel.value)) openSettings(); };
  const defForm = h('div', 'inline'); defForm.append(sel, defBtn);

  // hapus akun
  const rm = h('button', 'btn danger', 'Remove this account'); rm.type = 'button';
  rm.onclick = () => { d.close(); if (a) removeAccount(a); };

  body.replaceChildren(
    section('Profile', prof, pr),
    section('Token', tr),
    section('Storage repository', rr,
      h('p', 'hint', 'Switch to another repository in this account. It is created as a private repository if it doesn’t exist yet.'), repoForm),
    section('Default drive', h('p', 'hint', 'The default branch is what GitHub shows first and what a plain git clone checks out. Changing it needs permission to administer the repository.'), defForm),
    section('Account', h('p', 'hint', 'Removes this token from this browser. Your files on GitHub are not touched.'), rm),
  );
}

/* --- pemilih drive --- */
async function enter(name) {
  const t = toast('Opening ' + name + '…', false, 0);
  try { await openDrive(name); }
  catch (e) { toast('Could not open drive: ' + e.message, true); }
  t.remove();
}
async function newDrive() {
  const name = await ask({ title: 'New drive', text: `Creates a separate branch in ${S.owner}/${S.repo} with its own empty file space.`, input: '', ok: 'Create' });
  if (!name) return;
  const t = toast('Creating drive…', false, 0);
  try { await openDrive(await createDrive(name)); }
  catch (e) { toast(e.status === 422 ? 'A drive with that name already exists.' : 'Failed: ' + e.message, true, 6000); }
  t.remove();
}
// Ubah branch bawaan repo (yang dibuka GitHub lebih dulu dan di-checkout oleh git clone biasa)
async function setDefault(name) {
  const ok = await ask({ title: 'Make this the default drive?', text: `“${name}” becomes the default branch of ${S.owner}/${S.repo}. It is what GitHub shows first and what a plain git clone checks out.`, ok: 'Make default' });
  if (!ok) return false;
  let done = false;
  const t = toast('Changing default branch…', false, 0);
  try {
    await repoApi('', { method: 'PATCH', body: JSON.stringify({ default_branch: name }) });
    S.defaultBranch = name;
    toast(`“${name}” is now the default drive`);
    done = true;
  } catch (e) {
    toast(e.status === 403 || e.status === 404 ? 'Your token needs permission to administer this repository (Administration: Read and write).' : 'Failed: ' + e.message, true, 7000);
  }
  t.remove();
  if (S.screen === 'drives') showDrives();
  return done;
}
// Hapus drive = hapus branch. Branch bawaan ditolak GitHub, jadi tidak ditawarkan.
async function deleteDrive(name) {
  if (name === S.defaultBranch) return toast('The default drive can’t be deleted. Make another drive the default first.', true, 6000);
  let info = '';
  try {
    const tr = await repoApi(`/git/trees/${encodeURIComponent(name)}?recursive=1`);
    const files = tr.tree.filter((x) => x.type === 'blob' && x.path.startsWith(ROOT + '/') && !x.path.endsWith('/' + KEEP));
    info = ` It contains ${files.length} file(s) (${fmtSize(files.reduce((s, f) => s + (f.size || 0), 0))}).`;
  } catch { /* hitungan hanya informasi tambahan */ }
  const typed = await ask({ title: 'Delete this drive?', text: `This permanently deletes the branch “${name}” and everything in it.${info} Type the drive name to confirm.`, input: '', ok: 'Delete drive' });
  if (typed === null) return;
  if (typed !== name) return toast('The name didn’t match, nothing was deleted.', true);
  const t = toast('Deleting drive…', false, 0);
  try {
    await repoApi(`/git/refs/heads/${name}`, { method: 'DELETE' });
    const a = activeAcct(); if (a && a.branch === name) { a.branch = null; persist(); }
    toast(`Drive “${name}” deleted`);
  } catch (e) { toast('Failed: ' + e.message, true, 7000); }
  t.remove(); showDrives();
}
function driveCard(name) {
  const isDef = name === S.defaultBranch;
  const b = h('div', 'drive-card'); b.tabIndex = 0; b.setAttribute('role', 'button');
  const t = h('span', 'tile lg accent'); t.appendChild(icon('hard-drive'));
  b.append(t, h('span', 'drive-name', name), h('span', 'meta' + (isDef ? ' def' : ''), isDef ? 'Default branch' : 'Separate branch'));
  if (!isDef) {
    const acts = h('div', 'acts');
    const btn = (ic, title, fn, cls = '') => { const x = h('button', 'ibtn ' + cls); x.append(icon(ic)); x.title = title; x.setAttribute('aria-label', title); x.onclick = (e) => { e.stopPropagation(); fn(); }; return x; };
    acts.append(btn('trash', 'Delete drive', () => deleteDrive(name), 'del'));
    b.appendChild(acts);
  }
  b.onclick = () => enter(name);
  b.onkeydown = (e) => { if (e.key === 'Enter' && e.target === b) enter(name); };
  return b;
}
function newDriveCard() {
  const b = h('button', 'drive-card new');
  const t = h('span', 'tile lg'); t.appendChild(icon('plus'));
  b.append(t, h('span', 'drive-name', 'New drive'), h('span', 'meta', 'Empty, with its own history'));
  b.onclick = newDrive;
  return b;
}
async function showDrives() {
  show('drives');
  renderAcctBtn($('drivesAcctBtn'));
  $('repoLine').textContent = `${S.owner}/${S.repo} · ${S.repoPrivate ? 'private' : 'PUBLIC'} repository`;
  const grid = $('driveGrid');
  grid.replaceChildren(h('p', 'muted', 'Loading your drives…'));
  try { S.branches = await fetchBranches(); }
  catch (e) { S.branches = []; toast('Failed to load drives: ' + e.message, true); }
  grid.replaceChildren(...S.branches.map(driveCard), newDriveCard());
}


/* ---------- daftar file ---------- */
async function load() {
  $('loading').replaceChildren(...Array.from({ length: 4 }, () => h('i')));
  $('loading').classList.remove('hidden'); $('empty').classList.add('hidden'); $('list').replaceChildren();
  S.selected.clear();
  try {
    const r = await repoApi(`/contents/${enc(fullPath())}?ref=${S.head || S.branch}`);
    let items = Array.isArray(r) ? r : [];
    if (items.length >= 1000) items = await listViaTree(fullPath()); // Contents API berhenti di 1000 item
    S.items = items.filter((i) => i.name !== KEEP);
  } catch (e) {
    if (e.status === 404) S.items = [];
    else { toast('Failed to load: ' + e.message, true); S.items = []; }
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

function render() {
  renderCrumbs();
  const items = S.visible = visibleItems();
  const list = $('list');
  list.className = 'list ' + S.view;
  list.replaceChildren();
  if (S.view === 'grid') {
    const dirs = items.filter((i) => i.type === 'dir'), files = items.filter((i) => i.type !== 'dir');
    if (dirs.length) { list.appendChild(h('div', 'sec', 'Folders')); const g = h('div', 'folders'); dirs.forEach((i) => g.appendChild(folderChip(i))); list.appendChild(g); }
    if (files.length) { list.appendChild(h('div', 'sec', 'Files')); const g = h('div', 'cards'); files.forEach((i) => g.appendChild(fileCard(i))); list.appendChild(g); }
  } else if (items.length) {
    list.appendChild(listTable(items));
  }
  // state kosong
  const empty = items.length === 0;
  $('empty').classList.toggle('hidden', !empty);
  if (empty) {
    const searching = S.query && S.items.length > 0;
    $('emptyTitle').textContent = searching ? 'No matches' : 'This folder is empty';
    $('emptyText').textContent = searching ? `Nothing in this folder matches “${S.query}”.` : 'Drag files here, or upload something to get started.';
    $('emptyCta').classList.toggle('hidden', searching);
  }
  $('viewGrid').classList.toggle('on', S.view === 'grid');
  $('viewList').classList.toggle('on', S.view === 'list');
  updateSelection();
  const files = S.items.filter((i) => i.type !== 'dir');
  const total = files.reduce((s, f) => s + f.size, 0);
  $('status').textContent = `${S.items.length - files.length} folders · ${files.length} files · ${fmtSize(total)} · ${S.repoPrivate ? 'Private' : 'PUBLIC'} · ${S.owner}/${S.repo}@${S.branch}`;
}

function renderCrumbs() {
  const c = $('crumbs'); c.replaceChildren();
  const mk = (label, depth) => {
    const b = h('button', '', label);
    b.onclick = () => { S.path = S.path.slice(0, depth); S.query = ''; $('search').value = ''; load(); };
    return b;
  };
  c.appendChild(mk('My Drive', 0));
  S.path.forEach((p, i) => { const s = icon('chevron-right'); s.classList.add('sep'); c.append(s, mk(p, i + 1)); });
}

/* ----- blok pembangun item ----- */
function chkEl(it, always = false) {
  const c = h('input', 'chk' + (always ? ' always' : '')); c.type = 'checkbox'; c.setAttribute('aria-label', 'Select ' + it.name);
  c.onclick = (e) => e.stopPropagation();
  c.onchange = () => toggleSel(it.name, c.checked);
  return c;
}
function actsEl(it) {
  const a = h('div', 'acts');
  const btn = (ic, title, fn, cls = '') => { const b = h('button', 'ibtn ' + cls); b.append(icon(ic)); b.title = title; b.setAttribute('aria-label', title); b.onclick = (e) => { e.stopPropagation(); fn(); }; return b; };
  if (it.type !== 'dir') a.appendChild(btn('download', 'Download', () => download(it)));
  a.appendChild(btn('pencil', 'Rename', () => rename(it)));
  a.appendChild(btn('trash', 'Delete', () => remove([it]), 'del'));
  return a;
}
function nameCell(it, k) {
  const n = h('div', 'namecell'); n.append(tile(k), h('span', 'name', it.name)); return n;
}
function base(it, cls) {
  const el = h('div', 'item ' + cls); el.dataset.name = it.name; el.title = it.name;
  el.onclick = () => (S.selected.size ? toggleSel(it.name) : open(it));
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
  const all = h('input', 'chk always'); all.type = 'checkbox'; all.id = 'selAll'; all.setAttribute('aria-label', 'Select all');
  all.onchange = () => { S.visible.forEach((i) => (all.checked ? S.selected.add(i.name) : S.selected.delete(i.name))); updateSelection(); };
  const sb = (label, key) => {
    const b = h('button', 'sortbtn' + (S.sort === key ? ' on' : '')); b.append(label);
    if (S.sort === key) b.appendChild(icon(S.dir === 1 ? 'arrow-up' : 'arrow-down'));
    b.onclick = () => { if (S.sort === key) S.dir *= -1; else { S.sort = key; S.dir = 1; } render(); };
    return b;
  };
  head.append(all, sb('Name', 'name'), sb('Type', 'type'), sb('Size', 'size'), h('span'));
  t.appendChild(head);
  for (const it of items) {
    const k = kind(it);
    const el = base(it, 'row');
    el.append(chkEl(it), nameCell(it, k), h('div', 'cell muted', typeLabel(it)), h('div', 'cell muted num-r', it.type === 'dir' ? '—' : fmtSize(it.size)), actsEl(it));
    t.appendChild(el);
  }
  return t;
}

/* ----- seleksi ----- */
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
  $('selCount').textContent = `${n} selected`;
  document.body.classList.toggle('selecting', n > 0);
  const all = $('selAll');
  if (all) all.checked = S.visible.length > 0 && S.visible.every((i) => S.selected.has(i.name));
}

/* ---------- aksi ---------- */
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
  const t = toast('Downloading ' + it.name + '…', false, 0);
  try { saveBlob(await fetchBlob(it), it.name); } catch (e) { toast('Download failed: ' + e.message, true); }
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
    if (!['image', 'video', 'audio', 'pdf', 'text'].includes(k)) { body.innerHTML = '<p class="muted">No preview available for this file type. Use the Download button.</p>'; return; }
    const blob = await fetchBlob(it);
    if (!dlg.open) return;
    if (pvUrl) URL.revokeObjectURL(pvUrl);
    body.replaceChildren();
    if (k === 'text') { const pre = h('pre'); pre.textContent = await blob.text(); body.appendChild(pre); return; }
    pvUrl = URL.createObjectURL(blob);
    const tag = { image: 'img', video: 'video', audio: 'audio', pdf: 'iframe' }[k];
    const el = document.createElement(tag); el.src = pvUrl;
    if (k === 'video' || k === 'audio') el.controls = true;
    body.appendChild(el);
  } catch (e) { body.replaceChildren(h('p', 'error', 'Failed to load: ' + e.message)); }
}

const readB64 = (file) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1] || '');
  r.onerror = () => rej(r.error);
  r.readAsDataURL(file);
});

// Terima File atau { file, rel } (rel = path relatif, mis. "Foto/a.jpg" untuk unggah folder)
async function upload(input) {
  let files = [...input].map((x) => (x instanceof File ? { file: x, rel: x.webkitRelativePath || x.name } : x));
  if (!files.length || S.busy) return;
  const tooBig = files.filter((f) => f.file.size > MAX_FILE);
  if (tooBig.length) toast(`Skipped (over GitHub's ${fmtSize(MAX_FILE)} limit): ${tooBig.map((f) => f.rel).join(', ')}`, true, 6000);
  files = files.filter((f) => f.file.size <= MAX_FILE);
  if (!files.length) return;
  const dup = files.filter((f) => S.items.some((i) => i.name === f.rel));
  if (dup.length && !(await ask({ title: 'Overwrite files?', text: `${dup.length} file(s) already exist and will be overwritten: ${dup.map((f) => f.rel).slice(0, 5).join(', ')}`, ok: 'Overwrite' }))) return;

  S.busy = true;
  const pt = progressToast('Uploading…');
  try {
    const entries = []; let done = 0, next = 0;
    const worker = async () => {
      while (next < files.length) {
        const f = files[next++];
        pt.set(`Uploading ${done + 1}/${files.length}: ${f.rel}`, done / files.length);
        const blob = await repoApi('/git/blobs', { method: 'POST', body: JSON.stringify({ content: await readB64(f.file), encoding: 'base64' }) });
        entries.push({ path: fullPath(f.rel), mode: '100644', type: 'blob', sha: blob.sha });
        done++; pt.set(`Uploading ${done}/${files.length}`, done / files.length);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    pt.set('Saving commit…', 1);
    await commitTree(entries, `Drivemu: upload ${files.length} file(s)`);
    toast(`${files.length} file(s) uploaded`);
    refreshUsage();
  } catch (e) { toast('Upload failed: ' + e.message, true, 7000); }
  pt.done(); S.busy = false; load();
}

async function newFolder() {
  const name = await ask({ title: 'New folder', input: 'Untitled folder', ok: 'Create' });
  if (!name) return;
  if (/[\\/]/.test(name) || name === '.' || name === '..') return toast('Invalid folder name', true);
  if (S.items.some((i) => i.name === name)) return toast('That name is already in use', true);
  try {
    const put = await repoApi(`/contents/${enc(fullPath(name, KEEP))}`, { method: 'PUT', body: JSON.stringify({ message: `Drivemu: new folder ${name}`, content: '', branch: S.branch }) });
    if (put && put.commit) S.head = put.commit.sha;
    toast('Folder created');
  } catch (e) { toast('Failed: ' + e.message, true); }
  load();
}

async function rename(it) {
  const name = await ask({ title: 'Rename', input: it.name, ok: 'Save' });
  if (!name || name === it.name) return;
  if (/[\\/]/.test(name) || name === '.' || name === '..') return toast('Invalid name', true);
  if (S.items.some((i) => i.name === name)) return toast('That name is already in use', true);
  const t = toast('Renaming…', false, 0);
  try {
    const dir = fullPath();
    const entries = [];
    if (it.type === 'dir') {
      for (const b of await blobsUnder(it.path)) {
        entries.push({ path: `${dir}/${name}/${b.path.slice(it.path.length + 1)}`, mode: b.mode, type: 'blob', sha: b.sha });
        entries.push({ path: b.path, mode: b.mode, type: 'blob', sha: null });
      }
    } else {
      entries.push({ path: `${dir}/${name}`, mode: '100644', type: 'blob', sha: it.sha });
      entries.push({ path: it.path, mode: '100644', type: 'blob', sha: null });
    }
    await commitTree(entries, `Drivemu: rename ${it.name} to ${name}`);
    toast('Renamed');
  } catch (e) { toast('Failed: ' + e.message, true); }
  t.remove(); load();
}

async function remove(list) {
  const label = list.length === 1 ? `"${list[0].name}"` : `${list.length} items`;
  if (!(await ask({ title: 'Delete permanently?', text: `${label} will be deleted from the repository (git history on GitHub still keeps old versions).`, ok: 'Delete' }))) return;
  const t = toast('Deleting…', false, 0);
  try {
    const entries = [];
    for (const it of list) {
      if (it.type === 'dir') for (const b of await blobsUnder(it.path)) entries.push({ path: b.path, mode: b.mode, type: 'blob', sha: null });
      else entries.push({ path: it.path, mode: '100644', type: 'blob', sha: null });
    }
    if (entries.length) await commitTree(entries, `Drivemu: delete ${label}`);
    toast('Deleted');
    refreshUsage();
  } catch (e) { toast('Failed: ' + e.message, true); }
  t.remove(); load();
}

/* ---------- menu "New" ---------- */
function openMenu(anchor) {
  const m = $('newMenu');
  m.classList.remove('hidden');
  const r = anchor.getBoundingClientRect();
  m.style.top = r.bottom + 6 + 'px';
  m.style.left = Math.max(8, Math.min(r.left, window.innerWidth - m.offsetWidth - 8)) + 'px';
}
const closeMenu = () => { $('newMenu').classList.add('hidden'); $('acctMenu').classList.add('hidden'); };
$('newBtn').onclick = (e) => { e.stopPropagation(); openMenu(e.currentTarget); };
$('mobileNewBtn').onclick = (e) => { e.stopPropagation(); openMenu(e.currentTarget); };
document.addEventListener('click', closeMenu);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
$('newMenu').onclick = (e) => {
  const b = e.target.closest('button'); if (!b) return;
  closeMenu();
  ({ files: () => $('fileInput').click(), 'folder-upload': () => $('folderInput').click(), folder: newFolder })[b.dataset.act]();
};

/* ---------- event ---------- */
$('loginForm').onsubmit = async (e) => {
  e.preventDefault();
  const btn = $('loginBtn'); btn.disabled = true; btn.textContent = 'Connecting…'; $('loginError').textContent = '';
  const snap = snapshot();
  try {
    const repo = $('repoInput').value.trim(), token = $('tokenInput').value.trim();
    if (!validRepo(repo)) throw new Error('Repository names can only use letters, numbers, dots, dashes and underscores.');
    await authenticate(token);
    await connectRepo(repo);
    registerAccount(token);
    S.returnTo = null; $('tokenInput').value = '';
    await showDrives();
  } catch (err) {
    restore(snap); // gagal menambah akun: tetap di akun sebelumnya
    $('loginError').textContent = err.status === 401 ? 'Invalid token.' : 'Failed: ' + err.message;
  }
  btn.disabled = false; btn.textContent = 'Connect';
};
$('loginBack').onclick = () => { const to = S.returnTo; S.returnTo = null; show(to || 'drives'); };
for (const id of ['acctBtn', 'drivesAcctBtn']) $(id).onclick = (e) => { e.stopPropagation(); openAcctMenu(e.currentTarget); };
$('navAll').onclick = () => { saveSession(); showDrives(); };
for (const id of ['settingsBtn', 'drivesSettingsBtn']) $(id).onclick = openSettings;
$('settingsClose').onclick = () => $('settings').close();
$('emptyCta').onclick = () => $('fileInput').click();
$('fileInput').onchange = (e) => { upload(e.target.files); e.target.value = ''; };
$('folderInput').onchange = (e) => { upload(e.target.files); e.target.value = ''; };
$('refreshBtn').onclick = () => { S.head = null; load(); refreshUsage(); }; // baca ulang dari branch (perubahan dari luar Drivemu)
$('navDrive').onclick = () => { S.path = []; S.query = ''; $('search').value = ''; load(); };
const setView = (v) => { S.view = v; try { localStorage.setItem('drivemu.view', v); } catch { /* abaikan */ } render(); };
$('viewGrid').onclick = () => setView('grid');
$('viewList').onclick = () => setView('list');
$('search').oninput = (e) => { S.query = e.target.value; render(); };
$('selClear').onclick = () => { S.selected.clear(); updateSelection(); };
$('bulkDelete').onclick = () => remove(S.items.filter((i) => S.selected.has(i.name)));
$('pvClose').onclick = () => $('preview').close();
$('preview').onclose = () => { if (pvUrl) { URL.revokeObjectURL(pvUrl); pvUrl = null; } $('pvBody').replaceChildren(); };

// seret & lepas
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

// Baca file hasil drop, termasuk isi folder (rekursif)
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

/* ---------- mulai ---------- */
(async function init() {
  try { S.view = localStorage.getItem('drivemu.view') || 'grid'; } catch { /* abaikan */ }
  loadAccounts();
  $('repoInput').value = DEFAULT_REPO;
  const a = activeAcct();
  if (!a) { showLogin(); return; }
  try {
    await authenticate(a.token);
    await connectRepo(a.repo || DEFAULT_REPO);
    Object.assign(a, { login: S.owner, avatar: S.user.avatar_url }); persist();
  } catch (e) {
    if (e.status === 401) { toast(`The token for ${a.login || 'an account'} is no longer valid.`, true, 6000); await signOut(a.id); }
    else showLogin('Could not connect: ' + e.message);
    return;
  }
  if (a.branch) {
    try { await openDrive(a.branch); return; }
    catch (e) { toast(`Could not open "${a.branch}": ${e.message}`, true); }
  }
  showDrives();
})();
})();
