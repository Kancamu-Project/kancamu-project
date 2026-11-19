import {
  os,
  t,
  i18n,
  settings,
  apps,
  fs,
  join,
  KNOWN_FOLDERS,
  h,
  icon,
  setIcon,
  clear,
  iconUrl,
  fillSlider,
  formatBytes,
  formatClock,
  kindOf,
  describeError,
  battery,
  networkState,
  networkIcon,
  setAirplaneMode,
  wallpaperBackground,
  DEFAULT_WALLPAPERS,
  resolveTheme,
  OS_INFO,
  brandName,
  clearAll,
  playSound,
  url,
  alertDialog,
  confirmDialog,
  promptDialog
} from 'webos/sdk/app.js';

await os.ready;
await apps.init();

const $ = (id) => document.getElementById(id);
const els = {
  back: $('back'),
  profile: $('profile'),
  profileName: $('profile-name'),
  search: $('search'),
  navList: $('nav-list'),
  page: $('page'),
  head: $('page-head'),
  body: $('page-body')
};

/* ---------------------------------- pages ---------------------------------- */

/** Categories of the left-hand list. */
const NAV = [
  { route: 'home', color: '#0a7fd9' },
  { route: 'system', color: '#0a7fd9' },
  { route: 'bluetooth', color: '#0067c0' },
  { route: 'network', color: '#1890c9' },
  { route: 'personalization', color: '#c9641c' },
  { route: 'apps', color: '#5b67c9' },
  { route: 'accounts', color: '#2a9d6f' },
  { route: 'time-language', color: '#0d8bb5' },
  { route: 'accessibility', color: '#2f6fd6' },
  { route: 'privacy', color: '#6b69d6' },
  { route: 'update', color: '#107c10' }
];

/**
 * Every page, by route. `key` selects the texts in /languages:
 * settings.pages.<key>.title and settings.pages.<key>.desc
 */
const PAGES = {
  home: { key: 'home', icon: 'home', render: renderHome },
  system: { key: 'system', icon: 'desktop', render: renderSystem, children: ['system/display', 'system/sound', 'system/notifications', 'system/multitasking', 'system/clipboard', 'system/power', 'system/storage', 'system/about'] },
  'system/clipboard': { key: 'clipboard', icon: 'copy', render: renderClipboard },
  'system/multitasking': { key: 'multitasking', icon: 'view-grid', render: renderMultitasking },
  'system/display': { key: 'display', icon: 'sun', render: renderDisplay },
  'system/sound': { key: 'sound', icon: 'volume-2', render: renderSound },
  'system/notifications': { key: 'notifications', icon: 'bell', render: renderNotifications },
  'system/power': { key: 'power', icon: 'battery', render: renderPower },
  'system/storage': { key: 'storage', icon: 'drive', render: renderStorage },
  'system/about': { key: 'about', icon: 'info', render: renderAbout },
  bluetooth: { key: 'bluetooth', icon: 'bluetooth', render: renderBluetooth },
  network: { key: 'network', icon: 'wifi', render: renderNetwork },
  personalization: {
    key: 'personalization',
    icon: 'brush',
    render: renderPersonalization,
    children: ['personalization/background', 'personalization/colors', 'personalization/lock-screen', 'personalization/start', 'personalization/taskbar']
  },
  'personalization/background': { key: 'background', icon: 'picture', render: renderBackground },
  'personalization/colors': { key: 'colors', icon: 'palette', render: renderColors },
  'personalization/lock-screen': { key: 'lockScreen', icon: 'lock', render: renderLockScreen },
  'personalization/start': { key: 'start', icon: 'view-grid', render: renderStart },
  'personalization/taskbar': { key: 'taskbar', icon: 'taskbar', render: renderTaskbar },
  apps: { key: 'apps', icon: 'apps', render: renderAppsHome, children: ['apps/installed', 'apps/startup'] },
  'apps/installed': { key: 'installedApps', icon: 'apps', render: renderApps },
  'apps/startup': { key: 'startupApps', icon: 'power', render: renderStartup },
  accounts: { key: 'accounts', icon: 'user', render: renderAccounts },
  'time-language': { key: 'timeLanguage', icon: 'globe', render: renderTimeLanguage, children: ['time-language/date-time', 'time-language/language'] },
  'time-language/date-time': { key: 'dateTime', icon: 'clock', render: renderDateTime },
  'time-language/language': { key: 'language', icon: 'globe', render: renderLanguage },
  accessibility: { key: 'accessibility', icon: 'accessibility', render: renderAccessibility },
  privacy: { key: 'privacy', icon: 'lock', render: renderPrivacy },
  update: { key: 'update', icon: 'refresh', render: renderUpdate }
};

// the colours a Mac offers: blue, purple, pink, red, orange, yellow, green, graphite
const ACCENTS = ['#007aff', '#a550a7', '#f74f9e', '#ff5257', '#f7821b', '#ffc600', '#62ba46', '#8c8c8c'];

const SOLID_COLORS = ['#000000', '#1f1f1f', '#515c6b', '#2d7d9a', '#0078d4', '#0063b1', '#744da9', '#881798', '#c30052', '#d13438', '#ca5010', '#ff8c00', '#ffb900', '#107c10', '#018574', '#ffffff'];

const titleOf = (route) => t(`settings.pages.${PAGES[route].key}.title`);
const descOf = (route) => t(`settings.pages.${PAGES[route].key}.desc`);
const parentOf = (route) => (route.includes('/') ? route.split('/')[0] : null);

const state = { route: 'home', history: [], query: '' };

/** Functions that copy the current settings into the controls of the page. */
let bindings = [];
/** Clean-up for timers and listeners of the page that is being left. */
let disposers = [];

function bind(fn) {
  fn();
  bindings.push(fn);
}

function runBindings() {
  for (const fn of [...bindings]) fn();
}

function subscribe(off) {
  disposers.push(off);
}

function listen(target, type, fn) {
  target.addEventListener(type, fn);
  disposers.push(() => target.removeEventListener(type, fn));
}

/* ------------------------------- navigation -------------------------------- */

function go(route, { push = true } = {}) {
  const target = PAGES[route] ? route : 'home';
  if (push && target !== state.route) state.history.push(state.route);
  state.route = target;
  state.query = '';
  els.search.value = '';
  render();
  els.page.scrollTop = 0;
}

function back() {
  const previous = state.history.pop();
  if (previous) go(previous, { push: false });
}

