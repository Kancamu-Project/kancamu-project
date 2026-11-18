import { os, t, i18n, settings, apps, h, icon, hydrateIcons, confirmDialog } from 'webos/sdk/app.js';

await os.ready;
await apps.init();

const $ = (id) => document.getElementById(id);
const els = { rail: $('rail'), page: $('page'), back: $('back'), search: $('search'), clear: $('search-clear') };

/** The tags an app can carry in its "categories" (apps.json), in the order the Store shows them. */
const CATEGORIES = ['productivity', 'image', 'video', 'audio', 'utilities', 'developer', 'internet'];
const FALLBACK_CATEGORY = 'utilities';
const SECTIONS = [
  { type: 'home', icon: 'home' },
  { type: 'apps', icon: 'apps' },
  { type: 'library', icon: 'download' }
];

const state = {
  page: { type: 'home' }, // { type: 'home' | 'apps' | 'library' | 'app' | 'search', id?, category?, query? }
  section: 'home', // which item of the rail is lit
  stack: [], // pages to go back to
  installing: new Map(), // app id -> progress 0..1
  timers: new Set() // intervals of the page that is shown (the banner)
};

/* ------------------------------------------------------------------- data -- */

const HEX = /^#[0-9a-f]{6}$/i;
const FALLBACK_COLORS = ['#0f7bd8', '#073663'];

/** The colours of a banner, from "color" in apps.json: a list of #rrggbb, one or more (several make a gradient). */
function colorsOf(value) {
  const list = (Array.isArray(value) ? value : []).filter((color) => HEX.test(color));
  return list.length ? list : FALLBACK_COLORS;
}

/** The custom properties that colour a banner: the first colour, and all of them for the gradient. */
const bannerStyle = (colors) => ({ '--color': colors[0], '--colors': (colors.length > 1 ? colors : [colors[0], colors[0]]).join(', ') });

/** The tags of an app that the Store knows, in the order the app lists them. */
function tagsOf(app) {
  const list = [...new Set(app.categories)].filter((tag) => CATEGORIES.includes(tag));
  return list.length ? list : [FALLBACK_CATEGORY];
}

const meta = (app) => ({
  categories: tagsOf(app),
  colors: colorsOf(app.store.color),
  featured: !!app.store.featured,
  publisher: apps.publisher(app)
});

const description = (app) => apps.description(app);
const categoryName = (key) => t(`store.categories.${key}`);
const allCategories = (app) => meta(app).categories.map(categoryName).join(', ');

/** What the Store offers: apps that can be removed. The apps the system needs (Settings, File Explorer, this Store) are not in it. */
const catalog = () => apps.all.filter((app) => apps.isRemovable(app.id));

const byName = (list) => {
  const collator = new Intl.Collator(i18n.lang);
  return [...list].sort((a, b) => collator.compare(apps.name(a), apps.name(b)));
};

/* ---------------------------------------------------- install and uninstall -- */

/** Every "Get / Open" button on the page; they are repainted while an install runs. */
function paintAction(button) {
  const app = catalog().find((item) => item.id === button.dataset.app);
  if (!app) return;
  const progress = state.installing.get(app.id);
  const busy = progress !== undefined;
  button.className = `btn btn-accent store-action${busy ? ' is-installing' : ''}${button.dataset.size ? ` is-${button.dataset.size}` : ''}`;
  button.style.setProperty('--progress', `${Math.round((progress ?? 0) * 100)}%`);
  button.disabled = busy;
  button.textContent = busy ? t('store.installing') : t(apps.isInstalled(app.id) ? 'store.open' : 'store.get');
}

const paintActions = () => document.querySelectorAll('[data-store-action]').forEach(paintAction);

function actionButton(app, size = '') {
  const button = h('button', { type: 'button', dataset: { storeAction: '1', app: app.id, size } });
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    if (apps.isInstalled(app.id)) os.launch(app.id);
    else install(app);
  });
  paintAction(button);
  return button;
}

/** A short, made-up download: the apps are already on the disk. */
function install(app) {
  if (state.installing.has(app.id)) return;
  state.installing.set(app.id, 0);
  paintActions();
  const timer = setInterval(() => {
    const next = Math.min(1, (state.installing.get(app.id) ?? 0) + 0.05 + Math.random() * 0.09);
    state.installing.set(app.id, next);
    if (next >= 1) {
      clearInterval(timer);
      state.installing.delete(app.id);
      apps.setInstalled(app.id, true);
      os.notify({ title: t('store.installedTitle', { name: apps.name(app) }), body: t('store.installedBody'), onClick: () => os.launch(app.id) });
    }
    paintActions();
  }, 90);
}

