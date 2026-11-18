import { os, t, i18n, fs, apps, h, promptDialog, alertDialog, readJSON, writeJSON, formatBytes } from 'webos/sdk/app.js';

await os.ready;
await apps.init();

/* ------------------------------------ glyphs ----------------------------------- */

const STROKE = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
const GLYPH = {
  processes: `<path ${STROKE} d="M4 6h16M4 12h16M4 18h16M7 4v4M7 10v4M7 16v4"/>`,
  performance: `<path ${STROKE} d="M4 20V4M4 20h16M7 15l4-4 3 3 5-7"/>`,
  details: `<path ${STROKE} d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>`,
  startup: `<path ${STROKE} d="M4 18a8 8 0 1 1 16 0M12 18l4-6M7 18h.01M17 18h.01"/>`,
  enable: `<path ${STROKE} d="M5 12l5 5 9-10"/>`,
  disable: `<path ${STROKE} d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM6 6l12 12"/>`,
  settings: `<path ${STROKE} d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.3l2-1.500-2-3.400-2.300.9a7 7 0 0 0-2.200-1.300L14 3h-4l-.4 2.400a7 7 0 0 0-2.200 1.300l-2.300-.9-2 3.400 2 1.500a7 7 0 0 0 0 2.600l-2 1.500 2 3.400 2.300-.9a7 7 0 0 0 2.200 1.300L10 21h4l.4-2.400a7 7 0 0 0 2.200-1.300l2.300.9 2-3.400-2-1.500c.1-.4.100-.9.100-1.300z"/>`,
  run: `<path ${STROKE} d="M5 5h14v14H5zM9 9l4 3-4 3"/>`,
  end: `<path ${STROKE} d="M6 6l12 12M18 6L6 18"/>`,
  chevron: `<path ${STROKE} d="M9 5l7 7-7 7"/>`
};

function glyph(name) {
  const span = document.createElement('span');
  span.innerHTML = `<svg viewBox="0 0 24 24">${GLYPH[name]}</svg>`;
  return span.firstChild;
}

/* ------------------------------------- state ----------------------------------- */

const SPEEDS = { high: 1000, normal: 2000, low: 4000, paused: 0 };
const HISTORY = 60;
const TINT = { cpu: '#118bd1', memory: '#8e44ad', disk: '#4caf50', network: '#d9822b' };

const state = {
  view: 'processes', // 'processes' | 'performance' | 'startup' | 'details'
  speed: readJSON('taskmgr.speed', 'normal'),
  selected: null, // 'app:<id>' | 'win:<id>'
  open: new Set(), // expanded app rows
  query: '',
  sort: { processes: ['cpu', -1], startup: ['name', 1], details: ['name', 1] },
  resource: 'cpu'
};
if (!(state.speed in SPEEDS)) state.speed = 'normal';

/* ---------------------------------- measuring ---------------------------------- */

// A window cannot look beyond itself, so the shell does the measuring (os.system.metrics)
// and this page asks for the readings once a second.
let latest = { windows: [], metrics: null };
let diskEvents = 0;
let lastNet = null;

const pageStart = () => latest.metrics?.pageStart ?? performance.timeOrigin;

fs.on('change', () => diskEvents++);

const history = { cpu: [], memory: [], disk: [], network: [] };
const live = { cpu: 0, memory: 0, memoryUsed: 0, memoryLimit: 0, disk: 0, network: 0, apps: new Map() };

function pushHistory(key, value) {
  history[key].push(value);
  if (history[key].length > HISTORY) history[key].shift();
}