function renderNav() {
  clear(els.navList);
  const query = state.query.toLowerCase();
  if (query) {
    const matches = Object.keys(PAGES).filter((route) => `${titleOf(route)} ${descOf(route)}`.toLowerCase().includes(query));
    if (!matches.length) els.navList.append(h('p', { class: 'nav-empty' }, t('settings.noResults')));
    for (const route of matches) {
      const parent = parentOf(route);
      els.navList.append(
        h(
          'button',
          { class: 'nav-item', type: 'button', onclick: () => go(route) },
          icon(PAGES[route].icon),
          h('span', { class: 'nav-item-text' }, h('span', null, titleOf(route)), parent ? h('span', { class: 'nav-item-sub' }, titleOf(parent)) : null)
        )
      );
    }
    return;
  }
  const current = parentOf(state.route) ?? state.route;
  for (const item of NAV) {
    const button = h(
      'button',
      { class: `nav-item${item.route === current ? ' is-active' : ''}`, type: 'button', style: { '--tint': item.color }, onclick: () => go(item.route) },
      icon(PAGES[item.route].icon),
      h('span', { class: 'nav-item-text' }, titleOf(item.route))
    );
    button.dataset.tip = titleOf(item.route);
    els.navList.append(button);
  }
}

function renderHead() {
  clear(els.head);
  const parent = parentOf(state.route);
  if (parent) els.head.append(h('button', { class: 'crumb', type: 'button', onclick: () => go(parent) }, titleOf(parent)), icon('chevron-right'));
  els.head.append(h('span', null, titleOf(state.route)));
}

function renderBody() {
  for (const off of disposers) off();
  disposers = [];
  bindings = [];
  clear(els.body);
  PAGES[state.route].render(els.body);
}

function render() {
  els.back.disabled = !state.history.length;
  els.profileName.textContent = settings.get('userName');
  renderNav();
  renderHead();
  renderBody();
}

/* --------------------------------- builders -------------------------------- */

function cardLead({ icon: glyph, image }) {
  if (image) return h('img', { class: 'card-image', src: image, alt: '', draggable: false });
  return glyph ? icon(glyph, { class: 'card-icon' }) : null;
}

function cardText({ title, desc }) {
  return h('div', { class: 'card-text' }, h('span', { class: 'card-title' }, title), desc ? h('span', { class: 'card-desc' }, desc) : null);
}

/** One row of a settings page: icon, title, description and a control on the right. */
function card(options) {
  const { control, value, onClick } = options;
  const parts = [
    cardLead(options),
    cardText(options),
    control ? h('div', { class: 'card-control' }, control) : null,
    value != null ? h('div', { class: 'card-control card-value' }, value) : null,
    onClick ? icon('chevron-right', { class: 'card-chevron' }) : null
  ];
  return onClick ? h('button', { class: 'card', type: 'button', onclick: onClick }, parts) : h('div', { class: 'card' }, parts);
}

/** A card whose content sits below its title (grids, tables, bars). */
function stackedCard(options, ...content) {
  return h('div', { class: 'card is-stacked' }, h('div', { class: 'card-row' }, cardLead(options), cardText(options), options.control ? h('div', { class: 'card-control' }, options.control) : null), content);
}

function group(title, ...children) {
  return h('section', { class: 'group' }, title ? h('h3', { class: 'group-title' }, title) : null, children);
}

const linkCard = (route) => card({ icon: PAGES[route].icon, title: titleOf(route), desc: descOf(route), onClick: () => go(route) });
const note = (text) => h('p', { class: 'note' }, text);

/** A piece of text that stays up to date. */
function live(fn) {
  const el = h('span');
  bind(() => {
    el.textContent = fn();
  });
  return el;
}

/** On/Off switch for a setting (or for anything, with custom get/set). */
function toggle(key, custom = {}) {
  const get = custom.get ?? (() => !!settings.get(key));
  const set = custom.set ?? ((value) => settings.set(key, value));
  const input = h('input', { type: 'checkbox', role: 'switch' });
  const text = h('span', { class: 'switch-text' });
  input.addEventListener('change', () => set(input.checked));
  bind(() => {
    input.checked = get();
    text.textContent = t(input.checked ? 'common.on' : 'common.off');
  });
  return h('label', { class: 'switch' }, text, input);
}

/** Drop-down list. `options` is a function so the labels follow the language. */
function combo(get, set, options) {
  const label = h('span');
  const button = h('button', { class: 'btn combo', type: 'button', 'aria-haspopup': 'listbox' }, label, icon('chevron-down', { size: 12 }));
  os.dropdown(button, () => options().map((option) => ({ label: option.label, checked: option.value === get(), radio: true, action: () => set(option.value) })), { minWidth: 170 });
  bind(() => {
    label.textContent = options().find((option) => option.value === get())?.label ?? '';
  });
  return button;
}

function slider(key, { min = 0, max = 100, set, onCommit } = {}) {
  const input = h('input', { class: 'slider', type: 'range', min, max, step: 1 });
  const value = h('span', { class: 'slider-value' });
  input.addEventListener('input', () => (set ? set(Number(input.value)) : settings.set(key, Number(input.value))));
  if (onCommit) input.addEventListener('change', onCommit);
  bind(() => {
    input.value = settings.get(key);
    fillSlider(input);
    value.textContent = input.value;
  });
  return h('div', { class: 'slider-wrap' }, value, input);
}

function swatches(colors, get, set) {
  const buttons = colors.map((color) => {
    const button = h('button', { class: 'swatch', type: 'button', style: { background: color }, 'aria-label': color, onclick: () => set(color) });
    button.dataset.color = color;
    return button;
  });
  bind(() => {
    const current = String(get()).toLowerCase();
    for (const button of buttons) {
      const selected = button.dataset.color === current;
      button.classList.toggle('is-selected', selected);
      button.replaceChildren(...(selected ? [icon('check')] : []));
    }
  });
  return h('div', { class: 'swatches' }, buttons);
}

/** Miniature desktop (or lock screen) that shows the current look. */
function mock({ small = false, lock = false } = {}) {
  const inner = lock
    ? h('div', { class: 'mock-clock' }, live(() => formatClock(new Date()).replace(/\s?[ap]\.?m\.?$/i, '')))
    : [h('div', { class: 'mock-window' }), h('div', { class: 'mock-taskbar' }, h('i'), h('i'), h('i'))];
  const el = h('div', { class: `mock${small ? ' is-small' : ''}` }, inner);
  bind(() => {
    el.style.background = wallpaperBackground();
  });
  return el;
}

