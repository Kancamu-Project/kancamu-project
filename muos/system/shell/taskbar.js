import { h, picture, rectOf } from '../core/dom.js';
import { settings } from '../core/settings.js';
import { apps } from '../core/apps.js';
import { i18n, t } from '../core/i18n.js';
import { url } from '../core/paths.js';
import { fs, TRASH } from '../core/fs.js';
import { hasDragPaths, getDragPaths } from '../core/clipboard.js';
import { describeError } from '../core/errors.js';
import { showMenu, isMenuOpen } from '../ui/menu.js';
import { alertDialog, confirmDialog } from '../ui/dialog.js';
import { uninstallApp } from './uninstall.js';
import { QUICK_LINK_MENU_GAP, DOCK_ZOOM_SCALE, DOCK_ZOOM_REACH, DOCK_REVEAL_DELAY, DOCK_HIDE_DELAY, DOCK_SETTLE_DELAY, WINDOW_LAYOUTS } from '../config/shell.js';

/**
 * The dock at the bottom of the screen: Start, Search, the pinned and running apps, and the Recycle Bin at the right end.
 * Widgets and Task View, the clock, the status icons and the tray are in the menu bar at the top (menubar.js).
 */
export function createTaskbar(shell) {
  const { wm, flyouts } = shell;
  const el = document.getElementById('taskbar');

  /* ------------------------------- layout -------------------------------- */

  const startBtn = h('button', { class: 'tb-btn tb-start', type: 'button', dataset: { flyout: 'start' }, onclick: () => flyouts.toggle('start') }, picture('logo'));
  const appsEl = h('div', { class: 'tb-apps' });

  // the Recycle Bin: the last tile, set apart by a thin line (as the Trash of a Mac)
  const trashImg = h('img', { alt: '', draggable: false });
  const trashBtn = h('button', { class: 'tb-btn tb-trash', type: 'button', onclick: () => (flyouts.close(), shell.openLocation(TRASH)) }, trashImg);
  const endEl = h('div', { class: 'tb-end' }, trashBtn);

  // the dock floats above the bottom edge; the bar itself is only the free strip around it
  const dock = h('div', { class: 'taskbar-center' }, startBtn, appsEl, endEl);
  el.append(dock);

  /* ------------------------------ the zoom ------------------------------- */

  /** The tiles near the pointer grow, the nearest the most (a cosine curve, as in the dock of a Mac). */
  function zoomDock(x) {
    for (const tile of dock.querySelectorAll('.tb-btn')) {
      const box = tile.getBoundingClientRect(); // the tile grows around its centre, so its centre does not move
      const near = Math.abs(x - (box.left + box.width / 2)) / (tile.offsetWidth * DOCK_ZOOM_REACH);
      const weight = near >= 1 ? 0 : (Math.cos(near * Math.PI) + 1) / 2;
      tile.style.setProperty('--zoom', (1 + (DOCK_ZOOM_SCALE - 1) * weight).toFixed(3));
    }
  }
  dock.addEventListener('pointermove', (e) => e.pointerType === 'mouse' && zoomDock(e.clientX));
  dock.addEventListener('pointerleave', () => {
    for (const tile of dock.querySelectorAll('.tb-btn')) tile.style.removeProperty('--zoom');
  });

  /* ------------------------ the dock that hides -------------------------- */

  const zone = h('div', { class: 'dock-zone' });
  el.append(zone);
  let hidden = false;
  let showTimer = 0;
  let hideTimer = 0;

  const setRevealed = (on) => el.classList.toggle('is-revealed', on);

  /** A window on this desktop is as tall as the work area (maximized, snapped to a side) or reaches into the place of the dock. */
  function covered() {
    const strip = el.getBoundingClientRect();
    const left = strip.left + dock.offsetLeft;
    const right = left + dock.offsetWidth;
    return wm.onDesktop().some((win) => {
      if (win.minimized) return false;
      if (win.layout !== 'normal' && WINDOW_LAYOUTS[win.layout]?.height === '100%') return true;
      const box = win.el.getBoundingClientRect();
      return box.bottom > strip.top && box.right > left && box.left < right;
    });
  }

  /** Hide or show the dock, by the setting and by what covers it. */
  function updateDock() {
    const mode = settings.get('dockBehavior');
    hidden = mode === 'hide' || (mode !== 'show' && covered());
    document.documentElement.dataset.dock = hidden ? 'hidden' : 'shown';
    el.classList.toggle('is-hidden', hidden);
    if (!hidden) setRevealed(false);
  }

  /** The dock stays up while something that belongs to it is open or the pointer is on it. */
  const keepRevealed = () => ['start', 'search'].includes(flyouts.current) || isMenuOpen() || dock.matches(':hover') || !!document.querySelector('.tb-preview:not([hidden]):hover');

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => (keepRevealed() ? scheduleHide() : setRevealed(false)), DOCK_HIDE_DELAY);
  }

  zone.addEventListener('pointerenter', () => {
    clearTimeout(hideTimer);
    clearTimeout(showTimer);
    showTimer = setTimeout(() => setRevealed(true), DOCK_REVEAL_DELAY);
  });
  zone.addEventListener('pointerleave', () => {
    clearTimeout(showTimer);
    if (el.classList.contains('is-revealed')) scheduleHide();
  });
  dock.addEventListener('pointerenter', () => clearTimeout(hideTimer));
  dock.addEventListener('pointerleave', () => hidden && scheduleHide());
  flyouts.on('change', (name) => {
    if (!hidden) return;
    if (name === 'start' || name === 'search') setRevealed(true);
    else if (!name) scheduleHide();
  });
  // right away, and again when the windows have got to their new places
  let settleTimer = 0;
  const looksAgain = () => {
    updateDock();
    clearTimeout(settleTimer);
    settleTimer = setTimeout(updateDock, DOCK_SETTLE_DELAY);
  };
  for (const type of ['open', 'close', 'focus', 'change', 'desktop']) wm.on(type, looksAgain);
  // a window that was dragged or resized by hand has just got somewhere new
  window.addEventListener('pointerup', () => requestAnimationFrame(looksAgain), true);
  window.addEventListener('resize', updateDock);

  /* ---------------------------- the Recycle Bin -------------------------- */

  function updateTrash() {
    const name = t('desktop.recycleBin');
    trashImg.src = url(`apps/file-explorer/icons/${fs.trashCount() ? 'recycle-bin-full' : 'recycle-bin'}.svg`); // the Recycle Bin belongs to File Explorer
    trashBtn.dataset.tip = name;
    trashBtn.setAttribute('aria-label', name);
  }

  async function emptyTrash() {
    const count = fs.trashCount();
    if (!count) return;
    const ok = await confirmDialog(t('files.emptyTrashTitle'), i18n.plural('files.emptyTrashMessage', count), { okLabel: t('files.emptyTrash'), danger: true });
    if (ok) fs.emptyTrash();
  }

  trashBtn.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    flyouts.close();
    showMenu(
      [
        { label: t('files.open'), icon: 'open', action: () => shell.openLocation(TRASH) },
        { separator: true },
        { label: t('files.emptyTrash'), icon: 'delete', disabled: fs.trashCount() === 0, action: emptyTrash }
      ],
      { anchor: rectOf(trashBtn), placement: 'top-center', gap: 12 }
    );
  });

  // files dropped on it go to the Recycle Bin
  trashBtn.addEventListener('dragover', (e) => {
    if (!hasDragPaths(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    trashBtn.classList.add('is-drop');
  });
  trashBtn.addEventListener('dragleave', () => trashBtn.classList.remove('is-drop'));
  trashBtn.addEventListener('drop', async (e) => {
    if (!hasDragPaths(e)) return;
    e.preventDefault();
    trashBtn.classList.remove('is-drop');
    const errors = [];
    for (const path of getDragPaths(e)) {
      try {
        fs.trash(path);
      } catch (err) {
        errors.push(err);
      }
    }
    if (errors.length) await alertDialog(t('files.deleteFailed'), errors.map(describeError).join('\n'));
  });

  fs.on('change', updateTrash);

  /* ----------------------------- app buttons ----------------------------- */

  const buttons = new Map();

  function order() {
    const ids = apps.pinnedTo('taskbar');
    for (const win of wm.onDesktop()) if (!ids.includes(win.appId) && apps.get(win.appId)) ids.push(win.appId);
    return ids;
  }

  function createAppButton(app) {
    const btn = h(
      'button',
      { class: 'tb-btn tb-app', type: 'button', dataset: { app: app.id } },
      h('img', { src: app.icon, alt: '', draggable: false }),
      h('span', { class: 'tb-indicator' })
    );
    btn.addEventListener('click', () => !justDragged && onAppClick(app, btn));
    enableReorder(btn, app);
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      appMenu(app, btn);
    });
    return btn;
  }

  /** Drag an app button sideways to change the order of the pinned apps. */
  let justDragged = false;
  function enableReorder(btn, app) {
    btn.addEventListener('pointerdown', (down) => {
      if (down.button !== 0) return;
      const startX = down.clientX;
      let dragging = false;
      let mids = [];

      const move = (e) => {
        const dx = e.clientX - startX;
        if (!dragging) {
          if (Math.abs(dx) < 6) return;
          dragging = true;
          try {
            btn.setPointerCapture(down.pointerId);
          } catch {
            /* the pointer is already gone */
          }
          btn.classList.add('is-dragging');
          mids = [...appsEl.children].filter((b) => b !== btn).map((b) => ({ id: b.dataset.app, mid: b.getBoundingClientRect().left + b.offsetWidth / 2 }));
        }
        btn.style.transform = `translateX(${dx}px)`;
      };

      const end = () => {
        btn.removeEventListener('pointermove', move);
        btn.removeEventListener('pointerup', end);
        btn.removeEventListener('pointercancel', end);
        if (!dragging) return;
        const rect = btn.getBoundingClientRect();
        const mid = rect.left + rect.width / 2;
        btn.style.transform = '';
        btn.classList.remove('is-dragging');
        justDragged = true;
        setTimeout(() => (justDragged = false), 0);
        const ids = mids.map((m) => m.id);
        ids.splice(mids.filter((m) => m.mid < mid).length, 0, app.id);
        const pinned = apps.pinnedTo('taskbar');
        const next = ids.filter((id) => pinned.includes(id));
        if (JSON.stringify(next) !== JSON.stringify(pinned)) settings.set('taskbarPinned', next);
        else renderApps();
      };

      btn.addEventListener('pointermove', move);
      btn.addEventListener('pointerup', end);
      btn.addEventListener('pointercancel', end);
    });
  }

  function renderApps() {
    const ids = order();
    for (const [id, btn] of buttons) {
      if (!ids.includes(id)) {
        btn.remove();
        buttons.delete(id);
      }
    }
    ids.forEach((id, index) => {
      let btn = buttons.get(id);
      if (!btn) {
        btn = createAppButton(apps.get(id));
        buttons.set(id, btn);
      }
      if (appsEl.children[index] !== btn) appsEl.insertBefore(btn, appsEl.children[index] || null);
    });
    updateApps();
  }

  function updateApps() {
    const activeApp = wm.active?.appId;
    for (const [id, btn] of buttons) {
      const wins = wm.byApp(id, { here: true });
      btn.classList.toggle('is-running', wins.length > 0);
      btn.classList.toggle('is-active', activeApp === id);
      btn.classList.toggle('is-multiple', wins.length > 1);
      // a running app shows its window cards on hover instead of a tooltip
      btn.dataset.tip = wins.length ? '' : apps.name(id);
      btn.setAttribute('aria-label', apps.name(id));
    }
  }

  function onAppClick(app, btn) {
    flyouts.close();
    const wins = wm.byApp(app.id, { here: true });
    if (!wins.length) {
      shell.launch(app.id);
    } else if (wins.length === 1) {
      const win = wins[0];
      if (wm.activeId === win.id && !win.minimized) wm.minimize(win.id);
      else wm.activate(win.id);
    } else {
      showMenu(
        wins.map((win) => ({ label: win.title, iconUrl: app.icon, checked: wm.activeId === win.id, action: () => wm.activate(win.id) })),
        { anchor: rectOf(btn), placement: 'top-center', gap: 12, minWidth: 220 }
      );
    }
  }

  function appMenu(app, btn) {
    flyouts.close();
    const wins = wm.byApp(app.id, { here: true });
    const pinned = apps.isPinned('taskbar', app.id);
    showMenu(
      [
        { label: apps.name(app), iconUrl: app.icon, action: () => shell.launch(app.id) },
        { separator: true },
        pinned
          ? { label: t('taskbar.unpin'), icon: 'pin-off', action: () => apps.setPinned('taskbar', app.id, false) }
          : { label: t('taskbar.pin'), icon: 'pin', action: () => apps.setPinned('taskbar', app.id, true) },
        wins.length > 0 && {
          label: wins.length > 1 ? t('taskbar.closeAll') : t('taskbar.closeWindow'),
          icon: 'dismiss',
          action: async () => {
            for (const win of wins) if (!(await wm.requestClose(win.id))) break;
          }
        },
        apps.isRemovable(app.id) && { separator: true },
        apps.isRemovable(app.id) && { label: t('uninstall.action'), icon: 'delete', danger: true, action: () => uninstallApp(app) }
      ],
      { anchor: rectOf(btn), placement: 'top-center', gap: 12 }
    );
  }

  function relabel() {
    el.setAttribute('role', 'toolbar');
    el.setAttribute('aria-label', t('taskbar.label'));
    startBtn.dataset.tip = t('taskbar.start');
    startBtn.setAttribute('aria-label', t('taskbar.start'));
    updateTrash();
    updateApps();
  }

  function applyOptions() {
    el.dataset.align = settings.get('taskbarAlign') === 'left' ? 'left' : 'center';
    document.documentElement.dataset.taskbarAlign = el.dataset.align; // Start follows the taskbar
  }

  /* ------------------------------- wiring -------------------------------- */

  wm.on('open', renderApps);
  wm.on('close', renderApps);
  wm.on('focus', updateApps);
  wm.on('change', updateApps);
  wm.on('desktop', renderApps);
  flyouts.on('change', (name) => {
    startBtn.classList.toggle('is-open', name === 'start');
  });
  settings.on('change', (key) => {
    if (key === 'taskbarPinned' || key === 'appInstall') renderApps();
    if (key === 'taskbarAlign') applyOptions();
    if (key === 'dockBehavior') updateDock();
  });
  i18n.on('change', relabel);

  /** Right-click on the Start button: the links an administrator reaches for first. */
  startBtn.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    flyouts.close();
    const byRole = (role) => apps.byRole(role);
    const link = (role, args) => {
      const app = byRole(role);
      return app && { label: apps.name(app), iconUrl: app.icon, action: () => shell.launch(app.id, args) };
    };
    const settingsApp = byRole('settings');
    const taskManager = link('task-manager');
    if (taskManager) taskManager.shortcut = 'Ctrl+Shift+Esc';
    showMenu(
      [
        settingsApp && { label: t('taskbar.appsAndFeatures'), icon: 'view-grid', action: () => shell.launch(settingsApp.id, { page: 'apps/installed' }) },
        taskManager,
        link('settings'),
        link('file-manager'),
        { label: t('taskbar.search'), icon: 'search', action: () => flyouts.open('search') },
        link('terminal'),
        { separator: true },
        {
          label: t('taskbar.powerGroup'),
          icon: 'power',
          items: [
            { label: t('power.lock'), icon: 'lock', action: () => shell.power.lock() },
            { label: t('power.signOut'), icon: 'sign-out', action: () => shell.power.signOut() },
            { separator: true },
            { label: t('power.sleep'), icon: 'moon', action: () => shell.power.sleep() },
            { label: t('power.shutDown'), icon: 'power', action: () => shell.power.shutDown() },
            { label: t('power.restart'), icon: 'refresh', action: () => shell.power.restart() }
          ]
        },
        { label: t('taskbar.showDesktop'), icon: 'desktop', action: () => wm.toggleShowDesktop() }
      ].filter(Boolean),
      { anchor: rectOf(startBtn), placement: 'top-start', gap: QUICK_LINK_MENU_GAP }
    );
  });

  dock.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    flyouts.close();
    const settingsApp = apps.byRole('settings');
    if (!settingsApp) return;
    const taskManager = apps.byRole('task-manager');
    showMenu([taskManager && { label: apps.name(taskManager), iconUrl: taskManager.icon, shortcut: 'Ctrl+Shift+Esc', action: () => shell.launch(taskManager.id) }, { label: t('taskbar.settings'), icon: 'settings', action: () => shell.launch(settingsApp.id, { page: 'personalization/taskbar' }) }], {
      x: e.clientX,
      y: e.clientY
    });
  });

  applyOptions();
  renderApps();
  relabel();
  updateDock();

  return {
    el,
    /** Ids of the app buttons from left to right (Alt+1 ... Alt+9). */
    appIds: () => [...appsEl.children].map((b) => b.dataset.app),
    /** Bring the dock up, or send it down again, while it is hidden (Alt+D). */
    toggleReveal() {
      if (hidden) setRevealed(!el.classList.contains('is-revealed'));
    },
    /** Rectangle windows shrink into when they are minimized. */
    anchorFor: (appId) => rectOf(buttons.get(appId) || startBtn)
  };
}