async function sample() {
  const [metrics, windows] = await Promise.all([os.system.metrics().catch(() => null), os.windows.list().catch(() => [])]);
  latest = { windows, metrics: metrics ?? latest.metrics };
  if (!metrics) return;

  // processor: the busiest of "tasks over 50 ms" and "how late the timer ran"
  const busy = new Map(Object.entries(metrics.busy));
  let longMs = 0;
  for (const ms of busy.values()) longMs += ms;
  live.cpu = Math.min(100, Math.max(longMs, metrics.drift) / 10);
  live.apps = new Map([...busy].map(([key, ms]) => [key, Math.min(100, ms / 10)]));
  pushHistory('cpu', live.cpu);

  live.memoryUsed = metrics.memory.used;
  live.memoryLimit = metrics.memory.limit;
  live.memory = live.memoryLimit ? (live.memoryUsed / live.memoryLimit) * 100 : 0;
  pushHistory('memory', live.memoryUsed);

  live.disk = Math.min(100, diskEvents * 10);
  diskEvents = 0;
  pushHistory('disk', live.disk);

  live.network = lastNet == null ? 0 : Math.max(0, metrics.network - lastNet);
  lastNet = metrics.network;
  pushHistory('network', live.network);
}
await sample();
setInterval(sample, 1000);

/* ------------------------------------ processes -------------------------------- */

const pidOf = (id) => String(id).replace(/\D/g, '');
const squash = (text) => text.toLowerCase().replace(/[\s-]+/g, '');

/** How much a window weighs: its page elements, plus the pixels of its pictures and canvases (measured by the shell). */
const weightOf = (id) => latest.metrics?.weights?.[id] ?? { nodes: 200, media: 0 };

const shellNodes = () => latest.metrics?.shellNodes ?? 600;

/** The windows, grouped by app, and the parts of the desktop itself. Memory is the heap shared out by weight, plus pictures. */
function gather() {
  const background = latest.windows.filter((w) => w.background);
  const windows = latest.windows.filter((w) => !w.background);
  const byApp = new Map();
  for (const win of windows) {
    const group = byApp.get(win.appId) ?? { appId: win.appId, windows: [] };
    group.windows.push({ ...win, pid: pidOf(win.id), ...weightOf(win.id) });
    byApp.set(win.appId, group);
  }
  const shell = shellNodes();
  const totalNodes = shell + [...byApp.values()].reduce((sum, g) => sum + g.windows.reduce((s, w) => s + w.nodes, 0), 0) + background.reduce((sum, w) => sum + weightOf(w.id).nodes, 0);
  const heap = live.memoryUsed || 0;
  const share = (nodes, media = 0) => (heap * nodes) / Math.max(1, totalNodes) + media;
  const groups = [...byApp.values()].map((group) => {
    const app = apps.get(group.appId);
    const perWindowCpu = (live.apps.get(`app:${group.appId}`) ?? 0) / group.windows.length;
    for (const w of group.windows) {
      w.cpu = perWindowCpu;
      w.mem = share(w.nodes, w.media);
    }
    return {
      key: `app:${group.appId}`,
      appId: group.appId,
      name: app ? apps.name(app) : group.appId,
      icon: app?.icon ?? '',
      windows: group.windows,
      cpu: group.windows.reduce((s, w) => s + w.cpu, 0),
      mem: group.windows.reduce((s, w) => s + w.mem, 0),
      suspended: group.windows.every((w) => w.minimized)
    };
  });
  // started with the system, without a window (Settings → Apps → Startup)
  const hidden = background.map((w) => {
    const app = apps.getAny(w.appId);
    const weight = weightOf(w.id);
    return { key: `bg:${w.id}`, id: w.id, appId: w.appId, name: apps.name(app) || w.title, icon: app?.icon ?? '', cpu: live.apps.get(`app:${w.appId}`) ?? 0, mem: share(weight.nodes, weight.media), opened: w.opened, background: true };
  });
  const shellCpu = live.apps.get('shell') ?? 0;
  const system = [
    { key: 'sys:dwm', name: t('tm.system.dwm'), image: 'dwm.exe', weight: 0.4 },
    { key: 'sys:shell', name: t('tm.system.shell'), image: 'explorer.exe', weight: 0.4 },
    { key: 'sys:disk', name: t('tm.system.disk'), image: 'vds.exe', weight: 0.2 }
  ].map((row) => ({ ...row, cpu: shellCpu * row.weight, mem: share(shell * row.weight) }));
  return { groups, system, background: hidden, windows: groups.flatMap((g) => g.windows) };
}

/* ------------------------------------ actions ---------------------------------- */