function pinnedApps(place) {
  return apps.sorted().map((app) =>
    card({
      image: app.icon,
      title: apps.name(app),
      control: toggle(null, { get: () => apps.isPinned(place, app.id), set: (value) => apps.setPinned(place, app.id, value) })
    })
  );
}

/* ----------------------------------- system -------------------------------- */

async function renameDevice() {
  const value = await promptDialog(t('settings.about.rename'), t('settings.about.renameMessage'), { value: settings.get('deviceName'), okLabel: t('settings.about.renameConfirm') });
  if (value == null) return;
  const name = value.trim().toUpperCase();
  if (!/^[A-Z0-9-]{1,15}$/.test(name) || /^-|-$/.test(name)) {
    await alertDialog(t('settings.about.rename'), t('settings.about.renameInvalid'));
    return;
  }
  settings.set('deviceName', name);
}

function renderSystem(body) {
  body.append(
    h(
      'div',
      { class: 'hero' },
      mock({ small: true }),
      h('div', { class: 'hero-text' }, h('span', { class: 'hero-title' }, live(() => settings.get('deviceName'))), h('span', { class: 'hero-sub' }, OS_INFO.name)),
      h('button', { class: 'btn', type: 'button', onclick: renameDevice }, t('settings.about.rename'))
    ),
    group(null, PAGES.system.children.map(linkCard))
  );
}

function renderDisplay(body) {
  body.append(
    group(
      t('settings.display.brightnessColor'),
      card({ icon: 'sun', title: t('quick.brightness'), desc: t('settings.display.brightnessDesc'), control: slider('brightness', { min: 10, max: 100 }) }),
      card({ icon: 'night-light', title: t('quick.nightLight'), desc: t('settings.display.nightLightDesc'), control: toggle('nightLight') })
    ),
    group(
      t('settings.display.scaleLayout'),
      card({ icon: 'desktop', title: t('settings.display.resolution'), desc: t('settings.display.resolutionDesc'), value: `${window.screen.width} × ${window.screen.height}` }),
      card({ icon: 'search', title: t('settings.display.scale'), desc: t('settings.display.scaleDesc'), value: `${Math.round(window.devicePixelRatio * 100)}%` })
    )
  );
}

function renderSound(body) {
  body.append(
    group(
      t('settings.sound.output'),
      card({
        icon: 'volume-2',
        title: t('quick.volume'),
        desc: t('settings.sound.volumeDesc'),
        control: slider('volume', { set: (value) => settings.update({ volume: value, muted: false }), onCommit: () => playSound('ding') })
      }),
      card({ icon: 'volume-mute', title: t('quick.mute'), desc: t('settings.sound.muteDesc'), control: toggle('muted') })
    ),
    group(
      t('settings.sound.system'),
      card({ icon: 'bell', title: t('settings.sound.systemSounds'), desc: t('settings.sound.systemSoundsDesc'), control: toggle('sounds') }),
      card({
        icon: 'volume-2',
        title: t('settings.sound.test'),
        desc: t('settings.sound.testDesc'),
        control: h('button', { class: 'btn', type: 'button', onclick: () => playSound('notify') }, t('settings.sound.testButton'))
      })
    )
  );
}

function renderNotifications(body) {
  body.append(
    group(
      null,
      card({ icon: 'dnd', title: t('quick.doNotDisturb'), desc: t('settings.notifications.dndDesc'), control: toggle('doNotDisturb') }),
      card({
        icon: 'bell',
        title: t('settings.notifications.test'),
        desc: t('settings.notifications.testDesc'),
        control: h(
          'button',
          {
            class: 'btn',
            type: 'button',
            disabled: !os.embedded,
            onclick: () => os.notify({ title: t('settings.notifications.sampleTitle'), body: t('settings.notifications.sampleBody') })
          },
          t('settings.notifications.send')
        )
      })
    )
  );
}

function renderPower(body) {
  const status = () => {
    if (!battery.supported) return t('settings.power.unavailable');
    return t(battery.charging ? 'settings.power.charging' : 'settings.power.onBattery');
  };
  body.append(
    group(
      null,
      card({ icon: 'battery', title: t('settings.power.level'), desc: live(status), value: live(() => `${battery.percent}%`) }),
      card({ icon: 'leaf', title: t('quick.energySaver'), desc: t('settings.power.saverDesc'), control: toggle('energySaver') })
    )
  );
  subscribe(battery.on('change', runBindings));
}

async function emptyTrash() {
  const count = fs.trashCount();
  if (!count) return;
  const ok = await confirmDialog(t('files.emptyTrashTitle'), i18n.plural('files.emptyTrashMessage', count), { okLabel: t('files.emptyTrash'), danger: true });
  if (ok) await fs.emptyTrash();
}

function renderStorage(body) {
  const usage = fs.usage();
  const ratio = usage.used / usage.capacity;
  const sizeOf = (path) => {
    try {
      return fs.sizeOf(path);
    } catch {
      return 0;
    }
  };
  const trash = fs.trashList();
  const trashSize = trash.reduce((sum, item) => sum + item.size, 0);
  body.append(
    group(
      null,
      stackedCard(
        { image: iconUrl('c-drive'), title: t('settings.storage.localDisk'), desc: t('settings.storage.usedOf', { used: formatBytes(usage.used), total: formatBytes(usage.capacity) }) },
        h('div', { class: `bar${ratio > 0.9 ? ' is-full' : ''}` }, h('span', { style: { width: `${Math.max(1, ratio * 100)}%` } })),
        h('div', { class: 'bar-labels' }, h('span', null, t('settings.storage.used', { size: formatBytes(usage.used) })), h('span', null, t('settings.storage.free', { size: formatBytes(usage.free) })))
      )
    ),
    group(
      t('settings.storage.breakdown'),
      Object.entries(KNOWN_FOLDERS).map(([key, path]) => card({ image: iconUrl(`folder-${key}`), title: t(`folders.${key}`), value: formatBytes(sizeOf(path)) })),
      card({
        image: iconUrl(trash.length ? 'recycle-bin-full' : 'recycle-bin'),
        title: t('desktop.recycleBin'),
        desc: `${i18n.plural('settings.storage.items', trash.length)} · ${formatBytes(trashSize)}`,
        control: h('button', { class: 'btn', type: 'button', disabled: !trash.length, onclick: emptyTrash }, t('files.emptyTrash'))
      })
    ),
    note(t('settings.storage.note'))
  );
  subscribe(fs.on('change', renderBody));
}

