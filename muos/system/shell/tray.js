import { Emitter } from '../core/events.js';
import { h } from '../core/dom.js';
import { apps } from '../core/apps.js';
import { i18n, t } from '../core/i18n.js';
import { showMenu } from '../ui/menu.js';
import { rectOf } from '../core/dom.js';
import { TRAY_MENU_GAP, TRAY_MENU_PLACEMENT } from '../config/shell.js';

/**
 * The icons of the apps that run in the background, in the menu bar at the top (next to the status icons).
 * An app asks for its icon with os.tray.set() (permission "tray"); a click on the icon and a choice in
 * its menu go back to the app as events.
 * Events: 'click' (appId), 'item' (appId, id), 'exit' (appId).
 */
export function createTray(shell) {
  const emitter = new Emitter();
  const items = new Map(); // app id -> { owner, tooltip, items }
  const bar = shell.menubar.trayEl;

  function menuFor(appId, entry) {
    const menu = (entry.items ?? []).map((item) => (item.separator ? item : { ...item, action: () => emitter.emit('item', appId, item.id) }));
    // an app that runs in the background can always be ended from its icon
    if (shell.background?.isRunning(appId)) menu.push(...(menu.length ? [{ separator: true }] : []), { label: t('tray.exit'), icon: 'dismiss', action: () => emitter.emit('exit', appId) });
    return menu;
  }

  function render() {
    bar.replaceChildren(
      ...[...items].map(([appId, entry]) => {
        const app = apps.getAny(appId);
        const button = h('button', { class: 'mb-btn tray-app', type: 'button', 'aria-label': entry.tooltip || apps.name(app) }, h('img', { src: app?.icon ?? '', alt: '', draggable: false }));
        button.dataset.tip = entry.tooltip || apps.name(app);
        button.addEventListener('click', () => {
          shell.flyouts.close();
          emitter.emit('click', appId);
        });
        button.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          const menu = menuFor(appId, entry);
          if (menu.length) showMenu(menu, { anchor: rectOf(button), placement: TRAY_MENU_PLACEMENT, gap: TRAY_MENU_GAP });
        });
        return button;
      })
    );
  }

  i18n.on('change', render);

  return Object.assign(emitter, {
    /** Put (or change) the icon of an app. `owner` is the page that asked: it gets the clicks. */
    set(appId, entry) {
      items.set(appId, entry);
      render();
    },
    remove(appId) {
      if (items.delete(appId)) render();
    },
    /** The icon goes when the page that put it there goes. */
    removeOwner(owner) {
      for (const [appId, entry] of items) if (entry.owner === owner) items.delete(appId);
      render();
    },
    ownerOf: (appId) => items.get(appId)?.owner ?? null,
    has: (appId) => items.has(appId)
  });
}