function endTask(key) {
  if (!key) return;
  const data = gather();
  if (key.startsWith('app:')) data.groups.find((g) => g.key === key)?.windows.forEach((w) => os.windows.close(w.id));
  else if (key.startsWith('win:')) os.windows.close(key.slice(4));
  else if (key.startsWith('bg:')) os.windows.close(key.slice(3));
  state.selected = null;
  renderBody();
}

function switchTo(key) {
  const data = gather();
  const win = key.startsWith('win:') ? data.windows.find((w) => w.id === key.slice(4)) : data.groups.find((g) => g.key === key)?.windows.at(-1);
  if (win) os.windows.activate(win.id);
}

async function runNewTask() {
  const text = await promptDialog(t('tm.run.title'), t('tm.run.message'), { okLabel: t('tm.run.button'), placeholder: t('tm.run.placeholder') });
  const name = text?.trim();
  if (!name) return;
  const key = squash(name.replace(/\.exe$/i, ''));
  const roles = { explorer: 'file-manager', cmd: 'terminal', control: 'settings', taskmgr: 'task-manager' };
  const app = (roles[key] && apps.byRole(roles[key])) || apps.list.find((a) => a.id === key || squash(a.name) === key || squash(apps.name(a)) === key);
  if (app) return os.launch(app.id);
  const entry = fs.stat(name);
  if (entry) return os.openPath(entry.path);
  alertDialog(t('tm.run.title'), t('tm.run.notFound', { name }));
}

function setSpeed(speed) {
  state.speed = speed;
  try {
    writeJSON('taskmgr.speed', speed);
  } catch {
    /* kept for this session */
  }
  schedule();
}

/* ------------------------------------ rendering -------------------------------- */

const $ = (id) => document.getElementById(id);
const percent = (value) => `${value < 10 && value > 0 ? value.toFixed(1) : Math.round(value)}%`;
const heat = (value, scale = 100) => Math.min(1, value / scale);

function renderNav() {
  const nav = $('nav');
  nav.replaceChildren(
    ...['processes', 'performance', 'startup', 'details'].map((view) => {
      const b = h('button', { class: `nav-item${state.view === view ? ' is-active' : ''}`, type: 'button', 'data-tip': t(`tm.nav.${view}`) }, glyph(view), h('span', null, t(`tm.nav.${view}`)));
      b.addEventListener('click', () => {
        state.view = view;
        state.selected = null;
        render();
      });
      return b;
    }),
    h('span', { class: 'nav-fill' }),
    (() => {
      const b = h('button', { class: 'nav-item', type: 'button', 'data-tip': t('tm.speed.title') }, glyph('settings'), h('span', null, t('tm.speed.title')));
      os.dropdown(b, () => ['high', 'normal', 'low', 'paused'].map((id) => ({ label: t(`tm.speed.${id}`), checked: state.speed === id, radio: true, action: () => setSpeed(id) })), { placement: 'top-start' });
      return b;
    })()
  );
}

function renderHead() {
  const head = $('head');
  head.replaceChildren(h('h1', null, t(`tm.nav.${state.view}`)));
  if (state.view === 'performance') return;
  const search = h('input', { class: 'input search', type: 'text', spellcheck: false, autocomplete: 'off', value: state.query, placeholder: t('tm.search'), 'aria-label': t('tm.search') });
  search.addEventListener('input', () => {
    state.query = search.value;
    renderBody();
  });
  const run = h('button', { class: 'btn', type: 'button' }, glyph('run'), t('tm.run.button'));
  run.addEventListener('click', runNewTask);
  if (state.view === 'startup') {
    const enable = h('button', { class: 'btn', type: 'button', id: 'st-enable', disabled: true }, glyph('enable'), t('tm.startup.enable'));
    const disable = h('button', { class: 'btn', type: 'button', id: 'st-disable', disabled: true }, glyph('disable'), t('tm.startup.disable'));
    enable.addEventListener('click', () => setStartup(state.selected, true));
    disable.addEventListener('click', () => setStartup(state.selected, false));
    head.append(search, run, enable, disable);
    return;
  }
  const end = h('button', { class: 'btn', type: 'button', id: 'end-task', disabled: !selectable() }, glyph('end'), t('tm.endTask'));
  end.addEventListener('click', () => endTask(state.selected));
  head.append(search, run, end);
}