async function resetSystem() {
  const ok = await confirmDialog(t('settings.about.reset'), t('settings.about.resetMessage'), { okLabel: t('settings.about.resetConfirm'), danger: true });
  if (!ok) return;
  if (os.embedded) await os.system.resetStorage();
  else clearAll();
  await fs.wipe();
  if (os.embedded) os.power('restart');
  else window.location.reload();
}

function renderAbout(body) {
  const ua = navigator.userAgentData;
  const brand = ua?.brands?.filter((entry) => !/not.?a.?brand/i.test(entry.brand)).pop();
  const unknown = t('settings.about.unknown');
  const row = (label, value) => [h('dt', null, label), h('dd', null, value)];
  const copyright = h('span', null, OS_INFO.copyright.replace('{brand}', ''));
  brandName().then((name) => (copyright.textContent = OS_INFO.copyright.replace('{brand}', name)));
  const language = () => i18n.available.find((entry) => entry.code === i18n.lang)?.name ?? i18n.lang;
  body.append(
    group(
      null,
      stackedCard(
        { icon: 'desktop', title: t('settings.about.device'), control: h('button', { class: 'btn', type: 'button', onclick: renameDevice }, t('settings.about.rename')) },
        h(
          'dl',
          { class: 'table' },
          row(t('settings.about.deviceName'), live(() => settings.get('deviceName'))),
          row(t('settings.about.processor'), t('settings.about.processorValue', { count: navigator.hardwareConcurrency || 1 })),
          row(t('settings.about.memory'), navigator.deviceMemory ? `${navigator.deviceMemory} GB` : unknown),
          row(t('settings.about.systemType'), ua?.platform || navigator.platform || unknown),
          row(t('settings.about.browser'), brand ? `${brand.brand} ${brand.version}` : navigator.userAgent),
          row(t('settings.about.display'), `${window.screen.width} × ${window.screen.height} (${Math.round(window.devicePixelRatio * 100)}%)`),
          row(t('settings.about.touch'), navigator.maxTouchPoints ? t('settings.about.touchYes', { count: navigator.maxTouchPoints }) : t('settings.about.touchNo'))
        )
      ),
      stackedCard(
        { image: iconUrl('logo'), title: t('settings.about.system') },
        h(
          'dl',
          { class: 'table' },
          row(t('settings.about.edition'), OS_INFO.name),
          row(t('settings.about.version'), OS_INFO.version),
          row(t('settings.about.build'), OS_INFO.build),
          row(t('settings.about.copyright'), copyright),
          row(t('settings.pages.language.title'), language())
        )
      )
    ),
    group(
      t('settings.about.recovery'),
      card({
        icon: 'refresh',
        title: t('settings.about.reset'),
        desc: t('settings.about.resetDesc'),
        control: h('button', { class: 'btn', type: 'button', onclick: resetSystem }, t('settings.about.resetButton'))
      })
    )
  );
}

/* --------------------------- bluetooth and network -------------------------- */

function renderBluetooth(body) {
  const pointer = window.matchMedia('(pointer: fine)').matches ? t('settings.bluetooth.mouse') : t('settings.bluetooth.touch');
  body.append(
    group(null, card({ icon: 'bluetooth', title: t('quick.bluetooth'), desc: live(() => t(settings.get('bluetooth') ? 'settings.bluetooth.onDesc' : 'settings.bluetooth.offDesc')), control: toggle('bluetooth') })),
    group(
      t('settings.bluetooth.input'),
      card({ icon: 'desktop', title: t('settings.bluetooth.pointer'), value: pointer }),
      card({ icon: 'accessibility', title: t('settings.bluetooth.touchPoints'), value: String(navigator.maxTouchPoints || 0) })
    )
  );
}

function renderNetwork(body) {
  const glyph = icon('wifi', { class: 'hero-icon' });
  bind(() => setIcon(glyph, networkIcon()));
  const connection = navigator.connection;
  const properties = [];
  if (connection) {
    if (connection.effectiveType) properties.push(card({ icon: 'wifi', title: t('settings.network.type'), value: String(connection.effectiveType).toUpperCase() }));
    if (connection.downlink) properties.push(card({ icon: 'download', title: t('settings.network.downlink'), value: `${connection.downlink} Mbps` }));
    if (connection.rtt) properties.push(card({ icon: 'clock', title: t('settings.network.rtt'), value: `${connection.rtt} ms` }));
  }
  body.append(
    h(
      'div',
      { class: 'hero' },
      glyph,
      h('div', { class: 'hero-text' }, h('span', { class: 'hero-title' }, live(() => t(`settings.network.status.${networkState()}`))), h('span', { class: 'hero-sub' }, live(() => t(`tray.network.${networkState()}`))))
    ),
    group(
      null,
      card({ icon: 'wifi', title: t('quick.wifi'), desc: t('settings.network.wifiDesc'), control: toggle('wifi') }),
      card({ icon: 'airplane', title: t('quick.airplane'), desc: t('settings.network.airplaneDesc'), control: toggle('airplane', { get: () => !!settings.get('airplane'), set: setAirplaneMode }) })
    ),
    properties.length ? group(t('settings.network.properties'), properties) : null
  );
  listen(window, 'online', runBindings);
  listen(window, 'offline', runBindings);
}

/* ------------------------------ personalization ----------------------------- */

function themeTiles() {
  return h(
    'div',
    { class: 'themes' },
    ['light', 'dark'].map((theme) => {
      const button = h(
        'button',
        { class: 'theme', type: 'button', onclick: () => settings.update({ theme, wallpaper: 'auto' }) },
        h('span', { class: 'theme-picture', style: { backgroundImage: `url("${url(DEFAULT_WALLPAPERS[theme])}")` } }),
        t(`settings.colors.${theme}`)
      );
      bind(() => button.classList.toggle('is-selected', resolveTheme() === theme && settings.get('wallpaper') === 'auto'));
      return button;
    })
  );
}

function renderPersonalization(body) {
  body.append(
    h('div', { class: 'hero' }, mock(), h('div', { class: 'hero-text' }, h('span', { class: 'group-title' }, t('settings.personalization.selectTheme')), themeTiles())),
    group(null, PAGES.personalization.children.map(linkCard))
  );
}