async function uninstall(app) {
  const name = apps.name(app);
  const ok = await confirmDialog(t('store.uninstallTitle', { name }), t('store.uninstallMessage', { name }), { okLabel: t('store.uninstall'), danger: true });
  if (ok) apps.setInstalled(app.id, false);
}

/** The ⋯ menu of an app: pin it, or remove it. */
function moreMenu(app) {
  const installed = apps.isInstalled(app.id);
  const inStart = apps.isPinned('start', app.id);
  const inTaskbar = apps.isPinned('taskbar', app.id);
  return [
    { label: t('store.open'), icon: 'open', disabled: !installed, action: () => os.launch(app.id) },
    { separator: true },
    { label: t(inStart ? 'start.unpinStart' : 'start.pinStart'), icon: inStart ? 'pin-off' : 'pin', disabled: !installed, action: () => apps.setPinned('start', app.id, !inStart) },
    { label: t(inTaskbar ? 'taskbar.unpin' : 'taskbar.pin'), icon: inTaskbar ? 'pin-off' : 'pin', disabled: !installed, action: () => apps.setPinned('taskbar', app.id, !inTaskbar) },
    apps.isRemovable(app.id) && { separator: true },
    apps.isRemovable(app.id) && { label: t('store.uninstall'), icon: 'delete', danger: true, disabled: !installed, action: () => uninstall(app) }
  ];
}

function moreButton(app) {
  const button = h('button', { class: 'btn btn-icon', type: 'button', 'aria-label': t('store.more') }, icon('more'));
  button.addEventListener('click', (e) => e.stopPropagation());
  os.dropdown(button, () => moreMenu(app), { placement: 'bottom-end' });
  return button;
}

/* --------------------------------------------------------------- building blocks -- */

const openApp = (app) => go({ type: 'app', id: app.id });

/** A tile of a row or grid: icon, name, category and the Get / Open button. */
function tile(app) {
  const el = h(
    'article',
    { class: 'tile', tabIndex: 0, role: 'link', 'aria-label': apps.name(app) },
    h('img', { class: 'tile-icon', src: app.icon, alt: '', draggable: false }),
    h('div', { class: 'tile-name' }, apps.name(app)),
    h('div', { class: 'tile-sub' }, allCategories(app)),
    h('div', { class: 'tile-price' }, t('store.free')),
    actionButton(app, 'small')
  );
  el.addEventListener('click', () => openApp(app));
  el.addEventListener('keydown', (e) => e.key === 'Enter' && e.target === el && openApp(app));
  return el;
}

/** A horizontally scrolling row with a title and "See all". */
function row(title, list, { onAll } = {}) {
  const scroller = h('div', { class: 'row-scroll' }, list.map(tile));
  const arrow = (dir) => h('button', { class: `row-arrow is-${dir}`, type: 'button', 'aria-label': t(`store.${dir === 'left' ? 'previous' : 'next'}`), onclick: () => scroller.scrollBy({ left: (dir === 'left' ? -1 : 1) * scroller.clientWidth * 0.8, behavior: 'smooth' }) }, icon(dir === 'left' ? 'chevron-left' : 'chevron-right'));
  return h(
    'section',
    { class: 'row' },
    h('div', { class: 'row-head' }, h('h2', null, title), onAll ? h('button', { class: 'link', type: 'button', onclick: onAll }, t('store.seeAll')) : null),
    h('div', { class: 'row-body' }, arrow('left'), scroller, arrow('right'))
  );
}

function hero() {
  const slides = catalog().filter((app) => meta(app).featured);
  if (!slides.length) return null;
  let index = 0;
  const box = h('section', { class: 'hero', 'aria-roledescription': 'carousel', 'aria-label': t('store.featured') });

  function paint() {
    const app = slides[index];
    const colors = meta(app).colors;
    const dots = h(
      'div',
      { class: 'hero-dots' },
      slides.map((_, i) => h('button', { class: `hero-dot${i === index ? ' is-active' : ''}`, type: 'button', 'aria-label': `${i + 1}/${slides.length}`, onclick: () => show(i) }))
    );
    const open = h('button', { class: 'hero-slide', type: 'button', style: bannerStyle(colors), onclick: () => openApp(app) }, h('span', { class: 'hero-text' }, h('span', { class: 'hero-tag' }, t('store.featured')), h('span', { class: 'hero-title' }, apps.name(app)), h('span', { class: 'hero-sub' }, description(app))), h('img', { class: 'hero-icon', src: app.icon, alt: '', draggable: false }));
    const arrow = (dir) => h('button', { class: `hero-arrow is-${dir}`, type: 'button', 'aria-label': t(`store.${dir === 'left' ? 'previous' : 'next'}`), onclick: () => show(index + (dir === 'left' ? -1 : 1)) }, icon(dir === 'left' ? 'chevron-left' : 'chevron-right'));
    box.replaceChildren(open, h('div', { class: 'hero-actions' }, actionButton(app, 'hero')), dots, ...(slides.length > 1 ? [arrow('left'), arrow('right')] : []));
  }

  function show(i) {
    index = (i + slides.length) % slides.length;
    paint();
  }

  if (slides.length > 1) {
    const timer = setInterval(() => !box.matches(':hover, :focus-within') && show(index + 1), 6500);
    state.timers.add(timer);
  }
  paint();
  return box;
}