const selectable = () => !!state.selected && !state.selected.startsWith('sys:') && !state.selected.startsWith('st:');

function sortRows(rows, view) {
  const [key, dir] = state.sort[view];
  const pick = { name: (r) => r.name.toLowerCase(), cpu: (r) => r.cpu, mem: (r) => r.mem, pid: (r) => Number(r.pid ?? 0), status: (r) => r.status ?? '', uptime: (r) => r.opened ?? 0,
    publisher: (r) => (r.publisher ?? '').toLowerCase(),
    impact: (r) => IMPACTS.indexOf(r.impact), title: (r) => (r.title ?? '').toLowerCase() }[key] ?? ((r) => r.name);
  return [...rows].sort((a, b) => (pick(a) < pick(b) ? -dir : pick(a) > pick(b) ? dir : 0));
}

function headerCell(view, key, label, { total, num = false } = {}) {
  const th = h('th', { class: num ? 'num' : '', 'aria-sort': state.sort[view][0] === key ? (state.sort[view][1] > 0 ? 'ascending' : 'descending') : 'none' });
  if (total != null) th.append(h('span', { class: 'total' }, total));
  th.append(h('span', { class: 'label' }, label));
  if (state.sort[view][0] === key) th.append(h('span', { class: 'arrow' }, state.sort[view][1] > 0 ? '▲' : '▼'));
  th.addEventListener('click', () => {
    const [current, dir] = state.sort[view];
    state.sort[view] = [key, current === key ? -dir : key === 'name' || key === 'title' ? 1 : -1];
    renderBody();
  });
  return th;
}

const matches = (name) => !state.query || name.toLowerCase().includes(state.query.trim().toLowerCase());

function nameCell(row, { twist = null, icon = null, count = 0 } = {}) {
  const cell = h('td');
  const inner = h('div', { class: 'name-cell' });
  if (twist) {
    const b = h('button', { class: `twist${state.open.has(row.key) ? ' is-open' : ''}`, type: 'button', tabIndex: -1, 'aria-label': t(state.open.has(row.key) ? 'tm.collapse' : 'tm.expand') }, glyph('chevron'));
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.open.has(row.key)) state.open.delete(row.key);
      else state.open.add(row.key);
      renderBody();
    });
    inner.append(b);
  } else if (twist === null && icon !== undefined) inner.append(h('span', { class: 'spacer' }));
  if (icon) inner.append(h('img', { src: icon, alt: '', draggable: false }));
  inner.append(h('span', null, row.name));
  if (count > 1) inner.append(h('span', { class: 'count' }, `(${count})`));
  cell.append(inner);
  return cell;
}

function rowMenu(row, event) {
  const canEnd = !row.key.startsWith('sys:');
  os.menu(
    [
      !row.key.startsWith('sys:') && !row.key.startsWith('bg:') && { label: t('tm.switchTo'), action: () => switchTo(row.key) },
      row.windows?.length > 1 && { label: t(state.open.has(row.key) ? 'tm.collapse' : 'tm.expand'), action: () => (state.open.has(row.key) ? state.open.delete(row.key) : state.open.add(row.key), renderBody()) },
      { separator: true },
      { label: t('tm.endTask'), disabled: !canEnd, action: () => endTask(row.key) }
    ].filter(Boolean),
    event
  );
}

function selectRow(row) {
  state.selected = row.key;
  renderBody();
}