function pictures() {
  try {
    return fs
      .list(KNOWN_FOLDERS.pictures)
      .filter((entry) => entry.url && kindOf(entry) === 'image')
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

/** Shrink a photo so that it fits into the (small) virtual disk. */
async function toDataUrl(file, maxSide = 1920) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = h('canvas', { width: Math.round(bitmap.width * scale), height: Math.round(bitmap.height * scale) });
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

function browsePhoto() {
  const input = h('input', { type: 'file', accept: 'image/*' });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const data = await toDataUrl(file);
      const base = file.name.replace(/\.[^.]*$/, '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'Picture';
      const path = await fs.writeLink(join(KNOWN_FOLDERS.pictures, `${base}.jpg`), data, Math.round(data.length * 0.75));
      settings.set('wallpaper', `file:${path}`);
    } catch (err) {
      alertDialog(t('settings.background.browseFailed'), describeError(err));
    }
  });
  input.click();
}

function renderBackground(body) {
  const kind = () => (String(settings.get('wallpaper')).startsWith('color:') ? 'color' : 'picture');

  const thumbs = h('div', { class: 'thumbs' });
  let shown = '';
  bind(() => {
    const list = pictures();
    const current = settings.get('wallpaper');
    const theme = resolveTheme();
    const signature = [current, theme, i18n.lang, ...list.map((entry) => entry.path)].join('|');
    if (signature === shown) return;
    shown = signature;
    const tile = (value, image, label, badge) => {
      const button = h(
        'button',
        { class: `thumb${current === value ? ' is-selected' : ''}`, type: 'button', style: { backgroundImage: `url("${image}")` }, 'aria-label': label, onclick: () => settings.set('wallpaper', value) },
        badge ? h('span', { class: 'thumb-badge' }, badge) : null
      );
      button.dataset.tip = label;
      return button;
    };
    clear(thumbs).append(
      tile('auto', url(DEFAULT_WALLPAPERS[theme]), t('settings.background.auto'), t('settings.background.autoBadge')),
      ...list.map((entry) => tile(`file:${entry.path}`, entry.url, entry.name))
    );
  });

  const pictureCard = stackedCard(
    {
      icon: 'picture',
      title: t('settings.background.choose'),
      desc: t('settings.background.chooseDesc'),
      control: h('button', { class: 'btn', type: 'button', onclick: browsePhoto }, t('settings.background.browse'))
    },
    thumbs
  );
  const fitCard = card({
    icon: 'view-grid',
    title: t('settings.background.fit'),
    control: combo(
      () => settings.get('wallpaperFit'),
      (value) => settings.set('wallpaperFit', value),
      () => ['fill', 'fit', 'stretch', 'center'].map((value) => ({ value, label: t(`settings.background.fits.${value}`) }))
    )
  });
  const colorCard = stackedCard(
    { icon: 'palette', title: t('settings.background.color') },
    swatches(
      SOLID_COLORS,
      () => String(settings.get('wallpaper')).slice(6),
      (color) => settings.set('wallpaper', `color:${color}`)
    )
  );
  bind(() => {
    const solid = kind() === 'color';
    pictureCard.hidden = solid;
    fitCard.hidden = solid;
    colorCard.hidden = !solid;
  });

  body.append(
    h('div', { class: 'hero' }, mock()),
    group(
      null,
      card({
        icon: 'picture',
        title: t('settings.background.personalize'),
        desc: t('settings.background.personalizeDesc'),
        control: combo(
          kind,
          (value) => value !== kind() && settings.set('wallpaper', value === 'color' ? `color:${SOLID_COLORS[4]}` : 'auto'),
          () => [
            { value: 'picture', label: t('settings.background.picture') },
            { value: 'color', label: t('settings.background.solid') }
          ]
        )
      }),
      pictureCard,
      fitCard,
      colorCard
    )
  );
  subscribe(fs.on('change', runBindings));
}

function renderColors(body) {
  body.append(
    h('div', { class: 'hero' }, mock()),
    group(
      null,
      card({
        icon: 'brush',
        title: t('settings.colors.mode'),
        desc: t('settings.colors.modeDesc'),
        control: combo(
          () => settings.get('theme'),
          (value) => settings.set('theme', value),
          () => [
            { value: 'system', label: t('settings.colors.system') },
            { value: 'light', label: t('settings.colors.light') },
            { value: 'dark', label: t('settings.colors.dark') }
          ]
        )
      }),
      card({ icon: 'sparkle', title: t('settings.colors.transparency'), desc: t('settings.colors.transparencyDesc'), control: toggle('transparency') }),
      stackedCard(
        { icon: 'palette', title: t('settings.colors.accent'), desc: t('settings.colors.accentDesc') },
        swatches(
          ACCENTS,
          () => settings.get('accent'),
          (color) => settings.set('accent', color)
        )
      )
    )
  );
}

function renderLockScreen(body) {
  body.append(
    h('div', { class: 'hero' }, mock({ lock: true })),
    group(
      null,
      card({ icon: 'lock', title: t('settings.lockScreen.startup'), desc: t('settings.lockScreen.startupDesc'), control: toggle('lockOnStartup') }),
      card({
        icon: 'picture',
        title: t('settings.lockScreen.background'),
        desc: t('settings.lockScreen.backgroundDesc'),
        onClick: () => go('personalization/background')
      }),
      card({
        icon: 'power',
        title: t('settings.lockScreen.lockNow'),
        desc: t('settings.lockScreen.lockNowDesc'),
        control: h('button', { class: 'btn', type: 'button', disabled: !os.embedded, onclick: () => os.power('lock') }, t('power.lock'))
      })
    )
  );
  const timer = setInterval(runBindings, 1000);
  subscribe(() => clearInterval(timer));
}

function renderStart(body) {
  body.append(
    group(null, card({ icon: 'clock', title: t('settings.start.recommended'), desc: t('settings.start.recommendedDesc'), control: toggle('startRecommended') })),
    group(t('settings.start.pinned'), pinnedApps('start'))
  );
}

function renderTaskbar(body) {
  body.append(
    group(
      t('settings.taskbar.behaviors'),
      card({
        icon: 'taskbar',
        title: t('settings.taskbar.alignment'),
        desc: t('settings.taskbar.alignmentDesc'),
        control: combo(
          () => settings.get('taskbarAlign'),
          (value) => settings.set('taskbarAlign', value),
          () => [
            { value: 'center', label: t('settings.taskbar.center') },
            { value: 'left', label: t('settings.taskbar.left') }
          ]
        )
      }),
      card({
        icon: 'taskbar',
        title: t('settings.taskbar.dock'),
        desc: t('settings.taskbar.dockDesc'),
        control: combo(
          () => settings.get('dockBehavior'),
          (value) => settings.set('dockBehavior', value),
          () => [
            { value: 'show', label: t('settings.taskbar.dockShow') },
            { value: 'auto', label: t('settings.taskbar.dockAuto') },
            { value: 'hide', label: t('settings.taskbar.dockHide') }
          ]
        )
      }),
      card({ icon: 'view-grid', title: t('settings.taskbar.taskView'), desc: t('settings.taskbar.taskViewDesc'), control: toggle('taskbarTaskView') }),
      card({ icon: 'apps', title: t('settings.taskbar.widgets'), desc: t('settings.taskbar.widgetsDesc'), control: toggle('taskbarWidgets') })
    ),
    group(t('settings.taskbar.pinned'), pinnedApps('taskbar'))
  );
}

