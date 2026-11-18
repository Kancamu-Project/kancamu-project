/**
 * What a page may ask of the OS. Every call of the app protocol (system/shell/protocol.js)
 * is either open to all pages (it only concerns the page's own window) or needs one of the
 * permissions that an app lists in apps.json. A call that is in neither table is refused.
 * Kept apart from the protocol so that the tables can be checked without a desktop.
 */

/** Calls that need no permission: they only concern the page's own window. */
export const OPEN = new Set(['window.ready', 'window.setTitle', 'window.close', 'window.minimize', 'window.toggleMaximize', 'window.setDirty', 'window.setCloseGuard', 'window.closeAnswer', 'window.focus', 'menu.show', 'menu.close', 'shortcut.key']);

/** Which permission a call needs. */
export const PERMISSION_OF = {
  'storage.set': 'storage',
  'storage.remove': 'storage',
  'storage.clear': 'storage',
  'notify.show': 'notify',
  'launch.app': 'launch',
  'launch.openPath': 'launch',
  'windows.list': 'windows',
  'windows.close': 'windows',
  'windows.activate': 'windows',
  'power.run': 'power',
  'snip.start': 'snip',
  'clipboard.add': 'clipboard',
  'clipboard.clearHistory': 'clipboard',
  'clipboard.files.set': 'clipboard',
  'clipboard.files.clear': 'clipboard',
  'settings.update': 'settings',
  'settings.reset': 'settings',
  'fs.readFile': 'fs',
  'fs.readData': 'fs',
  'fs.writeFile': 'fs',
  'fs.writeLink': 'fs',
  'fs.mkdir': 'fs',
  'fs.remove': 'fs',
  'fs.rename': 'fs',
  'fs.move': 'fs',
  'fs.copy': 'fs',
  'fs.trash': 'fs',
  'fs.restore': 'fs',
  'fs.purge': 'fs',
  'fs.emptyTrash': 'fs',
  'fs.flush': 'fs',
  'fs.wipe': 'system',
  'storage.usage': 'system',
  'storage.clearAll': 'system',
  'storage.clearOf': 'system',
  'system.metrics': 'system',
  'tray.set': 'tray',
  'tray.remove': 'tray'
};

/** Every permission a page can be given in apps.json. */
export const PERMISSIONS = ['storage', 'notify', 'launch', 'windows', 'power', 'snip', 'clipboard', 'settings', 'fs', 'apps', 'system', 'tray'];

/** Pages that do not say what they need get this. */
export const DEFAULT_PERMISSIONS = ['storage', 'notify'];

/** Settings every page may read (what the look of a page depends on). */
export const PUBLIC_SETTINGS = ['theme', 'accent', 'transparency', 'animations', 'energySaver', 'highContrast', 'colorFilter', 'focusIndicator', 'language', 'clock24h', 'clockSeconds'];

/** Actions of the power menu a page may ask for. */
export const POWER_ACTIONS = new Set(['lock', 'signOut', 'sleep', 'restart', 'shutDown']);