function processRow(row, kind, extra = {}) {
  const tr = h('tr', { class: `${kind}${state.selected === row.key ? ' is-selected' : ''}` });
  tr.addEventListener('click', () => selectRow(row));
  tr.addEventListener('dblclick', () => !row.key.startsWith('sys:') && !row.key.startsWith('bg:') && switchTo(row.key));
  tr.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    state.selected = row.key;
    rowMenu(row, e);
    renderBody();
  });
  tr.append(
    nameCell(row, extra),
    h('td', null, row.suspended ? t('tm.status.suspended') : row.windows && !row.windows.length ? '' : row.minimized ? t('tm.status.suspended') : t('tm.status.running')),
    h('td', { class: 'num heat', style: { '--level': String(heat(row.cpu, 25)) } }, percent(row.cpu)),
    h('td', { class: 'num heat', style: { '--level': String(heat(row.mem, 300 * 1024 * 1024)) } }, formatBytes(row.mem))
  );
  return tr;
}

function renderProcesses(body) {
  const data = gather();
  const groups = sortRows(data.groups.filter((g) => matches(g.name) || g.windows.some((w) => matches(w.title))), 'processes');
  const background = sortRows(data.background.filter((b) => matches(b.name)), 'processes');
  const system = sortRows(data.system.filter((s) => matches(s.name) || matches(s.image)), 'processes');
  const memPercent = live.memoryLimit ? (live.memoryUsed / live.memoryLimit) * 100 : 0;
  const rows = [h('tr', { class: 'group' }, h('td', { colSpan: 4 }, `${t('tm.groups.apps')} (${groups.length})`))];
  for (const group of groups) {
    const expandable = group.windows.length > 1;
    rows.push(processRow({ ...group, status: group.suspended ? 'suspended' : 'running' }, 'app', { twist: expandable ? true : null, icon: group.icon, count: group.windows.length }));
    if (expandable && state.open.has(group.key)) {
      for (const win of sortRows(group.windows, 'details')) {
        rows.push(processRow({ key: `win:${win.id}`, name: win.title, cpu: win.cpu, mem: win.mem, minimized: win.minimized }, 'child'));
      }
    }
  }
  if (background.length) {
    rows.push(h('tr', { class: 'group' }, h('td', { colSpan: 4 }, `${t('tm.groups.background')} (${background.length})`)));
    for (const row of background) rows.push(processRow({ ...row, status: 'running' }, 'app', { icon: row.icon }));
  }
  rows.push(h('tr', { class: 'group' }, h('td', { colSpan: 4 }, `${t('tm.groups.system')} (${system.length})`)));
  for (const row of system) rows.push(processRow(row, 'sys'));
  body.replaceChildren(
    h(
      'table',
      { class: 'grid' },
      h('thead', null, h('tr', null, headerCell('processes', 'name', t('tm.cols.name')), headerCell('processes', 'status', t('tm.cols.status')), headerCell('processes', 'cpu', t('tm.cols.cpu'), { total: percent(live.cpu), num: true }), headerCell('processes', 'mem', t('tm.cols.memory'), { total: percent(memPercent), num: true }))),
      h('tbody', null, rows)
    )
  );
}

/* ----------------------------------- startup apps ------------------------------ */

const IMPACTS = ['none', 'low', 'medium', 'high'];
const MB = 1024 * 1024;

/** The apps that can start with the system: whether they do, and how much they weigh once they run. */
function startupRows() {
  const running = new Map(gather().background.map((b) => [b.appId, b]));
  return apps.startupCapable().map((app) => {
    const enabled = apps.startsAtBoot(app);
    const mem = running.get(app.id)?.mem ?? 0;
    const impact = !enabled || !running.has(app.id) ? 'none' : mem < 8 * MB ? 'low' : mem < 40 * MB ? 'medium' : 'high';
    return { key: `st:${app.id}`, app, name: apps.name(app), publisher: apps.publisher(app), enabled, status: t(enabled ? 'tm.startup.enabled' : 'tm.startup.disabled'), impact };
  });
}

function setStartup(key, on) {
  if (!key?.startsWith('st:')) return;
  apps.setStartsAtBoot(key.slice(3), on);
  renderBody();
}

