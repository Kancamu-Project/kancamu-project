/**
 * Entry point of the OS shell (loaded by /index.html).
 * Boots the services, builds the desktop and hands control to the user.
 */
import { Emitter } from './core/events.js';
import { settings } from './core/settings.js';
import { i18n, t } from './core/i18n.js';
import { apps } from './core/apps.js';
import { fs, dirname, TRASH } from './core/fs.js';
import { persistent } from './core/store.js';
import { kindOf } from './core/filetypes.js';
import { playSound } from './core/sound.js';
import { watchTheme } from './core/system.js';
import { isEditable } from './core/dom.js';
import { closeMenus } from './ui/menu.js';
import { initTooltips } from './ui/tooltip.js';

import { WindowManager } from './shell/window-manager.js';
import { Flyouts } from './shell/flyouts.js';
import { createMenubar } from './shell/menubar.js';
import { createTaskbar } from './shell/taskbar.js';
import { createStartMenu } from './shell/start-menu.js';
import { createSearch } from './shell/search.js';
import { createQuickSettings } from './shell/quick-settings.js';
import { createCalendar } from './shell/calendar.js';
import { createNotifications } from './shell/notifications.js';
import { createDesktop } from './shell/desktop.js';
import { createDisplay } from './shell/display.js';
import { createLockScreen } from './shell/lock-screen.js';
import { createPower } from './shell/power.js';
import { createProtocol } from './shell/protocol.js';
import { createTray } from './shell/tray.js';
import { createBackground } from './shell/background.js';
import { createShortcuts } from './shell/shortcuts.js';
import { createSnapLayouts } from './shell/snap-layouts.js';
import { createTaskPreview } from './shell/task-preview.js';
import { createTaskView } from './shell/task-view.js';
import { createWidgets } from './shell/widgets.js';
import { createSnip } from './shell/snip.js';
import { createClipboardHistory } from './shell/clipboard-history.js';
import { watchClipboard } from './core/clipboard-watch.js';
import { MIN_BOOT_TIME } from './config/shell.js';
import { WELCOME_PATH, GUIDE_PATH } from './config/fs.js';
import { WELCOME_OPEN_DELAY, BOOT_REMOVE_DELAY, DISK_WARNING_INTERVAL } from './config/shell.js';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Shared context of all shell modules. Events: 'tick' (Date), 'unlock'. */
const shell = new Emitter();

