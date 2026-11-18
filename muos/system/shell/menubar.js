import { h, icon, setIcon, rectOf } from '../core/dom.js';
import { settings } from '../core/settings.js';
import { apps } from '../core/apps.js';
import { i18n, t } from '../core/i18n.js';
import { formatClock } from '../core/format.js';
import { OS_INFO } from '../core/osinfo.js';
import { networkIcon, networkState, volumeIcon, batteryIcon, battery, NETWORK_KEYS, VOLUME_KEYS } from '../core/system.js';
import { showMenu, isMenuOpen } from '../ui/menu.js';
import { CLOCK_TICK_MARGIN, MENUBAR_MENU_GAP } from '../config/shell.js';

/**
 * The bar along the top of the screen, as on a Mac.
 * At the start: the system menu (the logo), the name of the app in front and its menu, and the Window menu.
 * At the end: the icons of the apps that run in the background (see tray.js), Widgets and Task View, the status of network,
 * sound and battery (Quick settings), and the date and time (Calendar and notifications).
 */
export function createMenubar(shell) {
  const { wm, flyouts } = shell;
  const el = document.getElementById('menubar');

  /* ------------------------------- layout -------------------------------- */

  const logoBtn = h('button', { class: 'mb-btn mb-logo', type: 'button', onclick: () => systemMenu() }, icon('logo-mono'));
  const appBtn = h('button', { class: 'mb-btn mb-app', type: 'button', onclick: () => appMenu() });
  const windowBtn = h('button', { class: 'mb-btn', type: 'button', onclick: () => windowMenu() });

  const widgetsBtn = h('button', { class: 'mb-btn mb-icon', type: 'button', dataset: { flyout: 'widgets' }, onclick: () => flyouts.toggle('widgets') }, icon('widgets'));
  const taskViewBtn = h('button', { class: 'mb-btn mb-icon', type: 'button', onclick: () => shell.taskView?.toggle() }, icon('task-view'));
  const trayEl = h('div', { class: 'mb-tray' });
  const netGlyph = icon('wifi');
  const volGlyph = icon('volume-2');
  const statusBtn = h('button', { class: 'mb-btn mb-status', type: 'button', dataset: { flyout: 'quick' }, onclick: () => flyouts.toggle('quick') }, netGlyph, volGlyph, batteryIcon());
  const dateEl = h('span', { class: 'mb-date' });
  const timeEl = h('span', { class: 'mb-time' });
  const badge = h('span', { class: 'mb-badge', hidden: true });
  const clockBtn = h('button', { class: 'mb-btn mb-clock', type: 'button', dataset: { flyout: 'calendar' }, onclick: () => flyouts.toggle('calendar') }, dateEl, timeEl, badge);

  el.append(h('div', { class: 'mb-start' }, logoBtn, appBtn, windowBtn), h('div', { class: 'mb-end' }, trayEl, widgetsBtn, taskViewBtn, statusBtn, clockBtn));

  /* -------------------------------- menus -------------------------------- */

  const below = (button) => ({ anchor: rectOf(button), placement: 'bottom-start', gap: MENUBAR_MENU_GAP });

  /*
   * Pressing a title while its own menu is open closes the menu. A menu closes on the press itself
   * (before the click), so the press is noted first (window, capture) and the click that follows is
   * not allowed to open the menu again. Pressing another title opens that one.
   */
  let openFor = null; // the button whose menu is open
  let pressedOpen = null; // the button that was pressed while its menu was open
  window.addEventListener('pointerdown', () => (pressedOpen = isMenuOpen() ? openFor : null), true);

  function openMenu(button, items) {
    if (pressedOpen === button) {
      pressedOpen = null;
      return;
    }
    flyouts.close();
    openFor = button;
    showMenu(items, below(button)).then(() => {
      if (openFor === button) openFor = null;
    });
  }

  /** The window whose app the bar speaks for: the one in front, if it is shown. */
  const front = () => (wm.active && !wm.active.minimized ? wm.active : null);

  function systemMenu() {
    const settingsApp = apps.byRole('settings');
    const storeApp = apps.byRole('store');
    openMenu(
      logoBtn,
      [
        settingsApp && { label: t('menubar.about', { name: OS_INFO.name }), icon: 'info', action: () => shell.launch(settingsApp.id, { page: 'system/about' }) },
        { separator: true },
        settingsApp && { label: apps.name(settingsApp), action: () => shell.launch(settingsApp.id) },
        storeApp && { label: apps.name(storeApp), action: () => shell.launch(storeApp.id) },
        { separator: true },
        { label: t('power.sleep'), icon: 'moon', action: () => shell.power.sleep() },
        { label: t('power.restart'), icon: 'refresh', action: () => shell.power.restart() },
        { label: t('power.shutDown'), icon: 'power', action: () => shell.power.shutDown() },
        { separator: true },
        { label: t('power.lock'), icon: 'lock', action: () => shell.power.lock() },
        { label: `${t('power.signOut')} ${settings.get('userName')}`, icon: 'sign-out', action: () => shell.power.signOut() }
      ].filter(Boolean)
    );
  }

  function appMenu() {
    const win = front();
    if (!win) return;
    const name = apps.name(win.app);
    openMenu(
      appBtn,
      [
        { label: t('menubar.closeWindow'), icon: 'dismiss', action: () => wm.requestClose(win.id) },
        { separator: true },
        {
          label: t('menubar.quit', { name }),
          action: async () => {
            for (const other of wm.byApp(win.appId)) if (!(await wm.requestClose(other.id))) break;
          }
        }
      ]
    );
  }

  function windowMenu() {
    const win = front();
    const open = wm.onDesktop();
    openMenu(
      windowBtn,
      [
        { label: t('window.minimize'), icon: 'win-minimize', disabled: !win, action: () => wm.minimize(win.id) },
        { label: win?.layout === 'max' ? t('window.restore') : t('window.maximize'), icon: win?.layout === 'max' ? 'win-restore' : 'win-maximize', disabled: !win, action: () => wm.toggleMaximize(win.id) },
        { separator: true },
        { label: t('taskbar.showDesktop'), icon: 'desktop', action: () => wm.toggleShowDesktop() },
        { label: t('taskbar.taskView'), icon: 'task-view', action: () => shell.taskView?.toggle() },
        open.length > 0 && { separator: true },
        ...open.map((other) => ({ label: other.title, iconUrl: other.app.icon, checked: wm.activeId === other.id && !other.minimized, action: () => wm.activate(other.id) }))
      ].filter(Boolean)
    );
  }

  /* ------------------------------- the bar ------------------------------- */

  /** The name of the app in front (or "Desktop"); the buttons that need a window are off without one. */
  function updateFront() {
    const win = front();
    appBtn.textContent = win ? apps.name(win.app) : t('menubar.desktop');
    appBtn.disabled = !win;
  }

  /** Widgets and Task View can be switched off in Settings. */
  function applyOptions() {
    widgetsBtn.hidden = !settings.get('taskbarWidgets');
    taskViewBtn.hidden = !settings.get('taskbarTaskView');
  }

  let clockTimer = 0;

  function tick() {
    const now = new Date();
    const seconds = settings.get('clockSeconds');
    dateEl.textContent = i18n.date(now, { weekday: 'short', month: 'short', day: 'numeric' });
    timeEl.textContent = formatClock(now, { seconds });
    clockBtn.dataset.tip = i18n.date(now, { dateStyle: 'full' });
    clearTimeout(clockTimer);
    const rest = seconds ? 1000 - now.getMilliseconds() : 60000 - (now.getSeconds() * 1000 + now.getMilliseconds());
    clockTimer = setTimeout(tick, rest + CLOCK_TICK_MARGIN);
    shell.emit?.('tick', now);
  }

  function updateStatus() {
    setIcon(netGlyph, networkIcon());
    setIcon(volGlyph, volumeIcon());
    const net = t(`tray.network.${networkState()}`);
    const vol = settings.get('muted') ? t('tray.muted') : t('tray.volume', { value: settings.get('volume') });
    const bat = t(battery.charging && battery.supported ? 'tray.batteryCharging' : 'tray.battery', { value: battery.percent });
    statusBtn.dataset.tip = `${net}\n${vol}\n${bat}`;
  }

  function relabel() {
    el.setAttribute('role', 'menubar');
    el.setAttribute('aria-label', t('menubar.label'));
    logoBtn.dataset.tip = OS_INFO.name;
    logoBtn.setAttribute('aria-label', OS_INFO.name);
    windowBtn.textContent = t('menubar.window');
    widgetsBtn.dataset.tip = t('taskbar.widgets');
    widgetsBtn.setAttribute('aria-label', t('taskbar.widgets'));
    taskViewBtn.dataset.tip = t('taskbar.taskView');
    taskViewBtn.setAttribute('aria-label', t('taskbar.taskView'));
    applyOptions();
    updateFront();
    updateStatus();
    tick();
  }

  /* ------------------------------- wiring -------------------------------- */

  for (const type of ['open', 'close', 'focus', 'change', 'desktop']) wm.on(type, updateFront);
  flyouts.on('change', (name) => {
    statusBtn.classList.toggle('is-open', name === 'quick');
    clockBtn.classList.toggle('is-open', name === 'calendar');
    widgetsBtn.classList.toggle('is-open', name === 'widgets');
  });
  settings.on('change', (key) => {
    if (key === 'taskbarWidgets' || key === 'taskbarTaskView') applyOptions();
    if (key === 'clock24h' || key === 'clockSeconds') tick();
    if (NETWORK_KEYS.has(key) || VOLUME_KEYS.has(key)) updateStatus();
  });
  battery.on('change', updateStatus);
  window.addEventListener('online', updateStatus);
  window.addEventListener('offline', updateStatus);
  i18n.on('change', relabel);
  el.addEventListener('contextmenu', (e) => e.preventDefault());

  relabel();

  return {
    el,
    /** Where the icons of the background apps go (see tray.js). */
    trayEl,
    /** Number shown next to the clock (unread notifications). */
    setBadge(count) {
      badge.hidden = count <= 0;
      badge.textContent = count > 9 ? '9+' : String(count);
    }
  };
}