function renderStartup(body) {
  const list = sortRows(startupRows().filter((row) => matches(row.name) || matches(row.publisher)), 'startup');
  if (!list.length) {
    body.replaceChildren(h('p', { class: 'empty' }, t('tm.startup.empty')));
    return;
  }
  const rows = list.map((row) => {
    const tr = h(
      'tr',
      { class: state.selected === row.key ? 'is-selected' : '' },
      nameCell(row, { icon: row.app.icon }),
      h('td', null, row.publisher),
      h('td', null, row.status),
      h('td', null, t(`tm.startup.impact.${row.impact}`))
    );
    tr.addEventListener('click', () => selectRow(row));
    tr.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      state.selected = row.key;
      os.menu([{ label: t(row.enabled ? 'tm.startup.disable' : 'tm.startup.enable'), action: () => setStartup(row.key, !row.enabled) }], e);
      renderBody();
    });
    return tr;
  });
  body.replaceChildren(
    h(
      'table',
      { class: 'grid' },
      h('thead', null, h('tr', null, headerCell('startup', 'name', t('tm.cols.name')), headerCell('startup', 'publisher', t('tm.cols.publisher')), headerCell('startup', 'status', t('tm.cols.status')), headerCell('startup', 'impact', t('tm.cols.impact')))),
      h('tbody', null, rows)
    )
  );
}

function renderDetails(body) {
  const data = gather();
  const user = String(os.settings?.get?.('userName') ?? 'User').toLowerCase();
  const list = [
    ...data.windows.map((w) => ({ key: `win:${w.id}`, name: `${w.appId}.exe`, pid: w.pid, status: w.minimized ? t('tm.status.suspended') : t('tm.status.running'), cpu: w.cpu, mem: w.mem, opened: w.opened, title: w.title })),
    ...data.background.map((b) => ({ key: b.key, name: `${b.appId}.exe`, pid: pidOf(b.id), status: t('tm.status.running'), cpu: b.cpu, mem: b.mem, opened: b.opened, title: b.name })),
    ...data.system.map((s, i) => ({ key: s.key, name: s.image, pid: String(4 + i * 4), status: t('tm.status.running'), cpu: s.cpu, mem: s.mem, opened: pageStart(), title: s.name, system: true }))
  ].filter((row) => matches(row.name) || matches(row.title));
  const rows = sortRows(list, 'details').map((row) => {
    const tr = h(
      'tr',
      { class: state.selected === row.key ? 'is-selected' : '' },
      h('td', null, row.name),
      h('td', { class: 'num' }, row.pid),
      h('td', null, row.status),
      h('td', null, row.system ? 'SYSTEM' : user),
      h('td', { class: 'num' }, percent(row.cpu)),
      h('td', { class: 'num' }, formatBytes(row.mem)),
      h('td', { class: 'num' }, uptimeText(Date.now() - row.opened)),
      h('td', null, row.title)
    );
    tr.addEventListener('click', () => selectRow(row));
    tr.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      state.selected = row.key;
      rowMenu({ ...row }, e);
      renderBody();
    });
    return tr;
  });
  body.replaceChildren(
    h(
      'table',
      { class: 'grid' },
      h('thead', null, h('tr', null, headerCell('details', 'name', t('tm.cols.name')), headerCell('details', 'pid', t('tm.cols.pid'), { num: true }), headerCell('details', 'status', t('tm.cols.status')), headerCell('details', 'user', t('tm.cols.user')), headerCell('details', 'cpu', t('tm.cols.cpu'), { num: true }), headerCell('details', 'mem', t('tm.cols.memory'), { num: true }), headerCell('details', 'uptime', t('tm.cols.uptime'), { num: true }), headerCell('details', 'title', t('tm.cols.description')))),
      h('tbody', null, rows)
    )
  );
}

function uptimeText(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(s / 86400);
  const clock = [Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':');
  return days ? `${days}:${clock}` : clock;
}

/* ----------------------------------- performance -------------------------------- */

const RESOURCES = ['cpu', 'memory', 'disk', 'network'];

