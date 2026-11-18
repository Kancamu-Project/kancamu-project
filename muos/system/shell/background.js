import { Emitter } from '../core/events.js';
import { ROOT } from '../core/paths.js';
import { apps } from '../core/apps.js';
import { settings } from '../core/settings.js';
import { APP_FRAME_SANDBOX, APP_FRAME_REFERRER_POLICY } from '../config/shell.js';

/**
 * Apps that run without a window. An app with "startup" in its behaviors (apps.json) is loaded
 * when the system starts, in a hidden frame; the page sees that it has no window (os.background)
 * and does what it is there for, usually an icon in the tray (os.tray). It talks to the OS with
 * the same messages as a page in a window, so the protocol treats both alike: what a window has
 * and a background page lacks (a title, an active state) is simply missing.
 *
 * The user decides in Settings → Apps → Startup (the setting "startupApps"); the "Exit" of the
 * tray menu and End task in Task Manager stop the app for the rest of the session.
 * Events: 'start' (context), 'stop' (context).
 */
export function createBackground(shell) {
  const emitter = new Emitter();
  const running = new Map(); // app id -> context
  const stopped = new Set(); // apps the user ended: they stay off until the system starts again
  let sequence = 0;

  const layer = document.createElement('div');
  layer.id = 'background';
  layer.setAttribute('aria-hidden', 'true'); // looks are in style/shell.css: nothing of it is seen
  document.body.append(layer);

  /** What the pages should be running right now. */
  const wanted = () => apps.list.filter((app) => apps.startsAtBoot(app) && !stopped.has(app.id));

  function start(app) {
    if (running.has(app.id)) return running.get(app.id);
    const entry = new URL(app.entry);
    entry.searchParams.set('os', ROOT);
    const iframe = document.createElement('iframe');
    iframe.title = apps.name(app);
    iframe.src = entry.href;
    iframe.setAttribute('sandbox', APP_FRAME_SANDBOX);
    iframe.setAttribute('referrerpolicy', APP_FRAME_REFERRER_POLICY);
    iframe.tabIndex = -1;
    // the same shape as a window of the window manager, as far as the protocol needs it
    const context = { id: `b${++sequence}`, app, appId: app.id, args: {}, iframe, handlers: {}, notify() {}, background: true, opened: Date.now() };
    layer.append(iframe);
    running.set(app.id, context);
    emitter.emit('start', context);
    return context;
  }

  function stop(appId) {
    const context = running.get(appId);
    if (!context) return;
    running.delete(appId);
    context.iframe.remove();
    emitter.emit('stop', context);
  }

  /** Start what should run and stop what should not (an app was uninstalled, or switched off in Settings). */
  function sync() {
    const keep = new Set(wanted().map((app) => app.id));
    for (const id of [...running.keys()]) if (!keep.has(id)) stop(id);
    for (const app of wanted()) start(app);
  }

  settings.on('change', (key) => {
    if (key === 'appInstall' || key === 'startupApps') {
      // turning an app on again by hand lets it start again
      if (key === 'startupApps') for (const app of apps.list) if (apps.startsAtBoot(app)) stopped.delete(app.id);
      sync();
    }
  });

  return Object.assign(emitter, {
    sync,
    list: () => [...running.values()],
    isRunning: (appId) => running.has(appId),
    findByContentWindow: (contentWindow) => [...running.values()].find((context) => context.iframe.contentWindow === contentWindow) ?? null,
    findById: (id) => [...running.values()].find((context) => context.id === id) ?? null,
    /** End an app until the system starts again. */
    end(appId) {
      stopped.add(appId);
      stop(appId);
    },
    startAll: sync
  });
}