/* ------------------------------ apps and accounts --------------------------- */

function renderAppsHome(body) {
  body.append(group(null, PAGES.apps.children.map(linkCard)));
}

/** The apps that can run without a window, each with a switch: it decides whether the app starts with the system. */
function renderStartup(body) {
  const list = apps.startupCapable();
  body.append(
    list.length
      ? group(
          t('settings.pages.startupApps.title'),
          list.map((app) => card({ image: app.icon, title: apps.name(app), desc: apps.publisher(app), control: toggle(null, { get: () => apps.startsAtBoot(app), set: (on) => apps.setStartsAtBoot(app.id, on) }) }))
        )
      : group(null, card({ icon: 'info', title: t('settings.startup.empty') })),
    note(t('settings.startup.note'))
  );
}

function renderApps(body) {
  const list = apps.sorted();
  body.append(
    group(
      i18n.plural('settings.apps.count', list.length),
      list.map((app) => {
        const more = h('button', { class: 'btn btn-subtle btn-icon', type: 'button', 'aria-label': t('settings.apps.more') }, icon('more'));
        os.dropdown(
          more,
          () => {
            const inStart = apps.isPinned('start', app.id);
            const inTaskbar = apps.isPinned('taskbar', app.id);
            return [
              { label: t('files.open'), icon: 'open', disabled: !os.embedded && app.roles.includes('settings'), action: () => os.launch(app.id) },
              { separator: true },
              { label: t(inStart ? 'start.unpinStart' : 'start.pinStart'), icon: inStart ? 'pin-off' : 'pin', action: () => apps.setPinned('start', app.id, !inStart) },
              { label: t(inTaskbar ? 'taskbar.unpin' : 'taskbar.pin'), icon: inTaskbar ? 'pin-off' : 'pin', action: () => apps.setPinned('taskbar', app.id, !inTaskbar) },
              apps.isRemovable(app.id) && { separator: true },
              apps.isRemovable(app.id) && {
                label: t('settings.apps.uninstall'),
                danger: true,
                action: async () => {
                  const name = apps.name(app);
                  if (await confirmDialog(t('settings.apps.uninstallTitle', { name }), t('settings.apps.uninstallMessage', { name }), { okLabel: t('settings.apps.uninstall'), danger: true })) apps.setInstalled(app.id, false);
                }
              }
            ];
          },
          { placement: 'bottom-end' }
        );
        return card({ image: app.icon, title: apps.name(app), desc: `${apps.publisher(app)}  ·  ${t('settings.apps.version', { version: app.version })}`, control: more });
      })
    ),
    note(t('settings.apps.note'))
  );
}

function renderAccounts(body) {
  const input = h('input', { class: 'input', type: 'text', maxLength: 32, spellcheck: false, autocomplete: 'off', 'aria-label': t('settings.accounts.displayName') });
  input.value = settings.get('userName');
  const save = h('button', { class: 'btn btn-accent', type: 'button', disabled: true }, t('common.save'));
  const clean = () => input.value.replace(/\s+/g, ' ').trim();
  save.addEventListener('click', () => {
    if (clean()) settings.set('userName', clean());
    input.value = settings.get('userName');
    save.disabled = true;
  });
  input.addEventListener('input', () => {
    save.disabled = !clean() || clean() === settings.get('userName');
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !save.disabled) save.click();
  });

  body.append(
    h(
      'div',
      { class: 'hero' },
      h('img', { class: 'hero-avatar', src: iconUrl('avatar'), alt: '' }),
      h('div', { class: 'hero-text' }, h('span', { class: 'hero-title' }, live(() => settings.get('userName'))), h('span', { class: 'hero-sub' }, t('settings.localAccount')))
    ),
    group(t('settings.accounts.info'), card({ icon: 'user', title: t('settings.accounts.displayName'), desc: t('settings.accounts.displayNameDesc'), control: h('div', { class: 'field-row' }, input, save) }))
  );
}

/* ------------------------------ time and language --------------------------- */

function timeZone() {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const minutes = -new Date().getTimezoneOffset();
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  return `(UTC${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}) ${zone}`;
}

function tickEverySecond() {
  const timer = setInterval(runBindings, 1000);
  subscribe(() => clearInterval(timer));
}

function renderTimeLanguage(body) {
  body.append(
    h(
      'div',
      { class: 'hero' },
      h(
        'div',
        { class: 'hero-text' },
        h('span', { class: 'big-time' }, live(() => formatClock(new Date(), { seconds: settings.get('clockSeconds') }))),
        h('span', { class: 'hero-sub' }, live(() => i18n.date(new Date(), { dateStyle: 'full' })))
      )
    ),
    group(null, PAGES['time-language'].children.map(linkCard))
  );
  tickEverySecond();
}

function renderDateTime(body) {
  body.append(
    group(
      null,
      card({ icon: 'clock', title: live(() => formatClock(new Date(), { seconds: true })), desc: live(() => i18n.date(new Date(), { dateStyle: 'full' })) }),
      card({ icon: 'globe', title: t('settings.dateTime.timeZone'), value: timeZone() })
    ),
    group(
      t('settings.dateTime.format'),
      card({ icon: 'clock', title: t('settings.dateTime.clock24'), desc: t('settings.dateTime.clock24Desc'), control: toggle('clock24h') }),
      card({ icon: 'taskbar', title: t('settings.dateTime.seconds'), desc: t('settings.dateTime.secondsDesc'), control: toggle('clockSeconds') })
    )
  );
  tickEverySecond();
}