function drawChart(canvas, key, { grid = true } = {}) {
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || canvas.width;
  const height = canvas.clientHeight || canvas.height;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const c = canvas.getContext('2d');
  c.scale(ratio, ratio);
  const color = TINT[key];
  const values = history[key];
  const max = key === 'cpu' || key === 'disk' ? 100 : Math.max(key === 'memory' ? 32 * 1024 * 1024 : 4096, ...values) * 1.15;
  if (grid) {
    c.strokeStyle = `${color}33`;
    c.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      c.beginPath();
      c.moveTo(0, (height * i) / 4);
      c.lineTo(width, (height * i) / 4);
      c.stroke();
    }
    for (let x = width - (((Date.now() / 1000) * (width / (HISTORY - 1))) % (width / 10)); x > 0; x -= width / 10) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, height);
      c.stroke();
    }
  }
  if (!values.length) return;
  const step = width / (HISTORY - 1);
  const x = (i) => width - (values.length - 1 - i) * step;
  const y = (v) => height - 1 - (Math.min(v, max) / max) * (height - 2);
  c.beginPath();
  c.moveTo(x(0), height);
  values.forEach((v, i) => c.lineTo(x(i), y(v)));
  c.lineTo(x(values.length - 1), height);
  c.closePath();
  c.fillStyle = `${color}40`;
  c.fill();
  c.beginPath();
  values.forEach((v, i) => (i ? c.lineTo(x(i), y(v)) : c.moveTo(x(i), y(v))));
  c.strokeStyle = color;
  c.lineWidth = 1.5;
  c.stroke();
}

const rate = (bytes) => `${formatBytes(bytes)}/s`;

function summary(key) {
  if (key === 'cpu') return percent(live.cpu);
  if (key === 'memory') return live.memoryLimit ? `${formatBytes(live.memoryUsed)} (${percent((live.memoryUsed / live.memoryLimit) * 100)})` : t('tm.perf.unsupported');
  if (key === 'disk') return percent(live.disk);
  return rate(live.network);
}

function renderPerformance(body) {
  const tiles = h('div', { class: 'tiles', role: 'listbox' });
  for (const key of RESOURCES) {
    const canvas = h('canvas', { width: 52, height: 40 });
    const tile = h('button', { class: `tile${state.resource === key ? ' is-active' : ''}`, type: 'button', role: 'option', style: { '--tint': TINT[key] } }, canvas, h('span', { class: 'tile-text' }, h('strong', null, t(`tm.perf.${key}`)), h('span', null, summary(key))));
    tile.addEventListener('click', () => {
      state.resource = key;
      renderBody();
    });
    tiles.append(tile);
    queueMicrotask(() => drawChart(canvas, key, { grid: false }));
  }
  const stat = (label, value, text = false) => h('div', { class: `stat${text ? ' is-text' : ''}` }, h('span', null, label), h('strong', null, value));
  const stats = [];
  const key = state.resource;
  const connection = navigator.connection;
  if (key === 'cpu') {
    const data = gather();
    stats.push(stat(t('tm.perf.utilization'), percent(live.cpu)), stat(t('tm.perf.processes'), String(data.windows.length + data.background.length + data.system.length)), stat(t('tm.perf.processors'), String(navigator.hardwareConcurrency || 1)), stat(t('tm.perf.uptime'), uptimeText(Date.now() - pageStart())));
  } else if (key === 'memory') {
    stats.push(stat(t('tm.perf.inUse'), live.memoryLimit ? formatBytes(live.memoryUsed) : '—'), stat(t('tm.perf.limit'), live.memoryLimit ? formatBytes(live.memoryLimit) : '—'));
    if (navigator.deviceMemory) stats.push(stat(t('tm.perf.deviceMemory'), `${navigator.deviceMemory}+ GB`));
  } else if (key === 'disk') {
    const usage = fs.usage();
    stats.push(stat(t('tm.perf.activeTime'), percent(live.disk)), stat(t('tm.perf.capacity'), formatBytes(usage.capacity)), stat(t('tm.perf.used'), formatBytes(usage.used)), stat(t('tm.perf.free'), formatBytes(usage.free)));
  } else {
    stats.push(stat(t('tm.perf.receive'), rate(live.network)), stat(t('tm.perf.state'), t(navigator.onLine ? 'tm.perf.online' : 'tm.perf.offline')));
    if (connection?.effectiveType) stats.push(stat(t('tm.perf.connection'), String(connection.effectiveType).toUpperCase()));
    if (connection?.downlink) stats.push(stat(t('tm.perf.downlink'), `${connection.downlink} Mbps`));
    if (connection?.rtt != null) stats.push(stat(t('tm.perf.latency'), `${connection.rtt} ms`));
  }
  const chart = h('canvas', { class: 'chart', style: { '--tint': TINT[key] } });
  const scale = key === 'cpu' || key === 'disk' ? '100%' : key === 'memory' ? formatBytes(Math.max(32 * 1024 * 1024, ...history.memory) * 1.15) : rate(Math.max(4096, ...history.network) * 1.15);
  const detail = h(
    'div',
    { class: 'detail' },
    h('div', { class: 'detail-head' }, h('h2', null, t(`tm.perf.${key}`)), h('span', null, summary(key))),
    h('div', { class: 'chart-label' }, h('span', null, t('tm.perf.usage')), h('span', null, scale)),
    chart,
    h('div', { class: 'chart-label' }, h('span', null, t('tm.perf.seconds')), h('span', null, '0')),
    h('div', { class: 'stats' }, stats),
    h('p', { class: 'perf-note' }, t(`tm.perf.note.${key}`))
  );
  body.replaceChildren(h('div', { class: 'perf' }, tiles, detail));
  queueMicrotask(() => drawChart(chart, key));
}