const grid = (list) => h('div', { class: 'grid' }, list.map(tile));

const empty = (message) => h('p', { class: 'empty' }, message);

/* -------------------------------------------------------------------- pages -- */

function homePage() {
  const page = h('div', { class: 'home' }, hero());
  const all = byName(catalog());
  page.append(row(t('store.topFree'), all, { onAll: () => go({ type: 'apps', category: 'all' }, { section: 'apps' }) }));
  for (const key of CATEGORIES) {
    const list = byName(catalog().filter((app) => meta(app).categories.includes(key)));
    if (list.length) page.append(row(categoryName(key), list, { onAll: () => go({ type: 'apps', category: key }, { section: 'apps' }) }));
  }
  return page;
}

function appsPage() {
  const current = state.page.category ?? 'all';
  const chips = h(
    'div',
    { class: 'chips', role: 'tablist' },
    ['all', ...CATEGORIES].map((key) => h('button', { class: `chip${current === key ? ' is-active' : ''}`, type: 'button', role: 'tab', 'aria-selected': String(current === key), onclick: () => go({ type: 'apps', category: key }, { push: false }) }, categoryName(key)))
  );
  const list = byName(catalog().filter((app) => current === 'all' || meta(app).categories.includes(current)));
  return h('div', null, h('h1', { class: 'title' }, t('store.nav.apps')), chips, list.length ? grid(list) : empty(t('store.nothing')));
}

function libraryRow(app) {
  const installed = apps.isInstalled(app.id);
  const el = h(
    'article',
    { class: 'lib-row', tabIndex: 0, role: 'link', 'aria-label': apps.name(app) },
    h('img', { src: app.icon, alt: '', draggable: false }),
    h('div', { class: 'lib-text' }, h('div', { class: 'lib-name' }, apps.name(app)), h('div', { class: 'lib-sub' }, `${apps.publisher(app)} · ${allCategories(app)} · ${t('store.version', { version: app.version })}`)),
    h('div', { class: 'lib-actions' }, actionButton(app), installed ? moreButton(app) : null)
  );
  el.addEventListener('click', () => openApp(app));
  el.addEventListener('keydown', (e) => e.key === 'Enter' && e.target === el && openApp(app));
  return el;
}

function libraryPage() {
  const installed = byName(apps.list.filter((app) => apps.isRemovable(app.id)));
  const available = byName(catalog().filter((app) => !apps.isInstalled(app.id)));
  const page = h('div', null, h('h1', { class: 'title' }, t('store.nav.library')), h('p', { class: 'subtitle' }, i18n.plural('store.library.count', installed.length)));
  page.append(h('div', { class: 'lib' }, installed.map(libraryRow)));
  if (available.length) page.append(h('h2', { class: 'subhead' }, t('store.library.available')), h('div', { class: 'lib' }, available.map(libraryRow)));
  return page;
}

function searchPage() {
  const query = state.page.query.trim().toLowerCase();
  const hit = (app) => `${apps.name(app)} ${description(app)} ${description(app)} ${allCategories(app)} ${app.id}`.toLowerCase().includes(query);
  const list = byName(catalog().filter(hit));
  return h('div', null, h('h1', { class: 'title' }, t('store.results', { query: state.page.query.trim() })), list.length ? grid(list) : empty(t('store.noResults', { query: state.page.query.trim() })));
}