function renderLanguage(body) {
  const sample = new Date();
  const row = (label, value) => [h('dt', null, label), h('dd', null, value)];
  body.append(
    group(
      null,
      card({
        icon: 'globe',
        title: t('settings.language.display'),
        desc: t('settings.language.displayDesc'),
        control: combo(
          () => settings.get('language'),
          (value) => settings.set('language', value),
          () => i18n.available.map((entry) => ({ value: entry.code, label: entry.name }))
        )
      })
    ),
    group(
      null,
      stackedCard(
        { icon: 'calendar', title: t('settings.language.regional'), desc: t('settings.language.regionalDesc') },
        h(
          'dl',
          { class: 'table' },
          row(t('settings.language.longDate'), i18n.date(sample, { dateStyle: 'full' })),
          row(t('settings.language.shortDate'), i18n.date(sample, { dateStyle: 'short' })),
          row(t('settings.language.time'), formatClock(sample)),
          row(t('settings.language.number'), i18n.number(1234567.89))
        )
      )
    )
  );
}

function renderAccessibility(body) {
  body.append(
    group(
      t('settings.accessibility.visual'),
      card({ icon: 'sparkle', title: t('settings.colors.transparency'), desc: t('settings.colors.transparencyDesc'), control: toggle('transparency') }),
      card({ icon: 'eye', title: t('settings.accessibility.animations'), desc: t('settings.accessibility.animationsDesc'), control: toggle('animations') })
    ),
    note(t('settings.accessibility.note')),
    group(
      t('settings.accessibility.contrast'),
      card({ icon: 'eye', title: t('settings.accessibility.highContrast'), desc: t('settings.accessibility.highContrastDesc'), control: toggle('highContrast') }),
      card({
        icon: 'palette',
        title: t('settings.accessibility.colorFilter'),
        desc: t('settings.accessibility.colorFilterDesc'),
        control: combo(
          () => settings.get('colorFilter'),
          (value) => settings.set('colorFilter', value),
          () => ['none', 'grayscale', 'inverted', 'grayscaleInverted'].map((value) => ({ value, label: t(`settings.accessibility.filters.${value}`) }))
        )
      }),
      card({ icon: 'accessibility', title: t('settings.accessibility.focus'), desc: t('settings.accessibility.focusDesc'), control: toggle('focusIndicator') })
    ),
    group(
      t('settings.accessibility.shortcuts'),
      stackedCard(
        { icon: 'accessibility', title: t('settings.accessibility.shortcutsTitle'), desc: t('settings.accessibility.shortcutsNote') },
        h(
          'dl',
          { class: 'table' },
          SHORTCUTS.flatMap(([id, keys]) => [h('dt', null, keys), h('dd', null, t(`settings.accessibility.shortcut.${id}`))])
        )
      )
    )
  );
}

/** [id of the description, keys] */
const SHORTCUTS = [
  ['switch', 'Alt + Q'],
  ['desktop', 'Alt + W'],
  ['search', 'Alt + S'],
  ['start', 'Meta'],
  ['apps', 'Alt + 1 … 9'],
  ['snap', 'Alt + Shift + ← / →'],
  ['maximize', 'Alt + Shift + ↑ / ↓'],
  ['taskview', 'Alt + T'],
  ['widgets', 'Alt + Z'],
  ['clipboard', 'Alt + V'],
  ['taskmanager', 'Ctrl + Shift + Esc'],
  ['snip', 'Print Screen / Alt + Shift + S'],
  ['desktops', 'Ctrl + Alt + ← / → / D']
];

/* ------------------------------------ home --------------------------------- */

function renderHome(body) {
  const free = () => formatBytes(fs.usage().free);
  const updateText = () => (settings.get('updateChecked') ? t('settings.update.lastChecked', { when: i18n.date(settings.get('updateChecked'), { dateStyle: 'medium', timeStyle: 'short' }) }) : t('settings.update.neverChecked'));
  const tile = (route, glyph, title, desc) => card({ icon: glyph, title, desc: desc ?? descOf(route), onClick: () => go(route) });
  body.append(
    h(
      'div',
      { class: 'hero' },
      mock({ small: true }),
      h(
        'div',
        { class: 'hero-text' },
        h('strong', { class: 'hero-name' }, live(() => settings.get('deviceName'))),
        h('span', null, OS_INFO.name),
        h('button', { class: 'btn', type: 'button', onclick: renameDevice }, t('settings.about.rename'))
      )
    ),
    group(
      t('settings.home.status'),
      tile('network', 'wifi', titleOf('network'), live(() => t(`tray.network.${networkState()}`))),
      tile('bluetooth', 'bluetooth', titleOf('bluetooth'), live(() => t(settings.get('bluetooth') ? 'common.on' : 'common.off'))),
      tile('system/storage', 'drive', titleOf('system/storage'), live(() => t('settings.home.free', { size: free() }))),
      tile('system/power', 'battery', titleOf('system/power'), live(() => `${battery.percent}%${battery.charging && battery.supported ? ' ⚡' : ''}`)),
      tile('update', 'refresh', titleOf('update'), live(updateText))
    ),
    group(
      t('settings.home.more'),
      tile('personalization', 'brush', titleOf('personalization')),
      tile('apps', 'apps', titleOf('apps')),
      tile('time-language', 'globe', titleOf('time-language')),
      tile('accessibility', 'accessibility', titleOf('accessibility')),
      tile('privacy', 'lock', titleOf('privacy'))
    )
  );
  subscribe(battery.on('change', runBindings));
}

/* --------------------------------- multitasking ---------------------------- */

function renderMultitasking(body) {
  body.append(
    group(
      t('settings.multitasking.snap'),
      card({ icon: 'view-grid', title: t('settings.multitasking.snapWindows'), desc: t('settings.multitasking.snapWindowsDesc'), control: toggle('snapWindows') }),
      card({ icon: 'window', title: t('settings.multitasking.snapLayouts'), desc: t('settings.multitasking.snapLayoutsDesc'), control: toggle('snapLayouts') })
    ),
    group(
      t('settings.multitasking.desktops'),
      stackedCard(
        { icon: 'desktop', title: t('settings.multitasking.desktopsTitle'), desc: t('settings.multitasking.desktopsDesc') },
        h(
          'dl',
          { class: 'table' },
          SHORTCUTS.filter(([id]) => ['taskview', 'desktops'].includes(id)).flatMap(([id, keys]) => [h('dt', null, keys), h('dd', null, t(`settings.accessibility.shortcut.${id}`))])
        )
      )
    )
  );
}

/* ----------------------------------- clipboard ----------------------------- */