/* -------------------------------------- wiring ----------------------------------- */

/** Put the headers of the table on show in a bar above the scrolling part; clicking a copy clicks the real one. */
function detachHead(body) {
  const bar = $('body-head');
  const table = body.querySelector('table.grid');
  bar.hidden = !table;
  bar.replaceChildren();
  if (!table?.tHead) {
    bar.hidden = true;
    return;
  }
  table.classList.add('is-measuring');
  const real = [...table.tHead.rows[0].cells];
  const copy = h('table', { class: 'grid' }, h('thead', null, h('tr', null, real.map((th) => {
    const clone = th.cloneNode(true);
    clone.style.width = `${th.getBoundingClientRect().width}px`;
    clone.addEventListener('click', () => th.click());
    return clone;
  }))));
  copy.style.width = `${table.getBoundingClientRect().width}px`;
  bar.append(copy);
  bar.scrollLeft = body.scrollLeft;
}

$('body').addEventListener('scroll', () => ($('body-head').scrollLeft = $('body').scrollLeft));

function renderBody() {
  const body = $('body');
  const scroll = body.scrollTop;
  if (state.view === 'processes') renderProcesses(body);
  else if (state.view === 'startup') renderStartup(body);
  else if (state.view === 'details') renderDetails(body);
  else renderPerformance(body);
  body.scrollTop = scroll;
  detachHead(body);
  $('end-task')?.toggleAttribute('disabled', !selectable());
  if (state.view === 'startup') {
    const row = state.selected?.startsWith('st:') ? startupRows().find((r) => r.key === state.selected) : null;
    $('st-enable')?.toggleAttribute('disabled', !row || row.enabled);
    $('st-disable')?.toggleAttribute('disabled', !row || !row.enabled);
  }
}

function render() {
  renderNav();
  renderHead();
  renderBody();
  os.window.setTitle(`${t(`tm.nav.${state.view}`)} - ${t('app.name')}`);
  schedule();
}

let timer = 0;
function schedule() {
  clearInterval(timer);
  const period = SPEEDS[state.speed];
  // the graphs of the performance page move every second whatever the table does
  timer = setInterval(() => {
    if (state.speed === 'paused' && state.view !== 'performance') return;
    if (state.view === 'performance' || period) renderBody();
  }, state.view === 'performance' ? 1000 : period || 1000);
}

document.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.key === 'Delete' && selectable()) {
    e.preventDefault();
    endTask(state.selected);
  }
});
$('body').addEventListener('pointerdown', (e) => {
  if (!e.target.closest('tr, .tile')) {
    state.selected = null;
    renderBody();
  }
});
i18n.on('change', render);
os.window.on('activate', () => renderBody());

render();