async function boot() {
  const started = performance.now();
  watchTheme();
  initTooltips();
  await Promise.all([i18n.init(), apps.init(), fs.init()]);
  shell.disk = fs;

  shell.flyouts = new Flyouts();
  shell.wm = new WindowManager(document.getElementById('windows'));

  /** Open an app by id. */
  shell.launch = (appId, args) => shell.wm.open(appId, args);
  /** Show a folder (or 'shell:trash', 'shell:pc', 'shell:home') in the file manager. */
  shell.openLocation = (location, extra = {}) => {
    const app = apps.byRole('file-manager');
    return app ? shell.launch(app.id, { path: location, ...extra }) : null;
  };
  /** Open a file or folder of the virtual disk. */
  shell.openPath = (path) => {
    if (path === TRASH) return shell.openLocation(TRASH);
    const entry = fs.stat(path);
    if (!entry) return null;
    if (entry.type === 'dir') return shell.openLocation(entry.path);
    // pictures and media have their own apps; every other file is text
    const kind = kindOf(entry);
    const role = entry.url ? { image: 'image-viewer', audio: 'media-player', video: 'media-player' }[kind] : 'text-editor';
    const app = role ? apps.byRole(role) : null;
    if (app) {
      // text files open as a new tab of the Notepad that is already open (most recently used first)
      const open = role === 'text-editor' ? [...shell.wm.stack].reverse().map((id) => shell.wm.get(id)).find((win) => win?.appId === app.id) : null;
      if (open) {
        open.args = { path: entry.path };
        shell.wm.activate(open.id);
        open.notify('args', open.args);
        return open;
      }
      return shell.launch(app.id, { path: entry.path });
    }
    return shell.openLocation(dirname(entry.path), { select: entry.name, preview: true });
  };

  shell.notifications = createNotifications(shell);
  shell.display = createDisplay(shell);
  shell.lock = createLockScreen(shell);
  shell.power = createPower(shell);
  shell.menubar = createMenubar(shell);
  shell.taskbar = createTaskbar(shell);
  shell.tray = createTray(shell); // the icons of the background apps, in the menu bar
  shell.start = createStartMenu(shell);
  shell.search = createSearch(shell);
  shell.quick = createQuickSettings(shell);
  shell.calendar = createCalendar(shell);
  shell.desktop = createDesktop(shell);
  shell.snap = createSnapLayouts(shell);
  shell.taskPreview = createTaskPreview(shell);
  shell.taskView = createTaskView(shell);
  shell.widgets = createWidgets(shell);
  shell.snip = createSnip(shell);
  shell.clipboardHistory = createClipboardHistory(shell);
  watchClipboard((item) => shell.clipboardHistory.add(item));

  shell.shortcuts = createShortcuts(shell);
  shell.wm.anchorFor = shell.taskbar.anchorFor;
  shell.wm.on('open', () => shell.flyouts.close());
  shell.wm.on('content-pointerdown', () => {
    shell.flyouts.close();
    closeMenus();
  });
  shell.notifications.on('change', () => shell.menubar.setBadge(shell.notifications.unread));

  // An app was uninstalled in the Store: its windows go away with it.
  settings.on('change', (key) => {
    if (key !== 'appInstall') return;
    for (const win of shell.wm.list()) if (!apps.get(win.appId)) shell.wm.close(win.id);
  });

  // What app windows talk to: messages only (see /system/shell/protocol.js).
  shell.background = createBackground(shell);
  shell.protocol = createProtocol(shell);
  shell.background.startAll(); // the apps that start with the system (their messages are answered from here on)

  // Saving to the browser's storage failed (usually: the disk is full). Say so, but not on every attempt.
  let lastDiskWarning = 0;
  fs.on('error', () => {
    if (Date.now() - lastDiskWarning < DISK_WARNING_INTERVAL) return;
    lastDiskWarning = Date.now();
    playSound('error');
    shell.notifications.notify({ title: t('disk.errorTitle'), body: t('disk.errorBody') });
  });

  // Leaving the page while an app holds unsaved work: let the browser ask first.
  window.addEventListener('beforeunload', (e) => {
    fs.flush();
    if (shell.wm.hasUnsavedWork) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // This is a desktop, not a web page: no browser context menu, and dropping
  // a real file on the window must not navigate away.
  document.addEventListener('contextmenu', (e) => {
    if (!isEditable(e.target)) e.preventDefault();
  });
  for (const type of ['dragover', 'drop']) {
    window.addEventListener(type, (e) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault();
    });
  }

  let firstUnlock = true;
  shell.on('unlock', () => {
    if (firstUnlock) {
      firstUnlock = false;
      playSound('startup');
    }
    if (!settings.get('welcomed')) {
      settings.set('welcomed', true);
      setTimeout(() => {
        // Welcome in front, the guide in the tab beside it
        const editor = apps.byRole('text-editor');
        if (editor && fs.stat(WELCOME_PATH)) shell.launch(editor.id, { path: WELCOME_PATH, paths: [GUIDE_PATH].filter((path) => fs.stat(path)) });
      }, WELCOME_OPEN_DELAY); // the first start (and the first after a reset)
    }
    if (!persistent || !fs.persistent) {
      shell.notifications.notify({ title: t('welcome.noStorageTitle'), body: t('welcome.noStorageBody') });
    }
  });

  await Promise.race([shell.display.preload(), delay(3000)]);
  await delay(Math.max(0, MIN_BOOT_TIME - (performance.now() - started)));

  // boot is over: show the lock screen (or go straight to the desktop)
  const screen = document.getElementById('screen');
  if (settings.get('lockOnStartup')) {
    shell.lock.show();
  } else {
    screen.inert = false;
    shell.emit('unlock');
  }
  const bootEl = document.getElementById('boot');
  bootEl.classList.add('is-done');
  setTimeout(() => bootEl.remove(), BOOT_REMOVE_DELAY);
}

boot().catch((err) => {
  console.error('[boot] failed', err);
  const bootEl = document.getElementById('boot');
  const message = document.getElementById('boot-message');
  if (bootEl && message) {
    bootEl.classList.add('has-error');
    message.textContent = `The system could not start: ${err?.message || err}`;
  }
});