function renderClipboard(body) {
  const clearButton = h('button', { class: 'btn', type: 'button' }, t('settings.clipboard.clearButton'));
  clearButton.addEventListener('click', () => {
    os.clipboardHistory.clear();
    clearButton.textContent = t('settings.clipboard.cleared');
    clearButton.disabled = true;
    setTimeout(() => {
      clearButton.textContent = t('settings.clipboard.clearButton');
      clearButton.disabled = false;
    }, 1500);
  });
  body.append(
    group(
      t('settings.clipboard.history'),
      card({ icon: 'copy', title: t('settings.clipboard.history'), desc: t('settings.clipboard.historyDesc'), control: toggle('clipboardHistory') }),
      card({ icon: 'info', title: t('settings.clipboard.shortcut'), desc: t('settings.clipboard.shortcutDesc'), value: 'Alt + V' })
    ),
    group(t('settings.clipboard.data'), card({ icon: 'delete', title: t('settings.clipboard.clear'), desc: t('settings.clipboard.clearDesc'), control: clearButton })),
    note(t('settings.clipboard.note'))
  );
}

/* ------------------------------------ privacy ------------------------------ */

/** Texts the apps keep for the user; [app (null: the desktop itself), storage key, translation key]. */
const ACTIVITY = [
  ['edge', 'edge.history', 'edgeHistory'],
  ['edge', 'edge.bookmarks', 'edgeFavorites'],
  ['media-player', 'player.recent', 'playerRecent'],
  ['media-player', 'player.playlists', 'playerPlaylists'],
  ['photos', 'photos.favorites', 'photoFavorites'],
  ['notepad', 'notepad.session', 'notepadSession'],
  [null, 'widgets.notes', 'widgetNotes']
];

function permissionCard(name, glyph, key) {
  const value = h('span', null, t('settings.privacy.state.unknown'));
  const show = (state) => {
    value.textContent = t(`settings.privacy.state.${state}`);
  };
  navigator.permissions
    ?.query({ name })
    .then((status) => {
      show(status.state);
      status.onchange = () => show(status.state);
    })
    .catch(() => show('unknown'));
  return card({ icon: glyph, title: t(`settings.privacy.${key}`), desc: t(`settings.privacy.${key}Desc`), value });
}

function renderPrivacy(body) {
  const clearButton = (targets, label) => {
    const button = h('button', { class: 'btn', type: 'button' }, label);
    button.addEventListener('click', async () => {
      if (!(await confirmDialog(t('settings.privacy.clearTitle'), t('settings.privacy.clearMessage'), { okLabel: t('settings.privacy.clear'), danger: true }))) return;
      for (const [appId, key] of targets) await os.system.clearAppData(appId, key);
      button.textContent = t('settings.privacy.cleared');
      button.disabled = true;
      setTimeout(() => {
        button.textContent = label;
        button.disabled = false;
      }, 1500);
    });
    return button;
  };
  body.append(
    group(
      t('settings.privacy.permissions'),
      permissionCard('camera', 'eye', 'camera'),
      permissionCard('microphone', 'volume-2', 'microphone'),
      permissionCard('geolocation', 'globe', 'location'),
      note(t('settings.privacy.permissionsNote'))
    ),
    group(
      t('settings.privacy.activity'),
      card({ icon: 'clock', title: t('settings.privacy.clearAll'), desc: t('settings.privacy.clearAllDesc'), control: clearButton(ACTIVITY.map(([appId, key]) => [appId, key]), t('settings.privacy.clearAllButton')) }),
      ...ACTIVITY.map(([appId, key, id]) => card({ icon: 'info', title: t(`settings.privacy.data.${id}`), control: clearButton([[appId, key]], t('settings.privacy.clear')) }))
    ),
    group(
      t('settings.privacy.security'),
      card({ icon: 'lock', title: t('settings.lockScreen.startup'), desc: t('settings.lockScreen.startupDesc'), control: toggle('lockOnStartup') }),
      card({ icon: 'lock', title: titleOf('personalization/lock-screen'), desc: descOf('personalization/lock-screen'), onClick: () => go('personalization/lock-screen') })
    )
  );
}

/* ------------------------------------ update ------------------------------- */

function renderUpdate(body) {
  const headline = h('span');
  const sub = h('span');
  const progress = h('div', { class: 'bar', hidden: true }, h('span'));
  const button = h('button', { class: 'btn btn-accent', type: 'button' }, t('settings.update.check'));
  let timer = 0;
  const paint = () => {
    headline.textContent = t(timer ? 'settings.update.checking' : 'settings.update.upToDate');
    sub.textContent = settings.get('updateChecked') ? t('settings.update.lastChecked', { when: i18n.date(settings.get('updateChecked'), { dateStyle: 'medium', timeStyle: 'short' }) }) : t('settings.update.neverChecked');
    button.disabled = !!timer;
  };
  button.addEventListener('click', () => {
    let done = 0;
    progress.hidden = false;
    timer = setInterval(() => {
      done += 4;
      progress.firstChild.style.width = `${Math.min(100, done)}%`;
      if (done >= 100) {
        clearInterval(timer);
        timer = 0;
        progress.hidden = true;
        settings.set('updateChecked', Date.now());
      }
      paint();
    }, 100);
    paint();
  });
  subscribe(() => clearInterval(timer));
  bind(paint);
  body.append(
    stackedCard({ icon: 'check', title: t('settings.update.status'), desc: null, control: button }, h('div', { class: 'update-text' }, h('strong', null, headline), sub), progress),
    note(t('settings.update.note')),
    group(
      t('settings.update.history'),
      card({ icon: 'download', title: `${OS_INFO.name} ${OS_INFO.version}`, desc: t('settings.update.initial'), value: t('settings.update.installed') })
    ),
    group(
      t('settings.update.advanced'),
      card({ icon: 'refresh', title: titleOf('system/about'), desc: t('settings.update.resetDesc'), onClick: () => go('system/about') })
    )
  );
}

/* ----------------------------------- wiring -------------------------------- */

els.back.addEventListener('click', back);
els.profile.addEventListener('click', () => go('accounts'));
els.search.addEventListener('input', () => {
  state.query = els.search.value.trim();
  renderNav();
});
els.search.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    els.search.value = '';
    state.query = '';
    renderNav();
  } else if (e.key === 'Enter') {
    els.navList.querySelector('.nav-item')?.click();
  }
});

settings.on('change', (key) => {
  if (key === 'userName') els.profileName.textContent = settings.get('userName');
  if ((key === 'appInstall' && state.route === 'apps/installed') || (key === 'startupApps' && state.route === 'apps/startup')) renderBody();
  runBindings();
});
i18n.on('change', () => {
  i18n.apply(document);
  render();
});
os.window.on('args', (args) => {
  if (typeof args.page === 'string') go(args.page);
});

go(typeof os.args.page === 'string' ? os.args.page : 'home', { push: false });