function detailPage() {
  const app = catalog().find((item) => item.id === state.page.id);
  if (!app) return empty(t('store.nothing'));
  const m = meta(app);
  const installed = apps.isInstalled(app.id);
  const fact = (label, value) => h('div', { class: 'fact' }, h('div', { class: 'fact-value' }, value), h('div', { class: 'fact-label' }, label));
  const info = (label, value) => [h('dt', null, label), h('dd', null, value)];
  const related = byName(catalog().filter((other) => other.id !== app.id && meta(other).categories.some((tag) => m.categories.includes(tag))));

  const page = h(
    'div',
    { class: 'detail' },
    h(
      'header',
      { class: 'detail-head', style: bannerStyle(m.colors) },
      h('img', { class: 'detail-icon', src: app.icon, alt: '', draggable: false }),
      h(
        'div',
        { class: 'detail-title' },
        h('h1', null, apps.name(app)),
        h('div', { class: 'detail-publisher' }, m.publisher),
        h('div', { class: 'detail-category' }, allCategories(app)),
        h('div', { class: 'detail-buttons' }, actionButton(app, 'large'), moreButton(app))
      )
    ),
    h('div', { class: 'facts' }, fact(t('store.detail.category'), allCategories(app)), fact(t('store.detail.version'), app.version), fact(t('store.detail.price'), t('store.free')), fact(t('store.detail.status'), t(installed ? 'store.installed' : 'store.notInstalled'))),
    h('section', { class: 'block' }, h('h2', null, t('store.detail.about')), h('p', null, description(app))),
    h('section', { class: 'block' }, h('h2', null, t('store.detail.whatsNew')), h('p', { class: 'muted' }, t('store.detail.version')), h('p', null, `${app.version} — ${t('store.detail.firstRelease')}`)),
    h('section', { class: 'block' }, h('h2', null, t('store.detail.additional')), h('dl', { class: 'info' }, info(t('store.detail.publishedBy'), m.publisher), info(t('store.detail.category'), allCategories(app)), info(t('store.detail.version'), app.version), info(t('store.detail.identifier'), app.id), info(t('store.detail.worksOn'), t('store.detail.thisDesktop'))))
  );
  if (related.length) page.append(row(t('store.detail.more', { category: allCategories(app) }), related));
  return page;
}

/* ------------------------------------------------------------ navigation / render -- */

function go(page, { push = true, section } = {}) {
  if (push) state.stack.push({ page: state.page, section: state.section });
  state.page = page;
  state.section = section ?? (page.type === 'app' || page.type === 'search' ? state.section : page.type);
  els.page.scrollTop = 0;
  render();
}

function back() {
  const previous = state.stack.pop();
  if (!previous) return;
  state.page = previous.page;
  state.section = previous.section;
  if (state.page.type !== 'search' && els.search.value) {
    els.search.value = '';
    els.clear.hidden = true;
  }
  render();
}

function renderRail() {
  els.rail.replaceChildren(
    ...SECTIONS.map(({ type, icon: glyph }) => {
      const active = state.section === type;
      const button = h('button', { class: `rail-item${active ? ' is-active' : ''}`, type: 'button', 'aria-current': active ? 'page' : null }, icon(glyph, { size: 20 }), h('span', null, t(`store.nav.${type}`)));
      button.addEventListener('click', () => {
        els.search.value = '';
        els.clear.hidden = true;
        state.stack = [];
        go({ type }, { push: false, section: type });
      });
      return button;
    })
  );
}

function render() {
  for (const timer of state.timers) clearInterval(timer);
  state.timers.clear();
  els.search.placeholder = t('store.search');
  els.back.disabled = !state.stack.length;
  els.back.dataset.tip = t('store.back');
  els.back.setAttribute('aria-label', t('store.back'));
  els.clear.setAttribute('aria-label', t('store.clearSearch'));
  renderRail();
  const pages = { home: homePage, apps: appsPage, library: libraryPage, app: detailPage, search: searchPage };
  els.page.replaceChildren(pages[state.page.type]());
}

/* --------------------------------------------------------------------- wiring -- */

let searchTimer = 0;
els.search.addEventListener('input', () => {
  const query = els.search.value;
  els.clear.hidden = !query;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    if (query.trim()) go({ type: 'search', query }, { push: state.page.type !== 'search' });
    else if (state.page.type === 'search') back();
  }, 200);
});
els.search.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') els.clear.click();
});
els.clear.addEventListener('click', () => {
  els.search.value = '';
  els.clear.hidden = true;
  els.search.focus();
  if (state.page.type === 'search') back();
});
els.back.addEventListener('click', back);
document.addEventListener('keydown', (e) => {
  if (e.altKey && e.key === 'ArrowLeft') back();
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') (e.preventDefault(), els.search.focus());
});

settings.on('change', (key) => ['startPinned', 'taskbarPinned', 'appInstall'].includes(key) && render());
i18n.on('change', render);

hydrateIcons(document);
render();
